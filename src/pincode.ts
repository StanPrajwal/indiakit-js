import { fail, type ValidationResult } from "./types";

/** Postal zones by first digit of the PIN code (India Post). */
export const PINCODE_ZONES: Readonly<Record<string, { zone: string; regions: string[] }>> = Object.freeze({
  "1": { zone: "Northern", regions: ["Delhi", "Haryana", "Punjab", "Himachal Pradesh", "Jammu and Kashmir", "Ladakh", "Chandigarh"] },
  "2": { zone: "Northern", regions: ["Uttar Pradesh", "Uttarakhand"] },
  "3": { zone: "Western", regions: ["Rajasthan", "Gujarat", "Dadra and Nagar Haveli and Daman and Diu"] },
  "4": { zone: "Western", regions: ["Maharashtra", "Goa", "Madhya Pradesh", "Chhattisgarh"] },
  "5": { zone: "Southern", regions: ["Andhra Pradesh", "Telangana", "Karnataka"] },
  "6": { zone: "Southern", regions: ["Tamil Nadu", "Kerala", "Puducherry", "Lakshadweep"] },
  "7": {
    zone: "Eastern",
    regions: ["West Bengal", "Odisha", "Assam", "Sikkim", "Arunachal Pradesh", "Nagaland", "Manipur", "Mizoram", "Tripura", "Meghalaya", "Andaman and Nicobar Islands"],
  },
  "8": { zone: "Eastern", regions: ["Bihar", "Jharkhand"] },
  "9": { zone: "Army Postal Service", regions: ["Army Postal Service (APS)"] },
});

export interface PincodeDetails {
  zone: string;
  /** States / UTs served by this postal zone (not an exact match for the PIN). */
  regions: string[];
}

/** Validates a 6-digit Indian PIN code, e.g. `560001`. Accepts "560 001". */
export function validatePincode(input: unknown): ValidationResult<PincodeDetails> {
  const value = input === null || input === undefined ? "" : String(input).replace(/\s+/g, "");
  if (!value) return fail(value, "EMPTY", "PIN code is required.");
  if (!/^\d+$/.test(value)) return fail(value, "INVALID_FORMAT", "PIN code must contain only digits.");
  if (value.length !== 6) return fail(value, "INVALID_LENGTH", "PIN code must be 6 digits.");
  if (value.startsWith("0")) return fail(value, "INVALID_FORMAT", "PIN code cannot start with 0.");
  const z = PINCODE_ZONES[value.charAt(0)]!;
  return { valid: true, value, details: { zone: z.zone, regions: [...z.regions] } };
}

/** Convenience boolean form of {@link validatePincode}. */
export function isValidPincode(input: unknown): boolean {
  return validatePincode(input).valid;
}

/** One post office returned by {@link lookupPincode}. */
export interface PostOffice {
  name: string;
  /** "Head Post Office", "Sub Post Office" or "Branch Post Office". */
  branchType: string;
  /** "Delivery" or "Non-Delivery". */
  deliveryStatus: string;
  block: string;
  district: string;
  division: string;
  region: string;
  circle: string;
  state: string;
}

/** Location details returned by {@link lookupPincode}. */
export interface PincodeLocation {
  pincode: string;
  /** District of the first (usually head) post office, e.g. "Bangalore". */
  district: string;
  state: string;
  /** Postal circle, e.g. "Karnataka". */
  circle: string;
  /** Unique district names, for PIN codes that span more than one district. */
  districts: string[];
  postOffices: PostOffice[];
}

export interface LookupPincodeOptions {
  /** Abort an in-flight request (e.g. when the input changes). */
  signal?: AbortSignal;
  /** Override the API base URL. Defaults to the free India Post API at api.postalpincode.in. */
  baseUrl?: string;
  /** Custom fetch implementation (for tests, SSR or proxies). */
  fetch?: typeof globalThis.fetch;
}

export class PincodeLookupError extends Error {
  constructor(
    message: string,
    /** "NOT_FOUND" when the PIN code is well-formed but has no post offices. */
    public readonly code: "INVALID_PINCODE" | "NOT_FOUND" | "NETWORK",
    public readonly status?: number,
  ) {
    super(message);
    this.name = "PincodeLookupError";
  }
}

export const DEFAULT_PINCODE_API = "https://api.postalpincode.in";

/**
 * Looks up the district, state and post offices for a PIN code using the free
 * India Post API (https://api.postalpincode.in). Works in the browser (CORS is open).
 * Throws {@link PincodeLookupError} on invalid codes, unknown PIN codes and network errors.
 */
export async function lookupPincode(input: string, options: LookupPincodeOptions = {}): Promise<PincodeLocation> {
  const result = validatePincode(input);
  if (!result.valid) throw new PincodeLookupError(result.message, "INVALID_PINCODE");

  const doFetch = options.fetch ?? globalThis.fetch;
  if (typeof doFetch !== "function") throw new PincodeLookupError("fetch is not available in this environment.", "NETWORK");

  const base = (options.baseUrl ?? DEFAULT_PINCODE_API).replace(/\/+$/, "");
  let res: Response;
  try {
    res = await doFetch(`${base}/pincode/${result.value}`, { signal: options.signal, headers: { Accept: "application/json" } });
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") throw err;
    throw new PincodeLookupError("Could not reach the PIN code service.", "NETWORK");
  }
  if (res.status === 404) throw new PincodeLookupError(`No post office found for ${result.value}.`, "NOT_FOUND", 404);
  if (!res.ok) throw new PincodeLookupError(`PIN code service returned ${res.status}.`, "NETWORK", res.status);

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new PincodeLookupError("PIN code service returned an invalid response.", "NETWORK", res.status);
  }
  const entry = (Array.isArray(body) ? body[0] : body) as { Status?: unknown; PostOffice?: unknown } | undefined;
  const offices = Array.isArray(entry?.PostOffice) ? (entry.PostOffice as Record<string, unknown>[]) : [];
  if (offices.length === 0) throw new PincodeLookupError(`No post office found for ${result.value}.`, "NOT_FOUND");

  const s = (o: Record<string, unknown>, k: string) => (typeof o[k] === "string" ? (o[k] as string).trim() : "");
  const postOffices: PostOffice[] = offices.map((o) => ({
    name: s(o, "Name"),
    branchType: s(o, "BranchType"),
    deliveryStatus: s(o, "DeliveryStatus"),
    block: s(o, "Block"),
    district: s(o, "District"),
    division: s(o, "Division"),
    region: s(o, "Region"),
    circle: s(o, "Circle"),
    state: s(o, "State"),
  }));
  const first = postOffices[0]!;
  return {
    pincode: result.value,
    district: first.district,
    state: first.state,
    circle: first.circle,
    districts: [...new Set(postOffices.map((p) => p.district).filter(Boolean))],
    postOffices,
  };
}
