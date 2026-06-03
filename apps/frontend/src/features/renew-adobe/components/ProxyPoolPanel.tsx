import { useCallback, useEffect, useState } from "react";
import {
  createAdminProxy,
  deleteAdminProxy,
  fetchAdminProxies,
  testAdminProxy,
} from "../api/proxyPoolApi";
import type { AdminProxyItem } from "../types";

export function ProxyPoolPanel() {
  const [rows, setRows] = useState<AdminProxyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rawLine, setRawLine] = useState("");
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchAdminProxies());
    } catch (err) {
      setError(err instanceof Error ? err.message : "X?a th?t b?i.");
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
      await createAdminProxy({
        raw_line: rawLine.trim(),
        label: label.trim() || undefined,
        note: note.trim() || undefined,
        is_default: rows.length === 0,
      });
      setRawLine("");
      setLabel("");
      setNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Them that bai.");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (id: number) => {
    setTestingId(id);
    setTestResult(null);
    setError(null);
    try {
      const result = await testAdminProxy(id);
      setTestResult(result.message ?? `Proxy OK - ${result.proxy_url_masked ?? ""}${result.exit_ip ? ` IP: ${result.exit_ip}` : ""}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test proxy th?t b?i.");
      await load();
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("X?a proxy n?y?")) return;
    setDeletingId(id);
    setError(null);
    try {
      await deleteAdminProxy(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xoa that bai.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-white">Proxy pool (Adobe login)</h2>
        <p className="text-xs text-slate-400 mt-1">
          Login admin t? ch?n proxy s?ng trong b?ng; n?u kh?ng c?n proxy s?ng th? d?ng proxy m?c ??nh.
          N?u kh?ng c? proxy m?c ??nh th? fallback env{" "}
          <code className="text-slate-300">ADOBE_PROXY</code>.
          Test ki?m tra k?t n?i proxy (gi?ng proxygenz); Adobe test ri?ng.
          <br />
          ??nh d?ng:{" "}
          <code className="text-slate-300">user:pass@host:port</code> ho?c{" "}
          <code className="text-slate-300">host:port:user:pass</code>
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
            placeholder="user:pass@host:port ho?c 180.93.2.169:3129:user:pass"
            className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white font-mono"
            required
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Nh?n (t?y ch?n)"
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white"
            />
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ghi ch?"
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="h-fit self-end rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? "Ã„Âang lÃ†Â°uÃ¢â‚¬Â¦" : "ThÃƒÂªm proxy"}
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-slate-400">Ã„Âang tÃ¡ÂºÂ£iÃ¢â‚¬Â¦</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">
          Ch?a c? proxy ? s? d?ng ADOBE_PROXY t? env.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-slate-400 border-b border-white/10">
                <th className="py-2 pr-3">NhÃƒÂ£n</th>
                <th className="py-2 pr-3">Proxy</th>
                <th className="py-2 pr-3">TrÃ¡ÂºÂ¡ng thÃƒÂ¡i</th>
                <th className="py-2 pr-3">MÃ¡ÂºÂ·c Ã„â€˜Ã¡Â»â€¹nh</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-white/5 text-slate-200">
                  <td className="py-2 pr-3">{row.label || "Ã¢â‚¬â€"}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{row.proxy_url_masked}</td>
                  <td className="py-2 pr-3">
                    {!row.is_active ? (
                      <span className="text-slate-500">TÃ¡ÂºÂ¯t</span>
                    ) : row.is_alive ? (
                      <span className="text-emerald-400">SÃ¡Â»â€˜ng</span>
                    ) : (
                      <span className="text-red-400" title={row.last_error ?? ""}>
                        Die
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3">{row.is_default ? "Ã¢Å“â€œ" : "Ã¢â‚¬â€"}</td>
                  <td className="py-2 text-right space-x-2">
                    <button
                      type="button"
                      onClick={() => void handleTest(row.id)}
                      disabled={testingId === row.id}
                      className="text-indigo-400 hover:text-indigo-300 text-xs disabled:opacity-50"
                    >
                      {testingId === row.id ? "Ã„Âang testÃ¢â‚¬Â¦" : "Test"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(row.id)}
                      disabled={deletingId === row.id}
                      className="text-red-400 hover:text-red-300 text-xs disabled:opacity-50"
                    >
                      XÃƒÂ³a
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
