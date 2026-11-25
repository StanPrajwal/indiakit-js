import { describe, expect, it } from "vitest";
import {
  addBankWorkingDays,
  countBankWorkingDays,
  getBankHoliday,
  getFinancialQuarter,
  getFinancialYear,
  getGSTAnnualDueDates,
  getGSTDueDates,
  getUpcomingGSTDeadlines,
  isBankWorkingDay,
  nextBankWorkingDay,
  toISTDateString,
} from "../src";

describe("dates in IST", () => {
  it("reads Date objects in Indian Standard Time", () => {
    expect(toISTDateString(new Date("2026-03-31T18:29:59Z"))).toBe("2026-03-31");
    expect(toISTDateString(new Date("2026-03-31T18:30:00Z"))).toBe("2026-04-01");
  });

  it("rejects bad input", () => {
    expect(() => toISTDateString("2026-02-30")).toThrow(RangeError);
    expect(() => toISTDateString("31/03/2026")).toThrow(TypeError);
    expect(() => toISTDateString(new Date(Number.NaN))).toThrow(RangeError);
  });
});

describe("financial year and quarter", () => {
  it("runs from April to March", () => {
    expect(getFinancialYear("2026-03-31")).toEqual({
      label: "FY 2025-26",
      shortLabel: "2025-26",
      startYear: 2025,
      start: "2025-04-01",
      end: "2026-03-31",
    });
    expect(getFinancialYear("2026-04-01").label).toBe("FY 2026-27");
    expect(getFinancialYear("2099-06-01").shortLabel).toBe("2099-00");
  });

  it("uses IST at the year boundary", () => {
    expect(getFinancialYear(new Date("2026-03-31T19:00:00Z")).label).toBe("FY 2026-27");
  });

  it("returns quarters", () => {
    expect(getFinancialQuarter("2026-05-10")).toMatchObject({ quarter: 1, label: "Q1 FY 2026-27", months: "Apr–Jun 2026", start: "2026-04-01", end: "2026-06-30" });
    expect(getFinancialQuarter("2026-09-30")).toMatchObject({ quarter: 2, start: "2026-07-01", end: "2026-09-30" });
    expect(getFinancialQuarter("2026-12-01")).toMatchObject({ quarter: 3, months: "Oct–Dec 2026" });
    expect(getFinancialQuarter("2027-02-28")).toMatchObject({ quarter: 4, label: "Q4 FY 2026-27", months: "Jan–Mar 2027", end: "2027-03-31" });
  });
});

describe("bank working days", () => {
  it("closes on Sundays and the 2nd and 4th Saturdays", () => {
    // November 2026: Saturdays are 7, 14, 21, 28.
    expect(getBankHoliday("2026-11-07")).toBeNull();
    expect(getBankHoliday("2026-11-14")).toBe("Second Saturday");
    expect(getBankHoliday("2026-11-21")).toBeNull();
    expect(getBankHoliday("2026-11-28")).toBe("Fourth Saturday");
    expect(getBankHoliday("2026-11-29")).toBe("Sunday");
    expect(isBankWorkingDay("2026-11-25")).toBe(true);
  });

  it("knows the national holidays and accepts your own", () => {
    expect(getBankHoliday("2027-01-26")).toBe("Republic Day");
    expect(getBankHoliday("2026-10-02")).toBe("Gandhi Jayanti");
    const holidays = [{ date: "2026-11-09", name: "Diwali" }, "2026-11-10"];
    expect(getBankHoliday("2026-11-09", { holidays })).toBe("Diwali");
    expect(getBankHoliday("2026-11-10", { holidays })).toBe("Holiday");
  });

  it("adds working days forward and backward", () => {
    // Fri 13 Nov 2026 → Sat 14 is 2nd Saturday, Sun 15 → Mon 16.
    expect(addBankWorkingDays("2026-11-13", 1)).toBe("2026-11-16");
    expect(addBankWorkingDays("2026-11-16", -1)).toBe("2026-11-13");
    expect(addBankWorkingDays("2026-11-20", 1)).toBe("2026-11-21"); // 3rd Saturday is open
    expect(addBankWorkingDays("2026-11-13", 1, { holidays: ["2026-11-16"] })).toBe("2026-11-17");
    expect(() => addBankWorkingDays("2026-11-13", 1.5)).toThrow(TypeError);
  });

  it("finds the next working day and counts working days", () => {
    expect(nextBankWorkingDay("2026-11-14")).toBe("2026-11-16");
    expect(nextBankWorkingDay("2026-11-13")).toBe("2026-11-13");
    expect(countBankWorkingDays("2026-11-13", "2026-11-20")).toBe(5);
    expect(countBankWorkingDays("2026-11-20", "2026-11-13")).toBe(-5);
    expect(countBankWorkingDays("2026-11-13", "2026-11-13")).toBe(0);
  });
});

describe("GST due dates", () => {
  it("monthly filers: GSTR-1 on the 11th, GSTR-3B on the 20th", () => {
    const d = getGSTDueDates("2026-11");
    expect(d.map((x) => [x.form, x.dueDate, x.periodLabel])).toEqual([
      ["GSTR-1", "2026-12-11", "Nov 2026"],
      ["GSTR-3B", "2026-12-20", "Nov 2026"],
    ]);
    expect(d[0]).toMatchObject({ frequency: "monthly", periodStart: "2026-11-01", periodEnd: "2026-11-30" });
  });

  it("rolls December into the next year and accepts dates", () => {
    expect(getGSTDueDates("2026-12-15").map((x) => x.dueDate)).toEqual(["2027-01-11", "2027-01-20"]);
  });

  it("QRMP: IFF and PMT-06 in the first two months of a quarter", () => {
    expect(getGSTDueDates("2026-10", { scheme: "qrmp" }).map((x) => [x.form, x.dueDate])).toEqual([
      ["IFF", "2026-11-13"],
      ["PMT-06", "2026-11-25"],
    ]);
  });

  it("QRMP: quarterly GSTR-3B on the 22nd or 24th by state", () => {
    const mh = getGSTDueDates("2026-12", { scheme: "qrmp", state: "27AAPFU0939F1ZV" });
    expect(mh.map((x) => [x.form, x.dueDate, x.periodLabel])).toEqual([
      ["GSTR-1", "2027-01-13", "Oct–Dec 2026"],
      ["GSTR-3B", "2027-01-22", "Oct–Dec 2026"],
    ]);
    expect(mh[1]).toMatchObject({ frequency: "quarterly", periodStart: "2026-10-01", periodEnd: "2026-12-31" });
    const dl = getGSTDueDates("2026-12", { scheme: "qrmp", state: "Delhi" });
    expect(dl.find((x) => x.form === "GSTR-3B")!.dueDate).toBe("2027-01-24");
    expect(() => getGSTDueDates("2026-12", { scheme: "qrmp" })).toThrow(/state is required/);
    expect(() => getGSTDueDates("2026-12", { scheme: "qrmp", state: "50" })).toThrow(RangeError);
  });

  it("composition: CMP-08 on the 18th after each quarter", () => {
    expect(getGSTDueDates("2027-03", { scheme: "composition" }).map((x) => [x.form, x.dueDate, x.periodLabel])).toEqual([
      ["CMP-08", "2027-04-18", "Jan–Mar 2027"],
    ]);
    expect(getGSTDueDates("2027-02", { scheme: "composition" })).toEqual([]);
  });

  it("rejects a bad period or scheme", () => {
    expect(() => getGSTDueDates("2026-13")).toThrow(RangeError);
    expect(() => getGSTDueDates("2026-11", { scheme: "weekly" as "monthly" })).toThrow(TypeError);
  });

  it("annual returns", () => {
    expect(getGSTAnnualDueDates("FY 2025-26").map((x) => [x.form, x.dueDate, x.periodLabel])).toEqual([
      ["GSTR-9", "2026-12-31", "FY 2025-26"],
      ["GSTR-9C", "2026-12-31", "FY 2025-26"],
    ]);
    expect(getGSTAnnualDueDates(2025, { scheme: "composition" })[0]).toMatchObject({
      form: "GSTR-4",
      dueDate: "2026-04-30",
      periodStart: "2025-04-01",
      periodEnd: "2026-03-31",
    });
    expect(getGSTAnnualDueDates("2025-2026")[0]!.dueDate).toBe("2026-12-31");
    expect(() => getGSTAnnualDueDates("2025-27")).toThrow(RangeError);
    expect(() => getGSTAnnualDueDates("twenty")).toThrow(TypeError);
  });
});

describe("getUpcomingGSTDeadlines", () => {
  it("lists what is due in the window, sorted", () => {
    const up = getUpcomingGSTDeadlines({ from: "2026-11-25", withinDays: 40 });
    expect(up.map((x) => [x.form, x.dueDate, x.periodLabel])).toEqual([
      ["GSTR-1", "2026-12-11", "Nov 2026"],
      ["GSTR-3B", "2026-12-20", "Nov 2026"],
      ["GSTR-9", "2026-12-31", "FY 2025-26"],
      ["GSTR-9C", "2026-12-31", "FY 2025-26"],
    ]);
  });

  it("includes the window's first day and QRMP quarter-end returns", () => {
    const up = getUpcomingGSTDeadlines({ from: "2027-01-13", withinDays: 12, scheme: "qrmp", state: "29" });
    expect(up.map((x) => [x.form, x.dueDate])).toEqual([
      ["GSTR-1", "2027-01-13"],
      ["GSTR-3B", "2027-01-22"],
    ]);
  });

  it("looks far enough ahead for long windows", () => {
    const up = getUpcomingGSTDeadlines({ from: "2026-11-25", withinDays: 120 });
    expect(up[up.length - 1]).toMatchObject({ form: "GSTR-3B", dueDate: "2027-03-20", periodLabel: "Feb 2027" });
  });

  it("validates withinDays", () => {
    expect(() => getUpcomingGSTDeadlines({ withinDays: 0 })).toThrow(RangeError);
  });
});
