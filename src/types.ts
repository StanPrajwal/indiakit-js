/** Result returned by every validator in bharatkit. */
export type ValidationResult<TDetails = undefined> =
  | {
      valid: true;
      /** The normalized value (trimmed, upper-cased, separators removed where relevant). */
      value: string;
      details: TDetails;
    }
  | {
      valid: false;
      /** The normalized value that was checked. */
      value: string;
      error: ValidationErrorCode;
      /** Human-readable English message, safe to show in a form. */
      message: string;
    };

export type ValidationErrorCode =
  | "EMPTY"
  | "INVALID_LENGTH"
  | "INVALID_FORMAT"
  | "INVALID_CHECKSUM"
  | "INVALID_STATE_CODE"
  | "INVALID_HOLDER_TYPE"
  | "INVALID_AMOUNT";

/** @internal */
export function fail(
  value: string,
  error: ValidationErrorCode,
  message: string,
): { valid: false; value: string; error: ValidationErrorCode; message: string } {
  return { valid: false, value, error, message };
}

/** @internal Upper-case and remove whitespace and hyphens. */
export function compact(input: unknown): string {
  if (input === null || input === undefined) return "";
  return String(input).replace(/[\s-]+/g, "").toUpperCase();
}
