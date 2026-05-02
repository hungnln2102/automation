import { Loader2, RefreshCw, Search, ShieldCheck, User } from "lucide-react";
import { Link } from "react-router-dom";
import { useStorefrontRenewCheck } from "./hooks/useStorefrontRenewCheck";
import { RenewAdobePublicStatusDisplay } from "./components/RenewAdobePublicStatusDisplay";
import { RENEW_ADOBE_PUBLIC_CHECK_STYLES } from "./renewAdobePublicCheck.styles";

/**
 * UI khớp cửa hàng (`Website/my-store/.../CheckProfile/RenewAdobePage.tsx`) — kiểm tra qua `/api/renew-adobe/public/*`.
 */
export default function RenewAdobePublicCheckPage() {
  const {
    email,
    setEmail,
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
  } = useStorefrontRenewCheck();

  return (
    <div className="min-h-[min(760px,calc(100vh-10rem))] text-slate-50">
      <div className="mx-auto flex w-full max-w-xl flex-col justify-center pb-12 pt-2">
        <div className="mb-4 px-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-50">
                Renew Adobe
              </h1>
              <p className="mt-0.5 text-xs text-slate-500">
                Kiểm tra và kích hoạt lại Adobe profile
              </p>
            </div>
            <Link
              to="/renew-adobe-admin"
              className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-medium text-slate-300 transition hover:bg-white/[0.08]"
            >
              ← Bàn admin
            </Link>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-3xl bg-slate-900 shadow-2xl shadow-purple-900/30 ring-1 ring-white/[0.06]">
          <div className="pointer-events-none absolute -top-20 left-1/2 h-40 w-96 -translate-x-1/2 rounded-full bg-purple-600/15 blur-3xl" />
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-indigo-500/5 to-transparent" />

          <div className="relative p-8 sm:p-10">
            <div className="mb-6">
              <div className="flex items-center gap-2">
                <Search
                  className="renew-adobe-search-titles h-5 w-5 shrink-0 text-purple-400"
                  strokeWidth={2}
                />
                <h2 className="text-xl font-bold text-slate-50">Kiểm tra &amp; Kích hoạt</h2>
              </div>
              <p className="mt-1 text-sm text-slate-400">
                Kiểm tra trạng thái Adobe profile của bạn
              </p>
            </div>

            <form onSubmit={handleCheckSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Email Adobe
                </label>
                <div className="relative">
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your-email@mkvest.com"
                    className="h-11 w-full rounded-xl border border-slate-700 bg-slate-800/70 py-3 pl-3 pr-10 text-sm text-slate-100 placeholder-slate-500 outline-none ring-1 ring-transparent transition-all focus:border-purple-500 focus:ring-purple-500/40"
                  />
                  <User
                    className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                    aria-hidden
                  />
                </div>
              </div>

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
                      <RefreshCw className="renew-adobe-refresh-nudge h-4 w-4" strokeWidth={2} />
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
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
          <span>© 2026 Renew Adobe Tool by Mavryk Premium Store</span>
          <span className="text-slate-700">·</span>
          <span className="flex items-center gap-1">
            <ShieldCheck className="h-3 w-3 text-emerald-600" />
            Bảo mật bởi Mavryk Premium Store
          </span>
        </div>
      </div>

      <style>{RENEW_ADOBE_PUBLIC_CHECK_STYLES}</style>
    </div>
  );
}
