import React, { createContext, useContext, useEffect, useState } from "react";
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
  loading: true,
  refresh: async () => {},
});

export const useAuth = (): AuthContextType => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  const refresh = async () => {
    try {
      const res = await apiFetch("/api/auth/me");
      if (!res.ok) {
        setUser(null);
        return;
      }
      const data = await res.json();
      setUser(data.user || null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isPublicRenewHost()) {
      setUser(null);
      setLoading(false);
      return;
    }
    if (location.pathname === "/login") {
      setLoading(false);
      return;
    }
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ lúc mount: bỏ /me cho /login & host storefront
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, loading, refresh }}>
      {children}
    </AuthContext.Provider>
  );
};
