import { validateGSTIN } from "./gstin";
import { GST_STATE_CODES } from "./states";

/**
 * A calendar date. Either an ISO date string (`"2026-04-01"`) or a `Date`.
 * A `Date` is read in Indian Standard Time, so `2026-03-31T20:00:00Z` counts as
 * 1 April 2026. All functions return dates as `"YYYY-MM-DD"` strings.
 */
export type DateInput = Date | string;

interface Civil {
  y: number;
  m: number; // 1–12
  d: number;
}

const IST_OFFSET_MS = 330 * 60 * 1000;
const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const fmt = ({ y, m, d }: Civil) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function toCivil(input: DateInput | undefined, field = "date"): Civil {
  if (input === undefined) input = new Date();
  if (input instanceof Date) {
    const t = input.getTime();
    if (!Number.isFinite(t)) throw new RangeError(`${field} is an invalid Date.`);
    const ist = new Date(t + IST_OFFSET_MS);
    return { y: ist.getUTCFullYear(), m: ist.getUTCMonth() + 1, d: ist.getUTCDate() };
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(input).trim());
  if (!match) throw new TypeError(`${field} must be a Date or a "YYYY-MM-DD" string.`);
  const c = { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
  if (c.m < 1 || c.m > 12 || c.d < 1 || c.d > daysInMonth(c.y, c.m)) {
    throw new RangeError(`${field}: "${input}" is not a real calendar date.`);
  }
  return c;
}

function addDays(c: Civil, n: number): Civil {
  const t = new Date(Date.UTC(c.y, c.m - 1, c.d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** Shifts a month (1–12) by `n` months. */
function addMonths(y: number, m: number, n: number): { y: number; m: number } {
  const idx = y * 12 + (m - 1) + n;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

/** Returns the date as `"YYYY-MM-DD"` in Indian Standard Time. Defaults to today. */
export function toISTDateString(date?: DateInput): string {
  return fmt(toCivil(date));
}

// ---------------------------------------------------------------------------
// Financial year and quarters
// ---------------------------------------------------------------------------

export interface FinancialYear {
  /** e.g. "FY 2025-26" */
  label: string;
  /** e.g. "2025-26" */
  shortLabel: string;
  /** Calendar year the FY starts in, e.g. 2025. */
  startYear: number;
  /** "2025-04-01" */
  start: string;
  /** "2026-03-31" */
  end: string;
}

function fyOf(startYear: number): FinancialYear {
  const shortLabel = `${startYear}-${pad((startYear + 1) % 100)}`;
  return {
    label: `FY ${shortLabel}`,
    shortLabel,
    startYear,
    start: `${pad(startYear, 4)}-04-01`,
    end: `${pad(startYear + 1, 4)}-03-31`,
  };
}

/** Indian financial year (1 April to 31 March) containing `date`. Defaults to today in IST. */
export function getFinancialYear(date?: DateInput): FinancialYear {
  const c = toCivil(date);
  return fyOf(c.m >= 4 ? c.y : c.y - 1);
}

function parseFY(fy: number | string): FinancialYear {
  if (typeof fy === "number") {
    if (!Number.isInteger(fy)) throw new TypeError("Financial year must be a whole start year, e.g. 2025.");
    return fyOf(fy);
  }
  const m = /^(?:FY\s*)?(\d{4})\s*[-–/]\s*(\d{2}|\d{4})$/i.exec(fy.trim());
  if (!m) throw new TypeError(`Financial year must look like 2025, "2025-26" or "FY 2025-26", got "${fy}".`);
  const start = Number(m[1]);
  const end = Number(m[2]);
  if ((m[2]!.length === 2 ? (start + 1) % 100 : start + 1) !== end) {
    throw new RangeError(`"${fy}" is not a valid financial year (years must be consecutive).`);
  }
  return fyOf(start);
}

export interface FinancialQuarter {
  /** 1 = Apr–Jun, 2 = Jul–Sep, 3 = Oct–Dec, 4 = Jan–Mar. */
  quarter: 1 | 2 | 3 | 4;
  /** e.g. "Q1 FY 2026-27" */
  label: string;
  /** e.g. "Apr–Jun 2026" */
  months: string;
  financialYear: FinancialYear;
  start: string;
  end: string;
}

function quarterOf(fy: FinancialYear, quarter: 1 | 2 | 3 | 4): FinancialQuarter {
  const first = addMonths(fy.startYear, 4, (quarter - 1) * 3);
  const last = addMonths(first.y, first.m, 2);
  return {
    quarter,
    label: `Q${quarter} ${fy.label}`,
    months: `${MONTHS[first.m - 1]}–${MONTHS[last.m - 1]} ${last.y}`,
    financialYear: fy,
    start: fmt({ y: first.y, m: first.m, d: 1 }),
    end: fmt({ y: last.y, m: last.m, d: daysInMonth(last.y, last.m) }),
  };
}

/** Financial-year quarter containing `date`. Defaults to today in IST. */
export function getFinancialQuarter(date?: DateInput): FinancialQuarter {
  const c = toCivil(date);
  const fy = getFinancialYear(date);
  const q = (Math.floor(((c.m + 8) % 12) / 3) + 1) as 1 | 2 | 3 | 4;
  return quarterOf(fy, q);
}

// ---------------------------------------------------------------------------
// Bank working days
// ---------------------------------------------------------------------------

/** A holiday you supply: a `"YYYY-MM-DD"` string, or an object with a name. */
export type HolidayInput = string | { date: string; name: string };

export interface BankDayOptions {
  /**
   * Extra holidays, e.g. state holidays and festival dates from the RBI list for
   * your state. Only Sundays, the 2nd and 4th Saturdays and the three national
   * holidays are built in.
   */
  holidays?: readonly HolidayInput[];
}

const NATIONAL_HOLIDAYS: Readonly<Record<string, string>> = Object.freeze({
  "01-26": "Republic Day",
  "08-15": "Independence Day",
  "10-02": "Gandhi Jayanti",
});

function holidayMap(holidays: readonly HolidayInput[] | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const h of holidays ?? []) {
    const date = typeof h === "string" ? h : h.date;
    const key = fmt(toCivil(date, "holidays[]"));
    map.set(key, typeof h === "string" ? "Holiday" : h.name);
  }
  return map;
}

function closedReason(c: Civil, custom: Map<string, string>): string | null {
  const dow = new Date(Date.UTC(c.y, c.m - 1, c.d)).getUTCDay();
  if (dow === 0) return "Sunday";
  if (dow === 6) {
    const nth = Math.ceil(c.d / 7);
    if (nth === 2) return "Second Saturday";
    if (nth === 4) return "Fourth Saturday";
  }
  return NATIONAL_HOLIDAYS[`${pad(c.m)}-${pad(c.d)}`] ?? custom.get(fmt(c)) ?? null;
}

/**
 * Why banks are closed on `date`, or `null` if it's a working day. Knows the RBI
 * rule (Sundays, 2nd and 4th Saturdays), the three national holidays, and any
 * holidays you pass.
 */
export function getBankHoliday(date: DateInput, options: BankDayOptions = {}): string | null {
  return closedReason(toCivil(date), holidayMap(options.holidays));
}

/** True if banks are open on `date`. See {@link getBankHoliday}. */
export function isBankWorkingDay(date: DateInput, options: BankDayOptions = {}): boolean {
  return getBankHoliday(date, options) === null;
}

/**
 * Moves `days` bank working days forward (or backward, if negative) from `date`.
 * With `days = 0`, returns `date` if it is a working day, otherwise the next one.
 * Useful for settlement dates (T+1) and payment SLAs.
 */
export function addBankWorkingDays(date: DateInput, days: number, options: BankDayOptions = {}): string {
  if (!Number.isInteger(days)) throw new TypeError("days must be a whole number.");
  const custom = holidayMap(options.holidays);
  let c = toCivil(date);
  const step = days < 0 ? -1 : 1;
  if (days === 0) {
    while (closedReason(c, custom)) c = addDays(c, 1);
    return fmt(c);
  }
  let left = Math.abs(days);
  while (left > 0) {
    c = addDays(c, step);
    if (!closedReason(c, custom)) left--;
  }
  return fmt(c);
}

/** The first bank working day on or after `date`. */
export function nextBankWorkingDay(date: DateInput, options: BankDayOptions = {}): string {
  return addBankWorkingDays(date, 0, options);
}

/** Bank working days from `from` (exclusive) to `to` (inclusive). Negative if `to` is earlier. */
export function countBankWorkingDays(from: DateInput, to: DateInput, options: BankDayOptions = {}): number {
  const custom = holidayMap(options.holidays);
  const a = toCivil(from, "from");
  const b = toCivil(to, "to");
  const sign = fmt(b) < fmt(a) ? -1 : 1;
  let [c, end] = sign === 1 ? [a, fmt(b)] : [b, fmt(a)];
  let n = 0;
  while (fmt(c) < end) {
    c = addDays(c, 1);
    if (!closedReason(c, custom)) n++;
  }
  return n * sign;
}

// ---------------------------------------------------------------------------
// GST return due dates
// ---------------------------------------------------------------------------

/**
 * How a taxpayer files:
 * - `monthly`: GSTR-1 and GSTR-3B every month.
 * - `qrmp`: Quarterly Return Monthly Payment (turnover up to ₹5 crore): optional IFF
 *   and PMT-06 payment in the first two months, GSTR-1 and GSTR-3B each quarter.
 * - `composition`: CMP-08 each quarter, GSTR-4 once a year.
 */
export type GSTFilingScheme = "monthly" | "qrmp" | "composition";

export interface GSTDeadline {
  /** Form name, e.g. "GSTR-3B". */
  form: string;
  description: string;
  frequency: "monthly" | "quarterly" | "annual";
  /** First day of the tax period. */
  periodStart: string;
  /** Last day of the tax period. */
  periodEnd: string;
  /** Human-readable period, e.g. "Apr 2026", "Apr–Jun 2026" or "FY 2025-26". */
  periodLabel: string;
  /** Statutory due date, `"YYYY-MM-DD"`. */
  dueDate: string;
}

export interface GSTDueDateOptions {
  /** Default `"monthly"`. */
  scheme?: GSTFilingScheme;
  /**
   * The taxpayer's state (GSTIN, two-digit code or name). Needed for quarterly
   * GSTR-3B under QRMP, which is due on the 22nd or 24th depending on the state.
   */
  state?: string | number;
}

/**
 * States and UTs whose quarterly (QRMP) GSTR-3B is due on the 22nd of the month after the quarter.
 * All other states and UTs file by the 24th.
 */
export const GSTR3B_QRMP_22ND_STATE_CODES: readonly string[] = Object.freeze([
  "22", "23", "24", "25", "26", "27", "29", "30", "31", "32", "33", "34", "35", "36", "37",
]);

function resolveState(input: string | number): string {
  const raw = String(input).trim();
  if (/^\d{1,2}$/.test(raw)) {
    const code = raw.padStart(2, "0");
    if (GST_STATE_CODES[code]) return code;
    throw new RangeError(`state: "${raw}" is not a GST state code.`);
  }
  if (raw.replace(/[\s-]/g, "").length === 15) {
    const r = validateGSTIN(raw);
    if (!r.valid) throw new TypeError(`state: ${r.message}`);
    return r.details.stateCode;
  }
  const lower = raw.toLowerCase();
  for (const [code, name] of Object.entries(GST_STATE_CODES)) if (name.toLowerCase() === lower) return code;
  throw new TypeError(`state: expected a GSTIN, a two-digit state code or a state name, got "${raw}".`);
}

function parsePeriod(period: DateInput | undefined): { y: number; m: number } {
  if (typeof period === "string") {
    const mm = /^(\d{4})-(\d{2})$/.exec(period.trim());
    if (mm) {
      const m = Number(mm[2]);
      if (m < 1 || m > 12) throw new RangeError(`period: "${period}" has no month ${m}.`);
      return { y: Number(mm[1]), m };
    }
  }
  const c = toCivil(period, "period");
  return { y: c.y, m: c.m };
}

const day = (y: number, m: number, d: number) => fmt({ y, m, d });

function deadline(
  form: string,
  description: string,
  frequency: GSTDeadline["frequency"],
  start: { y: number; m: number },
  months: number,
  due: { monthsAfterEnd: number; day: number } | string,
): GSTDeadline {
  const last = addMonths(start.y, start.m, months - 1);
  const periodLabel =
    months === 1
      ? `${MONTHS[start.m - 1]} ${start.y}`
      : `${MONTHS[start.m - 1]}–${MONTHS[last.m - 1]} ${last.y}`;
  let dueDate: string;
  if (typeof due === "string") dueDate = due;
  else {
    const dm = addMonths(last.y, last.m, due.monthsAfterEnd);
    dueDate = day(dm.y, dm.m, due.day);
  }
  return {
    form,
    description,
    frequency,
    periodStart: day(start.y, start.m, 1),
    periodEnd: day(last.y, last.m, daysInMonth(last.y, last.m)),
    periodLabel,
    dueDate,
  };
}

/**
 * GST returns and payments for the tax period (month) that contains `period`.
 * `period` can be `"2026-04"`, a `"YYYY-MM-DD"` date or a `Date`.
 *
 * Under QRMP and composition, quarterly returns are listed for the last month of
 * the quarter (June, September, December, March); the other months only have
 * the monthly items (IFF, PMT-06), if any.
 *
 * These are the statutory due dates. The government often extends them by
 * notification, and they are not moved for holidays.
 */
export function getGSTDueDates(period: DateInput, options: GSTDueDateOptions = {}): GSTDeadline[] {
  const scheme = options.scheme ?? "monthly";
  const p = parsePeriod(period);
  const quarterEnd = p.m % 3 === 0;
  const qStart = addMonths(p.y, p.m, -((p.m - 1) % 3));
  const out: GSTDeadline[] = [];

  switch (scheme) {
    case "monthly":
      out.push(deadline("GSTR-1", "Outward supplies (sales) return", "monthly", p, 1, { monthsAfterEnd: 1, day: 11 }));
      out.push(deadline("GSTR-3B", "Summary return and tax payment", "monthly", p, 1, { monthsAfterEnd: 1, day: 20 }));
      break;
    case "qrmp":
      if (!quarterEnd) {
        out.push(deadline("IFF", "Invoice Furnishing Facility for B2B invoices (optional)", "monthly", p, 1, { monthsAfterEnd: 1, day: 13 }));
        out.push(deadline("PMT-06", "Monthly tax payment", "monthly", p, 1, { monthsAfterEnd: 1, day: 25 }));
      } else {
        if (options.state === undefined) {
          throw new TypeError("state is required for QRMP, because quarterly GSTR-3B is due on the 22nd or 24th depending on the state.");
        }
        const due3B = GSTR3B_QRMP_22ND_STATE_CODES.includes(resolveState(options.state)) ? 22 : 24;
        out.push(deadline("GSTR-1", "Quarterly outward supplies (sales) return", "quarterly", qStart, 3, { monthsAfterEnd: 1, day: 13 }));
        out.push(deadline("GSTR-3B", "Quarterly summary return and tax payment", "quarterly", qStart, 3, { monthsAfterEnd: 1, day: due3B }));
      }
      break;
    case "composition":
      if (quarterEnd) {
        out.push(deadline("CMP-08", "Composition tax payment statement", "quarterly", qStart, 3, { monthsAfterEnd: 1, day: 18 }));
      }
      break;
    default:
      throw new TypeError('scheme must be "monthly", "qrmp" or "composition".');
  }
  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/**
 * Annual GST returns for a financial year (`2025`, `"2025-26"` or `"FY 2025-26"`):
 * GSTR-9 and GSTR-9C (31 December after the year) for regular taxpayers, or
 * GSTR-4 (30 April after the year) under composition.
 */
export function getGSTAnnualDueDates(
  financialYear: number | string,
  options: Pick<GSTDueDateOptions, "scheme"> = {},
): GSTDeadline[] {
  const fy = parseFY(financialYear);
  const start = { y: fy.startYear, m: 4 };
  const withLabel = (d: GSTDeadline): GSTDeadline => ({ ...d, periodLabel: fy.label });
  if (options.scheme === "composition") {
    return [withLabel(deadline("GSTR-4", "Annual return for composition taxpayers", "annual", start, 12, day(fy.startYear + 1, 4, 30)))];
  }
  const dec31 = day(fy.startYear + 1, 12, 31);
  return [
    withLabel(deadline("GSTR-9", "Annual return", "annual", start, 12, dec31)),
    withLabel(deadline("GSTR-9C", "Reconciliation statement (turnover above ₹5 crore)", "annual", start, 12, dec31)),
  ];
}

export interface UpcomingGSTOptions extends GSTDueDateOptions {
  /** Start of the window. Default: today in IST. */
  from?: DateInput;
  /** Window length in days, counting `from`. Default 30. */
  withinDays?: number;
}

/**
 * GST deadlines falling within the next `withinDays` days (default 30), sorted
 * by due date. Handy for reminder emails and dashboard widgets.
 */
export function getUpcomingGSTDeadlines(options: UpcomingGSTOptions = {}): GSTDeadline[] {
  const withinDays = options.withinDays ?? 30;
  if (!Number.isInteger(withinDays) || withinDays < 1) throw new RangeError("withinDays must be a whole number of at least 1.");
  const from = toCivil(options.from, "from");
  const fromStr = fmt(from);
  const toStr = fmt(addDays(from, withinDays - 1));
  const out: GSTDeadline[] = [];

  // Monthly and quarterly items fall due within ~1 month of the period's end, so
  // start two months back and run forward past the end of the window.
  for (let k = -2; k <= Math.ceil(withinDays / 28) + 1; k++) {
    const p = addMonths(from.y, from.m, k);
    out.push(...getGSTDueDates(`${pad(p.y, 4)}-${pad(p.m)}`, options));
  }
  // Annual returns fall due up to 21 months after the financial year starts.
  const fyNow = getFinancialYear(fmt(from)).startYear;
  for (let y = fyNow - 2; y <= fyNow + Math.ceil(withinDays / 365); y++) out.push(...getGSTAnnualDueDates(y, options));

  const seen = new Set<string>();
  return out
    .filter((d) => d.dueDate >= fromStr && d.dueDate <= toStr)
    .filter((d) => {
      const key = `${d.form}|${d.periodStart}|${d.dueDate}`;
      return seen.has(key) ? false : (seen.add(key), true);
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.form.localeCompare(b.form));
}
