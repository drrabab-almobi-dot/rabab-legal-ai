import React, { useState, useEffect, useCallback } from 'react';
import { AdminSidebar } from '@/components/layout';
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Skeleton } from '@/components/ui';
import { Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

interface Coupon {
  id: number;
  code: string;
  descriptionAr: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  maxUses: number | null;
  usageCount: number;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
}

export default function AdminCoupons() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    code: '', descriptionAr: '', discountType: 'percentage',
    discountValue: '', maxUses: '', expiresAt: '',
  });

  const fetchCoupons = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/admin/coupons`, { credentials: 'include' });
      if (!r.ok) throw new Error('فشل تحميل الكوبونات');
      setCoupons(await r.json());
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchCoupons(); }, [fetchCoupons]);

  const toggleActive = async (coupon: Coupon) => {
    try {
      const r = await fetch(`${BASE}/api/admin/coupons/${coupon.id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !coupon.isActive }),
      });
      if (!r.ok) throw new Error('فشل التحديث');
      await fetchCoupons();
    } catch (e: any) { setError(e.message); }
  };

  const deleteCoupon = async (id: number) => {
    if (!confirm('هل أنت متأكد من حذف هذا الكوبون؟')) return;
    try {
      const r = await fetch(`${BASE}/api/admin/coupons/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!r.ok) throw new Error('فشل الحذف');
      await fetchCoupons();
    } catch (e: any) { setError(e.message); }
  };

  const createCoupon = async () => {
    setSaving(true); setError(null);
    try {
      const body: Record<string, unknown> = {
        code: form.code.toUpperCase(), descriptionAr: form.descriptionAr,
        discountType: form.discountType, discountValue: parseFloat(form.discountValue),
      };
      if (form.maxUses) body.maxUses = parseInt(form.maxUses);
      if (form.expiresAt) body.expiresAt = form.expiresAt;
      const r = await fetch(`${BASE}/api/admin/coupons`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'فشل الإنشاء');
      setShowForm(false);
      setForm({ code: '', descriptionAr: '', discountType: 'percentage', discountValue: '', maxUses: '', expiresAt: '' });
      await fetchCoupons();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const active = coupons.filter(c => c.isActive).length;
  const totalUsage = coupons.reduce((s, c) => s + c.usageCount, 0);

  return (
    <AdminSidebar>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-primary">إدارة الكوبونات</h1>
          <p className="text-muted-foreground mt-1">رموز الخصم وتتبع استخدامها</p>
        </div>
        <Button className="flex items-center gap-2" onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4" /> كوبون جديد
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-primary">{coupons.length}</p><p className="text-sm text-muted-foreground">الكوبونات</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-green-600">{active}</p><p className="text-sm text-muted-foreground">نشطة</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-blue-600">{totalUsage}</p><p className="text-sm text-muted-foreground">مرة استُخدم</p></CardContent></Card>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm flex justify-between">{error}<button onClick={() => setError(null)} className="font-bold">✕</button></div>}

      {/* Create Form */}
      {showForm && (
        <Card className="mb-6 border-primary/30">
          <CardHeader><CardTitle className="text-base">إنشاء كوبون جديد</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="text-sm font-medium mb-1 block">رمز الكوبون</label><Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="SUMMER25" /></div>
              <div><label className="text-sm font-medium mb-1 block">الوصف</label><Input value={form.descriptionAr} onChange={e => setForm(f => ({ ...f, descriptionAr: e.target.value }))} placeholder="خصم صيفي 25%" /></div>
              <div><label className="text-sm font-medium mb-1 block">نوع الخصم</label>
                <select className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background" value={form.discountType} onChange={e => setForm(f => ({ ...f, discountType: e.target.value }))}>
                  <option value="percentage">نسبة مئوية (%)</option>
                  <option value="fixed">مبلغ ثابت (ريال)</option>
                </select>
              </div>
              <div><label className="text-sm font-medium mb-1 block">قيمة الخصم</label><Input type="number" value={form.discountValue} onChange={e => setForm(f => ({ ...f, discountValue: e.target.value }))} placeholder={form.discountType === 'percentage' ? '25' : '50'} /></div>
              <div><label className="text-sm font-medium mb-1 block">الحد الأقصى للاستخدام (اختياري)</label><Input type="number" value={form.maxUses} onChange={e => setForm(f => ({ ...f, maxUses: e.target.value }))} placeholder="100" /></div>
              <div><label className="text-sm font-medium mb-1 block">تاريخ الانتهاء (اختياري)</label><Input type="date" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} /></div>
            </div>
            <div className="flex gap-3 mt-4">
              <Button onClick={createCoupon} disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'إنشاء الكوبون'}</Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : coupons.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">لا توجد كوبونات بعد</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead className="bg-muted text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="py-3 px-4 font-semibold">الرمز</th>
                    <th className="py-3 px-4 font-semibold">الوصف</th>
                    <th className="py-3 px-4 font-semibold">الخصم</th>
                    <th className="py-3 px-4 font-semibold">الاستخدام</th>
                    <th className="py-3 px-4 font-semibold">الانتهاء</th>
                    <th className="py-3 px-4 font-semibold text-center">الحالة</th>
                    <th className="py-3 px-4 font-semibold text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {coupons.map(c => (
                    <tr key={c.id} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="py-3 px-4"><span className="font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">{c.code}</span></td>
                      <td className="py-3 px-4 text-muted-foreground">{c.descriptionAr}</td>
                      <td className="py-3 px-4 font-semibold">{c.discountValue}{c.discountType === 'percentage' ? '%' : ' ر.س'}</td>
                      <td className="py-3 px-4">{c.usageCount}{c.maxUses ? ` / ${c.maxUses}` : ''}</td>
                      <td className="py-3 px-4 text-muted-foreground">{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString('ar-SA') : '—'}</td>
                      <td className="py-3 px-4 text-center">
                        <button onClick={() => toggleActive(c)} className="text-muted-foreground hover:text-primary">
                          {c.isActive ? <ToggleRight className="w-6 h-6 text-green-500" /> : <ToggleLeft className="w-6 h-6 text-gray-400" />}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button onClick={() => deleteCoupon(c.id)} className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </AdminSidebar>
  );
}
