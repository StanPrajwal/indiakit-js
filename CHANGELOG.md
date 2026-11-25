# Changelog

All notable changes to this project are documented here. This project follows [Semantic Versioning](https://semver.org/). While it is below 1.0, minor versions may contain breaking changes; those are called out below.

## 0.2.1 — 2026-11-25

- Live demo at https://stanprajwal.github.io/indiakit-js/, linked from the README and set as the package homepage. No code changes.

## 0.2.0 — 2026-11-25

### Added
- `lookupPincode(pin)` returns the district, state, postal circle and post offices for a PIN code, using the free India Post API. Throws `PincodeLookupError` (`INVALID_PINCODE`, `NOT_FOUND` or `NETWORK`).
- `usePincode({ lookup: true })` fetches the location once the PIN code is valid and exposes `location`, `lookupStatus`, `lookupError` and `lookupErrorCode`. Results are cached and stale requests are aborted. Lookup is off by default.
- `validateGSTIN` now accepts TCS (e-commerce operator), TDS (TAN-based), UIN (UN bodies, embassies) and OIDAR / non-resident (state code 99 or 97) registrations, with the check digit verified.
- `details.type`, `details.typeLabel`, `details.tan`, `details.registrationYear` and `details.countryCode` on GSTIN results, plus `GSTIN_TYPE_LABELS` and the `GSTINType` type.
- `validateGSTIN(value, { types })` to accept only some registration types.
- `LookupStatus` type, shared by `useIFSC` and `usePincode`. `IFSCLookupStatus` remains as a deprecated alias.
- GitHub Actions CI and this changelog.

### Changed (breaking for TypeScript users)
- `GSTINDetails.pan` and `GSTINDetails.entityNumber` are now `string | undefined`, because UIN, OIDAR and TDS registrations have no PAN. Regular and TCS GSTINs still always have a PAN.
- GSTINs that used to fail with `INVALID_FORMAT` because they were UIN, OIDAR, TDS or TCS registrations are now valid. Pass `{ types: ["regular"] }` to keep the old behavior.

### Internal
- Upgraded dev tools (vitest 5, vite 8, tsup 9, jsdom 31). `npm audit` reports 0 vulnerabilities. The published package still has no runtime dependencies.

## 0.1.1 — 2026-11-25

- Added repository, homepage and issue links, and README badges.

## 0.1.0 — 2026-11-25

- First release: GSTIN, PAN, IFSC (with branch lookup), UPI, PIN code, mobile and ₹ validators and formatters, headless React hooks and unstyled inputs.
