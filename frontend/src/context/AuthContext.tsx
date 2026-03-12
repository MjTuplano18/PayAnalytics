"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  login as apiLogin,
  getMe,
  refreshTokens,
  type UserResponse,
} from "@/lib/api";

interface AuthContextValue {
  user: UserResponse | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "pa_access_token";
const REFRESH_KEY = "pa_refresh_token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Store token as proper React state so consumers re-render when it changes
  const [token, setTokenState] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null
  );
  const router = useRouter();
  const pathname = usePathname();

  // Load user from stored token on mount
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setIsLoading(false);
      if (pathname !== "/login") router.replace("/login");
      return;
    }

    getMe(token)
      .then(setUser)
      .catch(async () => {
        // Try refresh
        const refresh = localStorage.getItem(REFRESH_KEY);
        if (refresh) {
          try {
            const tokens = await refreshTokens(refresh);
            localStorage.setItem(TOKEN_KEY, tokens.access_token);
            localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
            setTokenState(tokens.access_token);
            const u = await getMe(tokens.access_token);
            setUser(u);
            return;
          } catch {
            // refresh failed
          }
        }
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_KEY);
        setTokenState(null);
        if (pathname !== "/login") router.replace("/login");
      })
      .finally(() => setIsLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(
    async (email: string, password: string) => {
      const tokens = await apiLogin(email, password);
      localStorage.setItem(TOKEN_KEY, tokens.access_token);
      localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
      setTokenState(tokens.access_token);
      const u = await getMe(tokens.access_token);
      setUser(u);
      router.replace("/dashboard");
    },
    [router]
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    setTokenState(null);
    setUser(null);
    router.replace("/login");
  }, [router]);

  const value = useMemo(
    () => ({
      user,
      token,
      isLoading,
      login,
      logout,
    }),
    [user, token, isLoading, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
