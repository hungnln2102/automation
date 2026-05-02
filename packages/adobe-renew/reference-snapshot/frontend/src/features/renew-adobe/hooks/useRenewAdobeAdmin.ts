import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_ENDPOINTS } from "@/constants";
import { apiFetch } from "@/lib/api";
import {
  deleteAdobeAdminAccount,
  fetchAdobeAdminAccounts,
  runSchedulerRenewAdobeCheck,
} from "../api/renewAdobeApi";
import type { AdobeAdminAccount } from "../types";
import { normalizeIncomingLicenseStatus } from "../utils/accountUtils";

type CheckAllProgress = {
  total: number;
  completed: number;
  failed: number;
  checkingIds: Set<number>;
};

export function useRenewAdobeAdmin() {
  const [accounts, setAccounts] = useState<AdobeAdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkingId, setCheckingId] = useState<number | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [fixingId, setFixingId] = useState<string | null>(null);
  /** Fix lần lượt nhiều user (Fix all); `current` = thứ tự đang chạy (1-based). */
  const [fixAllProgress, setFixAllProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [deletingAdminAccountId, setDeletingAdminAccountId] = useState<number | null>(null);
  const [adminAccountPendingDelete, setAdminAccountPendingDelete] =
    useState<AdobeAdminAccount | null>(null);
  const [checkAllProgress, setCheckAllProgress] =
    useState<CheckAllProgress | null>(null);
  const [autoAssignPhase, setAutoAssignPhase] = useState<
    "idle" | "running" | "done"
  >("idle");
  const [autoAssignResult, setAutoAssignResult] = useState<{
    assigned: number;
    skipped: number;
  } | null>(null);
  const checkAllAbortRef = useRef<AbortController | null>(null);
  const fixAllInFlightRef = useRef(false);
  const [cronTestLoading, setCronTestLoading] = useState(false);
  const [cronTestBanner, setCronTestBanner] = useState<string | null>(null);

  const isCheckingAll =
    checkAllProgress !== null &&
    checkAllProgress.completed < checkAllProgress.total;

  const loadAccounts = useMemo(
    () => () => {
      setLoading(true);
      setError(null);
      fetchAdobeAdminAccounts()
        .then(setAccounts)
        .catch((err) =>
          setError(err?.message ?? "Không thể tải danh sách tài khoản.")
        )
        .finally(() => setLoading(false));
    },
    []
  );

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const dismissCheckAllProgress = useCallback(() => {
    setCheckAllProgress(null);
    setAutoAssignPhase("idle");
    setAutoAssignResult(null);
  }, []);

  const handleCheckAll = useCallback(() => {
    if (isCheckingAll) {
      return;
    }

    setCheckError(null);
    setCronTestBanner(null);

    const abort = new AbortController();
    checkAllAbortRef.current = abort;

    setCheckAllProgress({
      total: 0,
      completed: 0,
      failed: 0,
      checkingIds: new Set(),
    });

    const url = API_ENDPOINTS.RENEW_ADOBE_CHECK_ALL;
    apiFetch(url, { signal: abort.signal })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(res.statusText || "Check All thất bại");
        }

        const reader = res.body?.getReader();
        if (!reader) {
          throw new Error("Không hỗ trợ streaming");
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) {
              continue;
            }

            try {
              const event = JSON.parse(line.slice(6));
              handleSSEEvent(event);
            } catch {}
          }
        }

        if (buffer.startsWith("data: ")) {
          try {
            handleSSEEvent(JSON.parse(buffer.slice(6)));
          } catch {}
        }
      })
      .catch((err) => {
        if (err.name === "AbortError") {
          return;
        }

        setCheckError(err?.message ?? "Lỗi khi chạy Check All.");
      })
      .finally(() => {
        checkAllAbortRef.current = null;
        setCheckAllProgress((prev) =>
          prev ? { ...prev, checkingIds: new Set() } : null
        );
      });

    function handleSSEEvent(event: Record<string, unknown>) {
      switch (event.type) {
        case "start":
          setCheckAllProgress({
            total: event.total as number,
            completed: 0,
            failed: 0,
            checkingIds: new Set(),
          });
          setAutoAssignPhase("idle");
          setAutoAssignResult(null);
          break;
        case "checking":
          setCheckAllProgress((prev) => {
            if (!prev) {
              return prev;
            }

            const ids = new Set(prev.checkingIds);
            ids.add(event.id as number);
            return { ...prev, checkingIds: ids };
          });
          break;
        case "done":
          setAccounts((prev) => {
            if (event.removed_from_db) {
              return prev.filter((account) => account.id !== event.id);
            }
            return prev.map((account) =>
              account.id === event.id
                ? {
                    ...account,
                    org_name: (event.org_name as string) ?? null,
                    user_count:
                      (event.user_count as number) ?? account.user_count,
                    license_status: normalizeIncomingLicenseStatus(
                      event.license_status ?? account.license_status
                    ),
                  }
                : account
            );
          });
          setCheckAllProgress((prev) => {
            if (!prev) {
              return prev;
            }

            const ids = new Set(prev.checkingIds);
            ids.delete(event.id as number);
            return {
              ...prev,
              completed: event.completed as number,
              failed: event.failed as number,
              checkingIds: ids,
            };
          });
          break;
        case "error":
          setAccounts((prev) =>
            prev.map((account) =>
              account.id === event.id
                ? {
                    ...account,
                    license_status: normalizeIncomingLicenseStatus(
                      event.license_status ?? account.license_status
                    ),
                  }
                : account
            )
          );
          setCheckAllProgress((prev) => {
            if (!prev) {
              return prev;
            }

            const ids = new Set(prev.checkingIds);
            ids.delete(event.id as number);
            return {
              ...prev,
              completed: event.completed as number,
              failed: event.failed as number,
              checkingIds: ids,
            };
          });
          break;
        case "complete":
          setCheckAllProgress((prev) =>
            prev
              ? {
                  ...prev,
                  completed: event.completed as number,
                  failed: event.failed as number,
                  checkingIds: new Set(),
                }
              : null
          );
          loadAccounts();
          break;
        case "auto_assign_start":
          setAutoAssignPhase("running");
          break;
        case "auto_assign_done":
          setAutoAssignPhase("done");
          setAutoAssignResult({
            assigned: (event.assigned as number) ?? 0,
            skipped: (event.skipped as number) ?? 0,
          });
          loadAccounts();
          break;
        case "auto_assign_error":
          setAutoAssignPhase("done");
          setCheckError(`Auto-assign: ${event.error as string}`);
          break;
        case "auto_assign_progress":
          break;
        case "fatal":
          setCheckError(event.error as string);
          break;
      }
    }
  }, [isCheckingAll, loadAccounts]);

  const handleCancelCheckAll = useCallback(() => {
    checkAllAbortRef.current?.abort();
    setCheckAllProgress(null);
  }, []);

  const handleTestCronJob = useCallback(() => {
    if (cronTestLoading || isCheckingAll || checkingId !== null) {
      return;
    }
    setCheckError(null);
    setCronTestBanner(null);
    setCronTestLoading(true);
    runSchedulerRenewAdobeCheck()
      .then(() => {
        setCronTestBanner(
          "Đã chạy xong job giống cron (check all + auto-assign) trên process API. Cron thật chạy trong `scheduler` — xem log service đó để so sánh."
        );
        loadAccounts();
      })
      .catch((err) =>
        setCheckError(
          err?.message ?? "Lỗi khi chạy test job cron (scheduler/run-adobe-check)."
        )
      )
      .finally(() => setCronTestLoading(false));
  }, [checkingId, cronTestLoading, isCheckingAll, loadAccounts]);

  const handleDeleteUser = useCallback(
    (accountId: number, userEmail: string) => {
      setCheckError(null);
      const key = `acc-${accountId}-${userEmail}`;
      setDeletingId(key);

      apiFetch(
        API_ENDPOINTS.RENEW_ADOBE_ACCOUNT_AUTO_DELETE_USERS(accountId),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userEmails: [userEmail] }),
        }
      )
        .then((res) => res.json())
        .then((data) => {
          if (data?.success === false) {
            throw new Error(data?.error ?? data?.message ?? "Xóa thất bại");
          }
          if (Array.isArray(data?.failed) && data.failed.length > 0) {
            const firstError = data.failed[0]?.error;
            throw new Error(firstError ?? "Xóa thất bại");
          }
          loadAccounts();
        })
        .catch((err) => setCheckError(err?.message ?? "Lỗi khi xóa user."))
        .finally(() => setDeletingId(null));
    },
    [loadAccounts]
  );

  const handleFixUser = useCallback(
    (userEmail: string) => {
      if (fixAllInFlightRef.current) {
        return;
      }
      setCheckError(null);
      setFixingId(userEmail);

      apiFetch(API_ENDPOINTS.RENEW_ADOBE_FIX_USER, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data?.success) {
            loadAccounts();
          } else {
            throw new Error(data?.error ?? "Fix thất bại");
          }
        })
        .catch((err) => setCheckError(err?.message ?? "Lỗi khi fix user."))
        .finally(() => setFixingId(null));
    },
    [loadAccounts]
  );

  const handleFixAllUsers = useCallback(
    async (emails: string[]) => {
      const unique = [
        ...new Set(
          emails
            .map((e) => String(e || "").trim().toLowerCase())
            .filter(Boolean)
        ),
      ];
      if (unique.length === 0 || fixAllInFlightRef.current) {
        return;
      }

      fixAllInFlightRef.current = true;
      setCheckError(null);
      setFixAllProgress({ current: 0, total: unique.length });

      try {
        const res = await apiFetch(
          API_ENDPOINTS.RENEW_ADOBE_FIX_USERS_ROUND,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ emails: unique }),
          }
        );
        const data = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          error?: string;
          total_added?: number;
          added_count?: number;
        };

        if (!data?.success) {
          const msg =
            typeof data?.error === "string" ? data.error : "Fix thất bại";
          throw new Error(msg);
        }

        const total =
          Number(data.total_added) ||
          Number(data.added_count) ||
          0;
        setFixAllProgress({
          current: Math.min(total, unique.length),
          total: unique.length,
        });
      } catch (err) {
        setCheckError(
          err instanceof Error ? err.message : "Lỗi khi fix hàng loạt."
        );
      } finally {
        fixAllInFlightRef.current = false;
        setFixingId(null);
        setFixAllProgress(null);
        loadAccounts();
      }
    },
    [loadAccounts]
  );

  const handleSaveUrlAccess = useCallback((accountId: number, url: string) => {
    apiFetch(API_ENDPOINTS.RENEW_ADOBE_URL_ACCESS(accountId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_url: url }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.success) {
          setAccounts((prev) =>
            prev.map((account) =>
              account.id === accountId
                ? { ...account, access_url: url || null }
                : account
            )
          );
        }
      })
      .catch(() => {});
  }, []);

  const openDeleteAdminModal = useCallback((account: AdobeAdminAccount) => {
    setCheckError(null);
    setAdminAccountPendingDelete(account);
  }, []);

  const closeDeleteAdminModal = useCallback(() => {
    if (deletingAdminAccountId !== null) return;
    setAdminAccountPendingDelete(null);
  }, [deletingAdminAccountId]);

  const confirmDeleteAdminAccount = useCallback(() => {
    const account = adminAccountPendingDelete;
    if (!account) return;
    setCheckError(null);
    setDeletingAdminAccountId(account.id);
    deleteAdobeAdminAccount(account.id)
      .then(() => {
        loadAccounts();
        setAdminAccountPendingDelete(null);
      })
      .catch((err) =>
        setCheckError(err?.message ?? "Lỗi khi xóa tài khoản admin.")
      )
      .finally(() => setDeletingAdminAccountId(null));
  }, [adminAccountPendingDelete, loadAccounts]);

  const handleCheck = useCallback(
    (account: AdobeAdminAccount) => {
      setCheckError(null);
      setCheckingId(account.id);

      apiFetch(API_ENDPOINTS.RENEW_ADOBE_ACCOUNT_CHECK(account.id), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
        .then((res) => {
          if (!res.ok) {
            throw new Error(res.statusText || "Check thất bại");
          }
          return res.json();
        })
        .then((data) => {
          if (data.success) {
            loadAccounts();
          } else {
            throw new Error(data.error || "Check thất bại");
          }
        })
        .catch((err) => setCheckError(err?.message ?? "Lỗi khi chạy check."))
        .finally(() => setCheckingId(null));
    },
    [loadAccounts]
  );

  return {
    accounts,
    loading,
    error,
    checkingId,
    checkError,
    deletingAdminAccountId,
    adminAccountPendingDelete,
    openDeleteAdminModal,
    closeDeleteAdminModal,
    confirmDeleteAdminAccount,
    deletingId,
    fixingId,
    fixAllProgress,
    checkAllProgress,
    autoAssignPhase,
    autoAssignResult,
    isCheckingAll,
    cronTestLoading,
    cronTestBanner,
    loadAccounts,
    dismissCheckAllProgress,
    handleCheckAll,
    handleCancelCheckAll,
    handleTestCronJob,
    handleDeleteUser,
    handleFixUser,
    handleFixAllUsers,
    handleSaveUrlAccess,
    handleCheck,
  };
}
