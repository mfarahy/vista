import type { StructuredAddress } from "./expose-data.js";

export function addressFromLegacy(address: string | null | undefined, postalCode: string | null | undefined, city: string | null | undefined, district: string | null | undefined): StructuredAddress {
  const value = address?.trim() || "";
  const match = value.match(/^(.*?)[, ]+([0-9]+[a-zA-Z]?[-/]?[0-9a-zA-Z]*)$/);
  return {
    street: match?.[1]?.trim() || value || null,
    houseNumber: match?.[2]?.trim() || null,
    postalCode: postalCode?.trim() || null,
    city: city?.trim() || null,
    district: district?.trim() || null,
    country: "Deutschland",
  };
}

export function addressKey(address: StructuredAddress) {
  return [address.street, address.houseNumber, address.postalCode, address.city, address.country].map((part) => part?.toLocaleLowerCase("de-DE") || "").join("|");
}
