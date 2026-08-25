import React, { useState, useEffect, useCallback } from 'react';
import { AdminSidebar } from '@/components/layout';
import { Card, CardContent, CardHeader, CardTitle, Button, Input, FramedState, Skeleton } from '@/components/ui';
import { Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { useLang } from '@/hooks/use-language';

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
  const { lang, t } = useLang();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ ar: string; en: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    code: '', descriptionAr: '', discountType: 'percentage',
    discountValue: '', maxUses: '', expiresAt: '',
  });

  const fetchCoupons = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/admin/coupons`, { credentials: 'include' });
      if (!r.ok) throw new Error();
      setCoupons(await r.json());
    } catch { setError({ ar: 'فشل تحميل الكوبونات', en: 'Failed to load coupons' }); }
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
      if (!r.ok) throw new Error();
      await fetchCoupons();
    } catch { setError({ ar: 'فشل تحديث حالة الكوبون', en: 'Failed to update coupon status' }); }
  };

  const deleteCoupon = async (id: number) => {
    if (!confirm(t('هل أنت متأكد من حذف هذا الكوبون؟', 'Are you sure you want to delete this coupon?'))) return;
    try {
      const r = await fetch(`${BASE}/api/admin/coupons/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!r.ok) throw new Error();
      await fetchCoupons();
    } catch { setError({ ar: 'فشل حذف الكوبون', en: 'Failed to delete coupon' }); }
  };

  const createCoupon = async () => {
    if (!form.code.trim()) {
      setError({ ar: 'يرجى إدخال رمز الكوبون', en: 'Please enter a coupon code' });
      return;
    }
    const discountValue = Number(form.discountValue);
    if (!form.discountValue || !Number.isFinite(discountValue) || discountValue <= 0) {
      setError({ ar: 'يرجى إدخال قيمة خصم صحيحة', en: 'Please enter a valid discount value' });
      return;
    }
    if (form.discountType === 'percentage' && discountValue > 100) {
      setError({ ar: 'يجب ألا تتجاوز نسبة الخصم 100٪', en: 'The discount percentage cannot exceed 100%' });
      return;
    }
    if (form.maxUses && (!Number.isInteger(Number(form.maxUses)) || Number(form.maxUses) <= 0)) {
      setError({ ar: 'يجب أن يكون الحد الأقصى للاستخدام عدداً صحيحاً موجباً', en: 'Maximum uses must be a positive whole number' });
      return;
    }
    setSaving(true); setError(null);
    try {
      const body: Record<string, unknown> = {
        code: form.code.toUpperCase(), descriptionAr: form.descriptionAr,
        discountType: form.discountType, discountValue,
      };
      if (form.maxUses) body.maxUses = parseInt(form.maxUses);
      if (form.expiresAt) body.expiresAt = form.expiresAt;
      const r = await fetch(`${BASE}/api/admin/coupons`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      await r.json();
      if (!r.ok) throw new Error();
      setShowForm(false);
      setForm({ code: '', descriptionAr: '', discountType: 'percentage', discountValue: '', maxUses: '', expiresAt: '' });
      await fetchCoupons();
    } catch { setError({ ar: 'فشل إنشاء الكوبون. تحقق من البيانات وحاول مرة أخرى', en: 'Failed to create the coupon. Check the details and try again' }); }
    finally { setSaving(false); }
  };

  const active = coupons.filter(c => c.isActive).length;
  const totalUsage = coupons.reduce((s, c) => s + c.usageCount, 0);

  return (
    <AdminSidebar>
      <div dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-primary">{t('إدارة الكوبونات', 'Coupon management')}</h1>
          <p className="text-muted-foreground mt-1">{t('رموز الخصم وتتبع استخدامها', 'Manage discount codes and track their usage')}</p>
        </div>
        <Button className="flex items-center gap-2" onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4" /> {t('كوبون جديد', 'New coupon')}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 mb-6 sm:grid-cols-3">
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-primary">{coupons.length}</p><p className="text-sm text-muted-foreground">{t('الكوبونات', 'Coupons')}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-green-600">{active}</p><p className="text-sm text-muted-foreground">{t('نشطة', 'Active')}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-blue-600">{totalUsage}</p><p className="text-sm text-muted-foreground">{t('مرة استُخدم', 'Total uses')}</p></CardContent></Card>
      </div>

       {error && <div role="alert" className="mb-4 flex justify-between rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{t(error.ar, error.en)}<button type="button" onClick={() => setError(null)} className="font-bold" aria-label={t('إغلاق رسالة الخطأ', 'Dismiss error')}>✕</button></div>}

      {/* Create Form */}
      {showForm && (
        <Card className="mb-6 border-primary/30">
          <CardHeader><CardTitle className="text-base">{t('إنشاء كوبون جديد', 'Create a new coupon')}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="text-sm font-medium mb-1 block">{t('رمز الكوبون', 'Coupon code')}</label><Input dir="ltr" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="SUMMER25" /></div>
              <div><label className="text-sm font-medium mb-1 block">{t('الوصف', 'Description')}</label><Input dir="auto" value={form.descriptionAr} onChange={e => setForm(f => ({ ...f, descriptionAr: e.target.value }))} placeholder={t('مثال: خصم صيفي 25٪', 'Example: 25% summer discount')} /></div>
              <div><label className="text-sm font-medium mb-1 block">{t('نوع الخصم', 'Discount type')}</label>
                <select className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background" value={form.discountType} onChange={e => setForm(f => ({ ...f, discountType: e.target.value }))}>
                  <option value="percentage">{t('نسبة مئوية (٪)', 'Percentage (%)')}</option>
                  <option value="fixed">{t('مبلغ ثابت (ريال)', 'Fixed amount (SAR)')}</option>
                </select>
              </div>
              <div><label className="text-sm font-medium mb-1 block">{t('قيمة الخصم', 'Discount value')}</label><Input type="number" min="0" max={form.discountType === 'percentage' ? '100' : undefined} value={form.discountValue} onChange={e => setForm(f => ({ ...f, discountValue: e.target.value }))} placeholder={form.discountType === 'percentage' ? '25' : '50'} /></div>
              <div><label className="text-sm font-medium mb-1 block">{t('الحد الأقصى للاستخدام (اختياري)', 'Maximum uses (optional)')}</label><Input type="number" min="1" step="1" value={form.maxUses} onChange={e => setForm(f => ({ ...f, maxUses: e.target.value }))} placeholder="100" /></div>
              <div><label className="text-sm font-medium mb-1 block">{t('تاريخ الانتهاء (اختياري)', 'Expiration date (optional)')}</label><Input dir="ltr" type="date" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} /></div>
            </div>
            <div className="flex gap-3 mt-4">
              <Button onClick={createCoupon} disabled={saving}>{saving ? t('جارٍ الحفظ...', 'Saving...') : t('إنشاء الكوبون', 'Create coupon')}</Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>{t('إلغاء', 'Cancel')}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3" role="status" aria-label={t('جارٍ تحميل الكوبونات', 'Loading coupons')}><span className="sr-only">{t('جارٍ تحميل الكوبونات...', 'Loading coupons...')}</span>{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : coupons.length === 0 ? (
            <FramedState title={t('لا توجد كوبونات بعد', 'No coupons yet')} className="m-4 min-h-28" />
          ) : (
            <div className="overflow-x-auto">
              <table className={`w-full text-sm ${lang === 'ar' ? 'text-right' : 'text-left'}`}>
                <thead className="bg-muted text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="py-3 px-4 font-semibold">{t('الرمز', 'Code')}</th>
                    <th className="py-3 px-4 font-semibold">{t('الوصف', 'Description')}</th>
                    <th className="py-3 px-4 font-semibold">{t('الخصم', 'Discount')}</th>
                    <th className="py-3 px-4 font-semibold">{t('الاستخدام', 'Usage')}</th>
                    <th className="py-3 px-4 font-semibold">{t('الانتهاء', 'Expiration')}</th>
                    <th className="py-3 px-4 font-semibold text-center">{t('الحالة', 'Status')}</th>
                    <th className="py-3 px-4 font-semibold text-center">{t('إجراءات', 'Actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {coupons.map(c => (
                    <tr key={c.id} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="py-3 px-4"><span dir="ltr" className="inline-block font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">{c.code}</span></td>
                      <td dir="auto" className="py-3 px-4 text-muted-foreground">{c.descriptionAr}</td>
                      <td dir="ltr" className="py-3 px-4 font-semibold">{c.discountValue}{c.discountType === 'percentage' ? '%' : ` ${t('ر.س', 'SAR')}`}</td>
                      <td dir="ltr" className="py-3 px-4">{c.usageCount}{c.maxUses ? ` / ${c.maxUses}` : ''}</td>
                      <td className="py-3 px-4 text-muted-foreground">{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US') : '—'}</td>
                      <td className="py-3 px-4 text-center">
                        <button onClick={() => toggleActive(c)} className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary" title={c.isActive ? t('إلغاء تفعيل الكوبون', 'Deactivate coupon') : t('تفعيل الكوبون', 'Activate coupon')} aria-label={c.isActive ? t('نشط؛ إلغاء تفعيل الكوبون', 'Active; deactivate coupon') : t('غير نشط؛ تفعيل الكوبون', 'Inactive; activate coupon')}>
                          {c.isActive ? <ToggleRight className="w-6 h-6 text-green-500" /> : <ToggleLeft className="w-6 h-6 text-gray-400" />}
                          <span className="text-xs">{c.isActive ? t('نشط', 'Active') : t('غير نشط', 'Inactive')}</span>
                        </button>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button onClick={() => deleteCoupon(c.id)} className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50" title={t('حذف الكوبون', 'Delete coupon')} aria-label={t('حذف الكوبون', 'Delete coupon')}><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </AdminSidebar>
  );
}
