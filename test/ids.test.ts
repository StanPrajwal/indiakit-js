import { describe, expect, it } from "vitest";
import {
  isValidBankAccount,
  isValidCIN,
  isValidDrivingLicence,
  isValidLLPIN,
  isValidPassport,
  isValidTAN,
  isValidUdyam,
  isValidVehicleRegistration,
  isValidVoterId,
  validateBankAccount,
  validateCIN,
  validateDrivingLicence,
  validateLLPIN,
  validatePassport,
  validateTAN,
  validateUdyam,
  validateVehicleRegistration,
  validateVoterId,
} from "../src";

describe("TAN", () => {
  it("accepts 4 letters, 5 digits, 1 letter", () => {
    expect(validateTAN(" dela12345b ")).toEqual({ valid: true, value: "DELA12345B", details: { jurisdictionCode: "DEL", nameInitial: "A" } });
    expect(isValidTAN("MUMA01234C")).toBe(true);
  });
  it("rejects other shapes, including a PAN", () => {
    expect(validateTAN("")).toMatchObject({ error: "EMPTY" });
    expect(validateTAN("DELA1234B")).toMatchObject({ error: "INVALID_LENGTH" });
    expect(validateTAN("ABCPE1234F")).toMatchObject({ error: "INVALID_FORMAT" });
  });
});

describe("CIN", () => {
  it("parses a valid CIN", () => {
    const r = validateCIN("U72200KA2010PTC052963");
    expect(r).toEqual({
      valid: true,
      value: "U72200KA2010PTC052963",
      details: {
        listed: false,
        industryCode: "72200",
        stateCode: "KA",
        year: 2010,
        companyTypeCode: "PTC",
        companyType: "Private limited company",
        registrationNumber: "052963",
      },
    });
    expect(validateCIN("L17110MH1973PLC019786")).toMatchObject({ valid: true, details: { listed: true, companyTypeCode: "PLC" } });
  });
  it("rejects bad shapes, years and company types", () => {
    expect(validateCIN("U72200KA2010PTC05296")).toMatchObject({ error: "INVALID_LENGTH" });
    expect(validateCIN("X72200KA2010PTC052963")).toMatchObject({ error: "INVALID_FORMAT" });
    expect(validateCIN("U72200KA1700PTC052963")).toMatchObject({ error: "INVALID_FORMAT" });
    expect(validateCIN("U72200KA2010XYZ052963").valid).toBe(false);
    expect(isValidCIN("U72200KA2999PTC052963")).toBe(false);
  });
});

describe("LLPIN", () => {
  it("accepts with or without the hyphen and normalizes it", () => {
    expect(validateLLPIN("aab1234")).toEqual({ valid: true, value: "AAB-1234", details: undefined });
    expect(isValidLLPIN("AAB-1234")).toBe(true);
  });
  it("rejects bad input", () => {
    expect(validateLLPIN("AA-12345")).toMatchObject({ error: "INVALID_FORMAT" });
    expect(validateLLPIN("AAB-123")).toMatchObject({ error: "INVALID_LENGTH" });
  });
});

describe("Udyam", () => {
  it("accepts and normalizes Udyam numbers", () => {
    expect(validateUdyam("udyam mh 26 0012345")).toEqual({
      valid: true,
      value: "UDYAM-MH-26-0012345",
      details: { stateCode: "MH", districtCode: "26", serial: "0012345" },
    });
    expect(isValidUdyam("UDYAM-KR-03-0000001")).toBe(true);
  });
  it("rejects bad input", () => {
    expect(validateUdyam("UDYAM-MH-26-001234")).toMatchObject({ error: "INVALID_LENGTH" });
    expect(validateUdyam("UDYOG-MH-26-0012345")).toMatchObject({ error: "INVALID_FORMAT" });
    expect(validateUdyam(null)).toMatchObject({ error: "EMPTY" });
  });
});

describe("voter ID and passport", () => {
  it("validates voter IDs", () => {
    expect(validateVoterId("abc 1234567")).toMatchObject({ valid: true, value: "ABC1234567" });
    expect(validateVoterId("AB12345678")).toMatchObject({ error: "INVALID_FORMAT" });
    expect(isValidVoterId("ABC123456")).toBe(false);
  });
  it("validates passport numbers", () => {
    expect(validatePassport("j8369854")).toMatchObject({ valid: true, value: "J8369854" });
    expect(validatePassport("J836985")).toMatchObject({ error: "INVALID_LENGTH" });
    expect(validatePassport("18369854")).toMatchObject({ error: "INVALID_FORMAT" });
    expect(isValidPassport("A0000000")).toBe(false);
  });
});

describe("vehicle registration", () => {
  it("accepts standard plates in any spacing", () => {
    expect(validateVehicleRegistration("ka 01 ab 1234")).toEqual({
      valid: true,
      value: "KA01AB1234",
      details: { series: "standard", stateCode: "KA", stateName: "Karnataka", rtoCode: "01", year: undefined, formatted: "KA 01 AB 1234" },
    });
    expect(validateVehicleRegistration("MH-12-DE-1433")).toMatchObject({ valid: true, details: { formatted: "MH 12 DE 1433" } });
    expect(isValidVehicleRegistration("DL 1C AB 1234")).toBe(true);
    expect(isValidVehicleRegistration("TN 09 1234")).toBe(true);
  });
  it("accepts Bharat-series plates", () => {
    expect(validateVehicleRegistration("22 BH 1234 AA")).toMatchObject({
      valid: true,
      details: { series: "bharat", year: "22", stateCode: undefined, formatted: "22 BH 1234 AA" },
    });
  });
  it("rejects unknown states and bad shapes", () => {
    expect(validateVehicleRegistration("XX 01 AB 1234")).toMatchObject({ error: "INVALID_STATE_CODE" });
    expect(validateVehicleRegistration("KA 01 AB 0000")).toMatchObject({ error: "INVALID_FORMAT" });
    expect(validateVehicleRegistration("KA01AB12345")).toMatchObject({ error: "INVALID_FORMAT" });
    expect(validateVehicleRegistration("KA1")).toMatchObject({ error: "INVALID_LENGTH" });
  });
});

describe("driving licence", () => {
  it("accepts the national format", () => {
    expect(validateDrivingLicence("MH14 20110062821")).toEqual({
      valid: true,
      value: "MH1420110062821",
      details: { stateCode: "MH", stateName: "Maharashtra", rtoCode: "14", year: 2011, serial: "0062821", formatted: "MH14 20110062821" },
    });
    expect(isValidDrivingLicence("ka-01-2019-0001234")).toBe(true);
  });
  it("rejects bad states, years and lengths", () => {
    expect(validateDrivingLicence("XX1420110062821")).toMatchObject({ error: "INVALID_STATE_CODE" });
    expect(validateDrivingLicence("MH1418990062821")).toMatchObject({ error: "INVALID_FORMAT" });
    expect(validateDrivingLicence("MH14201100628")).toMatchObject({ error: "INVALID_LENGTH" });
  });
});

describe("bank account", () => {
  it("accepts 9 to 18 digits", () => {
    expect(validateBankAccount("0012 3456 7890")).toEqual({ valid: true, value: "001234567890", details: undefined });
    expect(isValidBankAccount("123456789")).toBe(true);
    expect(isValidBankAccount("123456789012345678")).toBe(true);
  });
  it("rejects letters, bad lengths and all zeros", () => {
    expect(validateBankAccount("12345678")).toMatchObject({ error: "INVALID_LENGTH" });
    expect(validateBankAccount("1234567890123456789")).toMatchObject({ error: "INVALID_LENGTH" });
    expect(validateBankAccount("12345A789")).toMatchObject({ error: "INVALID_FORMAT" });
    expect(validateBankAccount("000000000")).toMatchObject({ error: "INVALID_FORMAT" });
  });
});
