import { useMemo, useState } from "react";
import ConfirmModal from "@/components/modals/ConfirmModal/ConfirmModal";
import { RenewAdobeAccountsTable } from "@/features/renew-adobe/components/RenewAdobeAccountsTable";
import { AddUserByEmail } from "@/features/renew-adobe/components/AddUserByEmail";
import { AddAdminAccountModal } from "@/features/renew-adobe/components/AddAdminAccountModal";
import { RenewAdobeHeader } from "@/features/renew-adobe/components/RenewAdobeHeader";
import { RenewAdobeProgressPanel } from "@/features/renew-adobe/components/RenewAdobeProgressPanel";
import { UserOrdersTable } from "@/features/renew-adobe/components/UserOrdersTable";
import type { AdobeAdminAccount } from "@/features/renew-adobe/types";
import { useRenewAdobeAdmin } from "@/features/renew-adobe/hooks/useRenewAdobeAdmin";

const PAGE_SIZE = 10;

export default function RenewAdobeAdmin() {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [addAdminOpen, setAddAdminOpen] = useState(false);
  const {
    accounts,
    loading,
    error,
    checkingId,
    checkError,
    deletingAdminAccountId,
    adminAccountPendingDelete,
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
    openDeleteAdminModal,
  } = useRenewAdobeAdmin();

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return accounts;
    const q = searchTerm.trim().toLowerCase();
    return accounts.filter(
      (item) =>
        item.email.toLowerCase().includes(q) ||
        (item.alias ?? "").toLowerCase().includes(q) ||
        (item.org_name ?? "").toLowerCase().includes(q) ||
        (item.id_product ?? "").toLowerCase().includes(q)
    );
  }, [accounts, searchTerm]);

  const totalItems = filtered.length;
  const currentRows = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  return (
    <div className="space-y-6">
      <AddAdminAccountModal
        open={addAdminOpen}
        onClose={() => setAddAdminOpen(false)}
        onCreated={loadAccounts}
      />
      <RenewAdobeHeader
        isCheckingAll={isCheckingAll}
        loading={loading}
        accountCount={accounts.length}
        checkingId={checkingId}
        cronTestLoading={cronTestLoading}
        onCheckAll={handleCheckAll}
        onCancelCheckAll={handleCancelCheckAll}
        onTestCronJob={handleTestCronJob}
        onAddAdmin={() => setAddAdminOpen(true)}
      />

      {cronTestBanner && (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100/95">
          {cronTestBanner}
        </p>
      )}

      {checkAllProgress && checkAllProgress.total > 0 && (
        <RenewAdobeProgressPanel
          total={checkAllProgress.total}
          completed={checkAllProgress.completed}
          failed={checkAllProgress.failed}
          isCheckingAll={isCheckingAll}
          autoAssignPhase={autoAssignPhase}
          autoAssignResult={autoAssignResult}
          onClose={dismissCheckAllProgress}
        />
      )}

      <RenewAdobeAccountsTable
        accounts={accounts}
        currentRows={currentRows}
        currentPage={currentPage}
        totalItems={totalItems}
        pageSize={PAGE_SIZE}
        searchTerm={searchTerm}
        loading={loading}
        error={error}
        checkError={checkError}
        checkingId={checkingId}
        deletingAdminAccountId={deletingAdminAccountId}
        isCheckingAll={isCheckingAll}
        checkingIds={checkAllProgress?.checkingIds}
        onSearchTermChange={(value) => {
          setSearchTerm(value);
          setCurrentPage(1);
        }}
        onPageChange={setCurrentPage}
        onCheck={handleCheck}
        onDeleteAdmin={openDeleteAdminModal}
        onSaveUrlAccess={handleSaveUrlAccess}
        onRefresh={loadAccounts}
      />

      <div className="mt-6 space-y-6">
        <UserOrdersTable
          accountsRefreshDep={accounts
            .map(
              (a) =>
                `${a.id}:${a.tracking_user_count ?? 0}:${a.user_count}:${a.license_status}`
            )
            .join("|")}
          onDeleteUser={handleDeleteUser}
          deletingId={deletingId}
          onFixUser={handleFixUser}
          fixingId={fixingId}
          onFixAllUsers={handleFixAllUsers}
          fixAllProgress={fixAllProgress}
        />
        <AddUserByEmail onAdded={loadAccounts} />
      </div>

      <ConfirmModal
        isOpen={adminAccountPendingDelete !== null}
        onClose={closeDeleteAdminModal}
        onConfirm={confirmDeleteAdminAccount}
        title="Xóa tài khoản admin?"
        message={
          adminAccountPendingDelete
            ? `Xóa tài khoản ${adminAccountPendingDelete.email} khỏi danh sách?`
            : ""
        }
        secondaryMessage="Gán user ↔ đơn hàng với account này sẽ được gỡ. (Không tự xóa user trên Adobe.)"
        confirmLabel="Xóa"
        cancelLabel="Hủy"
        isSubmitting={deletingAdminAccountId !== null}
      />
    </div>
  );
}

