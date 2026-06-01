import { useEffect, useState } from "react";
import type { RenewOtpSource } from "../otpSource";
import { isDongvanOtpSource } from "../otpSource";
import {
  parseDongvanLine,
  resolveDongvanOAuthInput,
} from "../utils/dongvanLineParser";

type DongvanOtpFieldsProps = {
  refreshToken: string;
  clientId: string;
  onRefreshTokenChange: (value: string) => void;
  onClientIdChange: (value: string) => void;
  onMailEmailChange?: (value: string | null) => void;
  disabled?: boolean;
  inputClass: string;
};

export function DongvanOtpFields({
  refreshToken,
  clientId,
  onRefreshTokenChange,
  onClientIdChange,
  onMailEmailChange,
  disabled = false,
  inputClass,
}: DongvanOtpFieldsProps) {
  const [pasteLine, setPasteLine] = useState("");
  const [parsedOk, setParsedOk] = useState(false);

  useEffect(() => {
    if (!pasteLine.trim()) {
      setParsedOk(Boolean(refreshToken.trim() && clientId.trim()));
      return;
    }
    const parsed = parseDongvanLine(pasteLine);
    setParsedOk(Boolean(parsed));
  }, [pasteLine, refreshToken, clientId]);

  const applyParsedLine = (line: string) => {
    const parsed = parseDongvanLine(line);
    if (!parsed) {
      onMailEmailChange?.(null);
      return;
    }
    onRefreshTokenChange(parsed.refreshToken);
    onClientIdChange(parsed.clientId);
    onMailEmailChange?.(parsed.mailEmail);
  };

  const handlePasteLineChange = (value: string) => {
    setPasteLine(value);
    applyParsedLine(value);
  };

  return (
    <>
      <div className="space-y-1">
        <label htmlFor="otp-dongvan-paste-line" className="text-xs font-medium text-white/60">
          Dán dòng DongVan <span className="text-rose-400">*</span>
        </label>
        <textarea
          id="otp-dongvan-paste-line"
          className={`${inputClass} min-h-24 resize-y font-mono text-xs leading-5`}
          placeholder="email|password|...|M.C528_...|9e5f94bc-e8a4-4e73-b8be-63364c29d753"
          value={pasteLine}
          onChange={(ev) => handlePasteLineChange(ev.target.value)}
          disabled={disabled}
        />
        <p className="text-xs text-white/45">
          Dán nguyên dòng mail mua từ DongVan — hệ thống tự tách refresh token và client ID.
        </p>
        {parsedOk ? (
          <p className="text-xs text-emerald-300/90">Đã tách OAuth2 thành công.</p>
        ) : pasteLine.trim() ? (
          <p className="text-xs text-amber-300/90">
            Chưa nhận dạng được — cần đủ các phần cách nhau bởi dấu |, kết thúc bằng client ID (UUID).
          </p>
        ) : null}
      </div>

      <details className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium text-white/55">
          Chi tiết OAuth2 (tùy chọn)
        </summary>
        <div className="mt-3 space-y-3">
          <div className="space-y-1">
            <label
              htmlFor="otp-dongvan-refresh-token"
              className="text-xs font-medium text-white/60"
            >
              Refresh token
            </label>
            <textarea
              id="otp-dongvan-refresh-token"
              className={`${inputClass} min-h-16 resize-y font-mono text-xs leading-5`}
              placeholder="M.C528_..."
              value={refreshToken}
              onChange={(ev) => {
                const value = ev.target.value;
                onRefreshTokenChange(value);
                if (value.includes("|")) applyParsedLine(value);
              }}
              disabled={disabled}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="otp-dongvan-client-id" className="text-xs font-medium text-white/60">
              Client ID
            </label>
            <input
              id="otp-dongvan-client-id"
              type="text"
              className={`${inputClass} font-mono text-xs`}
              placeholder="9e5f94bc-e8a4-4e73-b8be-63364c29d753"
              value={clientId}
              onChange={(ev) => onClientIdChange(ev.target.value)}
              disabled={disabled}
            />
          </div>
        </div>
      </details>

      <p className="text-xs text-white/45">
        API:{" "}
        <a
          href="https://docs.dongvanfb.net/utils/get-messages-mail-with-oauth2"
          target="_blank"
          rel="noreferrer"
          className="text-sky-300/90 hover:text-sky-200"
        >
          DongVan get_messages_oauth2
        </a>
      </p>
    </>
  );
}

export type DongvanOtpPayload = {
  otp_refresh_token?: string;
  otp_client_id?: string;
  otp_mail_email?: string;
};

export function buildDongvanOtpPayload(
  otpSource: RenewOtpSource | string,
  refreshToken: string,
  clientId: string,
  mailEmail?: string | null,
): DongvanOtpPayload {
  if (!isDongvanOtpSource(otpSource)) return {};
  const resolved = resolveDongvanOAuthInput(refreshToken, clientId);
  if (!resolved) return {};
  return {
    otp_refresh_token: resolved.refreshToken,
    otp_client_id: resolved.clientId,
    ...(mailEmail?.trim()
      ? { otp_mail_email: mailEmail.trim().toLowerCase() }
      : resolved.mailEmail
        ? { otp_mail_email: resolved.mailEmail }
        : {}),
  };
}

export function validateDongvanOtpFields(
  otpSource: RenewOtpSource | string,
  refreshToken: string,
  clientId: string,
): string | null {
  if (!isDongvanOtpSource(otpSource)) return null;
  if (!resolveDongvanOAuthInput(refreshToken, clientId)) {
    return "Dán dòng DongVan đầy đủ (email|...|token|client_id).";
  }
  return null;
}
