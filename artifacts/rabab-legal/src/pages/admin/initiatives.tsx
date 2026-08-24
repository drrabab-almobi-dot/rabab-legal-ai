/**
 * Admin: إدارة المبادرات المجتمعية
 * إضافة وتعديل وحذف بطاقات المبادرات من لوحة الإدارة
 */
import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, Loader2, Save, X, GripVertical, ExternalLink, Eye, EyeOff } from "lucide-react";

const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface Initiative {
  id: number;
  title: string;
  description: string | null;
  icon: string;
  rawUrl: string;
  utmCampaign: string | null;
  displayOrder: number;
  isActive: boolean;
}

const EMPTY: Omit<Initiative, "id" | "displayOrder" | "isActive"> = {
  title: "",
  description: "",
  icon: "🌐",
  rawUrl: "",
  utmCampaign: "",
};

export default function AdminInitiativesPage() {
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");

  const fetchList = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/admin/initiatives`, { credentials: "include" });
      const d = await r.json();
      setInitiatives(d.initiatives ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchList(); }, []);

  const openNew = () => {
    setEditingId(null);
    setForm({ ...EMPTY });
    setError("");
    setShowForm(true);
  };

  const openEdit = (init: Initiative) => {
    setEditingId(init.id);
    setForm({
      title: init.title,
      description: init.description ?? "",
      icon: init.icon,
      rawUrl: init.rawUrl,
      utmCampaign: init.utmCampaign ?? "",
    });
    setError("");
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.rawUrl.trim()) {
      setError("العنوان والرابط مطلوبان");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (editingId) {
        await fetch(`${API_BASE}/api/admin/initiatives/${editingId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: form.title, description: form.description, icon: form.icon, url: form.rawUrl, utmCampaign: form.utmCampaign }),
        });
      } else {
        await fetch(`${API_BASE}/api/admin/initiatives`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: form.title, description: form.description, icon: form.icon, url: form.rawUrl, utmCampaign: form.utmCampaign }),
        });
      }
      setShowForm(false);
      fetchList();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (init: Initiative) => {
    await fetch(`${API_BASE}/api/admin/initiatives/${init.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !init.isActive }),
    });
    fetchList();
  };

  const handleDelete = async (init: Initiative) => {
    if (!confirm(`حذف "${init.title}"؟`)) return;
    await fetch(`${API_BASE}/api/admin/initiatives/${init.id}`, { method: "DELETE", credentials: "include" });
    fetchList();
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">المبادرات المجتمعية</h1>
          <p className="text-sm text-muted-foreground">إضافة وتعديل بطاقات المبادرات الظاهرة للمستخدمين</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          إضافة مبادرة
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-card border border-border/60 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">{editingId ? "تعديل المبادرة" : "مبادرة جديدة"}</h2>
            <button onClick={() => setShowForm(false)} className="p-1 rounded-lg hover:bg-muted/50 text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">الأيقونة (emoji)</label>
              <input
                value={form.icon}
                onChange={e => setForm(p => ({ ...p, icon: e.target.value }))}
                className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:border-primary"
                placeholder="🌐"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">العنوان *</label>
              <input
                value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:border-primary"
                placeholder="اسم المبادرة"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-foreground mb-1">الوصف</label>
              <textarea
                value={form.description ?? ''}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                className="w-full h-20 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none"
                placeholder="وصف مختصر للمبادرة..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">الرابط * (# إذا قريباً)</label>
              <input
                value={form.rawUrl}
                onChange={e => setForm(p => ({ ...p, rawUrl: e.target.value }))}
                className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:border-primary"
                placeholder="https://example.com أو #"
                dir="ltr"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">utm_campaign</label>
              <input
                value={form.utmCampaign ?? ''}
                onChange={e => setForm(p => ({ ...p, utmCampaign: e.target.value }))}
                className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:border-primary"
                placeholder="initiative_name"
                dir="ltr"
              />
            </div>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              حفظ
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-border rounded-xl text-sm text-muted-foreground hover:bg-muted/30 transition-colors">
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-10 gap-3 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">جارٍ التحميل...</span>
        </div>
      ) : initiatives.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">لا توجد مبادرات بعد</div>
      ) : (
        <div className="space-y-3">
          {initiatives.map(init => (
            <div key={init.id} className="flex items-center gap-3 bg-card border border-border/60 rounded-2xl px-4 py-3">
              <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-xl shrink-0">
                {init.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`text-sm font-semibold ${!init.isActive ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                    {init.title}
                  </p>
                  {!init.isActive && <span className="text-xs text-muted-foreground">(مخفية)</span>}
                </div>
                <p className="text-xs text-muted-foreground truncate">{init.rawUrl}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {init.rawUrl !== "#" && (
                  <a href={init.rawUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                <button onClick={() => toggleActive(init)} className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground" title={init.isActive ? "إخفاء" : "إظهار"}>
                  {init.isActive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>
                <button onClick={() => openEdit(init)} className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleDelete(init)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
