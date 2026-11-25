import { compact, fail, type ValidationResult } from "./types";

export interface IFSCDetails {
  /** First 4 letters, e.g. "HDFC". */
  bankCode: string;
  /** Last 6 characters, e.g. "000240". */
  branchCode: string;
}

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/**
 * Validates the format of an Indian Financial System Code, e.g. `HDFC0000240`.
 * Format only — use {@link lookupIFSC} to confirm the branch exists.
 */
export function validateIFSC(input: unknown): ValidationResult<IFSCDetails> {
  const value = compact(input);
  if (!value) return fail(value, "EMPTY", "IFSC is required.");
  if (value.length !== 11) return fail(value, "INVALID_LENGTH", "IFSC must be 11 characters.");
  if (!IFSC_RE.test(value)) {
    return fail(value, "INVALID_FORMAT", "IFSC must be 4 letters, then 0, then 6 letters or digits (e.g. HDFC0000240).");
  }
  return { valid: true, value, details: { bankCode: value.slice(0, 4), branchCode: value.slice(5) } };
}

/** Convenience boolean form of {@link validateIFSC}. */
export function isValidIFSC(input: unknown): boolean {
  return validateIFSC(input).valid;
}

/** Branch details returned by {@link lookupIFSC}. */
export interface IFSCBranch {
  ifsc: string;
  bank: string;
  bankCode: string;
  branch: string;
  address: string;
  city: string;
  district: string;
  state: string;
  centre: string;
  contact: string | null;
  micr: string | null;
  swift: string | null;
  upi: boolean;
  neft: boolean;
  rtgs: boolean;
  imps: boolean;
}

export interface LookupIFSCOptions {
  /** Abort an in-flight request (e.g. when the input changes). */
  signal?: AbortSignal;
  /** Override the API base URL. Defaults to Razorpay's free IFSC API. */
  baseUrl?: string;
  /** Custom fetch implementation (for tests, SSR or proxies). */
  fetch?: typeof globalThis.fetch;
}

export class IFSCLookupError extends Error {
  constructor(
    message: string,
    /** "NOT_FOUND" when the code is well-formed but no branch exists. */
    public readonly code: "INVALID_IFSC" | "NOT_FOUND" | "NETWORK",
    public readonly status?: number,
  ) {
    super(message);
    this.name = "IFSCLookupError";
  }
}

export const DEFAULT_IFSC_API = "https://ifsc.razorpay.com";

/**
 * Looks up a branch by IFSC using Razorpay's open IFSC API (https://ifsc.razorpay.com).
 * Throws {@link IFSCLookupError} on invalid codes, unknown branches and network errors.
 */
export async function lookupIFSC(input: string, options: LookupIFSCOptions = {}): Promise<IFSCBranch> {
  const result = validateIFSC(input);
  if (!result.valid) throw new IFSCLookupError(result.message, "INVALID_IFSC");

  const doFetch = options.fetch ?? globalThis.fetch;
  if (typeof doFetch !== "function") throw new IFSCLookupError("fetch is not available in this environment.", "NETWORK");

  const base = (options.baseUrl ?? DEFAULT_IFSC_API).replace(/\/+$/, "");
  let res: Response;
  try {
    res = await doFetch(`${base}/${result.value}`, { signal: options.signal, headers: { Accept: "application/json" } });
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") throw err;
    throw new IFSCLookupError("Could not reach the IFSC service.", "NETWORK");
  }
  if (res.status === 404) throw new IFSCLookupError(`No bank branch found for ${result.value}.`, "NOT_FOUND", 404);
  if (!res.ok) throw new IFSCLookupError(`IFSC service returned ${res.status}.`, "NETWORK", res.status);

  const raw = (await res.json()) as Record<string, unknown>;
  const str = (k: string) => (typeof raw[k] === "string" && raw[k] !== "" ? (raw[k] as string) : null);
  return {
    ifsc: str("IFSC") ?? result.value,
    bank: str("BANK") ?? "",
    bankCode: str("BANKCODE") ?? result.details.bankCode,
    branch: str("BRANCH") ?? "",
    address: str("ADDRESS") ?? "",
    city: str("CITY") ?? "",
    district: str("DISTRICT") ?? "",
    state: str("STATE") ?? "",
    centre: str("CENTRE") ?? "",
    contact: str("CONTACT"),
    micr: str("MICR"),
    swift: str("SWIFT"),
    upi: raw.UPI === true,
    neft: raw.NEFT === true,
    rtgs: raw.RTGS === true,
    imps: raw.IMPS === true,
  };
}
