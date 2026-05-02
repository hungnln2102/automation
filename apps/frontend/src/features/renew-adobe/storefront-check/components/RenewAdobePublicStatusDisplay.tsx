import {
  AlertTriangle,
  ExternalLink,
  Loader2,
  PackageX,
  XCircle,
} from "lucide-react";
import { AnimatedCheckmark } from "./AnimatedCheckmark";
import type {
  RenewCheckResultKind,
  StorefrontRenewStatusCode,
} from "../types/storefrontRenew.types";

type Props = {
  loading: boolean;
  activating: boolean;
  resultType: RenewCheckResultKind;
  message: string | null;
  profileName: string | null;
  email: string;
  outsideOrderStatus: Extract<
    StorefrontRenewStatusCode,
    "no_order" | "order_expired"
  > | null;
  successNeedsProductLink: boolean;
  urlAccess: string | null;
};

function ActivatingSpinner({
  email,
  profileName,
}: {
  email: string;
  profileName: string | null;
}) {
  return (
    <div className="rounded-2xl border border-sky-500/30 bg-sky-950/60 px-5 py-5 text-center">
      <Loader2 className="mx-auto mb-3 h-10 w-10 animate-spin text-sky-400" />
      <p className="text-base font-semibold text-sky-200">
        Đang chuyển profile...
      </p>
      <div className="mt-3 space-y-1 text-xs text-slate-400">
        <p>
          Email:{" "}
          <span className="font-medium text-slate-200">{email.trim()}</span>
        </p>
        {profileName && (
          <p>
            Profile:{" "}
            <span className="font-medium text-slate-200">{profileName}</span>
          </p>
        )}
      </div>
      <p className="mt-3 text-xs italic text-slate-500">
        Đang mở trình duyệt và đăng nhập...
      </p>
    </div>
  );
}

function CheckSuccessCard({
  profileName,
  successNeedsProductLink,
  message,
  urlAccess,
}: {
  profileName: string | null;
  successNeedsProductLink: boolean;
  message: string | null;
  urlAccess: string | null;
}) {
  return (
    <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-5 text-center text-sm text-emerald-50">
      <div className="mb-3 flex flex-col items-center gap-3">
        <AnimatedCheckmark />
        <span className="text-base font-bold text-emerald-300">
          {successNeedsProductLink
            ? "Kích hoạt thành công — hoàn tất nhận gói"
            : "Profile đang hoạt động bình thường!"}
        </span>
      </div>
      {profileName && (
        <p className="text-lg font-bold text-emerald-200 tracking-wide">
          {profileName}
        </p>
      )}
      {profileName && !successNeedsProductLink && (
        <p className="mt-2 text-xs font-medium text-emerald-100/90">
          Login lại và chọn đúng Profile
        </p>
      )}
      {successNeedsProductLink && message && (
        <p className="mt-3 max-w-md text-xs leading-relaxed text-emerald-100/85">
          {message}
        </p>
      )}
      {successNeedsProductLink && urlAccess && (
        <a
          href={urlAccess}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-sky-500/35 transition hover:bg-sky-600"
        >
          <ExternalLink className="h-4 w-4 shrink-0" strokeWidth={2} />
          Mở liên kết nhận gói Adobe
        </a>
      )}
      {successNeedsProductLink && !urlAccess && (
        <p className="mt-3 text-xs text-amber-200/90">
          Chưa có liên kết trên hệ thống. Cập nhật{" "}
          <span className="font-medium">url_access</span> cho tài khoản trong
          Renew Adobe admin.
        </p>
      )}
    </div>
  );
}

function OutsideOrderCard({
  outsideOrderStatus,
}: {
  outsideOrderStatus: Extract<
    StorefrontRenewStatusCode,
    "no_order" | "order_expired"
  > | null;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-rose-500/45 bg-rose-500/10 px-4 py-5 text-center text-sm text-rose-50 shadow-lg shadow-rose-500/25 ring-1 ring-rose-400/20"
      role="alert"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(244,63,94,0.14),transparent_55%)]"
        aria-hidden
      />
      <div className="relative flex flex-col items-center gap-3">
        <div className="renew-adobe-status-glow-rose flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/30 ring-1 ring-rose-400/50 shadow-[0_0_24px_-4px_rgba(244,63,94,0.5)]">
          <span className="renew-adobe-status-icon-bounce inline-flex">
            <PackageX className="h-7 w-7 text-rose-200" strokeWidth={2} />
          </span>
        </div>
        <p className="text-base font-bold text-rose-100">Không có gói</p>
        <p className="text-sm font-semibold text-rose-300">
          {outsideOrderStatus === "order_expired"
            ? "Đơn hàng hết hạn"
            : "Không có đơn Renew Adobe còn hiệu lực"}
        </p>
        <p className="max-w-md border-t border-rose-500/30 pt-3 text-xs leading-relaxed text-rose-100/90">
          Vui lòng liên hệ admin để có thể kích hoạt lại gói
        </p>
      </div>
    </div>
  );
}

function ExpiredCard({
  profileName,
  message,
}: {
  profileName: string | null;
  message: string | null;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-5 text-center text-sm text-amber-50 shadow-lg shadow-amber-500/20 ring-1 ring-amber-400/15"
      role="alert"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(251,191,36,0.12),transparent_55%)]"
        aria-hidden
      />
      <div className="relative flex flex-col items-center gap-3">
        <div className="renew-adobe-status-glow-amber flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/25 ring-1 ring-amber-400/50 shadow-[0_0_24px_-4px_rgba(251,191,36,0.45)]">
          <span className="renew-adobe-status-icon-bounce inline-flex">
            <AlertTriangle
              className="h-7 w-7 text-amber-300"
              strokeWidth={2}
            />
          </span>
        </div>
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-400">
          Cần kích hoạt lại
        </p>
        <span className="text-base font-bold text-amber-200">
          Profile hết hạn
        </span>
        {profileName && (
          <p className="text-lg font-bold tracking-wide text-amber-100">
            {profileName}
          </p>
        )}
        <p className="max-w-md border-t border-amber-500/25 pt-3 text-xs leading-relaxed text-amber-100/90">
          {message}
        </p>
      </div>
    </div>
  );
}

function ActivateSuccessCard({ profileName }: { profileName: string | null }) {
  return (
    <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-5 text-center text-sm text-emerald-50">
      <div className="mb-3 flex flex-col items-center gap-3">
        <AnimatedCheckmark />
        <span className="text-base font-bold text-emerald-300">
          Chuyển profile thành công!
        </span>
      </div>
      {profileName && (
        <p className="text-lg font-bold text-emerald-200 tracking-wide">
          {profileName}
        </p>
      )}
      <p className="mt-4 text-xs leading-relaxed text-emerald-100/85">
        Đăng nhập lại Adobe Team và chọn đúng profile.
      </p>
    </div>
  );
}

function ErrorCard({ message }: { message: string | null }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-6 text-center text-sm text-rose-50">
      <XCircle
        className="renew-adobe-error-icon mb-2 h-8 w-8 text-rose-400"
        strokeWidth={2}
      />
      <p className="text-sm font-medium text-rose-100">{message}</p>
    </div>
  );
}

function InfoCard({ message }: { message: string | null }) {
  return (
    <div className="rounded-xl bg-slate-800/70 px-4 py-3 text-xs text-slate-300 ring-1 ring-slate-700">
      {message}
    </div>
  );
}

export function RenewAdobePublicStatusDisplay(props: Props) {
  const {
    loading,
    activating,
    resultType,
    message,
    profileName,
    email,
    outsideOrderStatus,
    successNeedsProductLink,
    urlAccess,
  } = props;

  if (activating) {
    return <ActivatingSpinner email={email} profileName={profileName} />;
  }

  if (loading || !resultType || (resultType !== "outside-order" && !message)) {
    return null;
  }

  return (
    <div>
      {resultType === "check-success" && (
        <CheckSuccessCard
          profileName={profileName}
          successNeedsProductLink={successNeedsProductLink}
          message={message}
          urlAccess={urlAccess}
        />
      )}
      {resultType === "outside-order" && (
        <OutsideOrderCard outsideOrderStatus={outsideOrderStatus} />
      )}
      {resultType === "expired" && (
        <ExpiredCard profileName={profileName} message={message} />
      )}
      {resultType === "activate-success" && (
        <ActivateSuccessCard profileName={profileName} />
      )}
      {resultType === "error" && <ErrorCard message={message} />}
      {resultType === "info" && <InfoCard message={message} />}
    </div>
  );
}
