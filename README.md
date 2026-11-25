# indiakit-js

[![npm version](https://img.shields.io/npm/v/indiakit-js.svg)](https://www.npmjs.com/package/indiakit-js)
[![npm downloads](https://img.shields.io/npm/dm/indiakit-js.svg)](https://www.npmjs.com/package/indiakit-js)
[![bundle size](https://img.shields.io/bundlephobia/minzip/indiakit-js)](https://bundlephobia.com/package/indiakit-js)
[![types](https://img.shields.io/npm/types/indiakit-js.svg)](https://www.npmjs.com/package/indiakit-js)
[![license](https://img.shields.io/npm/l/indiakit-js.svg)](./LICENSE)

**[Try the live demo →](https://stanprajwal.github.io/indiakit-js/)**

Validators, formatters and **headless React hooks** for Indian apps: GSTIN (including UIN, OIDAR, TDS and TCS registrations), PAN, IFSC (with live branch lookup), UPI links, PIN codes (with live district and post office lookup), mobile numbers, Aadhaar, TAN, CIN, Udyam and other IDs, and ₹ lakh/crore formatting. It also includes a **GST tax engine**, **financial-year, bank-day and GST due-date helpers**, and **PII redaction for logs**.

- **Zero runtime dependencies.** The core works anywhere: browser, Node, edge, React Native.
- **Headless.** The React hooks return state and `inputProps`, and the inputs come unstyled. Style them with your own CSS, Tailwind or shadcn.
- **Typed.** Every validator returns the same `ValidationResult` with parsed `details`.
- **Tree-shakeable.** ESM + CJS, `sideEffects: false`. The React layer is a separate entry point (`indiakit-js/react`).

```bash
npm install indiakit-js
```

## Core (no React)

```ts
import { validateGSTIN, lookupPincode, buildUPILink, formatINR, formatINRCompact, amountInWords } from "indiakit-js";

validateGSTIN("27AAPFU0939F1ZV");
// { valid: true, value: "27AAPFU0939F1ZV",
//   details: { type: "regular", typeLabel: "Regular taxpayer", stateCode: "27", stateName: "Maharashtra",
//              pan: "AAPFU0939F", panHolderType: "Firm / Partnership", entityNumber: "1", checksum: "V", … } }

validateGSTIN("2317UNO00001UND");                 // valid, details.type === "uin" (a UN body)
validateGSTIN(gstin, { types: ["regular"] });     // accept regular taxpayers only

await lookupPincode("560001");
// { pincode: "560001", district: "Bangalore", state: "Karnataka", circle: "Karnataka",
//   districts: ["Bangalore"], postOffices: [{ name: "Bangalore", branchType: "Head Post Office", … }, …] }

validateGSTIN("27AAPFU0939F1ZA");
// { valid: false, value: "...", error: "INVALID_CHECKSUM",
//   message: "GSTIN check digit does not match. Please re-check the number." }

formatINR(1234567.5);           // "₹12,34,567.50"
formatINRCompact(25_000_000);   // "₹2.5 Cr"
amountInWords(123456.78);
// "Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Seventy Eight Paise Only"

buildUPILink({ payeeAddress: "shop@okhdfcbank", payeeName: "My Shop", amount: 499, note: "Order 1042" });
// "upi://pay?pa=shop@okhdfcbank&pn=My%20Shop&tn=Order%201042&am=499.00&cu=INR"
```

### Financial year, bank days and GST deadlines

```ts
import { getFinancialYear, getFinancialQuarter, addBankWorkingDays, getUpcomingGSTDeadlines } from "indiakit-js";

getFinancialYear("2026-03-31");        // { label: "FY 2025-26", start: "2025-04-01", end: "2026-03-31", … }
getFinancialQuarter(new Date());       // { quarter: 3, label: "Q3 FY 2026-27", months: "Oct–Dec 2026", … }

addBankWorkingDays("2026-11-13", 1);   // "2026-11-16": skips the 2nd Saturday and Sunday
addBankWorkingDays("2026-11-07", 1, { holidays: [{ date: "2026-11-09", name: "State holiday" }] });
// "2026-11-10": skips Sunday the 8th and your holiday on the 9th

getUpcomingGSTDeadlines({ from: "2026-11-25", withinDays: 40 });
// [{ form: "GSTR-1",  dueDate: "2026-12-11", periodLabel: "Nov 2026", … },
//  { form: "GSTR-3B", dueDate: "2026-12-20", periodLabel: "Nov 2026", … },
//  { form: "GSTR-9",  dueDate: "2026-12-31", periodLabel: "FY 2025-26", … }, …]

getGSTDueDates("2026-12", { scheme: "qrmp", state: "27" });
// GSTR-1 on 13 Jan, GSTR-3B on 22 Jan (24 Jan for states in the second group)
```

- **Dates are read in IST.** A `Date` at `2026-03-31T20:00Z` is 1 April in India, so it belongs to the next financial year. Results come back as `"YYYY-MM-DD"` strings, so there are no time-zone surprises downstream.
- **Bank days:** Sundays, the 2nd and 4th Saturdays, and 26 January, 15 August and 2 October are built in. State and festival holidays vary by state and year, so pass them in `holidays` (for example from the RBI holiday list for your state). The functions are `getBankHoliday`, `isBankWorkingDay`, `addBankWorkingDays` (negative values go backwards), `nextBankWorkingDay` and `countBankWorkingDays`.
- **GST schemes:**
  - `monthly`: GSTR-1 on the 11th, GSTR-3B on the 20th.
  - `qrmp`: IFF on the 13th and PMT-06 on the 25th in the first two months of a quarter. After the quarter, GSTR-1 on the 13th and GSTR-3B on the 22nd or 24th, depending on the state.
  - `composition`: CMP-08 on the 18th after each quarter.
  - `getGSTAnnualDueDates` gives GSTR-9 and GSTR-9C (31 December), or GSTR-4 under composition (30 April).
- **These are statutory due dates.** The government often extends them by notification, so check before relying on them for penalties. Income-tax dates (TDS, advance tax, ITR) aren't included yet, because they are moving to the Income-tax Act, 2025.

### `ValidationResult`

```ts
type ValidationResult<T> =
  | { valid: true;  value: string; details: T }
  | { valid: false; value: string; error: ValidationErrorCode; message: string };

type ValidationErrorCode =
  | "EMPTY" | "INVALID_LENGTH" | "INVALID_FORMAT" | "INVALID_CHECKSUM"
  | "INVALID_STATE_CODE" | "INVALID_HOLDER_TYPE" | "INVALID_AMOUNT";
```

`value` is always the normalized input: trimmed and upper-cased, with spaces and hyphens removed. Mobile numbers normalize to E.164 (`+919876543210`).

### GST calculation

`computeGST` works out the tax on an invoice. It takes the supplier's state and the place of supply, each as a GSTIN, a state code or a state name.

```ts
import { computeGST } from "indiakit-js";

const bill = computeGST({
  supplierState: "27AAPFU0939F1ZV",  // Maharashtra
  placeOfSupply: "29",               // Karnataka → inter-state → IGST
  items: [
    { description: "Laptop stand", hsn: "8473", quantity: 2, unitPrice: 1499, rate: 18 },
    { description: "Installation", hsn: "998719", unitPrice: 500, rate: 18, discount: 50 },
  ],
  roundOff: true,
});

bill.taxHeads;     // ["IGST"]
bill.lines[0];     // { taxableValue: 2998, igst: 539.64, total: 3537.64, … }
bill.rateSummary;  // [{ rate: 18, taxableValue: 3448, igst: 620.64, … }]
bill.totals;       // { taxableValue: 3448, igst: 620.64, totalTax: 620.64, invoiceValue: 4068.64, roundOff: 0.36, grandTotal: 4069, … }
```

- **Same state:** CGST + SGST, split equally. In union territories without a legislature (Chandigarh, Ladakh, Lakshadweep, Andaman and Nicobar, Dadra and Nagar Haveli and Daman and Diu) it's CGST + UTGST. **Different states:** IGST.
- **`priceIncludesTax: true`** backs the tax out of MRP-style prices, so that taxable value + tax equals the price to the paisa.
- **`zeroRated: "lut"`** (exports or SEZ supplies under a Letter of Undertaking, no tax charged) or **`zeroRated: "igst"`** (IGST paid and claimed back). Zero-rated supplies are always inter-state, and `placeOfSupply` is optional for them.
- **`reverseCharge: true`** still calculates the tax, but leaves it out of `invoiceValue` because the recipient pays it to the government.
- **`cessRate`** on a line adds compensation cess as a percentage of the taxable value.
- **Arithmetic** is done in integer paise and tax is rounded half-up per line, so there's no float drift and CGST always equals SGST. `roundOff: true` rounds the grand total to the rupee and reports the difference.

It doesn't look up rates for you. Pass the rate for each line, because GST rates change and depend on the HSN code. It also doesn't handle per-unit (specific) cess, TCS/TDS deductions or e-invoice JSON.

### API

| Area | Functions |
|---|---|
| **GSTIN** | `validateGSTIN(value, { types? })` (returns `details.type`: `regular`, `tcs`, `tds`, `uin` or `oidar`), `isValidGSTIN`, `computeGSTINChecksum(first14)`, `isIntraStateSupply(a, b)` (decides CGST+SGST vs IGST), `GSTIN_TYPE_LABELS` |
| **GST tax** | `computeGST(input)` (CGST + SGST/UTGST or IGST, line totals, rate-wise summary, invoice totals), `validateHSN` / `isValidHSN` (HSN and SAC codes), `UTGST_STATE_CODES`. See [GST calculation](#gst-calculation). |
| **PAN** | `validatePAN` (checks the holder-type character), `isValidPAN`, `maskPAN` → `XXXXXX234F`, `PAN_HOLDER_TYPES` |
| **IFSC** | `validateIFSC`, `isValidIFSC`, `lookupIFSC(code, { signal?, baseUrl?, fetch? })` → bank, branch, address, city, state, MICR, UPI/NEFT/RTGS/IMPS flags |
| **Dates** | `getFinancialYear`, `getFinancialQuarter`, `toISTDateString`, `getBankHoliday`, `isBankWorkingDay`, `addBankWorkingDays`, `nextBankWorkingDay`, `countBankWorkingDays`, `getGSTDueDates(period, { scheme?, state? })`, `getGSTAnnualDueDates(fy)`, `getUpcomingGSTDeadlines({ from?, withinDays?, scheme?, state? })`, `GSTR3B_QRMP_22ND_STATE_CODES` |
| **UPI** | `validateUPIId`, `isValidUPIId`, `buildUPILink(params, { scheme? })`, `parseUPILink(link)` |
| **PIN code** | `validatePincode` (returns postal zone and regions), `isValidPincode`, `lookupPincode(pin, { signal?, baseUrl?, fetch? })` → district, state, circle and post offices, `PINCODE_ZONES` |
| **Other IDs** | `validateTAN`, `validateCIN` (listed flag, industry code, state, year, company type), `validateLLPIN`, `validateUdyam` (MSME), `validateVoterId` (EPIC), `validatePassport`, `validateDrivingLicence`, `validateVehicleRegistration` (including BH series), `validateBankAccount`, each with an `isValid…` form; `CIN_COMPANY_TYPES`, `RTO_STATE_CODES` |
| **Mobile** | `validateIndianMobile` (accepts `+91`, `91`, `0` prefixes and spaces, hyphens, brackets), `isValidIndianMobile`, `formatIndianMobile` → `+91 98765 43210` |
| **₹** | `formatINR`, `formatINRCompact` (`K` / `L` / `Cr`, or `style: "long"`), `parseINR("Rs. 1,500/-")`, `amountInWords`, `numberToIndianWords`, `groupIndian` |
| **States** | `GST_STATE_CODES`, `getStateByGSTCode` |
| **Aadhaar** | `validateAadhaar` (Verhoeff check digit), `isValidAadhaar`, `maskAadhaar` → `XXXX XXXX 0124`, `computeAadhaarChecksum(first11)` |
| **PII redaction** | `redactPII(text, { types?, mask? })`, `findPII`, `containsPII`, `redactObject(value)`, `maskPII`, `PII_TYPES`. See [below](#pii-redaction-for-logs-dpdp). |

`lookupIFSC` calls Razorpay's free, open-source [IFSC API](https://github.com/razorpay/ifsc) by default. If you self-host it, pass `baseUrl`. It throws `IFSCLookupError` with `code` set to `"INVALID_IFSC"`, `"NOT_FOUND"` or `"NETWORK"`.

`lookupPincode` calls the free India Post API at [api.postalpincode.in](https://api.postalpincode.in), which allows browser requests. It throws `PincodeLookupError` with `code` set to `"INVALID_PINCODE"`, `"NOT_FOUND"` or `"NETWORK"`.

## PII redaction for logs (DPDP)

Keep Aadhaar, PAN, GSTIN, mobile numbers, UPI IDs, emails, card numbers and bank account numbers out of your logs, error trackers, analytics and LLM prompts.

```ts
import { redactPII, findPII, redactObject } from "indiakit-js";

redactPII("KYC ok for 2345 6789 0124, PAN ABCPE1234F, call +91 98765 43210");
// "KYC ok for XXXX XXXX 0124, PAN XXXXXX234F, call XXXXXX3210"

redactPII(text, { mask: "label" });            // "... [AADHAAR], PAN [PAN], call [MOBILE]"
redactPII(text, { mask: (m) => `<${m.type}>` });
redactPII(text, { types: ["aadhaar", "pan"] }); // only these

findPII(text);
// [{ type: "aadhaar", match: "2345 6789 0124", value: "234567890124", start: 11, end: 25 }, …]

redactObject({ user: { pan: "ABCPE1234F", phones: ["9876543210"] } }); // deep copy, strings redacted
```

**Fewer false positives than plain regex.** Each candidate is checked the same way the validators check it before it's redacted: the Verhoeff check digit for Aadhaar, the GSTIN check digit, the PAN holder type and Luhn for cards. Numbers are never cut out of longer digit runs, and bank account numbers only match after a keyword such as `A/c`, `Acct` or `Account No`. So order IDs, timestamps and trace IDs stay readable.

| Type | Default mask |
|---|---|
| `aadhaar` | `XXXX XXXX 0124` (UIDAI style) |
| `pan` | `XXXXXX234F` |
| `gstin` | `27XXXXXXXXXX1ZV` (state code and last 3 kept, PAN hidden) |
| `mobile`, `card`, `bankAccount` | last 4 digits kept, e.g. `XXXXXX3210` |
| `email`, `upi` | `p***@example.com`, `s***@okhdfcbank` |

**With pino:**

```ts
import pino from "pino";
import { redactObject } from "indiakit-js";

const logger = pino({ formatters: { log: (obj) => redactObject(obj) } });
```

**With winston:**

```ts
import winston from "winston";
import { redactPII, redactObject } from "indiakit-js";

const redact = winston.format((info) => {
  const out = redactObject(info);
  out.message = redactPII(String(info.message));
  return out;
});
const logger = winston.createLogger({ format: winston.format.combine(redact(), winston.format.json()) });
```

Redaction is a safety net and doesn't replace keeping PII out of logs in the first place. It doesn't detect names, addresses, dates of birth, passport numbers or 16-digit Aadhaar Virtual IDs.

## React

```tsx
import { useGSTIN, useIFSC, useUPILink, useINR } from "indiakit-js/react";

function BillingForm() {
  const gstin = useGSTIN();             // errors show on blur by default
  const ifsc = useIFSC();               // validates, then fetches the branch

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (gstin.showErrors()) save(gstin.value); }}>
      <input {...gstin.inputProps} placeholder="GSTIN" />
      {gstin.error && <p role="alert">{gstin.error}</p>}
      {gstin.details && <p>Registered in {gstin.details.stateName}</p>}

      <input {...ifsc.inputProps} placeholder="IFSC" />
      {ifsc.lookupStatus === "loading" && <p>Looking up…</p>}
      {ifsc.branch && <p>{ifsc.branch.bank}, {ifsc.branch.branch}</p>}
      {ifsc.lookupError && <p role="alert">{ifsc.lookupError}</p>}
    </form>
  );
}
```

### Hooks

| Hook | Returns |
|---|---|
| `useGSTIN`, `usePAN`, `usePhone`, `useUPIId` | `{ value, setValue, result, isValid, details, error, touched, showErrors, reset, inputProps }` |
| `useIFSC({ lookup?, lookupOptions? })` | all of the above, plus `{ branch, lookupStatus, lookupError, lookupErrorCode }`. Requests are cached and aborted when the value changes. |
| `usePincode({ lookup?, lookupOptions? })` | the field state, plus `{ location, lookupStatus, lookupError, lookupErrorCode }`. Lookup is off by default, so the hook makes no network calls unless you pass `lookup: true`. Use `location.district` and `location.state` to auto-fill an address form. |
| `useUPILink(params, { scheme? })` | `{ link, error }`. Pass `link` to any QR component, e.g. [`qrcode.react`](https://www.npmjs.com/package/qrcode.react). |
| `useINR(amount)` | `{ formatted, compact, words }` |
| `useValidatedField(validator, options, config)` | the generic hook behind all of the above. Use it with your own validators. |

Field options: `defaultValue`, controlled `value` + `onChange`, and `validateOn: "blur" | "change" | "submit"`.

`inputProps` sets a suitable `maxLength`, `inputMode` (numeric/tel keyboards on mobile), `autoComplete` and `aria-invalid`. The hooks upper-case GSTIN, PAN and IFSC as the user types and strip characters that can't appear in each field.

### Unstyled inputs

If you'd rather not wire a hook yourself:

```tsx
import { GSTINInput, PhoneInput } from "indiakit-js/react";

<GSTINInput
  className="border rounded px-3 py-2 data-[invalid]:border-red-500 data-[valid]:border-green-600"
  onValueChange={(value, result) => result.valid && setGstin(result.value)}
/>
```

Available: `GSTINInput`, `PANInput`, `IFSCInput`, `PincodeInput`, `PhoneInput`, `UPIIdInput`. They forward refs, accept every native `<input>` prop and expose `data-valid` / `data-invalid` for styling.

## Scope and limits

- **GSTIN:** covers regular taxpayers, TCS (e-commerce operators), TDS deductors (TAN-based), UINs (UN bodies, embassies) and OIDAR / non-resident online service providers (state code 99 or 97), all with the check digit verified. Non-resident taxable person (NRTP) and other rare formats are reported as `INVALID_FORMAT`. Use `{ types }` to restrict which kinds you accept.
- **Format checks only:** a valid PAN, GSTIN or UPI ID is well-formed, but that doesn't prove it's registered. To confirm a GSTIN is active, call the GST portal or a GSP API. IFSC branches can be confirmed with `lookupIFSC`.
- **Other IDs** are checked for shape only, because none of them has a public checksum. Voter IDs and driving licences are checked against the current national formats (`ABC1234567`, `MH14 20110062821`), and older state-specific formats are rejected. A bank account number can only be confirmed with a penny-drop check through your payment provider.
- **PIN code zones** from `validatePincode` come from the first digit and are approximate. Use `lookupPincode` (or `usePincode({ lookup: true })`) for the exact district and state.

## Development

```bash
npm install
npm test          # vitest
npm run typecheck
npm run build     # tsup → dist/ (ESM + CJS + .d.ts)
npm run demo      # live demo at http://localhost:5173
npm run demo:build  # static build in demo-dist/ (deployed to GitHub Pages on every push to main)
```

## License

MIT
