import { describe, expect, it } from "vitest";
import { computeGST, isValidHSN, validateHSN } from "../src";

const MH_GSTIN = "27AAPFU0939F1ZV";

describe("computeGST: which tax heads apply", () => {
  it("charges IGST across states", () => {
    const r = computeGST({
      supplierState: MH_GSTIN,
      placeOfSupply: "29",
      items: [{ description: "Laptop stand", hsn: "8473", quantity: 2, unitPrice: 1499, rate: 18 }],
    });
    expect(r).toMatchObject({
      supplyKind: "inter-state",
      taxHeads: ["IGST"],
      supplierStateCode: "27",
      supplierStateName: "Maharashtra",
      placeOfSupplyCode: "29",
      placeOfSupplyName: "Karnataka",
    });
    expect(r.totals).toMatchObject({ taxableValue: 2998, igst: 539.64, cgst: 0, sgst: 0, totalTax: 539.64, invoiceValue: 3537.64, grandTotal: 3537.64 });
    expect(r.lines[0]).toMatchObject({ index: 0, hsn: "8473", taxableValue: 2998, igst: 539.64, total: 3537.64 });
  });

  it("splits CGST + SGST equally within a state", () => {
    const r = computeGST({ supplierState: "27", placeOfSupply: MH_GSTIN, items: [{ unitPrice: 1000, rate: 18 }] });
    expect(r.supplyKind).toBe("intra-state");
    expect(r.taxHeads).toEqual(["CGST", "SGST"]);
    expect(r.totals).toMatchObject({ cgst: 90, sgst: 90, utgst: 0, igst: 0, totalTax: 180, invoiceValue: 1180 });
  });

  it("uses UTGST in union territories without a legislature", () => {
    const r = computeGST({ supplierState: "Chandigarh", placeOfSupply: "04", items: [{ unitPrice: 1000, rate: 5 }] });
    expect(r.taxHeads).toEqual(["CGST", "UTGST"]);
    expect(r.totals).toMatchObject({ cgst: 25, utgst: 25, sgst: 0 });
  });

  it("uses SGST in Delhi (a UT with a legislature)", () => {
    const r = computeGST({ supplierState: "07", placeOfSupply: "delhi", items: [{ unitPrice: 100, rate: 18 }] });
    expect(r.taxHeads).toEqual(["CGST", "SGST"]);
  });

  it("accepts state names case-insensitively and numeric codes", () => {
    const r = computeGST({ supplierState: 9, placeOfSupply: "KARNATAKA", items: [{ unitPrice: 1, rate: 0 }] });
    expect(r).toMatchObject({ supplierStateCode: "09", placeOfSupplyCode: "29" });
  });
});

describe("computeGST: rounding", () => {
  it("keeps CGST and SGST equal and rounds half-up per line", () => {
    const r = computeGST({ supplierState: "27", placeOfSupply: "27", items: [{ unitPrice: 99.99, rate: 5 }] });
    expect(r.totals).toMatchObject({ cgst: 2.5, sgst: 2.5, totalTax: 5 });
  });

  it("avoids float drift", () => {
    const r = computeGST({ supplierState: "27", placeOfSupply: "29", items: [{ quantity: 3, unitPrice: 0.1, rate: 18 }] });
    expect(r.totals).toMatchObject({ taxableValue: 0.3, igst: 0.05, invoiceValue: 0.35 });
  });

  it("backs tax out of inclusive prices so the total matches the price", () => {
    const inter = computeGST({ supplierState: "27", placeOfSupply: "29", priceIncludesTax: true, items: [{ unitPrice: 100, rate: 18 }] });
    expect(inter.totals).toMatchObject({ taxableValue: 84.74, igst: 15.26, invoiceValue: 100 });
    const intra = computeGST({ supplierState: "27", placeOfSupply: "27", priceIncludesTax: true, items: [{ unitPrice: 100, rate: 18 }] });
    expect(intra.totals).toMatchObject({ taxableValue: 84.74, cgst: 7.63, sgst: 7.63, invoiceValue: 100 });
    const exact = computeGST({ supplierState: "27", placeOfSupply: "29", priceIncludesTax: true, items: [{ unitPrice: 118, rate: 18 }] });
    expect(exact.totals).toMatchObject({ taxableValue: 100, igst: 18 });
  });

  it("rounds the grand total to the rupee when asked", () => {
    const r = computeGST({
      supplierState: "27",
      placeOfSupply: "29",
      roundOff: true,
      items: [{ quantity: 2, unitPrice: 1499, rate: 18 }],
    });
    expect(r.totals).toMatchObject({ invoiceValue: 3537.64, roundOff: 0.36, grandTotal: 3538 });
  });
});

describe("computeGST: lines, discounts, cess and summary", () => {
  it("applies the discount before tax", () => {
    const r = computeGST({ supplierState: "27", placeOfSupply: "29", items: [{ quantity: 3, unitPrice: 100, discount: 30, rate: 12 }] });
    expect(r.lines[0]).toMatchObject({ taxableValue: 270, igst: 32.4, total: 302.4, discount: 30 });
  });

  it("adds cess and reports the CESS head", () => {
    const r = computeGST({ supplierState: "27", placeOfSupply: "29", items: [{ unitPrice: 1000, rate: 28, cessRate: 12 }] });
    expect(r.taxHeads).toEqual(["IGST", "CESS"]);
    expect(r.totals).toMatchObject({ igst: 280, cess: 120, totalTax: 400, invoiceValue: 1400 });
  });

  it("groups the rate-wise summary and sorts it by rate", () => {
    const r = computeGST({
      supplierState: "27",
      placeOfSupply: "27",
      items: [
        { unitPrice: 200, rate: 18 },
        { unitPrice: 100, rate: 5 },
        { unitPrice: 300, rate: 18 },
      ],
    });
    expect(r.rateSummary).toEqual([
      { rate: 5, cessRate: 0, taxableValue: 100, cgst: 2.5, sgst: 2.5, utgst: 0, igst: 0, cess: 0, totalTax: 5 },
      { rate: 18, cessRate: 0, taxableValue: 500, cgst: 45, sgst: 45, utgst: 0, igst: 0, cess: 0, totalTax: 90 },
    ]);
    expect(r.totals).toMatchObject({ taxableValue: 600, totalTax: 95, invoiceValue: 695 });
  });
});

describe("computeGST: zero-rated and reverse charge", () => {
  it("charges no tax on exports under LUT", () => {
    const r = computeGST({ supplierState: "27", zeroRated: "lut", items: [{ unitPrice: 5000, rate: 18 }] });
    expect(r).toMatchObject({ supplyKind: "inter-state", taxHeads: ["IGST"], zeroRated: "lut", placeOfSupplyCode: undefined });
    expect(r.totals).toMatchObject({ taxableValue: 5000, igst: 0, totalTax: 0, invoiceValue: 5000 });
  });

  it("charges IGST on zero-rated supplies with payment, even to an SEZ in the same state", () => {
    const r = computeGST({ supplierState: "27", placeOfSupply: "27", zeroRated: "igst", items: [{ unitPrice: 1000, rate: 18 }] });
    expect(r.supplyKind).toBe("inter-state");
    expect(r.totals).toMatchObject({ igst: 180, cgst: 0 });
  });

  it("leaves tax out of the invoice value under reverse charge", () => {
    const r = computeGST({ supplierState: "27", placeOfSupply: "29", reverseCharge: true, items: [{ unitPrice: 1000, rate: 18 }] });
    expect(r.reverseCharge).toBe(true);
    expect(r.totals).toMatchObject({ igst: 180, totalTax: 180, invoiceValue: 1000, grandTotal: 1000 });
  });
});

describe("computeGST: input errors", () => {
  const ok = { supplierState: "27", placeOfSupply: "29", items: [{ unitPrice: 100, rate: 18 }] };
  it("rejects bad states and GSTINs", () => {
    expect(() => computeGST({ ...ok, supplierState: "50" })).toThrow(RangeError);
    expect(() => computeGST({ ...ok, supplierState: "27AAPFU0939F1ZA" })).toThrow(/check digit/);
    expect(() => computeGST({ ...ok, placeOfSupply: "Atlantis" })).toThrow(TypeError);
    expect(() => computeGST({ ...ok, placeOfSupply: undefined })).toThrow(/placeOfSupply is required/);
  });

  it("rejects bad items", () => {
    expect(() => computeGST({ ...ok, items: [] })).toThrow(TypeError);
    expect(() => computeGST({ ...ok, items: [{ unitPrice: -1, rate: 18 }] })).toThrow(/items\[0\]\.unitPrice/);
    expect(() => computeGST({ ...ok, items: [{ unitPrice: 1, rate: 118 }] })).toThrow(RangeError);
    expect(() => computeGST({ ...ok, items: [{ unitPrice: 1, rate: 18, quantity: 0 }] })).toThrow(/quantity/);
    expect(() => computeGST({ ...ok, items: [{ unitPrice: 10, rate: 18, discount: 11 }] })).toThrow(/discount/);
    expect(() => computeGST({ ...ok, items: [{ unitPrice: 10, rate: Number.NaN }] })).toThrow(TypeError);
    expect(() => computeGST({ ...ok, items: [{ unitPrice: 10, rate: 18, hsn: "12" }] })).toThrow(/hsn/);
  });

  it("rejects an unknown zeroRated value", () => {
    expect(() => computeGST({ ...ok, zeroRated: "yes" as "lut" })).toThrow(TypeError);
  });
});

describe("validateHSN", () => {
  it("accepts goods HSN and services SAC codes", () => {
    expect(validateHSN("8473")).toMatchObject({ valid: true, details: { kind: "goods", chapter: "84" } });
    expect(validateHSN("8473 30 20")).toMatchObject({ valid: true, value: "84733020" });
    expect(validateHSN("998314")).toMatchObject({ valid: true, details: { kind: "services", chapter: "99" } });
  });

  it("rejects bad lengths, letters and chapters", () => {
    expect(validateHSN("")).toMatchObject({ error: "EMPTY" });
    expect(validateHSN("847")).toMatchObject({ error: "INVALID_LENGTH" });
    expect(validateHSN("84a3")).toMatchObject({ error: "INVALID_FORMAT" });
    expect(validateHSN("9983")).toMatchObject({ error: "INVALID_LENGTH" });
    expect(validateHSN("0012")).toMatchObject({ error: "INVALID_FORMAT" });
    expect(isValidHSN("8473")).toBe(true);
  });
});
