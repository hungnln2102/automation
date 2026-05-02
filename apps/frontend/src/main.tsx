import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { apiFetch } from "@/lib/api";

const reportError = (message: string, stack?: string) => {
  try {
    apiFetch('/api/error-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, stack, url: window.location.href }),
    }).catch(() => {});
  } catch {}
};

window.onerror = (_msg, _src, _line, _col, error) => {
  if (error) reportError(error.message, error.stack);
};

window.onunhandledrejection = (event: PromiseRejectionEvent) => {
  const reason = event.reason;
  reportError(
    reason?.message || String(reason),
    reason?.stack
  );
};

createRoot(document.getElementById("root")!).render(<App />);
