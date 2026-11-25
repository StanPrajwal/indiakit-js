import { forwardRef, useCallback, useRef, type InputHTMLAttributes } from "react";
import type { ValidationResult } from "../types";
import { validateGSTIN, type GSTINDetails } from "../gstin";
import { validatePAN, type PANDetails } from "../pan";
import { validateIFSC, type IFSCDetails } from "../ifsc";
import { validatePincode, type PincodeDetails } from "../pincode";
import { validateIndianMobile, type PhoneDetails } from "../phone";
import { validateUPIId, type UPIIdDetails } from "../upi";
import { useGSTIN, useIFSC, usePAN, usePhone, usePincode, useUPIId } from "./hooks";
import type { UseValidatedFieldOptions, ValidatedField } from "./useValidatedField";

type NativeProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange">;

export interface IndiaInputProps<TDetails> extends NativeProps {
  /** Controlled value. Update it from `onValueChange`. */
  value?: string;
  defaultValue?: string;
  /** Called on every change with the (normalized-for-display) value and its validation result. */
  onValueChange?: (value: string, result: ValidationResult<TDetails>) => void;
  /** When errors become visible (sets `aria-invalid` / `data-invalid`). Default `"blur"`. */
  validateOn?: UseValidatedFieldOptions["validateOn"];
}

/**
 * Creates an unstyled `<input>` bound to one of the hooks. The input gets
 * `data-valid` / `data-invalid` / `aria-invalid` attributes so you can style it
 * with plain CSS or Tailwind (`data-[invalid]:border-red-500`).
 */
function createInput<TDetails>(
  displayName: string,
  useField: (opts: UseValidatedFieldOptions) => ValidatedField<TDetails>,
  validate: (value: string) => ValidationResult<TDetails>,
) {
  const Component = forwardRef<HTMLInputElement, IndiaInputProps<TDetails>>(function IndiaInput(
    { value, defaultValue, onValueChange, validateOn, onBlur, ...rest },
    ref,
  ) {
    const cb = useRef(onValueChange);
    cb.current = onValueChange;
    const onChange = useCallback((v: string) => cb.current?.(v, validate(v)), []);
    const field = useField({ value, defaultValue, validateOn, onChange });
    const { onBlur: fieldBlur, ...inputProps } = field.inputProps;

    return (
      <input
        ref={ref}
        type="text"
        {...inputProps}
        {...rest}
        onBlur={(e) => {
          fieldBlur?.(e);
          onBlur?.(e);
        }}
        data-valid={field.isValid ? "" : undefined}
        data-invalid={field.error ? "" : undefined}
      />
    );
  });
  Component.displayName = displayName;
  return Component;
}

export const GSTINInput = createInput<GSTINDetails>("GSTINInput", useGSTIN, validateGSTIN);
export const PANInput = createInput<PANDetails>("PANInput", usePAN, validatePAN);
export const IFSCInput = createInput<IFSCDetails>("IFSCInput", (o) => useIFSC({ ...o, lookup: false }), validateIFSC);
export const PincodeInput = createInput<PincodeDetails>("PincodeInput", usePincode, validatePincode);
export const PhoneInput = createInput<PhoneDetails>("PhoneInput", usePhone, validateIndianMobile);
export const UPIIdInput = createInput<UPIIdDetails>("UPIIdInput", useUPIId, validateUPIId);
