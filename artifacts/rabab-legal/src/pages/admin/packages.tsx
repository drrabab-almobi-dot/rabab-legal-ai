import React, { useState, useEffect, useCallback } from 'react';
import { AdminSidebar } from '@/components/layout';
import { Card, CardContent, CardHeader, CardTitle, Badge, Button, Input, Skeleton } from '@/components/ui';
import { Plus, Edit2, Power, Star } from 'lucide-react';
import { useLang } from '@/hooks/use-language';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

interface Package {
  id: number;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  price: number;
  questionsAllowed: number;
  type: 'free' | 'questions' | 'monthly' | 'business';
  isActive: boolean;
  isPopular: boolean;
  features: string[];
  sortOrder: number;
}


const TYPE_COLORS: Record<string, string> = {
  free: 'bg-muted text-foreground border border-border',
  questions: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  monthly: 'bg-green-500/20 text-green-300 border border-green-500/30',
  business: 'bg-purple-500/20 text-purple-300 border border-purple-500/30',
};

export default function AdminPackages() {
  const { lang, t } = useLang();
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editPkg, setEditPkg] = useState<Package | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    nameAr: '', nameEn: '', descriptionAr: '', price: '',
    questionsAllowed: '', type: 'monthly', isActive: true, isPopular: false,
    sortOrder: '0', features: '',
  });

  const fetchPackages = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/admin/packages`, { credentials: 'include' });
      if (!r.ok) throw new Error('فشل تحميل الباقات');
      setPackages(await r.json());
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchPackages(); }, [fetchPackages]);

  const toggleActive = async (pkg: Package) => {
    try {
      const r = await fetch(`${BASE}/api/admin/packages/${pkg.id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !pkg.isActive }),
      });
      if (!r.ok) throw new Error('فشل التحديث');
      await fetchPackages();
    } catch (e: any) { setError(e.message); }
  };

  const openCreate = () => {
    setEditPkg(null);
    setForm({ nameAr: '', nameEn: '', descriptionAr: '', price: '', questionsAllowed: '', type: 'monthly', isActive: true, isPopular: false, sortOrder: String(packages.length), features: '' });
    setShowForm(true);
  };

  const openEdit = (pkg: Package) => {
    setEditPkg(pkg);
    setForm({ nameAr: pkg.nameAr, nameEn: pkg.nameEn, descriptionAr: pkg.descriptionAr, price: String(pkg.price), questionsAllowed: String(pkg.questionsAllowed), type: pkg.type, isActive: pkg.isActive, isPopular: pkg.isPopular, sortOrder: String(pkg.sortOrder), features: pkg.features.join('\n') });
    setShowForm(true);
  };

  const savePackage = async () => {
    setSaving(true);
    setError(null);
    try {
      const body = {
        nameAr: form.nameAr, nameEn: form.nameEn, descriptionAr: form.descriptionAr,
        price: parseFloat(form.price), questionsAllowed: parseInt(form.questionsAllowed),
        type: form.type, isActive: form.isActive, isPopular: form.isPopular,
        sortOrder: parseInt(form.sortOrder),
        features: form.features.split('\n').map(s => s.trim()).filter(Boolean),
      };
      const url = editPkg ? `${BASE}/api/admin/packages/${editPkg.id}` : `${BASE}/api/admin/packages`;
      const r = await fetch(url, {
        method: editPkg ? 'PATCH' : 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'فشل الحفظ');
      setShowForm(false);
      await fetchPackages();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <AdminSidebar>
      <div dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-primary">{t('إدارة الباقات', 'Package management')}</h1>
          <p className="text-muted-foreground mt-1">{t('تحكم في خطط الاشتراك وأسعارها', 'Manage subscription plans and prices')}</p>
        </div>
        <Button className="flex items-center gap-2" onClick={openCreate}>
          <Plus className="w-4 h-4" /> {t('باقة جديدة', 'New package')}
        </Button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm flex justify-between">
          {error} <button onClick={() => setError(null)} className="font-bold">✕</button>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <Card className="mb-6 border-primary/30">
          <CardHeader>
            <CardTitle className="text-base">{editPkg ? t('تعديل الباقة', 'Edit package') : t('إنشاء باقة جديدة', 'Create package')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="text-sm font-medium mb-1 block">{t('الاسم بالعربية', 'Arabic name')}</label><Input value={form.nameAr} onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))} placeholder={t('مثال: الباقة الشهرية', 'Example: Monthly plan')} /></div>
              <div><label className="text-sm font-medium mb-1 block">{t('الاسم بالإنجليزية', 'English name')}</label><Input dir="ltr" value={form.nameEn} onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))} placeholder="Monthly Plan" /></div>
              <div><label className="text-sm font-medium mb-1 block">{t('الوصف', 'Description')}</label><Input value={form.descriptionAr} onChange={e => setForm(f => ({ ...f, descriptionAr: e.target.value }))} /></div>
              <div><label className="text-sm font-medium mb-1 block">{t('السعر (ريال)', 'Price (SAR)')}</label><Input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} /></div>
              <div><label className="text-sm font-medium mb-1 block">{t('عدد الأسئلة (999 = غير محدود)', 'Questions (999 = unlimited)')}</label><Input type="number" value={form.questionsAllowed} onChange={e => setForm(f => ({ ...f, questionsAllowed: e.target.value }))} /></div>
              <div><label className="text-sm font-medium mb-1 block">{t('النوع', 'Type')}</label>
                <select className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  {Object.entries({ free: t('مجاني', 'Free'), questions: t('بالسؤال', 'Per question'), monthly: t('شهري', 'Monthly'), business: t('أعمال', 'Business') }).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div><label className="text-sm font-medium mb-1 block">{t('الترتيب', 'Sort order')}</label><Input type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))} /></div>
              <div className="flex items-center gap-6 mt-6">
                <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} /> {t('مفعّلة', 'Active')}</label>
                <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={form.isPopular} onChange={e => setForm(f => ({ ...f, isPopular: e.target.checked }))} /> {t('الأكثر شعبية', 'Most popular')}</label>
              </div>
              <div className="md:col-span-2"><label className="text-sm font-medium mb-1 block">{t('المميزات (سطر لكل ميزة)', 'Features (one per line)')}</label><textarea className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background" rows={4} value={form.features} onChange={e => setForm(f => ({ ...f, features: e.target.value }))} /></div>
            </div>
            <div className="flex gap-3 mt-4">
              <Button onClick={savePackage} disabled={saving}>{saving ? t('جارٍ الحفظ...', 'Saving...') : t('حفظ', 'Save')}</Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>{t('إلغاء', 'Cancel')}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading ? [1,2,3,4].map(i => <Card key={i}><CardContent className="p-6"><Skeleton className="h-32 w-full" /></CardContent></Card>) :
          packages.map(pkg => (
            <Card key={pkg.id} className={`border ${pkg.isActive ? 'border-border' : 'border-border/30 opacity-60'}`}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-primary text-lg">{lang === 'ar' ? pkg.nameAr : pkg.nameEn}</h3>
                      {pkg.isPopular && <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />}
                    </div>
                    <p className="text-xs text-muted-foreground">{lang === 'ar' ? pkg.nameEn : pkg.nameAr}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded font-medium ${TYPE_COLORS[pkg.type]}`}>{({ free: t('مجاني', 'Free'), questions: t('بالسؤال', 'Per question'), monthly: t('شهري', 'Monthly'), business: t('أعمال', 'Business') })[pkg.type]}</span>
                </div>
                <p className="text-sm text-muted-foreground mb-3">{pkg.descriptionAr}</p>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-2xl font-bold text-primary">{pkg.price} <span className="text-sm font-normal">{t('ر.س', 'SAR')}</span></span>
                  <span className="text-sm text-muted-foreground">{pkg.questionsAllowed >= 999 ? t('غير محدود', 'Unlimited') : `${pkg.questionsAllowed} ${t('سؤال', 'questions')}`}</span>
                </div>
                {pkg.features.length > 0 && (
                  <ul className="text-xs text-muted-foreground space-y-1 mb-4">
                    {pkg.features.slice(0, 3).map((f, i) => <li key={i}>✓ {f}</li>)}
                     {pkg.features.length > 3 && <li className="text-muted-foreground/60">+{pkg.features.length - 3} {t('مزايا أخرى', 'more features')}</li>}
                  </ul>
                )}
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => openEdit(pkg)}><Edit2 className="w-3 h-3" /> {t('تعديل', 'Edit')}</Button>
                  <Button size="sm" variant={pkg.isActive ? 'destructive' : 'outline'} className="flex-1 gap-1" onClick={() => toggleActive(pkg)}><Power className="w-3 h-3" /> {pkg.isActive ? t('تعطيل', 'Disable') : t('تفعيل', 'Enable')}</Button>
                </div>
              </CardContent>
            </Card>
          ))
        }
      </div>
      </div>
    </AdminSidebar>
  );
}
