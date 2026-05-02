import { useEffect, useRef, useState } from "react";

export type UrlAccessCellProps = {
  value: string;
  onSave: (url: string) => void;
};

export function UrlAccessCell({ value, onSave }: UrlAccessCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
    };
  }, []);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyError(false);
      setCopied(true);
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
      copyResetRef.current = setTimeout(() => {
        setCopied(false);
        copyResetRef.current = null;
      }, 1500);
    } catch {
      setCopyError(true);
      setCopied(false);
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
      copyResetRef.current = setTimeout(() => {
        setCopyError(false);
        copyResetRef.current = null;
      }, 2500);
    }
  };

  if (!editing) {
    return value ? (
      <div className="flex items-center justify-center gap-1">
        <button
          type="button"
          onClick={copyUrl}
          title={value}
          className="inline-flex items-center gap-1 rounded-lg bg-violet-500/20 text-violet-300 border border-violet-400/40 px-2 py-0.5 text-[11px] font-semibold hover:bg-violet-500/30 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-3 h-3"
          >
            <path d="M12.232 4.232a2.5 2.5 0 0 1 3.536 3.536l-1.225 1.224a.75.75 0 0 0 1.061 1.06l1.224-1.224a4 4 0 0 0-5.656-5.656l-3 3a4 4 0 0 0 .225 5.865.75.75 0 0 0 .977-1.138 2.5 2.5 0 0 1-.142-3.667l3-3Z" />
            <path d="M11.603 7.963a.75.75 0 0 0-.977 1.138 2.5 2.5 0 0 1 .142 3.667l-3 3a2.5 2.5 0 0 1-3.536-3.536l1.225-1.224a.75.75 0 0 0-1.061-1.06l-1.224 1.224a4 4 0 1 0 5.656 5.656l3-3a4 4 0 0 0-.225-5.865Z" />
          </svg>
          {copyError ? "Lỗi copy" : copied ? "Đã copy" : "Link"}
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(value);
            setEditing(true);
          }}
          className="text-white/30 hover:text-white/60 transition-colors"
          title="Sửa URL"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="w-3 h-3"
          >
            <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.262a1.75 1.75 0 0 0 0-2.474Z" />
            <path d="M4.75 3.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h6.5c.69 0 1.25-.56 1.25-1.25V9A.75.75 0 0 1 14 9v2.25A2.75 2.75 0 0 1 11.25 14h-6.5A2.75 2.75 0 0 1 2 11.25v-6.5A2.75 2.75 0 0 1 4.75 2H7a.75.75 0 0 1 0 1.5H4.75Z" />
          </svg>
        </button>
      </div>
    ) : (
      <button
        type="button"
        onClick={() => {
          setDraft("");
          setEditing(true);
        }}
        className="text-white/30 hover:text-violet-300 text-[11px] transition-colors"
        title="Thêm URL product"
      >
        + URL
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="https://acrs.adobe.com/go/..."
        className="w-28 px-1.5 py-0.5 text-[11px] border border-violet-400/40 rounded bg-slate-950/60 text-white placeholder:text-white/20 outline-none focus:ring-1 focus:ring-violet-500/50"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onSave(draft.trim());
            setEditing(false);
          }
          if (e.key === "Escape") {
            setEditing(false);
          }
        }}
      />
      <button
        type="button"
        onClick={() => {
          onSave(draft.trim());
          setEditing(false);
        }}
        className="text-emerald-400 hover:text-emerald-300 transition-colors"
        title="Lưu"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 16 16"
          fill="currentColor"
          className="w-3.5 h-3.5"
        >
          <path
            fillRule="evenodd"
            d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="text-white/30 hover:text-rose-400 transition-colors"
        title="Hủy"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 16 16"
          fill="currentColor"
          className="w-3.5 h-3.5"
        >
          <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
        </svg>
      </button>
    </div>
  );
}
