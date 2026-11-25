import { describe, expect, it, vi } from "vitest";
import {
  amountInWords,
  buildUPILink,
  computeGSTINChecksum,
  formatINR,
  formatINRCompact,
  formatIndianMobile,
  getStateByGSTCode,
  groupIndian,
  isIntraStateSupply,
  isValidGSTIN,
  lookupIFSC,
  IFSCLookupError,
  maskPAN,
  numberToIndianWords,
  parseINR,
  parseUPILink,
  validateGSTIN,
  validateIFSC,
  validateIndianMobile,
  validatePAN,
  validatePincode,
  validateUPIId,
} from "../src";

describe("GSTIN", () => {
  it("accepts a valid GSTIN and returns details", () => {
    const r = validateGSTIN("27AAPFU0939F1ZV");
    expect(r.valid).toBe(true);
    if (r.valid) {
      expect(r.details).toMatchObject({
        stateCode: "27",
        stateName: "Maharashtra",
        pan: "AAPFU0939F",
        panHolderType: "Firm / Partnership",
        entityNumber: "1",
        checksum: "V",
      });
    }
  });

  it("normalizes case and whitespace", () => {
    expect(validateGSTIN(" 27aapfu0939f1zv ").valid).toBe(true);
    expect(validateGSTIN("27 AAPFU 0939F 1ZV").value).toBe("27AAPFU0939F1ZV");
  });

  it("rejects a wrong check digit", () => {
    const r = validateGSTIN("27AAPFU0939F1ZA");
    expect(r).toMatchObject({ valid: false, error: "INVALID_CHECKSUM" });
  });

  it("rejects an unknown state code", () => {
    const first14 = "40AAPFU0939F1Z";
    const r = validateGSTIN(first14 + computeGSTINChecksum(first14));
    expect(r).toMatchObject({ valid: false, error: "INVALID_STATE_CODE" });
  });

  it("reports empty, length and format errors", () => {
    expect(validateGSTIN("")).toMatchObject({ error: "EMPTY" });
    expect(validateGSTIN(undefined)).toMatchObject({ error: "EMPTY" });
    expect(validateGSTIN("27AAPFU0939F1Z")).toMatchObject({ error: "INVALID_LENGTH" });
    expect(validateGSTIN("2AAAPFU0939F1ZV")).toMatchObject({ error: "INVALID_FORMAT" });
    expect(validateGSTIN("27AAPFU0939F0ZV")).toMatchObject({ error: "INVALID_FORMAT" }); // entity number can't be 0
  });

  it("computes checksums that round-trip for every state", () => {
    for (const code of ["07", "09", "24", "29", "33", "36", "37", "38"]) {
      const first14 = `${code}ABCDE1234F1Z`;
      expect(isValidGSTIN(first14 + computeGSTINChecksum(first14))).toBe(true);
    }
  });

  it("detects intra-state supply", () => {
    expect(isIntraStateSupply("27AAPFU0939F1ZV", "27ABCDE1234F1Z5")).toBe(true);
    expect(isIntraStateSupply("27AAPFU0939F1ZV", "29ABCDE1234F1Z5")).toBe(false);
  });

  it("looks up state names", () => {
    expect(getStateByGSTCode(7)).toBe("Delhi");
    expect(getStateByGSTCode("36")).toBe("Telangana");
    expect(getStateByGSTCode("00")).toBeUndefined();
  });
});

describe("PAN", () => {
  it("accepts valid PANs with holder type", () => {
    const r = validatePAN("abcpe1234f");
    expect(r).toMatchObject({ valid: true, value: "ABCPE1234F", details: { holderType: "Individual" } });
    expect(validatePAN("AAACR5055K")).toMatchObject({ valid: true, details: { holderTypeCode: "C" } });
  });

  it("rejects bad PANs", () => {
    expect(validatePAN("ABCPE1234")).toMatchObject({ error: "INVALID_LENGTH" });
    expect(validatePAN("ABCP11234F")).toMatchObject({ error: "INVALID_FORMAT" });
    expect(validatePAN("ABCXE1234F")).toMatchObject({ error: "INVALID_HOLDER_TYPE" });
  });

  it("masks PANs", () => {
    expect(maskPAN("ABCPE1234F")).toBe("XXXXXX234F");
  });
});

describe("IFSC", () => {
  it("validates format", () => {
    expect(validateIFSC("hdfc0000240")).toMatchObject({
      valid: true,
      value: "HDFC0000240",
      details: { bankCode: "HDFC", branchCode: "000240" },
    });
    expect(validateIFSC("SBIN0ABC123").valid).toBe(true);
    expect(validateIFSC("HDFC1000240")).toMatchObject({ error: "INVALID_FORMAT" });
    expect(validateIFSC("HDFC000024")).toMatchObject({ error: "INVALID_LENGTH" });
  });

  const sample = {
    BANK: "HDFC Bank",
    IFSC: "HDFC0000240",
    BRANCH: "Koramangala",
    ADDRESS: "Some address",
    CITY: "BANGALORE",
    DISTRICT: "BANGALORE URBAN",
    STATE: "KARNATAKA",
    CENTRE: "BANGALORE",
    CONTACT: "",
    MICR: "560240002",
    SWIFT: null,
    UPI: true,
    NEFT: true,
    RTGS: true,
    IMPS: true,
    BANKCODE: "HDFC",
  };

  it("looks up a branch via the API", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(sample), { status: 200 }));
    const branch = await lookupIFSC("hdfc0000240", { fetch });
    expect(fetch).toHaveBeenCalledWith("https://ifsc.razorpay.com/HDFC0000240", expect.anything());
    expect(branch).toMatchObject({ bank: "HDFC Bank", branch: "Koramangala", state: "KARNATAKA", contact: null, upi: true });
  });

  it("throws NOT_FOUND on 404 and INVALID_IFSC on bad input", async () => {
    const fetch = vi.fn(async () => new Response('"Not Found"', { status: 404 }));
    await expect(lookupIFSC("HDFC0999999", { fetch })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(lookupIFSC("bad", { fetch })).rejects.toBeInstanceOf(IFSCLookupError);
  });

  it("throws NETWORK when fetch fails", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("offline");
    });
    await expect(lookupIFSC("HDFC0000240", { fetch })).rejects.toMatchObject({ code: "NETWORK" });
  });
});

describe("UPI", () => {
  it("validates UPI IDs", () => {
    expect(validateUPIId("Shop.Name@OkHdfcBank")).toMatchObject({
      valid: true,
      value: "shop.name@okhdfcbank",
      details: { handle: "shop.name", provider: "okhdfcbank" },
    });
    expect(validateUPIId("9876543210@ybl").valid).toBe(true);
    expect(validateUPIId("no-at-sign").valid).toBe(false);
    expect(validateUPIId("a@b").valid).toBe(false);
    expect(validateUPIId("name@1bank").valid).toBe(false);
  });

  it("builds an encoded payment link", () => {
    const link = buildUPILink({
      payeeAddress: "shop@okhdfcbank",
      payeeName: "My Shop & Co",
      amount: 499,
      note: "Order #123",
      transactionRef: "ORD-123",
    });
    expect(link).toBe("upi://pay?pa=shop@okhdfcbank&pn=My%20Shop%20%26%20Co&tr=ORD-123&tn=Order%20%23123&am=499.00&cu=INR");
  });

  it("supports custom schemes and string amounts", () => {
    expect(buildUPILink({ payeeAddress: "a.b@ybl", amount: "₹1,250.5" }, { scheme: "phonepe" })).toBe(
      "phonepe://pay?pa=a.b@ybl&am=1250.50&cu=INR",
    );
  });

  it("rejects invalid params", () => {
    expect(() => buildUPILink({ payeeAddress: "bad" })).toThrow(/payeeAddress/);
    expect(() => buildUPILink({ payeeAddress: "ab@ybl", amount: -5 })).toThrow(RangeError);
    expect(() => buildUPILink({ payeeAddress: "ab@ybl", merchantCode: "12" })).toThrow(/4 digits/);
  });

  it("parses links back", () => {
    const link = buildUPILink({ payeeAddress: "shop@ybl", payeeName: "A & B", amount: 10, note: "Hi there" });
    expect(parseUPILink(link)).toMatchObject({
      payeeAddress: "shop@ybl",
      payeeName: "A & B",
      amount: "10.00",
      note: "Hi there",
      currency: "INR",
    });
    expect(parseUPILink("upi://pay?pn=NoPayee")).toBeNull();
    expect(parseUPILink("https://example.com")).toBeNull();
    expect(parseUPILink("upi://pay?pa=x@ybl&pn=Plus+Sign")?.payeeName).toBe("Plus Sign");
  });
});

describe("Pincode", () => {
  it("validates PIN codes", () => {
    expect(validatePincode("560 001")).toMatchObject({ valid: true, value: "560001", details: { zone: "Southern" } });
    expect(validatePincode(110001)).toMatchObject({ valid: true, details: { zone: "Northern" } });
    expect(validatePincode("056000")).toMatchObject({ error: "INVALID_FORMAT" });
    expect(validatePincode("5600")).toMatchObject({ error: "INVALID_LENGTH" });
    expect(validatePincode("56000A")).toMatchObject({ error: "INVALID_FORMAT" });
  });
});

describe("Mobile", () => {
  it.each(["9876543210", "09876543210", "+91 98765 43210", "91-98765-43210", "(+91) 98765 43210", "+919876543210"])(
    "accepts %s",
    (input) => {
      expect(validateIndianMobile(input)).toMatchObject({
        valid: true,
        value: "+919876543210",
        details: { national: "9876543210", formatted: "+91 98765 43210" },
      });
    },
  );

  it("rejects invalid numbers", () => {
    expect(validateIndianMobile("5876543210")).toMatchObject({ error: "INVALID_FORMAT" });
    expect(validateIndianMobile("98765")).toMatchObject({ error: "INVALID_LENGTH" });
    expect(validateIndianMobile("98765abc10")).toMatchObject({ error: "INVALID_FORMAT" });
    expect(formatIndianMobile("123")).toBe("123");
  });
});

describe("INR", () => {
  it("groups the Indian way", () => {
    expect(groupIndian("1")).toBe("1");
    expect(groupIndian("1000")).toBe("1,000");
    expect(groupIndian("100000")).toBe("1,00,000");
    expect(groupIndian("123456789")).toBe("12,34,56,789");
  });

  it("formats amounts", () => {
    expect(formatINR(1234567.5)).toBe("₹12,34,567.50");
    expect(formatINR(0)).toBe("₹0.00");
    expect(formatINR(-999)).toBe("-₹999.00");
    expect(formatINR(1500, { trimZeroDecimals: true })).toBe("₹1,500");
    expect(formatINR(1500.25, { symbol: false, decimals: 0 })).toBe("1,500");
    expect(formatINR("₹1,00,000")).toBe("₹1,00,000.00");
    expect(formatINR(NaN)).toBe("");
  });

  it("formats compactly", () => {
    expect(formatINRCompact(999)).toBe("₹999");
    expect(formatINRCompact(4500)).toBe("₹4.5K");
    expect(formatINRCompact(150000)).toBe("₹1.5 L");
    expect(formatINRCompact(25_000_000)).toBe("₹2.5 Cr");
    expect(formatINRCompact(12_500_000_000)).toBe("₹1,250 Cr");
    expect(formatINRCompact(150000, { style: "long" })).toBe("₹1.5 lakh");
    expect(formatINRCompact(-2e7, { symbol: false })).toBe("-2 Cr");
  });

  it("parses INR strings", () => {
    expect(parseINR("₹12,34,567.50")).toBe(1234567.5);
    expect(parseINR("Rs. 1,500/-")).toBe(1500);
    expect(parseINR("INR 2.5")).toBe(2.5);
    expect(parseINR("-₹100")).toBe(-100);
    expect(parseINR("abc")).toBeNaN();
  });

  it("converts numbers to words", () => {
    expect(numberToIndianWords(0)).toBe("Zero");
    expect(numberToIndianWords(15)).toBe("Fifteen");
    expect(numberToIndianWords(101)).toBe("One Hundred One");
    expect(numberToIndianWords(1234567)).toBe("Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven");
    expect(numberToIndianWords(1_000_000_000)).toBe("One Hundred Crore");
    expect(numberToIndianWords(12_34_56_78_901)).toBe(
      "One Thousand Two Hundred Thirty Four Crore Fifty Six Lakh Seventy Eight Thousand Nine Hundred One",
    );
    expect(() => numberToIndianWords(1.5)).toThrow(RangeError);
  });

  it("converts amounts to cheque words", () => {
    expect(amountInWords(123456.78)).toBe(
      "Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Seventy Eight Paise Only",
    );
    expect(amountInWords(1)).toBe("Rupees One Only");
    expect(amountInWords(0.5)).toBe("Fifty Paise Only");
    expect(amountInWords("₹10,00,000")).toBe("Rupees Ten Lakh Only");
    expect(amountInWords(1.005 * 100 / 100)).toMatch(/^Rupees One/);
    expect(amountInWords(-20)).toBe("Minus Rupees Twenty Only");
    expect(amountInWords(42.1, { currency: false })).toBe("Forty Two Point Ten");
  });
});
