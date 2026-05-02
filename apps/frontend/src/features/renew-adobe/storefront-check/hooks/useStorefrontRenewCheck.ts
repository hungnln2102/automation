import { useState, type FormEvent } from "react";
import {
  activateStorefrontRenewProfile,
  fetchStorefrontRenewStatus,
} from "../api/storefrontRenewApi";
import type {
  RenewCheckResultKind,
  StorefrontRenewStatusCode,
  StorefrontRenewStatusPayload,
} from "../types/storefrontRenew.types";

export function useStorefrontRenewCheck() {
  const [email, setEmail] = useState("");

  const [loading, setLoading] = useState(false);
  const [activating, setActivating] = useState(false);
  const [resultType, setResultType] = useState<RenewCheckResultKind>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [canActivate, setCanActivate] = useState(false);
  const [outsideOrderStatus, setOutsideOrderStatus] = useState<
    Extract<StorefrontRenewStatusCode, "no_order" | "order_expired"> | null
  >(null);
  const [successNeedsProductLink, setSuccessNeedsProductLink] = useState(false);
  const [urlAccess, setUrlAccess] = useState<string | null>(null);

  const resetResult = (options?: { preserveProfileName?: boolean }) => {
    setResultType(null);
    setMessage(null);
    setCanActivate(false);
    setOutsideOrderStatus(null);
    setSuccessNeedsProductLink(false);
    setUrlAccess(null);
    if (!options?.preserveProfileName) {
      setProfileName(null);
    }
  };

  const applyStatusResult = (data: StorefrontRenewStatusPayload) => {
    setProfileName(data.profileName);
    setCanActivate(data.canActivate);

    if (data.status === "active") {
      setResultType("check-success");
      setOutsideOrderStatus(null);
      setMessage(data.message);
      const acc = data.account;
      const pending = Boolean(acc && acc.userHasProduct !== true);
      setSuccessNeedsProductLink(pending);
      const rawUrl = acc?.urlAccess != null ? String(acc.urlAccess).trim() : "";
      setUrlAccess(rawUrl || null);
      return;
    }

    if (data.status === "no_order" || data.status === "order_expired") {
      setResultType("outside-order");
      setOutsideOrderStatus(data.status);
      setSuccessNeedsProductLink(false);
      setUrlAccess(null);
      setMessage(null);
      return;
    }

    setOutsideOrderStatus(null);
    setSuccessNeedsProductLink(false);
    setUrlAccess(null);
    setResultType("expired");
    setMessage(data.message);
  };

  const handleCheckSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setMessage("Vui lòng nhập email để kiểm tra.");
      setResultType("info");
      return;
    }

    setLoading(true);
    resetResult();

    try {
      const data = await fetchStorefrontRenewStatus(email.trim());
      applyStatusResult(data);
    } catch (err) {
      console.error("[renew-public-check] Lookup error:", err);
      setResultType("error");
      setMessage(
        err instanceof Error
          ? err.message
          : "Có lỗi kết nối tới máy chủ. Vui lòng thử lại sau.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async () => {
    if (!email.trim() || activating) return;

    setActivating(true);
    resetResult({ preserveProfileName: true });

    try {
      const data = await activateStorefrontRenewProfile(email.trim());
      setProfileName(data.profileName);
      setCanActivate(false);
      setResultType("activate-success");
      setMessage(
        data.message || `Profile đã được kích hoạt thành công cho ${email.trim()}.`,
      );
    } catch (err) {
      console.error("[renew-public-check] Activate error:", err);
      setResultType("error");
      setMessage(
        err instanceof Error
          ? err.message
          : "Có lỗi kết nối tới dịch vụ kích hoạt. Vui lòng thử lại sau.",
      );
    } finally {
      setActivating(false);
    }
  };

  return {
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
  };
}
