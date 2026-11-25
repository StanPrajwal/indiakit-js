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
