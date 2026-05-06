import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useLocation } from "react-router-dom";
import { apiFetch } from "./lib/api";
import { isPublicRenewHost } from "./lib/publicRenewHost";

type User = { id: number; username: string; role?: string };

type AuthContextType = {
  user: User | null;
  setUser: (u: User | null) => void;
  loading: boolean;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  setUser: () => {},
  loading: false,
  refresh: async () => {},
});

const AUTH_USER_STORAGE_KEY = "automation.auth.user";

function readCachedUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(AUTH_USER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<User>;
    if (typeof parsed.id !== "number" || typeof parsed.username !== "string") {
      return null;
    }
    return {
      id: parsed.id,
      username: parsed.username,
      role: typeof parsed.role === "string" ? parsed.role : undefined,
    };
  } catch {
    return null;
  }
}

function writeCachedUser(user: User | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!user) {
      window.sessionStorage.removeItem(AUTH_USER_STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
  } catch {
    /* ignore storage errors */
  }
}

/** Tránh chờ /me quá lâu (API cold / mạng) — mở login nhanh nếu session không phản hồi. */
const ME_FETCH_TIMEOUT_MS = 2800;

/** Không cần chờ /me: storefront công khai hoặc trang login. */
function skipsSessionProbe(pathname: string): boolean {
  if (typeof window !== "undefined" && isPublicRenewHost()) return true;
  return pathname === "/login";
}

export const useAuth = (): AuthContextType => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const location = useLocation();
  const [initialCachedUser] = useState<User | null>(() =>
    skipsSessionProbe(location.pathname) ? null : readCachedUser()
  );
  const [user, setUserState] = useState<User | null>(initialCachedUser);
  const [loading, setLoading] = useState(false);

  const setUser = useCallback((nextUser: User | null) => {
    setUserState(nextUser);
    writeCachedUser(nextUser);
  }, []);

  const refresh = useCallback(async () => {
    const controller = new AbortController();
    const tid = window.setTimeout(() => controller.abort(), ME_FETCH_TIMEOUT_MS);
    try {
      const res = await apiFetch("/api/auth/me", { signal: controller.signal });
      if (!res.ok) {
        setUser(null);
        return;
      }
      const data = await res.json();
      setUser(data.user || null);
    } catch {
      setUser(null);
    } finally {
      window.clearTimeout(tid);
      setLoading(false);
    }
  }, [setUser]);

  useEffect(() => {
    if (isPublicRenewHost()) {
      setUser(null);
      setLoading(false);
      return;
    }
    if (location.pathname === "/login" || !initialCachedUser) {
      setLoading(false);
      return;
    }
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ probe session lúc mount; đổi route không gọi lại /me
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, loading, refresh }}>
      {children}
    </AuthContext.Provider>
  );
};
