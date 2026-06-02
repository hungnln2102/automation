import { useCallback, useEffect, useState } from "react";
import {
  createMailBackupMailbox,
  deleteMailBackupMailbox,
  fetchMailBackupMailboxes,
  testMailBackupMailbox,
} from "../api/mailBackupApi";
import type { MailBackupMailbox } from "../types";

export function MailBackupPanel() {
  const [rows, setRows] = useState<MailBackupMailbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rawLine, setRawLine] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchMailBackupMailboxes());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tải danh sách thất bại.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createMailBackupMailbox({
        raw_line: rawLine.trim(),
        note: note.trim() || undefined,
        is_default: rows.length === 0,
      });
      setRawLine("");
      setNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Thêm thất bại.");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (id: number) => {
    setTestingId(id);
    setTestResult(null);
    setError(null);
    try {
      const result = await testMailBackupMailbox(id);
      setTestResult(
        `IMAP OK — ${result.email} — INBOX có ${result.inbox_count ?? 0} thư`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test IMAP thất bại.");
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Xóa hộp thư IMAP này?")) return;
    setDeletingId(id);
    setError(null);
    try {
      await deleteMailBackupMailbox(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xóa thất bại.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-white">Mail IMAP (OTP)</h2>
        <p className="text-xs text-slate-400 mt-1">
          Lưu trong DB — không cố định trong code. Gmail App Password thường chỉ{" "}
          <strong className="text-amber-300/90">16 ký tự</strong> (4 nhóm × 4).
        </p>
      </div>

      {error ? (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </p>
      ) : null}

      {testResult ? (
        <p className="text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
          {testResult}
        </p>
      ) : null}

      <form onSubmit={handleAdd} className="grid gap-3 md:grid-cols-[1fr_auto]">
        <div className="space-y-2">
          <input
            type="text"
            value={rawLine}
            onChange={(e) => setRawLine(e.target.value)}
            placeholder="email|mat_khau|app_password"
            className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white font-mono"
            required
          />
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ghi chú (tuỳ chọn)"
            className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="h-fit self-end rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? "Đang lưu…" : "Thêm mail"}
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-slate-400">Đang tải…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">Chưa có mail IMAP.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-slate-400 border-b border-white/10">
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">App pass</th>
                <th className="py-2 pr-3">Mặc định</th>
                <th className="py-2 pr-3">Ghi chú</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-white/5 text-slate-200">
                  <td className="py-2 pr-3 font-mono text-xs">{row.email}</td>
                  <td className="py-2 pr-3 font-mono text-xs text-slate-400">
                    {row.app_password_masked}
                  </td>
                  <td className="py-2 pr-3">{row.is_default ? "✓" : "—"}</td>
                  <td className="py-2 pr-3 text-slate-400">{row.note || "—"}</td>
                  <td className="py-2 text-right space-x-2">
                    <button
                      type="button"
                      onClick={() => void handleTest(row.id)}
                      disabled={testingId === row.id}
                      className="text-indigo-400 hover:text-indigo-300 text-xs disabled:opacity-50"
                    >
                      {testingId === row.id ? "Đang test…" : "Test IMAP"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(row.id)}
                      disabled={deletingId === row.id}
                      className="text-red-400 hover:text-red-300 text-xs disabled:opacity-50"
                    >
                      Xóa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
