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
import {
  lookupPincode,
  validatePincode,
  PincodeLookupError,
  type LookupPincodeOptions,
  type PincodeDetails,
  type PincodeLocation,
} from "../pincode";
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

export interface UsePincodeOptions extends UseValidatedFieldOptions {
  /**
   * Look up the district, state and post offices once the PIN code is valid.
   * Default `false`, so the hook makes no network calls unless you ask for them.
   */
  lookup?: boolean;
  /** Options passed to `lookupPincode` (custom `baseUrl` or `fetch`). */
  lookupOptions?: Omit<LookupPincodeOptions, "signal">;
}

export interface PincodeField extends ValidatedField<PincodeDetails> {
  /** District, state and post offices, once the lookup succeeds. */
  location: PincodeLocation | undefined;
  lookupStatus: LookupStatus;
  /** Set when the lookup fails, e.g. "No post office found for 999999." */
  lookupError: string | undefined;
  lookupErrorCode: PincodeLookupError["code"] | undefined;
}

const pincodeCache = new Map<string, PincodeLocation>();

/**
 * Headless 6-digit PIN code field (numeric keyboard on mobile).
 * Pass `{ lookup: true }` to also fetch the district, state and post offices
 * from the free India Post API, e.g. to auto-fill an address form.
 */
export function usePincode(options: UsePincodeOptions = {}): PincodeField {
  const { lookup = false, lookupOptions, ...fieldOptions } = options;
  const field = useValidatedField(validatePincode, fieldOptions, {
    transform: digitsOnly,
    maxLength: 6,
    inputMode: "numeric",
    autoComplete: "postal-code",
  });
  const code = field.result.valid ? field.result.value : "";
  const remote = useRemoteLookup(code, lookup, lookupPincode, lookupOptions, pincodeCache, (err) =>
    err instanceof PincodeLookupError ? err : new PincodeLookupError("PIN code lookup failed.", "NETWORK"),
  );
  return {
    ...field,
    location: remote.data,
    lookupStatus: remote.status,
    lookupError: remote.error,
    lookupErrorCode: remote.errorCode,
  };
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

export type LookupStatus = "idle" | "loading" | "success" | "error";
/** @deprecated Use `LookupStatus`. */
export type IFSCLookupStatus = LookupStatus;

export interface UseIFSCOptions extends UseValidatedFieldOptions {
  /** Look up the branch once the code is valid. Default `true`. */
  lookup?: boolean;
  /** Options passed to `lookupIFSC` (custom `baseUrl` or `fetch`). */
  lookupOptions?: Omit<LookupIFSCOptions, "signal">;
}

export interface IFSCField extends ValidatedField<IFSCDetails> {
  branch: IFSCBranch | undefined;
  lookupStatus: LookupStatus;
  /** Set when the lookup fails, e.g. "No bank branch found for HDFC0999999." */
  lookupError: string | undefined;
  lookupErrorCode: IFSCLookupError["code"] | undefined;
}

const branchCache = new Map<string, IFSCBranch>();

/** @internal For tests. */
export function __clearIFSCCache(): void {
  branchCache.clear();
}

/** @internal For tests. */
export function __clearPincodeCache(): void {
  pincodeCache.clear();
}

interface RemoteState<T, C> {
  key: string;
  status: LookupStatus;
  data?: T;
  error?: string;
  errorCode?: C;
}

/**
 * @internal Runs `fetcher(key)` whenever `key` is non-empty and `enabled`, caching
 * results and aborting stale requests.
 */
function useRemoteLookup<T, O extends object, E extends Error & { code: string }>(
  key: string,
  enabled: boolean,
  fetcher: (key: string, options: O & { signal?: AbortSignal }) => Promise<T>,
  options: O | undefined,
  cache: Map<string, T>,
  toError: (err: unknown) => E,
): { status: LookupStatus; data: T | undefined; error: string | undefined; errorCode: E["code"] | undefined } {
  const [state, setState] = useState<RemoteState<T, E["code"]>>({ key: "", status: "idle" });
  const optsRef = useRef(options);
  optsRef.current = options;
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const toErrorRef = useRef(toError);
  toErrorRef.current = toError;

  useEffect(() => {
    if (!enabled || !key) {
      setState({ key: "", status: "idle" });
      return;
    }
    const cached = cache.get(key);
    if (cached) {
      setState({ key, status: "success", data: cached });
      return;
    }
    const controller = new AbortController();
    setState({ key, status: "loading" });
    fetcherRef
      .current(key, { ...(optsRef.current as O), signal: controller.signal })
      .then((data) => {
        cache.set(key, data);
        if (!controller.signal.aborted) setState({ key, status: "success", data });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const e = toErrorRef.current(err);
        setState({ key, status: "error", error: e.message, errorCode: e.code });
      });
    return () => controller.abort();
  }, [key, enabled, cache]);

  const cachedNow = enabled && key ? cache.get(key) : undefined;
  const current: RemoteState<T, E["code"]> =
    state.key === key
      ? state
      : cachedNow
        ? { key, status: "success", data: cachedNow }
        : { key, status: enabled && key ? "loading" : "idle" };
  return { status: current.status, data: current.data, error: current.error, errorCode: current.errorCode };
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
  const remote = useRemoteLookup(code, lookup, lookupIFSC, lookupOptions, branchCache, (err) =>
    err instanceof IFSCLookupError ? err : new IFSCLookupError("IFSC lookup failed.", "NETWORK"),
  );
  return {
    ...field,
    branch: remote.data,
    lookupStatus: remote.status,
    lookupError: remote.error,
    lookupErrorCode: remote.errorCode,
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
