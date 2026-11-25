import { compact, fail, type ValidationResult } from "./types";

// ---------------------------------------------------------------------------
// TAN: Tax Deduction and Collection Account Number
// ---------------------------------------------------------------------------

export interface TANDetails {
  /** First 3 letters: the jurisdiction (city) code, e.g. "DEL". */
  jurisdictionCode: string;
  /** 4th letter: initial of the deductor's name. */
  nameInitial: string;
}

/**
 * Validates a TAN, e.g. `DELA12345B` (4 letters, 5 digits, 1 letter).
 * Format only: TAN has no public checksum.
 */
export function validateTAN(input: unknown): ValidationResult<TANDetails> {
  const value = compact(input);
  if (!value) return fail(value, "EMPTY", "TAN is required.");
  if (value.length !== 10) return fail(value, "INVALID_LENGTH", "TAN must be 10 characters.");
  if (!/^[A-Z]{4}\d{5}[A-Z]$/.test(value)) {
    return fail(value, "INVALID_FORMAT", "TAN must look like DELA12345B (4 letters, 5 digits, 1 letter).");
  }
  return { valid: true, value, details: { jurisdictionCode: value.slice(0, 3), nameInitial: value.charAt(3) } };
}

/** Convenience boolean form of {@link validateTAN}. */
export function isValidTAN(input: unknown): boolean {
  return validateTAN(input).valid;
}

// ---------------------------------------------------------------------------
// CIN: Corporate Identification Number (MCA)
// ---------------------------------------------------------------------------

/** Ownership / company-type codes used in characters 13–15 of a CIN. */
export const CIN_COMPANY_TYPES: Readonly<Record<string, string>> = Object.freeze({
  PLC: "Public limited company",
  PTC: "Private limited company",
  OPC: "One person company",
  GOI: "Company owned by the Government of India",
  SGC: "State government company",
  FLC: "Public limited subsidiary of a foreign company",
  FTC: "Private subsidiary of a foreign company",
  NPL: "Not-for-profit licensed company (Section 8)",
  GAP: "General association (public)",
  GAT: "General association (private)",
  ULL: "Public unlimited company",
  ULT: "Private unlimited company",
});

export interface CINDetails {
  /** `true` if the first character is "L" (listed on a stock exchange), `false` for "U". */
  listed: boolean;
  /** Characters 2–6: the NIC industry code. */
  industryCode: string;
  /** Characters 7–8: the state of the registered office, as the MCA writes it (e.g. "MH", "KA", "DL"). */
  stateCode: string;
  /** Characters 9–12: year of incorporation. */
  year: number;
  /** Characters 13–15, e.g. "PTC". */
  companyTypeCode: string;
  /** e.g. "Private limited company". */
  companyType: string;
  /** Last 6 digits: registration number at the Registrar of Companies. */
  registrationNumber: string;
}

/**
 * Validates a 21-character CIN, e.g. `U72200KA2010PTC052963`.
 * Checks the structure, the listed/unlisted flag, the year and the company-type code.
 */
export function validateCIN(input: unknown): ValidationResult<CINDetails> {
  const value = compact(input);
  if (!value) return fail(value, "EMPTY", "CIN is required.");
  if (value.length !== 21) return fail(value, "INVALID_LENGTH", "CIN must be 21 characters.");
  const m = /^([LU])(\d{5})([A-Z]{2})(\d{4})([A-Z]{3})(\d{6})$/.exec(value);
  if (!m) {
    return fail(value, "INVALID_FORMAT", "CIN must look like U72200KA2010PTC052963.");
  }
  const year = Number(m[4]);
  if (year < 1850 || year > new Date().getFullYear()) {
    return fail(value, "INVALID_FORMAT", `CIN year of incorporation ${year} is not plausible.`);
  }
  const companyType = CIN_COMPANY_TYPES[m[5]!];
  if (!companyType) return fail(value, "INVALID_FORMAT", `"${m[5]}" is not a CIN company-type code.`);
  return {
    valid: true,
    value,
    details: {
      listed: m[1] === "L",
      industryCode: m[2]!,
      stateCode: m[3]!,
      year,
      companyTypeCode: m[5]!,
      companyType,
      registrationNumber: m[6]!,
    },
  };
}

/** Convenience boolean form of {@link validateCIN}. */
export function isValidCIN(input: unknown): boolean {
  return validateCIN(input).valid;
}

// ---------------------------------------------------------------------------
// LLPIN: Limited Liability Partnership Identification Number
// ---------------------------------------------------------------------------

/** Validates an LLPIN, e.g. `AAB-1234`. The hyphen is optional on input; `value` always has it. */
export function validateLLPIN(input: unknown): ValidationResult<undefined> {
  const raw = compact(input);
  if (!raw) return fail(raw, "EMPTY", "LLPIN is required.");
  if (raw.length !== 7) return fail(raw, "INVALID_LENGTH", "LLPIN must be 3 letters and 4 digits.");
  if (!/^[A-Z]{3}\d{4}$/.test(raw)) return fail(raw, "INVALID_FORMAT", "LLPIN must look like AAB-1234.");
  return { valid: true, value: `${raw.slice(0, 3)}-${raw.slice(3)}`, details: undefined };
}

/** Convenience boolean form of {@link validateLLPIN}. */
export function isValidLLPIN(input: unknown): boolean {
  return validateLLPIN(input).valid;
}

// ---------------------------------------------------------------------------
// Udyam registration number (MSME)
// ---------------------------------------------------------------------------

export interface UdyamDetails {
  /** Two-letter state code, e.g. "MH". */
  stateCode: string;
  /** Two-digit district code. */
  districtCode: string;
  /** Seven-digit serial number. */
  serial: string;
}

/**
 * Validates an MSME Udyam registration number, e.g. `UDYAM-MH-26-0012345`.
 * Accepts it with or without hyphens; `value` is always the hyphenated form.
 */
export function validateUdyam(input: unknown): ValidationResult<UdyamDetails> {
  const raw = compact(input);
  if (!raw) return fail(raw, "EMPTY", "Udyam registration number is required.");
  const m = /^UDYAM([A-Z]{2})(\d{2})(\d{7})$/.exec(raw);
  if (!m) {
    if (raw.length !== 16) return fail(raw, "INVALID_LENGTH", "Udyam number must look like UDYAM-MH-26-0012345.");
    return fail(raw, "INVALID_FORMAT", "Udyam number must look like UDYAM-MH-26-0012345.");
  }
  return {
    valid: true,
    value: `UDYAM-${m[1]}-${m[2]}-${m[3]}`,
    details: { stateCode: m[1]!, districtCode: m[2]!, serial: m[3]! },
  };
}

/** Convenience boolean form of {@link validateUdyam}. */
export function isValidUdyam(input: unknown): boolean {
  return validateUdyam(input).valid;
}

// ---------------------------------------------------------------------------
// Voter ID (EPIC)
// ---------------------------------------------------------------------------

/**
 * Validates a voter ID (Electors Photo Identity Card number) in the current
 * national format: 3 letters and 7 digits, e.g. `ABC1234567`. Some older cards
 * use state-specific formats with slashes, which this rejects.
 */
export function validateVoterId(input: unknown): ValidationResult<undefined> {
  const value = compact(input);
  if (!value) return fail(value, "EMPTY", "Voter ID is required.");
  if (value.length !== 10) return fail(value, "INVALID_LENGTH", "Voter ID must be 10 characters.");
  if (!/^[A-Z]{3}\d{7}$/.test(value)) return fail(value, "INVALID_FORMAT", "Voter ID must look like ABC1234567 (3 letters, 7 digits).");
  return { valid: true, value, details: undefined };
}

/** Convenience boolean form of {@link validateVoterId}. */
export function isValidVoterId(input: unknown): boolean {
  return validateVoterId(input).valid;
}

// ---------------------------------------------------------------------------
// Passport
// ---------------------------------------------------------------------------

/**
 * Validates an Indian passport number: 1 letter and 7 digits, e.g. `J8369854`.
 * Format only; the check digits are in the passport's machine-readable zone, not the number.
 */
export function validatePassport(input: unknown): ValidationResult<undefined> {
  const value = compact(input);
  if (!value) return fail(value, "EMPTY", "Passport number is required.");
  if (value.length !== 8) return fail(value, "INVALID_LENGTH", "Passport number must be 8 characters.");
  if (!/^[A-Z]\d{7}$/.test(value)) return fail(value, "INVALID_FORMAT", "Passport number must be 1 letter followed by 7 digits.");
  if (/^[A-Z]0{7}$/.test(value)) return fail(value, "INVALID_FORMAT", "Passport number cannot be all zeros.");
  return { valid: true, value, details: undefined };
}

/** Convenience boolean form of {@link validatePassport}. */
export function isValidPassport(input: unknown): boolean {
  return validatePassport(input).valid;
}

// ---------------------------------------------------------------------------
// Vehicle registration and driving licence share the RTO state codes
// ---------------------------------------------------------------------------

/** Two-letter state / UT codes used on number plates and driving licences. */
export const RTO_STATE_CODES: Readonly<Record<string, string>> = Object.freeze({
  AN: "Andaman and Nicobar Islands",
  AP: "Andhra Pradesh",
  AR: "Arunachal Pradesh",
  AS: "Assam",
  BR: "Bihar",
  CG: "Chhattisgarh",
  CH: "Chandigarh",
  DD: "Dadra and Nagar Haveli and Daman and Diu",
  DL: "Delhi",
  DN: "Dadra and Nagar Haveli (legacy)",
  GA: "Goa",
  GJ: "Gujarat",
  HP: "Himachal Pradesh",
  HR: "Haryana",
  JH: "Jharkhand",
  JK: "Jammu and Kashmir",
  KA: "Karnataka",
  KL: "Kerala",
  LA: "Ladakh",
  LD: "Lakshadweep",
  MH: "Maharashtra",
  ML: "Meghalaya",
  MN: "Manipur",
  MP: "Madhya Pradesh",
  MZ: "Mizoram",
  NL: "Nagaland",
  OD: "Odisha",
  OR: "Odisha (legacy)",
  PB: "Punjab",
  PY: "Puducherry",
  RJ: "Rajasthan",
  SK: "Sikkim",
  TG: "Telangana",
  TN: "Tamil Nadu",
  TR: "Tripura",
  TS: "Telangana (legacy)",
  UK: "Uttarakhand",
  UA: "Uttarakhand (legacy)",
  UP: "Uttar Pradesh",
  WB: "West Bengal",
});

export interface VehicleRegistrationDetails {
  /** `standard` (e.g. KA 01 AB 1234) or `bharat` (BH series, e.g. 22 BH 1234 AA). */
  series: "standard" | "bharat";
  /** Two-letter state code; undefined for BH-series plates. */
  stateCode: string | undefined;
  stateName: string | undefined;
  /** RTO number, e.g. "01"; undefined for BH-series plates. */
  rtoCode: string | undefined;
  /** Year of registration for BH-series plates, e.g. "22". */
  year: string | undefined;
  /** Display format with spaces, e.g. "KA 01 AB 1234". */
  formatted: string;
}

/**
 * Validates an Indian vehicle registration (number plate), e.g. `KA 01 AB 1234`,
 * `DL 1C AB 1234`, `MH12DE1433` or a Bharat-series plate such as `22 BH 1234 AA`.
 * Checks the state code and the shape; it can't tell whether the vehicle exists.
 */
export function validateVehicleRegistration(input: unknown): ValidationResult<VehicleRegistrationDetails> {
  const value = compact(input).replace(/\./g, "");
  if (!value) return fail(value, "EMPTY", "Vehicle number is required.");
  if (value.length < 6 || value.length > 11) return fail(value, "INVALID_LENGTH", "Vehicle number must be 6 to 11 characters.");

  const bh = /^(\d{2})BH(\d{4})([A-Z]{1,2})$/.exec(value);
  if (bh) {
    return {
      valid: true,
      value,
      details: {
        series: "bharat",
        stateCode: undefined,
        stateName: undefined,
        rtoCode: undefined,
        year: bh[1],
        formatted: `${bh[1]} BH ${bh[2]} ${bh[3]}`,
      },
    };
  }

  const m = /^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{1,4})$/.exec(value);
  if (!m) return fail(value, "INVALID_FORMAT", "Vehicle number must look like KA 01 AB 1234.");
  const stateName = RTO_STATE_CODES[m[1]!];
  if (!stateName) return fail(value, "INVALID_STATE_CODE", `"${m[1]}" is not an Indian state code for vehicles.`);
  if (/^0+$/.test(m[4]!)) return fail(value, "INVALID_FORMAT", "Vehicle number cannot end in all zeros.");
  return {
    valid: true,
    value,
    details: {
      series: "standard",
      stateCode: m[1],
      stateName,
      rtoCode: m[2],
      year: undefined,
      formatted: [m[1], m[2], m[3], m[4]].filter(Boolean).join(" "),
    },
  };
}

/** Convenience boolean form of {@link validateVehicleRegistration}. */
export function isValidVehicleRegistration(input: unknown): boolean {
  return validateVehicleRegistration(input).valid;
}

export interface DrivingLicenceDetails {
  stateCode: string;
  stateName: string;
  /** Two-digit RTO code. */
  rtoCode: string;
  /** Year the licence was issued. */
  year: number;
  /** Seven-digit serial number. */
  serial: string;
  /** e.g. "MH14 20110062821" (the layout printed on most cards). */
  formatted: string;
}

/**
 * Validates a driving licence number in the national (Sarathi) format:
 * state code, 2-digit RTO, 4-digit year of issue and 7-digit serial, e.g.
 * `MH14 20110062821` or `MH-1420110062821`. Older state formats are rejected.
 */
export function validateDrivingLicence(input: unknown): ValidationResult<DrivingLicenceDetails> {
  const value = compact(input).replace(/[/.]/g, "");
  if (!value) return fail(value, "EMPTY", "Driving licence number is required.");
  if (value.length !== 15) return fail(value, "INVALID_LENGTH", "Driving licence number must be 15 characters (e.g. MH14 20110062821).");
  const m = /^([A-Z]{2})(\d{2})(\d{4})(\d{7})$/.exec(value);
  if (!m) return fail(value, "INVALID_FORMAT", "Driving licence number must look like MH14 20110062821.");
  const stateName = RTO_STATE_CODES[m[1]!];
  if (!stateName) return fail(value, "INVALID_STATE_CODE", `"${m[1]}" is not an Indian state code for driving licences.`);
  const year = Number(m[3]);
  if (year < 1950 || year > new Date().getFullYear()) {
    return fail(value, "INVALID_FORMAT", `Driving licence year of issue ${year} is not plausible.`);
  }
  return {
    valid: true,
    value,
    details: {
      stateCode: m[1]!,
      stateName,
      rtoCode: m[2]!,
      year,
      serial: m[4]!,
      formatted: `${m[1]}${m[2]} ${m[3]}${m[4]}`,
    },
  };
}

/** Convenience boolean form of {@link validateDrivingLicence}. */
export function isValidDrivingLicence(input: unknown): boolean {
  return validateDrivingLicence(input).valid;
}

// ---------------------------------------------------------------------------
// Bank account number
// ---------------------------------------------------------------------------

/**
 * Validates the shape of an Indian bank account number: 9 to 18 digits.
 * Banks don't share a checksum, so the only real check is a penny-drop
 * verification through your payment provider. Pair it with {@link validateIFSC}.
 */
export function validateBankAccount(input: unknown): ValidationResult<undefined> {
  const value = input === null || input === undefined ? "" : String(input).replace(/[\s-]+/g, "");
  if (!value) return fail(value, "EMPTY", "Account number is required.");
  if (!/^\d+$/.test(value)) return fail(value, "INVALID_FORMAT", "Account number can only contain digits.");
  if (value.length < 9 || value.length > 18) return fail(value, "INVALID_LENGTH", "Account number must be 9 to 18 digits.");
  if (/^0+$/.test(value)) return fail(value, "INVALID_FORMAT", "Account number cannot be all zeros.");
  return { valid: true, value, details: undefined };
}

/** Convenience boolean form of {@link validateBankAccount}. */
export function isValidBankAccount(input: unknown): boolean {
  return validateBankAccount(input).valid;
}
