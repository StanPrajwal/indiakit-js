import { describe, expect, it } from "vitest";
import {
  computeAadhaarChecksum,
  computeGSTINChecksum,
  containsPII,
  findPII,
  isValidAadhaar,
  maskAadhaar,
  redactObject,
  redactPII,
  validateAadhaar,
} from "../src";

const aadhaar = (first11: string) => first11 + computeAadhaarChecksum(first11);
const AADHAAR = aadhaar("23456789012");
const BAD_AADHAAR = AADHAAR.slice(0, 11) + String((Number(AADHAAR[11]) + 1) % 10);
const GSTIN = "27AAPFU0939F1ZV";

describe("Aadhaar", () => {
  it("validates the Verhoeff check digit", () => {
    expect(isValidAadhaar(AADHAAR)).toBe(true);
    expect(validateAadhaar(BAD_AADHAAR)).toMatchObject({ valid: false, error: "INVALID_CHECKSUM" });
  });

  it("accepts spaces and hyphens and returns a masked form", () => {
    const spaced = `${AADHAAR.slice(0, 4)} ${AADHAAR.slice(4, 8)}-${AADHAAR.slice(8)}`;
    const r = validateAadhaar(spaced);
    expect(r.valid && r.details).toMatchObject({ masked: `XXXX XXXX ${AADHAAR.slice(8)}`, last4: AADHAAR.slice(8) });
    expect(r.value).toBe(AADHAAR);
  });

  it("rejects wrong length, letters and a leading 0 or 1", () => {
    expect(validateAadhaar("")).toMatchObject({ error: "EMPTY" });
    expect(validateAadhaar("12345")).toMatchObject({ error: "INVALID_LENGTH" });
    expect(validateAadhaar("2345678901ab")).toMatchObject({ error: "INVALID_FORMAT" });
    expect(validateAadhaar(aadhaar("13456789012"))).toMatchObject({ error: "INVALID_FORMAT" });
  });

  it("masks like UIDAI", () => {
    expect(maskAadhaar(AADHAAR)).toBe(`XXXX XXXX ${AADHAAR.slice(8)}`);
  });

  it("computeAadhaarChecksum rejects bad input", () => {
    expect(() => computeAadhaarChecksum("123")).toThrow(TypeError);
  });
});

describe("findPII", () => {
  it("finds each supported type", () => {
    const text = [
      `aadhaar ${AADHAAR}`,
      "pan ABCPE1234F",
      `gstin ${GSTIN}`,
      "mobile +91 98765 43210",
      "upi shop@okhdfcbank",
      "mail Priya.S@example.co.in",
      "card 4111 1111 1111 1111",
      "a/c no: 001234567890123",
    ].join(", ");
    const types = findPII(text).map((m) => m.type);
    expect(types).toEqual(["aadhaar", "pan", "gstin", "mobile", "upi", "email", "card", "bankAccount"]);
  });

  it("reports positions and normalized values", () => {
    const text = "call 098765-43210 now";
    const [m] = findPII(text);
    expect(m).toMatchObject({ type: "mobile", match: "098765-43210", value: "9876543210" });
    expect(text.slice(m!.start, m!.end)).toBe("098765-43210");
  });

  it("does not report a PAN that sits inside a GSTIN", () => {
    expect(findPII(`GSTIN ${GSTIN}`).map((m) => m.type)).toEqual(["gstin"]);
  });

  it("skips numbers that fail the checksums", () => {
    expect(findPII(`order ${BAD_AADHAAR}`)).toEqual([]);
    expect(findPII("ref 4111 1111 1111 1112")).toEqual([]);
    expect(findPII(`id ${computeGSTINChecksum("27AAPFU0939F1Z") === "A" ? "27AAPFU0939F1ZB" : "27AAPFU0939F1ZA"}`)).toEqual([]);
  });

  it("does not carve PII out of longer numbers or words", () => {
    expect(findPII(`txn 99${AADHAAR}77`)).toEqual([]);
    expect(findPII("trace 1234567898765432109876")).toEqual([]);
    expect(findPII("XABCPE1234F")).toEqual([]);
  });

  it("does not treat 10-letter words or bad PAN holder types as PAN", () => {
    expect(findPII("ABCDE1234F")).toEqual([]); // D is not a holder type
  });

  it("only matches bank accounts after a keyword", () => {
    expect(findPII("invoice 001234567890123")).toEqual([]);
    const [m] = findPII("Account Number: 0012 3456 7890");
    expect(m).toMatchObject({ type: "bankAccount", value: "001234567890" });
  });

  it("tells email and UPI apart", () => {
    expect(findPII("ravi@ybl and ravi@gmail.com").map((m) => m.type)).toEqual(["upi", "email"]);
  });

  it("honours the types option", () => {
    expect(findPII(`PAN ABCPE1234F, ${AADHAAR}`, { types: ["pan"] }).map((m) => m.type)).toEqual(["pan"]);
  });

  it("handles empty and non-string input", () => {
    expect(findPII("")).toEqual([]);
    expect(findPII(undefined as unknown as string)).toEqual([]);
    expect(containsPII("nothing here")).toBe(false);
  });
});

describe("redactPII", () => {
  it("masks partially by default", () => {
    const out = redactPII(`KYC ok for ${AADHAAR}, PAN ABCPE1234F, call +91 98765 43210, mail priya@example.com`);
    expect(out).toBe(`KYC ok for XXXX XXXX ${AADHAAR.slice(8)}, PAN XXXXXX234F, call XXXXXX3210, mail p***@example.com`);
  });

  it("masks GSTIN, card, UPI and bank account", () => {
    expect(redactPII(GSTIN)).toBe("27XXXXXXXXXX1ZV");
    expect(redactPII("4111-1111-1111-1111")).toBe("XXXXXXXXXXXX1111");
    expect(redactPII("pay shop@okhdfcbank")).toBe("pay s***@okhdfcbank");
    expect(redactPII("acct 001234567890")).toBe("acct XXXXXXXX7890");
  });

  it("supports labels and custom masks", () => {
    expect(redactPII("PAN ABCPE1234F, +919876543210", { mask: "label" })).toBe("PAN [PAN], [MOBILE]");
    expect(redactPII("PAN ABCPE1234F", { mask: (m) => `<${m.type}>` })).toBe("PAN <pan>");
  });

  it("returns the input unchanged when there is nothing to redact", () => {
    const s = "order 12345 shipped to 560001";
    expect(redactPII(s)).toBe(s);
  });
});

describe("redactObject", () => {
  it("redacts nested strings without mutating the input", () => {
    const date = new Date(0);
    const input = { user: { pan: "ABCPE1234F", phones: ["9876543210"] }, count: 3, at: date };
    const out = redactObject(input, { mask: "label" });
    expect(out).toEqual({ user: { pan: "[PAN]", phones: ["[MOBILE]"] }, count: 3, at: date });
    expect(input.user.pan).toBe("ABCPE1234F");
  });

  it("handles circular references", () => {
    const a: Record<string, unknown> = { pan: "ABCPE1234F" };
    a.self = a;
    const out = redactObject(a) as Record<string, unknown>;
    expect(out.pan).toBe("XXXXXX234F");
    expect(out.self).toBe(out);
  });
});
