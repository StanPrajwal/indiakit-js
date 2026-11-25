import { PAN_HOLDER_TYPES } from "./pan";
import { GST_STATE_CODES } from "./states";
import { compact, fail, type ValidationResult } from "./types";

const CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z][A-Z0-9][0-9A-Z]$/;

export interface GSTINDetails {
  stateCode: string;
  stateName: string;
  /** Characters 3–12: the PAN of the registered taxpayer. */
  pan: string;
  /** PAN holder type, e.g. "Company", when recognised. */
  panHolderType: string | undefined;
  /** 13th character: registration number for this PAN within the state (1–9, then A–Z). */
  entityNumber: string;
  checksum: string;
}

/**
 * Computes the GSTIN check character for the first 14 characters.
 * Uses the official base-36 weighted mod-36 algorithm.
 */
export function computeGSTINChecksum(first14: string): string {
  const input = first14.toUpperCase();
  if (input.length !== 14) throw new RangeError("computeGSTINChecksum expects exactly 14 characters.");
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const code = CHARSET.indexOf(input.charAt(i));
    if (code < 0) throw new RangeError(`Invalid GSTIN character "${input.charAt(i)}".`);
    const product = code * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARSET.charAt((36 - (sum % 36)) % 36);
}

/**
 * Validates a GST Identification Number (GSTIN), e.g. `27AAPFU0939F1ZV`.
 * Checks length, structure, state code and the check digit.
 *
 * Covers regular taxpayer GSTINs. Special registrations (UIN, OIDAR, TDS/TCS) use
 * different structures and are reported as INVALID_FORMAT.
 */
export function validateGSTIN(input: unknown): ValidationResult<GSTINDetails> {
  const value = compact(input);
  if (!value) return fail(value, "EMPTY", "GSTIN is required.");
  if (value.length !== 15) return fail(value, "INVALID_LENGTH", "GSTIN must be 15 characters.");
  if (!GSTIN_RE.test(value)) {
    return fail(value, "INVALID_FORMAT", "GSTIN must look like 27AAPFU0939F1ZV.");
  }
  const stateCode = value.slice(0, 2);
  const stateName = GST_STATE_CODES[stateCode];
  if (!stateName) return fail(value, "INVALID_STATE_CODE", `"${stateCode}" is not a valid GST state code.`);

  const checksum = value.charAt(14);
  if (computeGSTINChecksum(value.slice(0, 14)) !== checksum) {
    return fail(value, "INVALID_CHECKSUM", "GSTIN check digit does not match. Please re-check the number.");
  }
  const pan = value.slice(2, 12);
  return {
    valid: true,
    value,
    details: {
      stateCode,
      stateName,
      pan,
      panHolderType: PAN_HOLDER_TYPES[pan.charAt(3)],
      entityNumber: value.charAt(12),
      checksum,
    },
  };
}

/** Convenience boolean form of {@link validateGSTIN}. */
export function isValidGSTIN(input: unknown): boolean {
  return validateGSTIN(input).valid;
}

/**
 * Returns `true` when two GSTINs are registered in the same state, which decides
 * whether a sale is intra-state (CGST + SGST) or inter-state (IGST).
 */
export function isIntraStateSupply(supplierGSTIN: string, recipientGSTIN: string): boolean {
  return compact(supplierGSTIN).slice(0, 2) === compact(recipientGSTIN).slice(0, 2);
}
