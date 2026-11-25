import { compact, fail, type ValidationResult } from "./types";

/** PAN holder type, taken from the 4th character of the PAN. */
export const PAN_HOLDER_TYPES: Readonly<Record<string, string>> = Object.freeze({
  P: "Individual",
  C: "Company",
  H: "Hindu Undivided Family (HUF)",
  F: "Firm / Partnership",
  A: "Association of Persons (AOP)",
  T: "Trust",
  B: "Body of Individuals (BOI)",
  L: "Local Authority",
  J: "Artificial Juridical Person",
  G: "Government",
  E: "Limited Liability Partnership (LLP)",
});

export interface PANDetails {
  /** 4th character, e.g. "P". */
  holderTypeCode: string;
  /** e.g. "Individual". */
  holderType: string;
}

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/**
 * Validates an Indian Permanent Account Number (PAN), e.g. `ABCPE1234F`.
 * Checks structure and the holder-type character. PAN has no public checksum.
 */
export function validatePAN(input: unknown): ValidationResult<PANDetails> {
  const value = compact(input);
  if (!value) return fail(value, "EMPTY", "PAN is required.");
  if (value.length !== 10) return fail(value, "INVALID_LENGTH", "PAN must be 10 characters.");
  if (!PAN_RE.test(value)) {
    return fail(value, "INVALID_FORMAT", "PAN must look like ABCPE1234F (5 letters, 4 digits, 1 letter).");
  }
  const holderTypeCode = value.charAt(3);
  const holderType = PAN_HOLDER_TYPES[holderTypeCode];
  if (!holderType) {
    return fail(value, "INVALID_HOLDER_TYPE", `"${holderTypeCode}" is not a valid PAN holder type (4th character).`);
  }
  return { valid: true, value, details: { holderTypeCode, holderType } };
}

/** Convenience boolean form of {@link validatePAN}. */
export function isValidPAN(input: unknown): boolean {
  return validatePAN(input).valid;
}

/** Masks a PAN for display, e.g. `ABCPE1234F` → `XXXXXX234F`. */
export function maskPAN(input: unknown, visible = 4): string {
  const value = compact(input);
  if (value.length <= visible) return value;
  return "X".repeat(value.length - visible) + value.slice(-visible);
}
