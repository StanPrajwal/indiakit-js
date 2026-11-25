import { PAN_HOLDER_TYPES } from "./pan";
import { GST_STATE_CODES } from "./states";
import { compact, fail, type ValidationResult } from "./types";

const CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
/** Regular taxpayer: state + PAN + entity number + (usually) "Z" + check. */
const REGULAR_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z][A-Z0-9][0-9A-Z]$/;
/** TDS deductor: state + TAN + entity number + "D" + check. */
const TDS_RE = /^[0-9]{2}[A-Z]{4}[0-9]{5}[A-Z][1-9A-Z]D[0-9A-Z]$/;
/** UIN (UN bodies, embassies) and OIDAR / non-resident: state + year + 3-letter code + 5-digit serial + 2-letter type + check. */
const SPECIAL_RE = /^[0-9]{2}[0-9]{2}[A-Z]{3}[0-9]{5}[A-Z]{2}[0-9A-Z]$/;

/**
 * Kind of GST registration:
 * - `regular`: normal taxpayer (PAN-based).
 * - `tcs`: e-commerce operator collecting tax at source (PAN-based, 14th character "C").
 * - `tds`: government or notified body deducting tax at source (TAN-based, 14th character "D").
 * - `uin`: Unique Identification Number for UN bodies, embassies and consulates.
 * - `oidar`: foreign provider of online services (state code 99 or 97).
 */
export type GSTINType = "regular" | "tcs" | "tds" | "uin" | "oidar";

export const GSTIN_TYPE_LABELS: Readonly<Record<GSTINType, string>> = Object.freeze({
  regular: "Regular taxpayer",
  tcs: "Tax Collector at Source (e-commerce operator)",
  tds: "Tax Deductor at Source",
  uin: "UN body / embassy (UIN)",
  oidar: "Non-resident online service provider (OIDAR)",
});

export interface GSTINDetails {
  type: GSTINType;
  /** Human-readable form of `type`. */
  typeLabel: string;
  stateCode: string;
  /** State or UT name; "Other Country" / "Other Territory" for OIDAR registrations. */
  stateName: string;
  /** Characters 3–12: the PAN of the taxpayer (regular and TCS registrations only). */
  pan: string | undefined;
  /** PAN holder type, e.g. "Company", when recognised. */
  panHolderType: string | undefined;
  /** Characters 3–12: the TAN of the deductor (TDS registrations only). */
  tan: string | undefined;
  /** 13th character: registration number for this PAN/TAN within the state (regular, TCS and TDS only). */
  entityNumber: string | undefined;
  /** Two-digit registration year, e.g. "17" (UIN and OIDAR only). */
  registrationYear: string | undefined;
  /** Three-letter country or organisation code, e.g. "USA" or "UNO" (UIN and OIDAR only). */
  countryCode: string | undefined;
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

const OIDAR_STATES: Readonly<Record<string, string>> = { "99": "Other Country", "97": "Other Territory" };

function detectType(value: string): GSTINType | undefined {
  if (SPECIAL_RE.test(value)) return OIDAR_STATES[value.slice(0, 2)] ? "oidar" : "uin";
  if (TDS_RE.test(value)) return "tds";
  if (REGULAR_RE.test(value)) return value.charAt(13) === "C" ? "tcs" : "regular";
  return undefined;
}

/**
 * Validates a GST Identification Number (GSTIN), e.g. `27AAPFU0939F1ZV`.
 * Checks length, structure, state code and the check digit, and reports the
 * registration type in `details.type`.
 *
 * Supports regular taxpayers, TCS (e-commerce operators), TDS deductors,
 * UINs (UN bodies, embassies) and OIDAR / non-resident online service providers.
 * Pass `{ types: ["regular"] }` to accept only some of them.
 */
export function validateGSTIN(input: unknown, options: { types?: readonly GSTINType[] } = {}): ValidationResult<GSTINDetails> {
  const value = compact(input);
  if (!value) return fail(value, "EMPTY", "GSTIN is required.");
  if (value.length !== 15) return fail(value, "INVALID_LENGTH", "GSTIN must be 15 characters.");
  const type = detectType(value);
  if (!type) return fail(value, "INVALID_FORMAT", "GSTIN must look like 27AAPFU0939F1ZV.");
  if (options.types && !options.types.includes(type)) {
    return fail(value, "INVALID_FORMAT", `${GSTIN_TYPE_LABELS[type]} GSTINs are not accepted here.`);
  }

  const stateCode = value.slice(0, 2);
  const stateName = type === "oidar" ? OIDAR_STATES[stateCode] : GST_STATE_CODES[stateCode];
  if (!stateName || (type !== "oidar" && OIDAR_STATES[stateCode])) {
    return fail(value, "INVALID_STATE_CODE", `"${stateCode}" is not a valid GST state code.`);
  }

  const checksum = value.charAt(14);
  if (computeGSTINChecksum(value.slice(0, 14)) !== checksum) {
    return fail(value, "INVALID_CHECKSUM", "GSTIN check digit does not match. Please re-check the number.");
  }

  const idPart = value.slice(2, 12);
  const panBased = type === "regular" || type === "tcs";
  const special = type === "uin" || type === "oidar";
  return {
    valid: true,
    value,
    details: {
      type,
      typeLabel: GSTIN_TYPE_LABELS[type],
      stateCode,
      stateName,
      pan: panBased ? idPart : undefined,
      panHolderType: panBased ? PAN_HOLDER_TYPES[idPart.charAt(3)] : undefined,
      tan: type === "tds" ? idPart : undefined,
      entityNumber: special ? undefined : value.charAt(12),
      registrationYear: special ? value.slice(2, 4) : undefined,
      countryCode: special ? value.slice(4, 7) : undefined,
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
