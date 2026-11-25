import { useEffect, useMemo, useRef, useState } from "react";
import { validateGSTIN, type GSTINDetails } from "../gstin";
import { lookupIFSC, validateIFSC, IFSCLookupError, type IFSCBranch, type IFSCDetails, type LookupIFSCOptions } from "../ifsc";
import {
  amountInWords,
  formatINR,
  formatINRCompact,
  type FormatINRCompactOptions,
  type FormatINROptions,
} from "../inr";
import { validatePAN, type PANDetails } from "../pan";
import { validateIndianMobile, type PhoneDetails } from "../phone";
import { validatePincode, type PincodeDetails } from "../pincode";
import { buildUPILink, validateUPIId, type BuildUPILinkOptions, type UPIIdDetails, type UPIPaymentParams } from "../upi";
import { upperAlnum, useValidatedField, type UseValidatedFieldOptions, type ValidatedField } from "./useValidatedField";

const digitsOnly = (raw: string) => raw.replace(/\D/g, "");
const phoneChars = (raw: string) => raw.replace(/[^\d\s()+-]/g, "");

/** Headless GSTIN field: upper-cases input, validates checksum and state, exposes `details.stateName` etc. */
export function useGSTIN(options?: UseValidatedFieldOptions): ValidatedField<GSTINDetails> {
  return useValidatedField(validateGSTIN, options, {
    transform: upperAlnum,
    maxLength: 15,
    autoCapitalize: "characters",
  });
}

/** Headless PAN field. */
export function usePAN(options?: UseValidatedFieldOptions): ValidatedField<PANDetails> {
  return useValidatedField(validatePAN, options, {
    transform: upperAlnum,
    maxLength: 10,
    autoCapitalize: "characters",
  });
}

/** Headless 6-digit PIN code field (numeric keyboard on mobile). */
export function usePincode(options?: UseValidatedFieldOptions): ValidatedField<PincodeDetails> {
  return useValidatedField(validatePincode, options, {
    transform: digitsOnly,
    maxLength: 6,
    inputMode: "numeric",
    autoComplete: "postal-code",
  });
}

/** Headless Indian mobile number field. `result.value` is E.164 (`+919876543210`). */
export function usePhone(options?: UseValidatedFieldOptions): ValidatedField<PhoneDetails> {
  return useValidatedField(validateIndianMobile, options, {
    transform: phoneChars,
    maxLength: 17,
    inputMode: "tel",
    autoComplete: "tel-national",
  });
}

const lowerTrim = (raw: string) => raw.replace(/\s+/g, "").toLowerCase();

/** Headless UPI ID (VPA) field. */
export function useUPIId(options?: UseValidatedFieldOptions): ValidatedField<UPIIdDetails> {
  return useValidatedField(validateUPIId, options, {
    transform: lowerTrim,
    maxLength: 320,
    inputMode: "email",
    autoCapitalize: "none",
  });
}

export type IFSCLookupStatus = "idle" | "loading" | "success" | "error";

export interface UseIFSCOptions extends UseValidatedFieldOptions {
  /** Look up the branch once the code is valid. Default `true`. */
  lookup?: boolean;
  /** Options passed to `lookupIFSC` (custom `baseUrl` or `fetch`). */
  lookupOptions?: Omit<LookupIFSCOptions, "signal">;
}

export interface IFSCField extends ValidatedField<IFSCDetails> {
  branch: IFSCBranch | undefined;
  lookupStatus: IFSCLookupStatus;
  /** Set when the lookup fails, e.g. "No bank branch found for HDFC0999999." */
  lookupError: string | undefined;
  lookupErrorCode: IFSCLookupError["code"] | undefined;
}

const branchCache = new Map<string, IFSCBranch>();

/** @internal For tests. */
export function __clearIFSCCache(): void {
  branchCache.clear();
}

/**
 * Headless IFSC field that also fetches bank and branch details once the code is valid
 * (via Razorpay's free IFSC API by default). Results are cached in memory and
 * in-flight requests are aborted when the value changes.
 */
export function useIFSC(options: UseIFSCOptions = {}): IFSCField {
  const { lookup = true, lookupOptions, ...fieldOptions } = options;
  const field = useValidatedField(validateIFSC, fieldOptions, {
    transform: upperAlnum,
    maxLength: 11,
    autoCapitalize: "characters",
  });
  const code = field.result.valid ? field.result.value : "";

  const [state, setState] = useState<{
    code: string;
    status: IFSCLookupStatus;
    branch?: IFSCBranch;
    error?: string;
    errorCode?: IFSCLookupError["code"];
  }>({ code: "", status: "idle" });

  const optsRef = useRef(lookupOptions);
  optsRef.current = lookupOptions;

  useEffect(() => {
    if (!lookup || !code) {
      setState({ code: "", status: "idle" });
      return;
    }
    const cached = branchCache.get(code);
    if (cached) {
      setState({ code, status: "success", branch: cached });
      return;
    }
    const controller = new AbortController();
    setState({ code, status: "loading" });
    lookupIFSC(code, { ...optsRef.current, signal: controller.signal })
      .then((branch) => {
        branchCache.set(code, branch);
        if (!controller.signal.aborted) setState({ code, status: "success", branch });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const e = err instanceof IFSCLookupError ? err : new IFSCLookupError("IFSC lookup failed.", "NETWORK");
        setState({ code, status: "error", error: e.message, errorCode: e.code });
      });
    return () => controller.abort();
  }, [code, lookup]);

  const current = state.code === code ? state : { status: (lookup && code ? "loading" : "idle") as IFSCLookupStatus };
  return {
    ...field,
    branch: "branch" in current ? current.branch : undefined,
    lookupStatus: current.status,
    lookupError: "error" in current ? current.error : undefined,
    lookupErrorCode: "errorCode" in current ? current.errorCode : undefined,
  };
}

export interface UPILinkState {
  /** The `upi://pay?...` link, or `undefined` if the params are invalid. */
  link: string | undefined;
  error: string | undefined;
}

/**
 * Builds a UPI payment link from params. Pass `link` to any QR component
 * (e.g. `qrcode.react`) or use it as an `<a href>` on mobile.
 */
export function useUPILink(params: UPIPaymentParams, options?: BuildUPILinkOptions): UPILinkState {
  const {
    payeeAddress, payeeName, amount, minimumAmount, note, transactionRef, transactionId, merchantCode, url, currency,
  } = params;
  const scheme = options?.scheme;
  return useMemo(() => {
    try {
      const link = buildUPILink(
        { payeeAddress, payeeName, amount, minimumAmount, note, transactionRef, transactionId, merchantCode, url, currency },
        { scheme },
      );
      return { link, error: undefined };
    } catch (err) {
      return { link: undefined, error: err instanceof Error ? err.message.replace(/^Invalid payeeAddress: /, "") : String(err) };
    }
  }, [payeeAddress, payeeName, amount, minimumAmount, note, transactionRef, transactionId, merchantCode, url, currency, scheme]);
}

export interface UseINROptions {
  format?: FormatINROptions;
  compact?: FormatINRCompactOptions;
}

export interface INRDisplay {
  /** "₹12,34,567.00" */
  formatted: string;
  /** "₹12.35 L" */
  compact: string;
  /** "Rupees Twelve Lakh … Only" */
  words: string;
}

/** Formats an amount three ways for display. Invalid amounts return empty strings. */
export function useINR(amount: number | string | null | undefined, options: UseINROptions = {}): INRDisplay {
  const { format, compact } = options;
  const fKey = JSON.stringify(format ?? {});
  const cKey = JSON.stringify(compact ?? {});
  return useMemo(() => {
    if (amount === null || amount === undefined || amount === "") return { formatted: "", compact: "", words: "" };
    try {
      return {
        formatted: formatINR(amount, format),
        compact: formatINRCompact(amount, compact),
        words: amountInWords(amount),
      };
    } catch {
      return { formatted: "", compact: "", words: "" };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, fKey, cKey]);
}
