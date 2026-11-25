# indiakit-js

[![npm version](https://img.shields.io/npm/v/indiakit-js.svg)](https://www.npmjs.com/package/indiakit-js)
[![npm downloads](https://img.shields.io/npm/dm/indiakit-js.svg)](https://www.npmjs.com/package/indiakit-js)
[![bundle size](https://img.shields.io/bundlephobia/minzip/indiakit-js)](https://bundlephobia.com/package/indiakit-js)
[![types](https://img.shields.io/npm/types/indiakit-js.svg)](https://www.npmjs.com/package/indiakit-js)
[![license](https://img.shields.io/npm/l/indiakit-js.svg)](./LICENSE)

**[Try the live demo →](https://stanprajwal.github.io/indiakit-js/)**

Validators, formatters and **headless React hooks** for Indian apps: GSTIN (including UIN, OIDAR, TDS and TCS registrations), PAN, IFSC (with live branch lookup), UPI links, PIN codes (with live district and post office lookup), mobile numbers and ₹ lakh/crore formatting.

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

### API

| Area | Functions |
|---|---|
| **GSTIN** | `validateGSTIN(value, { types? })` (returns `details.type`: `regular`, `tcs`, `tds`, `uin` or `oidar`), `isValidGSTIN`, `computeGSTINChecksum(first14)`, `isIntraStateSupply(a, b)` (decides CGST+SGST vs IGST), `GSTIN_TYPE_LABELS` |
| **PAN** | `validatePAN` (checks the holder-type character), `isValidPAN`, `maskPAN` → `XXXXXX234F`, `PAN_HOLDER_TYPES` |
| **IFSC** | `validateIFSC`, `isValidIFSC`, `lookupIFSC(code, { signal?, baseUrl?, fetch? })` → bank, branch, address, city, state, MICR, UPI/NEFT/RTGS/IMPS flags |
| **Dates** | `getFinancialYear`, `getFinancialQuarter`, `toISTDateString`, `getBankHoliday`, `isBankWorkingDay`, `addBankWorkingDays`, `nextBankWorkingDay`, `countBankWorkingDays`, `getGSTDueDates(period, { scheme?, state? })`, `getGSTAnnualDueDates(fy)`, `getUpcomingGSTDeadlines({ from?, withinDays?, scheme?, state? })`, `GSTR3B_QRMP_22ND_STATE_CODES` |
| **UPI** | `validateUPIId`, `isValidUPIId`, `buildUPILink(params, { scheme? })`, `parseUPILink(link)` |
| **PIN code** | `validatePincode` (returns postal zone and regions), `isValidPincode`, `lookupPincode(pin, { signal?, baseUrl?, fetch? })` → district, state, circle and post offices, `PINCODE_ZONES` |
| **Mobile** | `validateIndianMobile` (accepts `+91`, `91`, `0` prefixes and spaces, hyphens, brackets), `isValidIndianMobile`, `formatIndianMobile` → `+91 98765 43210` |
| **₹** | `formatINR`, `formatINRCompact` (`K` / `L` / `Cr`, or `style: "long"`), `parseINR("Rs. 1,500/-")`, `amountInWords`, `numberToIndianWords`, `groupIndian` |
| **States** | `GST_STATE_CODES`, `getStateByGSTCode` |

`lookupIFSC` calls Razorpay's free, open-source [IFSC API](https://github.com/razorpay/ifsc) by default. If you self-host it, pass `baseUrl`. It throws `IFSCLookupError` with `code` set to `"INVALID_IFSC"`, `"NOT_FOUND"` or `"NETWORK"`.

`lookupPincode` calls the free India Post API at [api.postalpincode.in](https://api.postalpincode.in), which allows browser requests. It throws `PincodeLookupError` with `code` set to `"INVALID_PINCODE"`, `"NOT_FOUND"` or `"NETWORK"`.

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
