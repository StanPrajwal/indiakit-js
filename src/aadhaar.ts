import { fail, type ValidationResult } from "./types";

export interface AadhaarDetails {
  /** Grouped for display, e.g. "2345 6789 0124". Avoid showing this; prefer `masked`. */
  formatted: string;
  /** UIDAI-style masked form that shows only the last 4 digits, e.g. "XXXX XXXX 0124". */
  masked: string;
  /** Last 4 digits, e.g. "0124". */
  last4: string;
}

// Verhoeff tables (dihedral group D5).
const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
] as const;
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
] as const;
const INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9] as const;

function verhoeff(digits: string, offset: number): number {
  let c = 0;
  for (let i = 0; i < digits.length; i++) {
    const n = digits.charCodeAt(digits.length - 1 - i) - 48;
    c = D[c]![P[(i + offset) % 8]![n]!]!;
  }
  return c;
}

/** @internal True if the digit string passes the Verhoeff check. */
export function isVerhoeffValid(digits: string): boolean {
  return /^\d+$/.test(digits) && verhoeff(digits, 0) === 0;
}

/**
 * Computes the Verhoeff check digit for the first 11 digits of an Aadhaar number.
 * Useful for generating test fixtures.
 */
export function computeAadhaarChecksum(first11: string): string {
  if (!/^\d{11}$/.test(first11)) throw new TypeError("computeAadhaarChecksum expects exactly 11 digits.");
  return String(INV[verhoeff(first11, 1)]);
}

/**
 * Validates a 12-digit Aadhaar number, e.g. `2345 6789 0124`.
 * Accepts spaces and hyphens. Checks length, the first digit (Aadhaar never
 * starts with 0 or 1) and the Verhoeff check digit. It cannot tell you whether
 * the number was actually issued; only UIDAI can.
 */
export function validateAadhaar(input: unknown): ValidationResult<AadhaarDetails> {
  const value = input === null || input === undefined ? "" : String(input).replace(/[\s-]+/g, "");
  if (!value) return fail(value, "EMPTY", "Aadhaar number is required.");
  if (!/^\d+$/.test(value)) return fail(value, "INVALID_FORMAT", "Aadhaar number can only contain digits.");
  if (value.length !== 12) return fail(value, "INVALID_LENGTH", "Aadhaar number must be 12 digits.");
  if (!/^[2-9]/.test(value)) return fail(value, "INVALID_FORMAT", "Aadhaar numbers never start with 0 or 1.");
  if (!isVerhoeffValid(value)) {
    return fail(value, "INVALID_CHECKSUM", "Aadhaar check digit does not match. Please re-check the number.");
  }
  const last4 = value.slice(8);
  return {
    valid: true,
    value,
    details: {
      formatted: `${value.slice(0, 4)} ${value.slice(4, 8)} ${last4}`,
      masked: `XXXX XXXX ${last4}`,
      last4,
    },
  };
}

/** Convenience boolean form of {@link validateAadhaar}. */
export function isValidAadhaar(input: unknown): boolean {
  return validateAadhaar(input).valid;
}

/**
 * Masks an Aadhaar number the way UIDAI requires for display and storage
 * (only the last 4 digits visible), e.g. `234567890124` → `XXXX XXXX 0124`.
 * Works on any 12-digit input, valid or not.
 */
export function maskAadhaar(input: unknown): string {
  const value = input === null || input === undefined ? "" : String(input).replace(/[\s-]+/g, "");
  if (value.length <= 4) return value;
  return `XXXX XXXX ${value.slice(-4)}`;
}
