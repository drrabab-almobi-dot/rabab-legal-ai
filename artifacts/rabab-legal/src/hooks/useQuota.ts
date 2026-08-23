/**
 * useQuota — hook يجلب حالة الحصة للمستخدم الحالي ويحدّثها عند الطلب
 */
import { useState, useEffect, useCallback } from 'react';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export type ServiceType = 'consultation' | 'contract_draft' | 'contract_review';

export interface QuotaStatus {
  allowed: boolean;
  isTrial: boolean;
  trialRemaining: number | null;
  remaining: Record<ServiceType, number | null>;
  allowed_limits: Record<ServiceType, number | null>;
  needsUpgrade: boolean;
  message?: string;
}

const DEFAULT: QuotaStatus = {
  allowed: true,
  isTrial: false,
  trialRemaining: null,
  remaining: { consultation: null, contract_draft: null, contract_review: null },
  allowed_limits: { consultation: null, contract_draft: null, contract_review: null },
  needsUpgrade: false,
};

let _cache: QuotaStatus | null = null;
let _cacheTs = 0;
const CACHE_TTL = 30_000; // 30 seconds

export function useQuota() {
  const [quota, setQuota] = useState<QuotaStatus>(_cache ?? DEFAULT);
  const [loading, setLoading] = useState(!_cache);

  const refresh = useCallback(async () => {
    try {
      const now = Date.now();
      if (_cache && now - _cacheTs < CACHE_TTL) {
        setQuota(_cache);
        setLoading(false);
        return;
      }
      const r = await fetch(`${BASE}/api/quota/status`, { credentials: 'include' });
      if (r.ok) {
        const data = await r.json();
        _cache = data;
        _cacheTs = Date.now();
        setQuota(data);
      }
    } catch {
      // silently keep previous state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const invalidate = useCallback(() => {
    _cache = null;
    _cacheTs = 0;
    refresh();
  }, [refresh]);

  return { quota, loading, refresh, invalidate };
}

/** بصمة جهاز مبسّطة — يُرسل مرة واحدة عند التسجيل */
export async function sendDeviceFingerprint() {
  try {
    const components = [
      navigator.userAgent,
      screen.width + 'x' + screen.height,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      navigator.language,
    ].join('|');
    const encoder = new TextEncoder();
    const data = encoder.encode(components);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const fingerprintHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    await fetch(`${BASE}/api/quota/device-fingerprint`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fingerprintHash }),
    });
  } catch {
    // non-critical
  }
}
