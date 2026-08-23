import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import * as SecureStore from '../utils/storage';
import * as Notifications from 'expo-notifications';
import { useQueryClient } from '@tanstack/react-query';
import { setAuthTokenGetter } from '@workspace/api-client-react';

const AUTH_STORAGE_KEY = 'rabab_legal_user';
const TOKEN_STORAGE_KEY = 'rabab_legal_jwt';

/** Decode JWT payload without verifying signature (verification happens server-side). */
function decodeJwtPayload(token: string): { exp?: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const decoded = atob(padded);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/** Returns true if the token expires within `withinMs` milliseconds (or is already expired). */
function tokenExpiresWithin(token: string, withinMs: number): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return true;
  return payload.exp * 1000 - Date.now() <= withinMs;
}

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  role: 'user' | 'admin';
  emailVerified?: boolean;
  phoneVerified?: boolean;
  freeConsultationsUsed?: number;
  createdAt?: string;
}

/** Thrown when register/login requires email OTP verification before proceeding. */
export class EmailVerificationRequiredError extends Error {
  constructor(public readonly email: string, public readonly code: 'EMAIL_VERIFICATION_REQUIRED' | 'EMAIL_NOT_VERIFIED') {
    super(code);
    this.name = 'EmailVerificationRequiredError';
  }
}

/** Thrown when the server requires phone OTP verification before granting a token. */
export class PhoneVerificationRequiredError extends Error {
  readonly verifyToken: string;
  readonly maskedPhone: string;
  constructor(verifyToken: string, maskedPhone: string) {
    super('يجب التحقق من رقم الجوال');
    this.name = 'PhoneVerificationRequiredError';
    this.verifyToken = verifyToken;
    this.maskedPhone = maskedPhone;
    Object.setPrototypeOf(this, PhoneVerificationRequiredError.prototype);
  }
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, phone: string) => Promise<void>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resendVerification: (email: string) => Promise<void>;
  confirmPhoneOtp: (verifyToken: string, code: string) => Promise<void>;
  resendPhoneOtp: (verifyToken: string) => Promise<{ verifyToken: string; maskedPhone: string }>;
  logout: () => Promise<void>;
  getBaseUrl: () => string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const getBaseUrl = () => `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

interface ApiError {
  error: string;
  email?: string;
  [key: string]: unknown;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await SecureStore.getItemAsync(TOKEN_STORAGE_KEY);
  const res = await fetch(`${getBaseUrl()}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
  });
  const data = await res.json();
  if (!res.ok) {
    // Phone verification gate: server returns 403 + pendingVerification
    if (data?.pendingVerification) {
      throw new PhoneVerificationRequiredError(data.verifyToken ?? '', data.maskedPhone ?? '');
    }
    // Preserve the full error payload so callers can inspect error codes and extra fields
    const err = new Error(data?.error ?? `HTTP ${res.status}`) as Error & { data: ApiError; status: number };
    err.data = data as ApiError;
    err.status = res.status;
    throw err;
  }
  return data as T;
}

/**
 * Request push-notification permission, get the Expo push token, and persist
 * it to the API using the authenticated `apiFetch` (Bearer token included).
 * Silently swallows all errors — push notifications are non-critical.
 */
async function registerPushTokenAuthenticated(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    type PermResult = { granted: boolean };
    const perms = await Notifications.getPermissionsAsync() as unknown as PermResult;
    let granted = perms.granted;
    if (!granted) {
      const result = await Notifications.requestPermissionsAsync() as unknown as PermResult;
      granted = result.granted;
    }
    if (!granted) return;

    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData?.data;
    if (!token) return;

    await apiFetch('/api/notifications/push-token', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  } catch {
    // Non-fatal — user can still use the app without push notifications
  }
}

/** Read the stored JWT without triggering a full auth restore. */
async function getStoredToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export { apiFetch, getBaseUrl, getStoredToken };

/** Configure the shared api-client-react token getter once on module load */
setAuthTokenGetter(async () => {
  try {
    return await SecureStore.getItemAsync(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  /** Attempt to refresh the stored JWT if it expires within 7 days. */
  const maybeRefreshToken = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync(TOKEN_STORAGE_KEY);
      if (!token) return;
      const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
      if (tokenExpiresWithin(token, SEVEN_DAYS_MS)) {
        const { token: newToken } = await apiFetch<{ token: string }>('/api/auth/refresh', {
          method: 'POST',
        });
        if (newToken) {
          await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, newToken);
        }
      }
    } catch {
      // Refresh failed silently — the next /me call will handle expiry
    }
  }, []);

  // Periodic JWT refresh: runs every 24 hours while the app JS is active (not when suspended by OS).
  // Cleared automatically when the component unmounts (e.g. on logout).
  useEffect(() => {
    const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
    const intervalId = setInterval(() => {
      maybeRefreshToken();
    }, TWENTY_FOUR_HOURS_MS);
    return () => clearInterval(intervalId);
  }, [maybeRefreshToken]);

  // When app returns to foreground, invalidate subscription so UI auto-refreshes
  // and opportunistically refresh the JWT in case it got close to expiry.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;
      if (
        (prev === 'background' || prev === 'inactive') &&
        nextState === 'active'
      ) {
        queryClient.invalidateQueries({ queryKey: ['getMySubscription'] });
        maybeRefreshToken();
      }
    });
    return () => subscription.remove();
  }, [queryClient, maybeRefreshToken]);

  // Restore user from storage + verify with server on mount
  useEffect(() => {
    const restore = async () => {
      try {
        const stored = await SecureStore.getItemAsync(AUTH_STORAGE_KEY);
        if (stored) {
          setUser(JSON.parse(stored));
        }
        // Auto-refresh token if close to expiry (within 7 days)
        await maybeRefreshToken();
        // Verify token/session is still valid
        const me = await apiFetch<AuthUser>('/api/auth/me');
        setUser(me);
        await SecureStore.setItemAsync(AUTH_STORAGE_KEY, JSON.stringify(me));
        // Re-register push token on each app restore (token may have rotated)
        registerPushTokenAuthenticated();
      } catch {
        // Token expired or not logged in — clear everything
        setUser(null);
        try { await SecureStore.deleteItemAsync(AUTH_STORAGE_KEY); } catch { /* web fallback */ }
        try { await SecureStore.deleteItemAsync(TOKEN_STORAGE_KEY); } catch { /* web fallback */ }
      } finally {
        setIsLoading(false);
      }
    };
    restore();
  }, [maybeRefreshToken]);

  // apiFetch throws PhoneVerificationRequiredError when server returns 403 + pendingVerification
  const login = useCallback(async (email: string, password: string) => {
    const { user: me, token } = await apiFetch<{ user: AuthUser; token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (token) {
      await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, token);
    }
    setUser(me);
    await SecureStore.setItemAsync(AUTH_STORAGE_KEY, JSON.stringify(me));
    queryClient.invalidateQueries();
    // Register push token now that we have a valid JWT
    registerPushTokenAuthenticated();
  }, [queryClient]);

  const register = useCallback(async (name: string, email: string, password: string, phone: string) => {
    // Server returns { pendingVerification: true, verifyToken, maskedPhone } (HTTP 201)
    // apiFetch detects pendingVerification and throws PhoneVerificationRequiredError
    const res = await apiFetch<{
      pendingVerification?: boolean;
      verifyToken?: string;
      maskedPhone?: string;
      user?: AuthUser;
      token?: string;
    }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, phone }),
    });
    // Legacy / future path: if server returns token directly
    if (res.token && res.user) {
      await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, res.token);
      setUser(res.user);
      await SecureStore.setItemAsync(AUTH_STORAGE_KEY, JSON.stringify(res.user));
      queryClient.invalidateQueries();
      registerPushTokenAuthenticated();
    }
  }, [queryClient]);

  /** Verify email OTP (task #187 email verification flow). */
  const verifyEmail = useCallback(async (email: string, code: string) => {
    const data = await apiFetch<{ user: AuthUser; token: string }>('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    });
    if (data.token) {
      await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, data.token);
    }
    setUser(data.user);
    await SecureStore.setItemAsync(AUTH_STORAGE_KEY, JSON.stringify(data.user));
    queryClient.invalidateQueries();
    registerPushTokenAuthenticated();
  }, [queryClient]);

  const resendVerification = useCallback(async (email: string) => {
    await apiFetch('/api/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }, []);

  /** Complete phone OTP verification and finish logging in (task #188). */
  const confirmPhoneOtp = useCallback(async (verifyToken: string, code: string) => {
    const { user: me, token } = await apiFetch<{ user: AuthUser; token: string }>('/api/auth/phone-verify/confirm', {
      method: 'POST',
      body: JSON.stringify({ verifyToken, code }),
    });
    if (token) {
      await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, token);
    }
    setUser(me);
    await SecureStore.setItemAsync(AUTH_STORAGE_KEY, JSON.stringify(me));
    queryClient.invalidateQueries();
    registerPushTokenAuthenticated();
  }, [queryClient]);

  /** Resend phone OTP and get back a fresh verifyToken (task #188). */
  const resendPhoneOtp = useCallback(async (verifyToken: string): Promise<{ verifyToken: string; maskedPhone: string }> => {
    return apiFetch<{ verifyToken: string; maskedPhone: string }>('/api/auth/phone-verify/resend', {
      method: 'POST',
      body: JSON.stringify({ verifyToken }),
    });
  }, []);

  const logout = useCallback(async () => {
    // Clear push token before invalidating the session so the DELETE request
    // still has a valid JWT to authenticate against the server.
    await unregisterPushToken();
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setUser(null);
    try { await SecureStore.deleteItemAsync(AUTH_STORAGE_KEY); } catch { /* web fallback */ }
    try { await SecureStore.deleteItemAsync(TOKEN_STORAGE_KEY); } catch { /* web fallback */ }
    queryClient.clear();
  }, [queryClient]);

  return (
    <AuthContext.Provider value={{
      user, isLoading,
      login, register,
      verifyEmail, resendVerification,
      confirmPhoneOtp, resendPhoneOtp,
      logout, getBaseUrl,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Remove push token from the server on logout so the device stops receiving
 *  notifications for this account. Best-effort — always continues logout. */
async function unregisterPushToken(): Promise<void> {
  try {
    await apiFetch('/api/notifications/push-token', { method: 'DELETE' });
  } catch {
    // Non-fatal
  }
}
