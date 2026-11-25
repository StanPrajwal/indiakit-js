export type { ValidationResult, ValidationErrorCode } from "./types";

export { validateGSTIN, isValidGSTIN, computeGSTINChecksum, isIntraStateSupply, type GSTINDetails } from "./gstin";
export { validatePAN, isValidPAN, maskPAN, PAN_HOLDER_TYPES, type PANDetails } from "./pan";
export {
  validateIFSC,
  isValidIFSC,
  lookupIFSC,
  IFSCLookupError,
  DEFAULT_IFSC_API,
  type IFSCDetails,
  type IFSCBranch,
  type LookupIFSCOptions,
} from "./ifsc";
export {
  validateUPIId,
  isValidUPIId,
  buildUPILink,
  parseUPILink,
  type UPIIdDetails,
  type UPIPaymentParams,
  type BuildUPILinkOptions,
} from "./upi";
export { validatePincode, isValidPincode, PINCODE_ZONES, type PincodeDetails } from "./pincode";
export { validateIndianMobile, isValidIndianMobile, formatIndianMobile, type PhoneDetails } from "./phone";
export {
  formatINR,
  formatINRCompact,
  parseINR,
  groupIndian,
  amountInWords,
  numberToIndianWords,
  type FormatINROptions,
  type FormatINRCompactOptions,
  type AmountInWordsOptions,
} from "./inr";
export { GST_STATE_CODES, getStateByGSTCode } from "./states";
