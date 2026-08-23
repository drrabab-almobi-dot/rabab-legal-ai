/**
 * DevPanel — مرئي فقط في بيئة التطوير (Replit preview)
 * مخفي تماماً في الإنتاج لأن import.meta.env.DEV = false في build
 */
import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { customFetch } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

export function DevPanel() {
  if (!import.meta.env.DEV) return null;
  return <DevPanelInner />;
}

interface PkgOption { id: number; nameAr: string; price: string; }

function DevPanelInner() {
  const [open, setOpen]         = useState(false);
  const [loading, setLoading]   = useState<string | null>(null);
  const [packages, setPackages] = useState<PkgOption[]>([]);
  const [selectedPkg, setSelectedPkg] = useState<number>(3);
  const [subOpen, setSubOpen]   = useState(false);
  const [msg, setMsg]           = useState<string | null>(null);

  const { user, login, logout } = useAuth();
  const [, setLocation]         = useLocation();
  const qc                      = useQueryClient();

  const doLogin = async (role: 'admin' | 'user') => {
    setLoading(role);
    setMsg(null);
    try {
      const res = await customFetch<{ token: string; user: any }>('/api/auth/dev-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      login(res.user);
      await qc.invalidateQueries();
      setOpen(false);
      setLocation(role === 'admin' ? '/admin' : '/dashboard');
    } catch (e: any) {
      setMsg('❌ ' + (e?.message ?? 'فشل تسجيل الدخول'));
    } finally {
      setLoading(null);
    }
  };

  const doLogout = async () => {
    setLoading('logout');
    setMsg(null);
    try { await customFetch('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    logout();
    await qc.clear();
    setOpen(false);
    setLocation('/');
    setLoading(null);
  };

  const openSubPanel = async () => {
    if (packages.length === 0) {
      try {
        const pkgs = await customFetch<PkgOption[]>('/api/payments/dev-packages');
        setPackages(pkgs);
        if (pkgs.length > 0) setSelectedPkg(pkgs.find(p => p.id !== 1)?.id ?? pkgs[0].id);
      } catch { /* ignore */ }
    }
    setSubOpen(s => !s);
  };

  const simulateSub = async () => {
    setLoading('sub');
    setMsg(null);
    try {
      const res = await customFetch<{ success: boolean; package: string; endDate: string }>(
        '/api/payments/dev-simulate',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ packageId: selectedPkg }) }
      );
      await qc.invalidateQueries();
      setMsg(`✅ اشتراك "${res.package}" حتى ${new Date(res.endDate).toLocaleDateString('ar-SA')}`);
      setSubOpen(false);
    } catch (e: any) {
      setMsg('❌ ' + (e?.message ?? 'فشل تفعيل الاشتراك'));
    } finally {
      setLoading(null);
    }
  };

  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 99999, fontFamily: 'monospace', direction: 'ltr' }}>
      {/* toggle */}
      <button onClick={() => { setOpen(o => !o); setMsg(null); }} title="Dev Panel"
        style={{ width: 44, height: 44, borderRadius: '50%', background: '#1e293b', color: '#f8fafc',
          border: '2px solid #6366f1', cursor: 'pointer', fontSize: 20, display: 'flex',
          alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,.4)', marginLeft: 'auto' }}>
        🛠
      </button>

      {open && (
        <div style={{ marginTop: 8, background: '#0f172a', border: '1px solid #334155', borderRadius: 12,
          padding: '14px 16px', minWidth: 230, boxShadow: '0 8px 32px rgba(0,0,0,.6)', color: '#e2e8f0' }}>

          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10, textAlign: 'center' }}>
            ⚠️ DEV ONLY — لا يظهر في الإنتاج
          </div>

          {/* current user */}
          <div style={{ background: '#1e293b', borderRadius: 8, padding: '8px 10px', marginBottom: 12, fontSize: 12 }}>
            {user ? (
              <>
                <div style={{ color: '#a78bfa', fontWeight: 'bold' }}>{user.role === 'admin' ? '👑 Admin' : '👤 User'}</div>
                <div style={{ color: '#94a3b8', marginTop: 2 }}>{user.email}</div>
              </>
            ) : <div style={{ color: '#64748b' }}>غير مسجّل الدخول</div>}
          </div>

          {/* message */}
          {msg && (
            <div style={{ background: '#1e3a2e', borderRadius: 6, padding: '6px 8px', marginBottom: 10, fontSize: 12, color: '#86efac' }}>
              {msg}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Btn label="👑 دخول كمدير"    color="#6366f1" loading={loading === 'admin'}  onClick={() => doLogin('admin')} />
            <Btn label="👤 دخول كمستخدم" color="#0ea5e9" loading={loading === 'user'}   onClick={() => doLogin('user')} />

            {user && (
              <>
                <Btn label="💳 محاكاة اشتراك مدفوع" color="#8b5cf6" loading={loading === 'sub' && !subOpen} onClick={openSubPanel} />

                {subOpen && packages.length > 0 && (
                  <div style={{ background: '#1e293b', borderRadius: 8, padding: 10 }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>اختاري الباقة:</div>
                    <select
                      value={selectedPkg}
                      onChange={e => setSelectedPkg(Number(e.target.value))}
                      style={{ width: '100%', background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155',
                        borderRadius: 6, padding: '5px 8px', fontSize: 12, marginBottom: 8, direction: 'rtl' }}>
                      {packages.filter(p => p.id !== 1).map(p => (
                        <option key={p.id} value={p.id}>{p.nameAr} — {p.price} ر.س</option>
                      ))}
                    </select>
                    <Btn label="✅ تفعيل بدون دفع" color="#10b981" loading={loading === 'sub'} onClick={simulateSub} />
                  </div>
                )}

                <Btn label="🚪 تسجيل خروج" color="#ef4444" loading={loading === 'logout'} onClick={doLogout} />
              </>
            )}

            {user?.role === 'admin' && (
              <Btn label="⚙️ لوحة الإدارة"  color="#f59e0b" loading={false} onClick={() => { setOpen(false); setLocation('/admin'); }} />
            )}
            {user && (
              <Btn label="📊 لوحة التحكم"   color="#10b981" loading={false} onClick={() => { setOpen(false); setLocation('/dashboard'); }} />
            )}
            {user && (
              <Btn label="💬 استشارة قانونية" color="#6366f1" loading={false} onClick={() => { setOpen(false); setLocation('/consultation'); }} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Btn({ label, color, loading, onClick }: {
  label: string; color: string; loading: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} disabled={loading}
      style={{ background: color, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 12px',
        fontSize: 13, fontWeight: 'bold', cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.6 : 1,
        textAlign: 'right', width: '100%' }}>
      {loading ? '...' : label}
    </button>
  );
}
