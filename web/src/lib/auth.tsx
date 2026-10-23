import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, call, setUnauthorizedHandler, tokenStore, type Unit, type User } from "./api";

type AuthState = {
  token: string | null;
  user: User | undefined;
  unit: Unit;
  loading: boolean;
  logIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  logOut: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => tokenStore.get());
  const queryClient = useQueryClient();

  const logOut = useCallback(() => {
    tokenStore.set(null);
    setToken(null);
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => setUnauthorizedHandler(logOut), [logOut]);

  const me = useQuery({
    queryKey: ["me", token],
    queryFn: () => call(api.GET("/auth/me")),
    enabled: !!token,
    staleTime: 5 * 60_000,
  });

  const accept = useCallback((accessToken: string) => {
    tokenStore.set(accessToken);
    setToken(accessToken);
  }, []);

  const logIn = useCallback(
    async (email: string, password: string) => {
      const res = await call(api.POST("/auth/login", { body: { email, password } }));
      accept(res.access_token);
    },
    [accept],
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      const res = await call(api.POST("/auth/signup", { body: { email, password } }));
      accept(res.access_token);
    },
    [accept],
  );

  const value = useMemo<AuthState>(
    () => ({
      token,
      user: me.data,
      unit: me.data?.unit_pref ?? "kg",
      loading: !!token && me.isPending,
      logIn,
      signUp,
      logOut,
    }),
    [token, me.data, me.isPending, logIn, signUp, logOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
