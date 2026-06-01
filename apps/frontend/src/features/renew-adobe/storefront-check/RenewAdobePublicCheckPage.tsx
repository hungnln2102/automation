import { Loader2, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { useStorefrontRenewCheck } from "./hooks/useStorefrontRenewCheck";
import { RenewAdobePublicStatusDisplay } from "./components/RenewAdobePublicStatusDisplay";
import { OtpPanel } from "./components/OtpPanel";
import { SlideOverlay } from "./components/SlideOverlay";
import { PublicEmailField } from "./components/PublicEmailField";
import { RENEW_ADOBE_PUBLIC_CHECK_STYLES } from "./renewAdobePublicCheck.styles";
import { isPublicRenewHost } from "@/lib/publicRenewHost";

/**
 * UI khớp cửa hàng — kiểm tra qua `/api/renew-adobe/public/*`.
 * Trên otp90.com: standalone, không nút vào admin. Trên admin.*: có link “Bàn admin”.
 */
export default function RenewAdobePublicCheckPage() {
  const {
    email,
    setEmail,
    isCheckMode,
    setIsCheckMode,
    loading,
    activating,
    resultType,
    message,
    profileName,
    canActivate,
    outsideOrderStatus,
    successNeedsProductLink,
    urlAccess,
    handleCheckSubmit,
    handleActivate,
    otpSent,
    otpCode,
    sendingOtp,
    otpMessage,
    otpResultType,
    handleSendOtp,
    resetOtp,
  } = useStorefrontRenewCheck();

  const publicSurface = typeof window !== "undefined" ? isPublicRenewHost() : false;

  const outerCls = publicSurface
    ? "min-h-screen bg-slate-950 text-slate-50"
    : "min-h-[min(760px,calc(100vh-10rem))] text-slate-50";

  return (
    <div className={outerCls}>
      <div
        className={`mx-auto flex w-full max-w-4xl flex-col justify-center pb-12 ${
          publicSurface ? "min-h-screen px-4 pt-10" : "pt-2"
        }`}
      >
        <div className="mb-4 px-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-50">
                Renew Adobe
              </h1>
              <p className="mt-0.5 text-xs text-slate-500">
                Kiểm tra, kích hoạt và nhận OTP Adobe profile
              </p>
            </div>
            {!publicSurface ? (
              <Link
                to="/renew-adobe-admin"
                className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-medium text-slate-300 transition hover:bg-white/[0.08]"
              >
                ← Bàn admin
              </Link>
            ) : null}
          </div>
        </div>

        <div className="relative min-h-[540px] overflow-hidden rounded-3xl bg-slate-900 shadow-2xl shadow-purple-900/30 ring-1 ring-white/[0.06]">
          <div className="pointer-events-none absolute -top-20 left-1/2 h-40 w-96 -translate-x-1/2 rounded-full bg-purple-600/15 blur-3xl" />

          <div className="relative grid min-h-[540px] grid-cols-1 lg:grid-cols-2">
            <div
              className={`relative p-6 transition-opacity duration-500 sm:p-8 ${
                isCheckMode
                  ? "cp-panel-left-active opacity-100"
                  : "cp-panel-hidden lg:pointer-events-none lg:opacity-0"
              }`}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-indigo-500/5 to-transparent" />
              <div className="relative flex h-full flex-col justify-center">
                <div className="mb-5">
                  <div className="flex items-center gap-2">
                    <Search
                      className="renew-adobe-search-titles h-5 w-5 shrink-0 text-purple-400"
                      strokeWidth={2}
                    />
                    <h2 className="text-lg font-bold text-slate-50">
                      Kiểm tra &amp; Kích hoạt
                    </h2>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">
                    Kiểm tra trạng thái Adobe profile của bạn
                  </p>
                </div>

                <form onSubmit={handleCheckSubmit} className="space-y-4">
                  <PublicEmailField
                    accent="purple"
                    value={email}
                    onChange={setEmail}
                    disabled={loading || activating}
                  />

                  <RenewAdobePublicStatusDisplay
                    loading={loading}
                    activating={activating}
                    resultType={resultType}
                    message={message}
                    profileName={profileName}
                    email={email}
                    outsideOrderStatus={outsideOrderStatus}
                    successNeedsProductLink={successNeedsProductLink}
                    urlAccess={urlAccess}
                  />

                  {resultType === "expired" && canActivate ? (
                    <button
                      type="button"
                      onClick={handleActivate}
                      disabled={activating}
                      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-sm font-semibold text-white shadow-lg shadow-amber-500/30 transition-all hover:shadow-amber-500/50 disabled:opacity-60"
                    >
                      {activating ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Đang kích hoạt...
                        </>
                      ) : (
                        <>
                          <RefreshCw
                            className="renew-adobe-refresh-nudge h-4 w-4"
                            strokeWidth={2}
                          />
                          Kích hoạt lại ngay
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={loading || activating}
                      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 text-sm font-semibold text-white shadow-lg shadow-purple-500/30 transition-all hover:shadow-purple-500/50 disabled:opacity-60"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Đang kiểm tra...
                        </>
                      ) : activating ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Đang kích hoạt...
                        </>
                      ) : (
                        <>
                          <Search className="renew-adobe-search-btn h-4 w-4" strokeWidth={2} />
                          Kiểm tra Profile
                        </>
                      )}
                    </button>
                  )}
                </form>

                <p className="mt-4 text-center text-xs text-slate-500 lg:hidden">
                  Cần mã OTP?{" "}
                  <button
                    type="button"
                    onClick={() => setIsCheckMode(false)}
                    className="font-semibold text-sky-400 hover:text-sky-300"
                  >
                    Nhận OTP →
                  </button>
                </p>
              </div>
            </div>

            <OtpPanel
              isCheckMode={isCheckMode}
              email={email}
              onEmailChange={setEmail}
              otpSent={otpSent}
              otpCode={otpCode}
              sendingOtp={sendingOtp}
              otpMessage={otpMessage}
              otpResultType={otpResultType}
              onSendOtp={handleSendOtp}
              onResetOtp={resetOtp}
              onSwitchToCheck={() => setIsCheckMode(true)}
            />

            <SlideOverlay
              isCheckMode={isCheckMode}
              onToggle={() => setIsCheckMode(!isCheckMode)}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
          <span>© 2026 Renew Adobe Tool</span>
          <span className="text-slate-700">·</span>
          <span className="flex items-center gap-1">
            <ShieldCheck className="h-3 w-3 text-emerald-600" />
            Bảo mật
          </span>
        </div>
      </div>

      <style>{RENEW_ADOBE_PUBLIC_CHECK_STYLES}</style>
    </div>
  );
}
