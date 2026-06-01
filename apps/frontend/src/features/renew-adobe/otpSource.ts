export type RenewOtpSource = "imap" | "tinyhost" | "hdsd" | "dongvan";

export const WEB_OTP_SOURCE_OPTIONS: { value: Exclude<RenewOtpSource, "imap">; label: string }[] = [
  { value: "hdsd", label: "otp.hdsd.net API" },
  { value: "tinyhost", label: "TinyHost API" },
  { value: "dongvan", label: "DongVan OAuth2 API" },
];

export function otpSourceLabel(source?: RenewOtpSource | string | null): string {
  if (source === "tinyhost") return "TinyHost";
  if (source === "hdsd") return "otp.hdsd.net";
  if (source === "dongvan") return "DongVan OAuth2";
  if (source === "imap") return "IMAP";
  return source ? String(source) : "—";
}

export function isDongvanOtpSource(source?: string | null): boolean {
  return String(source || "").trim().toLowerCase() === "dongvan";
}
