import { isVerhoeffValid } from "./aadhaar";
import { validateGSTIN } from "./gstin";
import { validatePAN } from "./pan";

/** Kinds of personal data that {@link findPII} and {@link redactPII} detect. */
export type PIIType = "aadhaar" | "pan" | "gstin" | "mobile" | "upi" | "email" | "card" | "bankAccount";

/** Every PII type, in the order they are matched. */
export const PII_TYPES: readonly PIIType[] = Object.freeze([
  "email",
  "upi",
  "gstin",
  "card",
  "bankAccount",
  "aadhaar",
  "mobile",
  "pan",
]);

export interface PIIMatch {
  type: PIIType;
  /** The exact text that matched, including any spaces or hyphens. */
  match: string;
  /** The value with separators removed (digits only for numbers, upper case for PAN/GSTIN, lower case for email/UPI). */
  value: string;
  /** Start index in the input string. */
  start: number;
  /** End index (exclusive) in the input string. */
  end: number;
}

export interface FindPIIOptions {
  /** Only look for these types. Default: all of {@link PII_TYPES}. */
  types?: readonly PIIType[];
}

export type PIIMaskStyle =
  /** Keep a few characters so logs stay debuggable, e.g. `XXXX XXXX 0124`, `j***@gmail.com`. */
  | "partial"
  /** Replace with a tag, e.g. `[AADHAAR]`, `[PAN]`. */
  | "label";

export interface RedactPIIOptions extends FindPIIOptions {
  /**
   * How to replace each match. `"partial"` (default) keeps the last 4 digits or the
   * email domain; `"label"` replaces the whole value with a tag such as `[AADHAAR]`.
   * Pass a function for anything else.
   */
  mask?: PIIMaskStyle | ((match: PIIMatch) => string);
}

interface Detector {
  type: PIIType;
  re: RegExp;
  /** Returns the normalized value if the candidate is real PII, or null. */
  confirm: (candidate: string) => string | null;
  /** For context-based detectors: the capture group holding the value. */
  group?: number;
}

const stripSep = (s: string) => s.replace(/[\s-]+/g, "");

function luhnValid(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let n = digits.charCodeAt(digits.length - 1 - i) - 48;
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

// Regexes are rebuilt per call (cheap) so concurrent callers never share `lastIndex`.
function detectors(): Detector[] {
  return [
    {
      type: "email",
      re: /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}(?![A-Za-z0-9-])/g,
      confirm: (s) => s.toLowerCase(),
    },
    {
      // UPI handles have no dot after "@" (that would be an email domain).
      type: "upi",
      re: /(?<![A-Za-z0-9._-])[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9]{1,63}(?![A-Za-z0-9.@-])/g,
      confirm: (s) => s.toLowerCase(),
    },
    {
      type: "gstin",
      re: /(?<![A-Za-z0-9])\d{2}[A-Za-z0-9]{13}(?![A-Za-z0-9])/g,
      confirm: (s) => {
        const r = validateGSTIN(s);
        return r.valid ? r.value : null;
      },
    },
    {
      // 13–19 digits, optionally grouped, Luhn-valid.
      type: "card",
      re: /(?<![\d+][\s-]?|\d)\d(?:[\s-]?\d){12,18}(?![\s-]?\d)/g,
      confirm: (s) => {
        const d = stripSep(s);
        return /^[2-6]/.test(d) && d.length >= 13 && d.length <= 19 && luhnValid(d) ? d : null;
      },
    },
    {
      // Bank account numbers are just digits, so only match them after a keyword.
      type: "bankAccount",
      re: /\b(?:bank\s+account|account|acct|a\/c|acc)(?:\s*(?:number|num|no|#))?\.?\s*[:#=-]?\s*(\d(?:[\s-]?\d){8,17})(?![\s-]?\d)/gi,
      group: 1,
      confirm: (s) => stripSep(s),
    },
    {
      type: "aadhaar",
      re: /(?<![\d+][\s-]?|[\d+])[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}(?![\s-]?\d)/g,
      confirm: (s) => {
        const d = stripSep(s);
        return isVerhoeffValid(d) ? d : null;
      },
    },
    {
      type: "mobile",
      re: /(?<![\d+][\s-]?|[\d+])(?:(?:\+|00)?91[\s-]?|\(\+91\)\s?|0)?[6-9]\d{4}[\s-]?\d{5}(?![\s-]?\d)/g,
      confirm: (s) => stripSep(s).replace(/\D/g, "").slice(-10),
    },
    {
      type: "pan",
      re: /(?<![A-Za-z0-9])[A-Za-z]{5}\d{4}[A-Za-z](?![A-Za-z0-9])/g,
      confirm: (s) => {
        const r = validatePAN(s);
        return r.valid ? r.value : null;
      },
    },
  ];
}

/**
 * Finds Indian personal data in free text: Aadhaar, PAN, GSTIN, mobile numbers,
 * UPI IDs, emails, card numbers and bank account numbers.
 *
 * Candidates are confirmed with the same checks the validators use (Verhoeff for
 * Aadhaar, the GSTIN check digit, the PAN holder type, Luhn for cards), so random
 * 12-digit order IDs and 10-letter codes are not reported.
 *
 * Matches never overlap and are returned in the order they appear.
 */
export function findPII(text: string, options: FindPIIOptions = {}): PIIMatch[] {
  if (typeof text !== "string" || !text) return [];
  const wanted = options.types ? new Set(options.types) : null;
  const found: PIIMatch[] = [];
  const overlaps = (start: number, end: number) => found.some((m) => start < m.end && end > m.start);

  for (const det of detectors()) {
    if (wanted && !wanted.has(det.type)) continue;
    for (const m of text.matchAll(det.re)) {
      const raw = det.group ? m[det.group]! : m[0];
      const start = det.group ? m.index! + m[0].length - raw.length : m.index!;
      const end = start + raw.length;
      if (overlaps(start, end)) continue;
      const value = det.confirm(raw);
      if (value === null) continue;
      found.push({ type: det.type, match: raw, value, start, end });
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

/** True if {@link findPII} finds anything. */
export function containsPII(text: string, options: FindPIIOptions = {}): boolean {
  return findPII(text, options).length > 0;
}

const LABELS: Record<PIIType, string> = {
  aadhaar: "[AADHAAR]",
  pan: "[PAN]",
  gstin: "[GSTIN]",
  mobile: "[MOBILE]",
  upi: "[UPI]",
  email: "[EMAIL]",
  card: "[CARD]",
  bankAccount: "[BANK_ACCOUNT]",
};

function maskTail(value: string, visible = 4): string {
  return "X".repeat(Math.max(0, value.length - visible)) + value.slice(-visible);
}

function maskHandle(value: string): string {
  const at = value.lastIndexOf("@");
  return `${value.charAt(0)}***${value.slice(at)}`;
}

/** The default `"partial"` mask for one match. */
export function maskPII(match: Pick<PIIMatch, "type" | "value">): string {
  const { type, value } = match;
  switch (type) {
    case "aadhaar":
      return `XXXX XXXX ${value.slice(-4)}`;
    case "pan":
      return maskTail(value);
    case "gstin":
      // Keep the state code and the last 3 characters; the PAN in between is hidden.
      return value.slice(0, 2) + "X".repeat(value.length - 5) + value.slice(-3);
    case "mobile":
    case "card":
    case "bankAccount":
      return maskTail(value);
    case "email":
    case "upi":
      return maskHandle(value);
  }
}

/**
 * Replaces Indian personal data in a string. Safe to call on every log line.
 *
 * ```ts
 * redactPII("KYC ok for 2345 6789 0124, PAN ABCPE1234F, call +91 98765 43210");
 * // "KYC ok for XXXX XXXX 0124, PAN XXXXXX234F, call XXXXXX3210"
 * redactPII(text, { mask: "label" });   // "KYC ok for [AADHAAR], PAN [PAN], call [MOBILE]"
 * ```
 */
export function redactPII(text: string, options: RedactPIIOptions = {}): string {
  const matches = findPII(text, options);
  if (!matches.length) return text;
  const mask = options.mask ?? "partial";
  const replace =
    typeof mask === "function" ? mask : mask === "label" ? (m: PIIMatch) => LABELS[m.type] : maskPII;

  let out = "";
  let last = 0;
  for (const m of matches) {
    out += text.slice(last, m.start) + replace(m);
    last = m.end;
  }
  return out + text.slice(last);
}

/**
 * Returns a deep copy of `value` with every string run through {@link redactPII}.
 * Handles arrays, plain objects and circular references; other objects (Date,
 * Map, class instances) are returned as-is. Object keys are not changed.
 *
 * Use it on request bodies, error contexts or log payloads before they leave the process.
 */
export function redactObject<T>(value: T, options: RedactPIIOptions = {}): T {
  const seen = new WeakMap<object, unknown>();
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return redactPII(v, options);
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v)) return seen.get(v);
    if (Array.isArray(v)) {
      const arr: unknown[] = [];
      seen.set(v, arr);
      for (const item of v) arr.push(walk(item));
      return arr;
    }
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) return v;
    const obj: Record<string, unknown> = {};
    seen.set(v, obj);
    for (const [k, item] of Object.entries(v)) obj[k] = walk(item);
    return obj;
  };
  return walk(value) as T;
}
