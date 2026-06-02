import { MailBackupPanel } from "@/features/renew-adobe/components/MailBackupPanel";

export default function MailBackupPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Mail Backup (IMAP)</h1>
        <p className="text-sm text-slate-400 mt-1">
          Quản lý hộp thư Gmail đọc OTP — lưu trong database, có thể thay đổi bất cứ lúc nào.
        </p>
      </div>
      <MailBackupPanel />
    </div>
  );
}
