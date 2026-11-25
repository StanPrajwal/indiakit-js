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
