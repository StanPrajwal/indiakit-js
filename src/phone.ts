import { fail, type ValidationResult } from "./types";

export interface PhoneDetails {
  /** 10-digit national number, e.g. "9876543210". */
  national: string;
  /** E.164 format, e.g. "+919876543210". */
  e164: string;
  /** Display format, e.g. "+91 98765 43210". */
  formatted: string;
}

/**
 * Validates an Indian mobile number. Accepts `9876543210`, `09876543210`,
 * `+91 98765 43210`, `91-98765-43210`, `(+91) 98765 43210`.
 * The normalized `value` is E.164 (`+919876543210`).
 */
export function validateIndianMobile(input: unknown): ValidationResult<PhoneDetails> {
  const raw = input === null || input === undefined ? "" : String(input).trim();
  if (!raw) return fail("", "EMPTY", "Mobile number is required.");
  if (/[^\d\s()+.-]/.test(raw)) return fail(raw, "INVALID_FORMAT", "Mobile number can only contain digits, spaces, +, - and brackets.");

  let digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);

  if (digits.length !== 10) return fail(digits, "INVALID_LENGTH", "Mobile number must be 10 digits.");
  if (!/^[6-9]/.test(digits)) return fail(digits, "INVALID_FORMAT", "Indian mobile numbers start with 6, 7, 8 or 9.");

  const e164 = `+91${digits}`;
  return {
    valid: true,
    value: e164,
    details: { national: digits, e164, formatted: `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` },
  };
}

/** Convenience boolean form of {@link validateIndianMobile}. */
export function isValidIndianMobile(input: unknown): boolean {
  return validateIndianMobile(input).valid;
}

/** Formats a valid mobile number as `+91 98765 43210`; returns the input unchanged if invalid. */
export function formatIndianMobile(input: string): string {
  const r = validateIndianMobile(input);
  return r.valid ? r.details.formatted : input;
}
