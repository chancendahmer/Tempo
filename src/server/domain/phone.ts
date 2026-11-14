import { CountryCode, parsePhoneNumberFromString } from "libphonenumber-js";

const SIGNUP_CALLING_CODES: Readonly<Partial<Record<string, string>>> = {
  US: "+1",
  CA: "+1",
  GB: "+44",
  AU: "+61",
};

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

export function signupCallingCode(countryCode: string): string | undefined {
  return SIGNUP_CALLING_CODES[countryCode.trim().toUpperCase()];
}

export function signupPhoneToE164(input: { countryCode: string; phoneNumber: string }): string {
  const countryCode = input.countryCode.trim().toUpperCase();
  const callingCode = signupCallingCode(countryCode);
  const phoneNumber = input.phoneNumber.trim();
  if (!callingCode || !/^\+?[\d\s().-]+$/.test(phoneNumber)) {
    throw new InvalidPhoneNumberError();
  }

  const parsed = parsePhoneNumberFromString(phoneNumber, {
    defaultCountry: countryCode as CountryCode,
    extract: false,
  });
  const nationalLength = countryCode === "AU" ? 9 : 10;
  if (!parsed?.isPossible() || `+${parsed.countryCallingCode}` !== callingCode
    || parsed.nationalNumber.length !== nationalLength) {
    throw new InvalidPhoneNumberError();
  }
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
