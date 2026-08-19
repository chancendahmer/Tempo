import { CountryCode, parsePhoneNumberFromString } from "libphonenumber-js";

export class InvalidPhoneNumberError extends Error {
  constructor() {
    super("Enter a valid mobile phone number.");
    this.name = "InvalidPhoneNumberError";
  }
}

export function normalizeE164(input: string, defaultCountry?: CountryCode): string {
  const parsed = parsePhoneNumberFromString(input, defaultCountry);
  if (!parsed?.isPossible()) throw new InvalidPhoneNumberError();
  return parsed.number;
}

export function phonePartsToE164(input: {
  countryCode: string;
  callingCode: string;
  areaCode: string;
  subscriberNumber: string;
}): string {
  const digits = `${input.callingCode}${input.areaCode}${input.subscriberNumber}`.replace(/\D/g, "");
  return normalizeE164(`+${digits}`, input.countryCode.toUpperCase() as CountryCode);
}
