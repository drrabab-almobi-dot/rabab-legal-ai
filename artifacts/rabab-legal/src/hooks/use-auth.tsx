import React, { createContext, useContext, useEffect, useState } from 'react';
import { getGetMeQueryKey, useGetMe, User } from '@workspace/api-client-react';
import { useLocation } from 'wouter';

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
  const { data, isLoading, isError } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      retry: false,
    }
  });

  useEffect(() => {
    if (!isLoading) {
      setSessionCheckTimedOut(false);
      return;
    }

    const timeout = window.setTimeout(() => setSessionCheckTimedOut(true), 5000);
    return () => window.clearTimeout(timeout);
  }, [isLoading]);

  useEffect(() => {
    if (data) {
      setUser(data);
    } else if (isError) {
      setUser(null);
    }
  }, [data, isError]);

  const login = (newUser: User) => {
    setUser(newUser);
  };

  const logout = () => {
    setUser(null);
    setLocation('/');
  };

  const value = {
    user,
    isLoading: isLoading && !sessionCheckTimedOut,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
