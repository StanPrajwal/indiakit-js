export interface FormatINROptions {
  /** Prefix with "₹". Default `true`. */
  symbol?: boolean;
  /** Fraction digits. Default `2`. */
  decimals?: number;
  /** Drop ".00" when the amount is a whole number. Default `false`. */
  trimZeroDecimals?: boolean;
}

function toNumber(amount: number | string | bigint): number {
  if (typeof amount === "number") return amount;
  if (typeof amount === "bigint") return Number(amount);
  return parseINR(amount);
}

/** Groups an integer string the Indian way: 1234567 → "12,34,567". */
export function groupIndian(intDigits: string): string {
  if (intDigits.length <= 3) return intDigits;
  const last3 = intDigits.slice(-3);
  const rest = intDigits.slice(0, -3);
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3;
}

/**
 * Formats an amount in Indian numbering, e.g. `1234567.5` → `₹12,34,567.50`.
 * Deterministic: does not depend on the runtime's Intl/ICU data.
 */
export function formatINR(amount: number | string | bigint, options: FormatINROptions = {}): string {
  const { symbol = true, decimals = 2, trimZeroDecimals = false } = options;
  const n = toNumber(amount);
  if (!Number.isFinite(n)) return "";
  const negative = n < 0;
  const fixed = Math.abs(n).toFixed(Math.max(0, Math.min(20, decimals)));
  let [intPart = "0", frac = ""] = fixed.split(".");
  if (trimZeroDecimals && /^0*$/.test(frac)) frac = "";
  const body = groupIndian(intPart) + (frac ? "." + frac : "");
  return (negative ? "-" : "") + (symbol ? "₹" : "") + body;
}

export interface FormatINRCompactOptions {
  /** Prefix with "₹". Default `true`. */
  symbol?: boolean;
  /** Max fraction digits. Default `2`. */
  decimals?: number;
  /** `"short"` → "L" / "Cr" / "K"; `"long"` → "lakh" / "crore" / "thousand". Default `"short"`. */
  style?: "short" | "long";
}

/**
 * Compact Indian notation: `150000` → `₹1.5 L`, `25000000` → `₹2.5 Cr`, `4500` → `₹4.5K`.
 */
export function formatINRCompact(amount: number | string | bigint, options: FormatINRCompactOptions = {}): string {
  const { symbol = true, decimals = 2, style = "short" } = options;
  const n = toNumber(amount);
  if (!Number.isFinite(n)) return "";
  const abs = Math.abs(n);
  const units: Array<[number, string, string]> = [
    [1e7, " Cr", " crore"],
    [1e5, " L", " lakh"],
    [1e3, "K", " thousand"],
  ];
  const trim = (x: number) => {
    const s = x.toFixed(decimals);
    return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
  };
  let out = trim(abs);
  for (const [div, short, long] of units) {
    if (abs >= div) {
      const scaled = abs / div;
      // Use Indian grouping for very large crore values (e.g. 1,250 Cr).
      const [i = "0", f] = trim(scaled).split(".");
      out = groupIndian(i) + (f ? "." + f : "") + (style === "long" ? long : short);
      break;
    }
  }
  return (n < 0 ? "-" : "") + (symbol ? "₹" : "") + out;
}

/**
 * Parses an INR string such as `"₹12,34,567.50"`, `"Rs. 1,500"`, `"INR 2.5"` into a number.
 * Returns `NaN` if the input cannot be parsed.
 */
export function parseINR(input: string): number {
  if (typeof input !== "string") return NaN;
  const cleaned = input
    .trim()
    .replace(/^(-)?\s*(₹|rs\.?|inr)\s*/i, "$1")
    .replace(/[,\s]/g, "")
    .replace(/\/-$/, "");
  if (!/^-?\d+(\.\d+)?$|^-?\.\d+$/.test(cleaned)) return NaN;
  return Number(cleaned);
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n]!;
  const t = TENS[Math.floor(n / 10)]!;
  const o = ONES[n % 10]!;
  return o ? `${t} ${o}` : t;
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (r) parts.push(twoDigits(r));
  return parts.join(" ");
}

/** Converts a non-negative integer to Indian-system words: 1234567 → "Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven". */
export function numberToIndianWords(n: number): string {
  if (!Number.isInteger(n) || n < 0) throw new RangeError("numberToIndianWords expects a non-negative integer.");
  if (!Number.isSafeInteger(n)) throw new RangeError("Number is too large to convert precisely.");
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7);
  let rest = n % 1e7;
  if (crore) parts.push(`${numberToIndianWords(crore)} Crore`);
  const lakh = Math.floor(rest / 1e5);
  rest %= 1e5;
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  const thousand = Math.floor(rest / 1e3);
  rest %= 1e3;
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));
  return parts.join(" ");
}

export interface AmountInWordsOptions {
  /** Prefix with "Rupees" and suffix with "Only", as on cheques and invoices. Default `true`. */
  currency?: boolean;
}

/**
 * Converts an amount to words for invoices and cheques:
 * `123456.78` → `"Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Seventy Eight Paise Only"`.
 */
export function amountInWords(amount: number | string, options: AmountInWordsOptions = {}): string {
  const { currency = true } = options;
  const n = typeof amount === "number" ? amount : parseINR(amount);
  if (!Number.isFinite(n)) throw new RangeError("amountInWords expects a finite amount.");
  const negative = n < 0;
  const totalPaise = Math.round(Math.abs(n) * 100);
  const rupees = Math.floor(totalPaise / 100);
  const paise = totalPaise % 100;

  let words: string;
  if (currency) {
    const r = `Rupees ${numberToIndianWords(rupees)}`;
    words = paise ? (rupees ? `${r} and ${twoDigits(paise)} Paise` : `${twoDigits(paise)} Paise`) : r;
    words += " Only";
  } else {
    words = numberToIndianWords(rupees) + (paise ? ` Point ${twoDigits(paise)}` : "");
  }
  return (negative ? "Minus " : "") + words;
}
