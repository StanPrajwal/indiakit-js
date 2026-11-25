import { describe, expect, it, vi } from "vitest";
import { computeGSTINChecksum, isValidGSTIN, lookupPincode, PincodeLookupError, validateGSTIN } from "../src";

const withCheck = (first14: string) => first14 + computeGSTINChecksum(first14);

describe("GSTIN registration types", () => {
  it("reports regular taxpayers as type regular", () => {
    const r = validateGSTIN("27AAPFU0939F1ZV");
    expect(r.valid && r.details).toMatchObject({ type: "regular", pan: "AAPFU0939F", tan: undefined, countryCode: undefined });
  });

  it("accepts real UINs issued to UN bodies", () => {
    for (const uin of ["2317UNO00001UND", "0717UNO00157UNO"]) {
      const r = validateGSTIN(uin);
      expect(r.valid).toBe(true);
      if (r.valid) {
        expect(r.details).toMatchObject({ type: "uin", countryCode: "UNO", pan: undefined, entityNumber: undefined });
      }
    }
    const r = validateGSTIN("2317UNO00001UND");
    expect(r.valid && r.details).toMatchObject({ stateName: "Madhya Pradesh", registrationYear: "17" });
  });

  it("accepts OIDAR registrations under state code 99 / 97", () => {
    const g = withCheck("9917USA00013OS");
    const r = validateGSTIN(g);
    expect(r.valid && r.details).toMatchObject({ type: "oidar", stateName: "Other Country", countryCode: "USA", registrationYear: "17" });
    expect(validateGSTIN(withCheck("9717GBR00001OS")).valid && "ok").toBe("ok");
  });

  it("rejects state code 99 on a PAN-based GSTIN", () => {
    expect(validateGSTIN(withCheck("99AAPFU0939F1Z"))).toMatchObject({ error: "INVALID_STATE_CODE" });
  });

  it("accepts TDS (TAN-based) and TCS registrations", () => {
    const tds = validateGSTIN(withCheck("07DELA12345B1D"));
    expect(tds.valid && tds.details).toMatchObject({ type: "tds", tan: "DELA12345B", pan: undefined, stateName: "Delhi" });
    const tcs = validateGSTIN(withCheck("29AABCF8078M1C"));
    expect(tcs.valid && tcs.details).toMatchObject({ type: "tcs", pan: "AABCF8078M", panHolderType: "Company" });
  });

  it("still checks the check digit on special formats", () => {
    expect(validateGSTIN("2317UNO00001UNE")).toMatchObject({ error: "INVALID_CHECKSUM" });
  });

  it("can restrict accepted types", () => {
    expect(validateGSTIN("2317UNO00001UND", { types: ["regular"] })).toMatchObject({ valid: false, error: "INVALID_FORMAT" });
    expect(validateGSTIN("27AAPFU0939F1ZV", { types: ["regular"] }).valid).toBe(true);
    expect(isValidGSTIN("2317UNO00001UND")).toBe(true);
  });
});

describe("lookupPincode", () => {
  const body = [
    {
      Message: "Number of pincode(s) found:2",
      Status: "Success",
      PostOffice: [
        { Name: "Bangalore ", BranchType: "Head Post Office", DeliveryStatus: "Delivery", Circle: "Karnataka", District: "Bangalore", Division: "Bangalore GPO", Region: "Bangalore HQ", Block: "Bangalore North", State: "Karnataka", Country: "India", Pincode: "560001" },
        { Name: "Vidhana Soudha", BranchType: "Sub Post Office", DeliveryStatus: "Non-Delivery", Circle: "Karnataka", District: "Bangalore", Division: "Bangalore East", Region: "Bangalore HQ", Block: "Bangalore North", State: "Karnataka", Country: "India", Pincode: "560001" },
      ],
    },
  ];

  it("returns district, state and post offices", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
    const loc = await lookupPincode("560 001", { fetch });
    expect(fetch).toHaveBeenCalledWith("https://api.postalpincode.in/pincode/560001", expect.anything());
    expect(loc).toMatchObject({ pincode: "560001", district: "Bangalore", state: "Karnataka", circle: "Karnataka", districts: ["Bangalore"] });
    expect(loc.postOffices).toHaveLength(2);
    expect(loc.postOffices[0]).toMatchObject({ name: "Bangalore", branchType: "Head Post Office" });
  });

  it("throws NOT_FOUND when the API reports no records", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify([{ Message: "No records found", Status: "Error", PostOffice: null }]), { status: 200 }));
    await expect(lookupPincode("999999", { fetch })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws INVALID_PINCODE without calling the API", async () => {
    const fetch = vi.fn();
    await expect(lookupPincode("12345", { fetch })).rejects.toBeInstanceOf(PincodeLookupError);
    await expect(lookupPincode("012345", { fetch })).rejects.toMatchObject({ code: "INVALID_PINCODE" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("throws NETWORK on fetch failure, server errors and bad JSON", async () => {
    await expect(lookupPincode("560001", { fetch: vi.fn(async () => { throw new TypeError("offline"); }) })).rejects.toMatchObject({ code: "NETWORK" });
    await expect(lookupPincode("560001", { fetch: vi.fn(async () => new Response("oops", { status: 500 })) })).rejects.toMatchObject({ code: "NETWORK", status: 500 });
    await expect(lookupPincode("560001", { fetch: vi.fn(async () => new Response("<html>", { status: 200 })) })).rejects.toMatchObject({ code: "NETWORK" });
  });
});
