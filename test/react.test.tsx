import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GSTINInput, PhoneInput, useGSTIN, useIFSC, useINR, usePAN, usePincode, useUPILink } from "../src/react";
import { __clearIFSCCache, __clearPincodeCache } from "../src/react/hooks";

afterEach(() => {
  cleanup();
  __clearIFSCCache();
  __clearPincodeCache();
});

describe("useGSTIN", () => {
  it("upper-cases input and exposes details", () => {
    const { result } = renderHook(() => useGSTIN());
    act(() => result.current.setValue("27aapfu0939f1zv"));
    expect(result.current.value).toBe("27AAPFU0939F1ZV");
    expect(result.current.isValid).toBe(true);
    expect(result.current.details?.stateName).toBe("Maharashtra");
  });

  it("hides errors until blur, then shows them", () => {
    const { result } = renderHook(() => useGSTIN());
    act(() => result.current.setValue("27AAPFU"));
    expect(result.current.isValid).toBe(false);
    expect(result.current.error).toBeUndefined();
    act(() => result.current.inputProps.onBlur?.({} as never));
    expect(result.current.error).toBe("GSTIN must be 15 characters.");
    expect(result.current.inputProps["aria-invalid"]).toBe(true);
  });

  it("shows errors while typing with validateOn: change, and on showErrors()", () => {
    const a = renderHook(() => usePAN({ validateOn: "change" }));
    act(() => a.result.current.setValue("ABC"));
    expect(a.result.current.error).toBeDefined();

    const b = renderHook(() => usePAN({ validateOn: "submit" }));
    act(() => b.result.current.inputProps.onBlur?.({} as never));
    expect(b.result.current.error).toBeUndefined();
    let ok = true;
    act(() => {
      ok = b.result.current.showErrors();
    });
    expect(ok).toBe(false);
    expect(b.result.current.error).toBe("PAN is required.");
  });

  it("reset clears value and touched state", () => {
    const { result } = renderHook(() => useGSTIN());
    act(() => result.current.setValue("27"));
    act(() => result.current.inputProps.onBlur?.({} as never));
    act(() => result.current.reset());
    expect(result.current.value).toBe("");
    expect(result.current.touched).toBe(false);
    expect(result.current.error).toBeUndefined();
  });
});

describe("useIFSC", () => {
  const body = { BANK: "State Bank of India", IFSC: "SBIN0000001", BRANCH: "Kolkata Main", STATE: "WEST BENGAL", UPI: true };

  it("looks up the branch once valid and caches it", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
    const { result } = renderHook(() => useIFSC({ lookupOptions: { fetch } }));
    expect(result.current.lookupStatus).toBe("idle");

    act(() => result.current.setValue("sbin0000001"));
    expect(result.current.lookupStatus).toBe("loading");
    await waitFor(() => expect(result.current.lookupStatus).toBe("success"));
    expect(result.current.branch?.bank).toBe("State Bank of India");

    act(() => result.current.setValue("SBIN000000"));
    expect(result.current.lookupStatus).toBe("idle");
    act(() => result.current.setValue("SBIN0000001"));
    expect(result.current.lookupStatus).toBe("success"); // from cache
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("reports NOT_FOUND", async () => {
    const fetch = vi.fn(async () => new Response('"Not Found"', { status: 404 }));
    const { result } = renderHook(() => useIFSC({ lookupOptions: { fetch }, defaultValue: "HDFC0999999" }));
    await waitFor(() => expect(result.current.lookupStatus).toBe("error"));
    expect(result.current.lookupErrorCode).toBe("NOT_FOUND");
  });

  it("skips the network when lookup is false", () => {
    const fetch = vi.fn();
    const { result } = renderHook(() => useIFSC({ lookup: false, lookupOptions: { fetch }, defaultValue: "HDFC0000240" }));
    expect(result.current.isValid).toBe(true);
    expect(result.current.lookupStatus).toBe("idle");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("useUPILink / useINR", () => {
  it("builds a link or returns an error", () => {
    const ok = renderHook(() => useUPILink({ payeeAddress: "shop@ybl", payeeName: "Shop", amount: 100 }));
    expect(ok.result.current.link).toBe("upi://pay?pa=shop@ybl&pn=Shop&am=100.00&cu=INR");
    const bad = renderHook(() => useUPILink({ payeeAddress: "nope" }));
    expect(bad.result.current.link).toBeUndefined();
    expect(bad.result.current.error).toMatch(/UPI ID/);
  });

  it("formats INR three ways", () => {
    const { result } = renderHook(() => useINR(250000));
    expect(result.current).toEqual({
      formatted: "₹2,50,000.00",
      compact: "₹2.5 L",
      words: "Rupees Two Lakh Fifty Thousand Only",
    });
    expect(renderHook(() => useINR("")).result.current.formatted).toBe("");
  });
});

describe("Input components", () => {
  it("GSTINInput (uncontrolled) reports changes and sets data attributes", () => {
    const onValueChange = vi.fn();
    render(<GSTINInput aria-label="gstin" onValueChange={onValueChange} />);
    const input = screen.getByLabelText("gstin") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "27aapfu0939f1zv" } });
    expect(input.value).toBe("27AAPFU0939F1ZV");
    expect(input).toHaveProperty("maxLength", 15);
    expect(input.hasAttribute("data-valid")).toBe(true);
    expect(onValueChange).toHaveBeenLastCalledWith("27AAPFU0939F1ZV", expect.objectContaining({ valid: true }));

    fireEvent.change(input, { target: { value: "27AAP" } });
    fireEvent.blur(input);
    expect(input.hasAttribute("data-invalid")).toBe(true);
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  it("PhoneInput works controlled", () => {
    function Form() {
      const [phone, setPhone] = useState("");
      const [e164, setE164] = useState("");
      return (
        <>
          <PhoneInput
            aria-label="phone"
            value={phone}
            onValueChange={(v, r) => {
              setPhone(v);
              setE164(r.valid ? r.value : "");
            }}
          />
          <output data-testid="out">{e164}</output>
        </>
      );
    }
    render(<Form />);
    const input = screen.getByLabelText("phone") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "98765 43210x" } });
    expect(input.value).toBe("98765 43210");
    expect(screen.getByTestId("out").textContent).toBe("+919876543210");
  });
});

describe("usePincode lookup", () => {
  const body = [{ Status: "Success", PostOffice: [{ Name: "Connaught Place", District: "New Delhi", State: "Delhi", Circle: "Delhi", BranchType: "Sub Post Office", DeliveryStatus: "Non-Delivery" }] }];

  it("makes no network calls by default", () => {
    const fetch = vi.fn();
    const { result } = renderHook(() => usePincode({ defaultValue: "110001", lookupOptions: { fetch } }));
    expect(result.current.isValid).toBe(true);
    expect(result.current.lookupStatus).toBe("idle");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("looks up and caches the location when lookup is on", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
    const { result } = renderHook(() => usePincode({ lookup: true, lookupOptions: { fetch } }));
    act(() => result.current.setValue("110001"));
    expect(result.current.lookupStatus).toBe("loading");
    await waitFor(() => expect(result.current.lookupStatus).toBe("success"));
    expect(result.current.location).toMatchObject({ district: "New Delhi", state: "Delhi" });

    act(() => result.current.setValue("11000"));
    expect(result.current.lookupStatus).toBe("idle");
    act(() => result.current.setValue("110001"));
    expect(result.current.lookupStatus).toBe("success");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("reports NOT_FOUND", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify([{ Status: "Error", PostOffice: null }]), { status: 200 }));
    const { result } = renderHook(() => usePincode({ lookup: true, lookupOptions: { fetch }, defaultValue: "999999" }));
    await waitFor(() => expect(result.current.lookupStatus).toBe("error"));
    expect(result.current.lookupErrorCode).toBe("NOT_FOUND");
  });
});
