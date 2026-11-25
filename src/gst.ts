import { validateGSTIN } from "./gstin";
import { GST_STATE_CODES } from "./states";
import { fail, type ValidationResult } from "./types";

/**
 * Union territories without a legislature. Intra-UT supplies there are taxed as
 * CGST + UTGST instead of CGST + SGST. (Delhi, Puducherry and Jammu and Kashmir
 * have legislatures, so they use SGST.)
 */
export const UTGST_STATE_CODES: readonly string[] = Object.freeze(["04", "25", "26", "31", "35", "38"]);

export interface GSTLineItem {
  /** Free text, copied to the result. */
  description?: string;
  /** HSN code (goods) or SAC (services), copied to the result and checked with {@link validateHSN}. */
  hsn?: string;
  /** Default 1. Can be fractional (e.g. 2.5 kg). */
  quantity?: number;
  /** Price per unit in rupees. Excludes GST unless `priceIncludesTax` is set. */
  unitPrice: number;
  /** GST rate in percent, e.g. 18. This is the full rate; it is split into CGST + SGST/UTGST for intra-state supplies. */
  rate: number;
  /** Discount on the whole line in rupees, taken off before tax (or off the tax-inclusive amount when `priceIncludesTax`). */
  discount?: number;
  /** Compensation cess in percent of the taxable value (ad valorem only). */
  cessRate?: number;
}

export interface ComputeGSTInput {
  /** Supplier's GSTIN, two-digit state code (`"27"`) or state name (`"Maharashtra"`). */
  supplierState: string | number;
  /**
   * Place of supply: recipient's GSTIN, two-digit state code or state name.
   * For unregistered (B2C) buyers this is usually the delivery state.
   * Optional when `zeroRated` is set.
   */
  placeOfSupply?: string | number;
  items: readonly GSTLineItem[];
  /** `true` when `unitPrice` already includes GST (MRP-style pricing). Default `false`. */
  priceIncludesTax?: boolean;
  /**
   * Exports and supplies to SEZ units are zero-rated and always inter-state.
   * - `"lut"`: supplied under a Letter of Undertaking / bond, no tax charged.
   * - `"igst"`: IGST is charged (and claimed back as a refund).
   */
  zeroRated?: "lut" | "igst";
  /**
   * Reverse charge: tax is calculated and shown, but the recipient pays it to the
   * government. `totals.invoiceValue` then excludes tax.
   */
  reverseCharge?: boolean;
  /** Round the grand total to the nearest rupee and report the difference in `totals.roundOff`. Default `false`. */
  roundOff?: boolean;
}

export interface GSTTaxAmounts {
  taxableValue: number;
  cgst: number;
  /** State tax. Zero when the place of supply is a UT without a legislature (see `utgst`). */
  sgst: number;
  /** Union territory tax, used instead of SGST for intra-UT supplies in UTs without a legislature. */
  utgst: number;
  igst: number;
  cess: number;
  /** cgst + sgst + utgst + igst + cess */
  totalTax: number;
}

export interface GSTLineResult extends GSTTaxAmounts {
  /** Position in the input `items` array. */
  index: number;
  description: string | undefined;
  hsn: string | undefined;
  quantity: number;
  unitPrice: number;
  rate: number;
  cessRate: number;
  discount: number;
  /** taxableValue + totalTax */
  total: number;
}

export interface GSTRateSummary extends GSTTaxAmounts {
  rate: number;
  cessRate: number;
}

export interface GSTComputation {
  /** `intra-state` → CGST + SGST/UTGST; `inter-state` → IGST. Zero-rated supplies are always inter-state. */
  supplyKind: "intra-state" | "inter-state";
  /** Which tax heads apply, e.g. `["CGST", "SGST"]` or `["IGST"]`. Includes `"CESS"` when any line has cess. */
  taxHeads: Array<"CGST" | "SGST" | "UTGST" | "IGST" | "CESS">;
  supplierStateCode: string;
  supplierStateName: string;
  placeOfSupplyCode: string | undefined;
  placeOfSupplyName: string | undefined;
  zeroRated: "lut" | "igst" | undefined;
  reverseCharge: boolean;
  lines: GSTLineResult[];
  /** Totals grouped by GST rate (and cess rate), sorted by rate. Use it for the tax table at the foot of an invoice. */
  rateSummary: GSTRateSummary[];
  totals: GSTTaxAmounts & {
    /** taxableValue + totalTax, or just taxableValue under reverse charge. Before rounding. */
    invoiceValue: number;
    /** grandTotal − invoiceValue; 0 unless `roundOff` is set. */
    roundOff: number;
    /** What the recipient pays the supplier. */
    grandTotal: number;
  };
}

/** Rupees → integer paise, avoiding binary float drift (e.g. 1.005 → 101 paise). */
function toPaise(rupees: number): number {
  return Math.round(Number((rupees * 100).toPrecision(15)));
}
const toRupees = (paise: number) => paise / 100;

function resolveState(input: string | number, field: string): string {
  const raw = String(input).trim();
  if (/^\d{1,2}$/.test(raw)) {
    const code = raw.padStart(2, "0");
    if (GST_STATE_CODES[code]) return code;
    throw new RangeError(`${field}: "${raw}" is not a GST state code.`);
  }
  if (raw.replace(/[\s-]/g, "").length === 15) {
    const r = validateGSTIN(raw);
    if (!r.valid) throw new TypeError(`${field}: ${r.message}`);
    return r.details.stateCode;
  }
  const lower = raw.toLowerCase();
  for (const [code, name] of Object.entries(GST_STATE_CODES)) {
    if (name.toLowerCase() === lower) return code;
  }
  throw new TypeError(`${field}: expected a GSTIN, a two-digit state code or a state name, got "${raw}".`);
}

function checkNumber(value: unknown, field: string, { min = 0, max = Infinity, positive = false } = {}): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${field} must be a finite number.`);
  if (positive ? value <= min : value < min) throw new RangeError(`${field} must be ${positive ? "greater than" : "at least"} ${min}.`);
  if (value > max) throw new RangeError(`${field} must be at most ${max}.`);
  return value;
}

const zeroAmounts = (): GSTTaxAmounts => ({ taxableValue: 0, cgst: 0, sgst: 0, utgst: 0, igst: 0, cess: 0, totalTax: 0 });

function addInto(target: GSTTaxAmounts, src: GSTTaxAmounts): void {
  target.taxableValue += src.taxableValue;
  target.cgst += src.cgst;
  target.sgst += src.sgst;
  target.utgst += src.utgst;
  target.igst += src.igst;
  target.cess += src.cess;
  target.totalTax += src.totalTax;
}

function amountsToRupees<T extends GSTTaxAmounts>(a: T): T {
  return {
    ...a,
    taxableValue: toRupees(a.taxableValue),
    cgst: toRupees(a.cgst),
    sgst: toRupees(a.sgst),
    utgst: toRupees(a.utgst),
    igst: toRupees(a.igst),
    cess: toRupees(a.cess),
    totalTax: toRupees(a.totalTax),
  };
}

/**
 * Calculates GST for an invoice: decides CGST + SGST/UTGST vs IGST from the
 * supplier state and place of supply, then computes each line, a rate-wise
 * summary and the invoice totals.
 *
 * All arithmetic is done in integer paise. Tax is rounded half-up to the paisa
 * per line, and CGST and SGST are always equal. With `priceIncludesTax`, each
 * line's taxable value is backed out so that taxable value + tax equals the
 * price exactly.
 *
 * ```ts
 * computeGST({
 *   supplierState: "27AAPFU0939F1ZV",   // Maharashtra
 *   placeOfSupply: "29",                // Karnataka → IGST
 *   items: [{ description: "Laptop stand", hsn: "8473", quantity: 2, unitPrice: 1499, rate: 18 }],
 * }).totals;
 * // { taxableValue: 2998, igst: 539.64, totalTax: 539.64, invoiceValue: 3537.64, grandTotal: 3537.64, … }
 * ```
 *
 * Throws `TypeError` / `RangeError` for invalid input.
 */
export function computeGST(input: ComputeGSTInput): GSTComputation {
  if (!input || typeof input !== "object") throw new TypeError("computeGST expects an input object.");
  const supplierStateCode = resolveState(input.supplierState, "supplierState");
  const zeroRated = input.zeroRated;
  if (zeroRated !== undefined && zeroRated !== "lut" && zeroRated !== "igst") {
    throw new TypeError('zeroRated must be "lut" or "igst".');
  }
  if (input.placeOfSupply === undefined && !zeroRated) throw new TypeError("placeOfSupply is required.");
  const placeOfSupplyCode =
    input.placeOfSupply === undefined ? undefined : resolveState(input.placeOfSupply, "placeOfSupply");
  if (!Array.isArray(input.items) || input.items.length === 0) throw new TypeError("items must be a non-empty array.");

  const intra = !zeroRated && supplierStateCode === placeOfSupplyCode;
  const useUTGST = intra && UTGST_STATE_CODES.includes(supplierStateCode);
  const taxCharged = zeroRated !== "lut";
  const inclusive = input.priceIncludesTax === true;
  const reverseCharge = input.reverseCharge === true;

  const lines: GSTLineResult[] = [];
  const totals = zeroAmounts();
  const groups = new Map<string, GSTRateSummary>();
  let anyCess = false;

  input.items.forEach((item, index) => {
    const at = `items[${index}]`;
    if (!item || typeof item !== "object") throw new TypeError(`${at} must be an object.`);
    const quantity = item.quantity === undefined ? 1 : checkNumber(item.quantity, `${at}.quantity`, { positive: true });
    const unitPrice = checkNumber(item.unitPrice, `${at}.unitPrice`);
    const rate = checkNumber(item.rate, `${at}.rate`, { max: 100 });
    const cessRate = item.cessRate === undefined ? 0 : checkNumber(item.cessRate, `${at}.cessRate`, { max: 1000 });
    const discount = item.discount === undefined ? 0 : checkNumber(item.discount, `${at}.discount`);
    if (item.hsn !== undefined) {
      const h = validateHSN(item.hsn);
      if (!h.valid) throw new TypeError(`${at}.hsn: ${h.message}`);
    }
    if (cessRate > 0) anyCess = true;

    const base = toPaise(quantity * unitPrice) - toPaise(discount);
    if (base < 0) throw new RangeError(`${at}.discount is larger than the line amount.`);

    const effRate = taxCharged ? rate : 0;
    const effCess = taxCharged ? cessRate : 0;
    let taxable = inclusive ? Math.round((base * 100) / (100 + effRate + effCess)) : base;

    const a = zeroAmounts();
    if (intra) {
      const half = Math.round((taxable * effRate) / 200);
      a.cgst = half;
      if (useUTGST) a.utgst = half;
      else a.sgst = half;
    } else {
      a.igst = Math.round((taxable * effRate) / 100);
    }
    a.cess = Math.round((taxable * effCess) / 100);
    a.totalTax = a.cgst + a.sgst + a.utgst + a.igst + a.cess;
    if (inclusive) taxable = base - a.totalTax; // keep taxable + tax == price exactly
    a.taxableValue = taxable;

    addInto(totals, a);
    const key = `${rate}|${cessRate}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { rate, cessRate, ...zeroAmounts() }));
    addInto(g, a);

    lines.push({
      index,
      description: item.description,
      hsn: item.hsn === undefined ? undefined : String(item.hsn).replace(/\s+/g, ""),
      quantity,
      unitPrice,
      rate,
      cessRate,
      discount,
      ...amountsToRupees(a),
      total: toRupees(a.taxableValue + a.totalTax),
    });
  });

  const invoiceValue = reverseCharge ? totals.taxableValue : totals.taxableValue + totals.totalTax;
  const grandTotal = input.roundOff ? Math.round(invoiceValue / 100) * 100 : invoiceValue;

  const taxHeads: GSTComputation["taxHeads"] = intra ? ["CGST", useUTGST ? "UTGST" : "SGST"] : ["IGST"];
  if (anyCess) taxHeads.push("CESS");

  return {
    supplyKind: intra ? "intra-state" : "inter-state",
    taxHeads,
    supplierStateCode,
    supplierStateName: GST_STATE_CODES[supplierStateCode]!,
    placeOfSupplyCode,
    placeOfSupplyName: placeOfSupplyCode === undefined ? undefined : GST_STATE_CODES[placeOfSupplyCode],
    zeroRated,
    reverseCharge,
    lines,
    rateSummary: [...groups.values()]
      .sort((x, y) => x.rate - y.rate || x.cessRate - y.cessRate)
      .map(amountsToRupees),
    totals: {
      ...amountsToRupees(totals),
      invoiceValue: toRupees(invoiceValue),
      roundOff: toRupees(grandTotal - invoiceValue),
      grandTotal: toRupees(grandTotal),
    },
  };
}

export interface HSNDetails {
  /** `services` for SAC codes (start with 99), otherwise `goods`. */
  kind: "goods" | "services";
  /** First two digits: the HSN chapter (99 for services). */
  chapter: string;
}

/**
 * Checks the shape of an HSN code (goods: 4, 6 or 8 digits) or SAC (services:
 * 6 digits starting with 99). Format only; it doesn't check the code exists.
 */
export function validateHSN(input: unknown): ValidationResult<HSNDetails> {
  const value = input === null || input === undefined ? "" : String(input).replace(/\s+/g, "");
  if (!value) return fail(value, "EMPTY", "HSN / SAC code is required.");
  if (!/^\d+$/.test(value)) return fail(value, "INVALID_FORMAT", "HSN / SAC code can only contain digits.");
  if (![4, 6, 8].includes(value.length)) return fail(value, "INVALID_LENGTH", "HSN code must be 4, 6 or 8 digits.");
  const chapter = value.slice(0, 2);
  if (chapter === "99") {
    if (value.length !== 6) return fail(value, "INVALID_LENGTH", "SAC (services) codes are 6 digits.");
    return { valid: true, value, details: { kind: "services", chapter } };
  }
  if (chapter === "00" || Number(chapter) > 98) return fail(value, "INVALID_FORMAT", `"${chapter}" is not an HSN chapter.`);
  return { valid: true, value, details: { kind: "goods", chapter } };
}

/** Convenience boolean form of {@link validateHSN}. */
export function isValidHSN(input: unknown): boolean {
  return validateHSN(input).valid;
}
