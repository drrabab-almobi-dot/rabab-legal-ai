import React, { createContext, useContext, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@workspace/api-client-react";
import { useLocation } from "wouter";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface AuthSessionResponse {
  user: User | null;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [sessionCheckTimedOut, setSessionCheckTimedOut] = useState(false);
  const [location, setLocation] = useLocation();
  const { data, isLoading, isError } = useQuery<AuthSessionResponse>({
    queryKey: ["/api/auth/session"],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/api/auth/session`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!response.ok)
        throw new Error(`Session check failed with ${response.status}`);
      return response.json() as Promise<AuthSessionResponse>;
    },
    retry: false,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!isLoading) {
      setSessionCheckTimedOut(false);
      return;
    }

    const timeout = window.setTimeout(
      () => setSessionCheckTimedOut(true),
      5000,
    );
    return () => window.clearTimeout(timeout);
  }, [isLoading]);

  useEffect(() => {
    if (data) {
      setUser(data.user);
    } else if (isError) {
      setUser(null);
    }
  }, [data, isError]);

  const login = (newUser: User) => {
    setUser(newUser);
  };

  const logout = () => {
    setUser(null);
    setLocation("/");
  };

  const value = {
    user,
    isLoading: isLoading && !sessionCheckTimedOut,
    isAuthenticated: !!user,
    isAdmin: user?.role === "admin",
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
