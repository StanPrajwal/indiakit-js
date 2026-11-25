import { useCallback, useMemo, useState, type ChangeEvent, type InputHTMLAttributes } from "react";
import type { ValidationResult } from "../types";

export interface UseValidatedFieldOptions {
  /** Initial value (uncontrolled). */
  defaultValue?: string;
  /** Controlled value. When set, pair it with `onChange`. */
  value?: string;
  /** Called with the raw (display) value on every change. */
  onChange?: (value: string) => void;
  /**
   * When `error` becomes visible. `"blur"` (default) waits until the user leaves the field,
   * `"change"` shows errors while typing, `"submit"` only after `showErrors()`.
   */
  validateOn?: "blur" | "change" | "submit";
}

export interface FieldConfig {
  /** Display transform applied while typing (e.g. upper-case). */
  transform?: (raw: string) => string;
  maxLength?: number;
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
  autoCapitalize?: string;
}

export type FieldInputProps = Pick<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "onBlur" | "maxLength" | "inputMode" | "autoComplete" | "autoCapitalize" | "spellCheck" | "aria-invalid"
>;

export interface ValidatedField<TDetails> {
  /** Current display value. */
  value: string;
  setValue: (value: string) => void;
  /** Full validation result for the current value (always computed). */
  result: ValidationResult<TDetails>;
  isValid: boolean;
  /** Details for a valid value, otherwise `undefined`. */
  details: TDetails | undefined;
  /** Error message — only set once the error should be shown (see `validateOn`), and never for an empty untouched field. */
  error: string | undefined;
  touched: boolean;
  /** Force errors to be visible (e.g. on form submit). Returns whether the value is valid. */
  showErrors: () => boolean;
  reset: (value?: string) => void;
  /** Spread onto an `<input>`. */
  inputProps: FieldInputProps;
}

/**
 * Generic headless hook that wires any bharatkit validator to an input.
 * The specific hooks (`useGSTIN`, `usePAN`, …) are thin wrappers around this.
 */
export function useValidatedField<TDetails>(
  validate: (value: string) => ValidationResult<TDetails>,
  options: UseValidatedFieldOptions = {},
  config: FieldConfig = {},
): ValidatedField<TDetails> {
  const { defaultValue = "", value: controlled, onChange, validateOn = "blur" } = options;
  const [inner, setInner] = useState(defaultValue);
  const [touched, setTouched] = useState(false);
  const [forced, setForced] = useState(false);
  const isControlled = controlled !== undefined;
  const value = isControlled ? controlled : inner;
  const { transform } = config;

  const setValue = useCallback(
    (next: string) => {
      const v = transform ? transform(next) : next;
      if (!isControlled) setInner(v);
      onChange?.(v);
    },
    [isControlled, onChange, transform],
  );

  const result = useMemo(() => validate(value), [validate, value]);

  const visible =
    forced || (validateOn === "change" && value !== "") || (validateOn === "blur" && touched);
  const error = !result.valid && visible ? result.message : undefined;

  const showErrors = useCallback(() => {
    setForced(true);
    setTouched(true);
    return result.valid;
  }, [result.valid]);

  const reset = useCallback(
    (next = defaultValue) => {
      if (!isControlled) setInner(next);
      else onChange?.(next);
      setTouched(false);
      setForced(false);
    },
    [defaultValue, isControlled, onChange],
  );

  const inputProps: FieldInputProps = {
    value,
    onChange: (e: ChangeEvent<HTMLInputElement>) => setValue(e.target.value),
    onBlur: () => setTouched(true),
    maxLength: config.maxLength,
    inputMode: config.inputMode,
    autoComplete: config.autoComplete ?? "off",
    autoCapitalize: config.autoCapitalize,
    spellCheck: false,
    "aria-invalid": error ? true : undefined,
  };

  return {
    value,
    setValue,
    result,
    isValid: result.valid,
    details: result.valid ? result.details : undefined,
    error,
    touched,
    showErrors,
    reset,
    inputProps,
  };
}

/** @internal Upper-case and strip characters that can never appear in the code. */
export const upperAlnum = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
