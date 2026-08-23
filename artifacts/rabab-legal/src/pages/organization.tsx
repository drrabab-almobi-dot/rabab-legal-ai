/**
 * صفحة إدارة المنشأة — Organization Management
 * - المالك: ينشئ المنشأة، يدعو الموظفين، يرى استهلاكهم، يزيل الأعضاء
 * - العضو: يرى بيانات المنشأة والحصة المشتركة
 * - زائر الرابط: يقبل دعوة الانضمام
 */
import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { Navbar, Footer } from '@/components/layout';
import { Button, Card, CardContent, CardHeader, CardTitle, Badge, Input } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const apiFetch = (path: string, init?: RequestInit) =>
  fetch(`${API_BASE}${path}`, { credentials: 'include', ...init });
import {
  Building2, UserPlus, Users, Trash2, Mail, CheckCircle2,
  Clock, AlertCircle, BarChart2, RefreshCw, LogIn
} from 'lucide-react';
import { format } from 'date-fns';
import { arSA } from 'date-fns/locale';

// ── Types ──────────────────────────────────────────────────────────────────────
interface OrgInfo {
  role: 'owner' | 'member';
  org: { id: number; name: string; ownerId: number; createdAt: string };
  memberCount?: number;
  subscription: {
    consultationsAllowed: number;
    consultationsUsed: number;
    contractsAllowed: number;
    contractsUsed: number;
    endDate?: string | null;
  } | null;
}

interface Member {
  id: number;
  userId: number | null;
  email: string;
  name: string | null;
  status: string;
  invitedAt: string;
  joinedAt: string | null;
  usageThisMonth: number;
}

// ── Invite Token Accept view (when /join-org?token=xxx) ───────────────────────
function JoinOrgView({ token }: { token: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const { data: invite, isLoading, isError } = useQuery({
    queryKey: ['org-invite', token],
    queryFn: async () => {
      const r = await apiFetch(`/api/organizations/join/${token}`);
      if (!r.ok) throw new Error('رابط غير صالح');
      return r.json() as Promise<{ email: string; orgName: string }>;
    },
  });

  const joinMut = useMutation({
    mutationFn: async () => {
      const r = await apiFetch(`/api/organizations/join/${token}`, { method: 'POST' });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error); }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: 'تم الانضمام بنجاح', description: 'أصبحت الآن عضواً في المنشأة' });
      qc.invalidateQueries({ queryKey: ['org-my'] });
      setLocation('/organization');
    },
    onError: (e: Error) => toast({ title: 'خطأ', description: e.message, variant: 'destructive' }),
  });

  if (isLoading) return (
    <div className="min-h-screen flex flex-col"><Navbar />
      <main className="flex-1 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </main>
    </div>
  );

  if (isError || !invite) return (
    <div className="min-h-screen flex flex-col"><Navbar />
      <main className="flex-1 flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">رابط غير صالح</h2>
            <p className="text-muted-foreground">رابط الدعوة غير موجود أو انتهت صلاحيته.</p>
          </CardContent>
        </Card>
      </main>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col"><Navbar />
      <main className="flex-1 flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <Building2 className="w-12 h-12 text-primary mx-auto mb-2" />
            <CardTitle>دعوة للانضمام إلى منشأة</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-lg">
              تمت دعوتك للانضمام إلى منشأة <strong>{invite.orgName}</strong>
            </p>
            <p className="text-sm text-muted-foreground">البريد المدعو: {invite.email}</p>

            {!user ? (
              <div className="space-y-3">
                <p className="text-muted-foreground text-sm">يجب تسجيل الدخول بالبريد المدعو أولاً</p>
                <Button className="w-full gap-2" onClick={() => setLocation(`/login?returnTo=/join-org?token=${token}`)}>
                  <LogIn className="w-4 h-4" /> تسجيل الدخول
                </Button>
              </div>
            ) : user.email !== invite.email ? (
              <div className="p-3 bg-amber-50 text-amber-800 rounded-lg text-sm">
                أنت مسجل دخولك بالبريد <strong>{user.email}</strong>، لكن الدعوة لـ <strong>{invite.email}</strong>.
                يرجى تسجيل الدخول بالحساب الصحيح.
              </div>
            ) : (
              <Button
                className="w-full gap-2"
                onClick={() => joinMut.mutate()}
                disabled={joinMut.isPending}
              >
                {joinMut.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                قبول الدعوة والانضمام
              </Button>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

// ── Create Org form ────────────────────────────────────────────────────────────
function CreateOrgForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const { toast } = useToast();
  const mut = useMutation({
    mutationFn: async () => {
      const r = await apiFetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error); }
      return r.json();
    },
    onSuccess: () => { toast({ title: 'تم إنشاء المنشأة بنجاح' }); onCreated(); },
    onError: (e: Error) => toast({ title: 'خطأ', description: e.message, variant: 'destructive' }),
  });

  return (
    <Card className="max-w-lg mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-primary" /> إنشاء منشأة جديدة
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          باقة الأعمال تتيح لك إنشاء حساب منشأة وإضافة موظفيك؛ جميعكم تستفيدون من حصة الاشتراك الواحد.
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="اسم المنشأة أو الشركة"
            value={name}
            onChange={e => setName(e.target.value)}
            className="flex-1"
            onKeyDown={e => e.key === 'Enter' && name.trim() && mut.mutate()}
          />
          <Button onClick={() => mut.mutate()} disabled={!name.trim() || mut.isPending}>
            {mut.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'إنشاء'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Quota Bar ──────────────────────────────────────────────────────────────────
function QuotaBar({ used, allowed, label }: { used: number; allowed: number; label: string }) {
  const pct = allowed > 0 ? Math.min(100, (used / allowed) * 100) : 0;
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-primary';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{used} / {allowed}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Status badge ───────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  if (status === 'active') return <Badge className="bg-green-500 hover:bg-green-600 text-white gap-1"><CheckCircle2 className="w-3 h-3" /> عضو نشط</Badge>;
  if (status === 'pending') return <Badge variant="secondary" className="gap-1"><Clock className="w-3 h-3" /> بانتظار القبول</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">مُزال</Badge>;
}

// ── Members table ──────────────────────────────────────────────────────────────
function MembersTable({ orgId, members, onRemove }: { orgId: number; members: Member[]; onRemove: (id: number) => void }) {
  const fmt = (d: string) => { try { return format(new Date(d), 'dd MMM yyyy', { locale: arSA }); } catch { return d; } };
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="text-right py-2 pr-2 font-medium">الموظف</th>
            <th className="text-right py-2 font-medium">الحالة</th>
            <th className="text-right py-2 font-medium">الاستهلاك (هذا الشهر)</th>
            <th className="text-right py-2 font-medium">تاريخ الانضمام</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {members.map(m => (
            <tr key={m.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
              <td className="py-3 pr-2">
                <div className="font-medium">{m.name ?? '—'}</div>
                <div className="text-muted-foreground text-xs">{m.email}</div>
              </td>
              <td className="py-3"><StatusBadge status={m.status} /></td>
              <td className="py-3">
                {m.status === 'active'
                  ? <span className="font-medium">{m.usageThisMonth} خدمة</span>
                  : <span className="text-muted-foreground">—</span>}
              </td>
              <td className="py-3 text-muted-foreground">
                {m.joinedAt ? fmt(m.joinedAt) : m.status === 'pending' ? `مدعو ${fmt(m.invitedAt)}` : '—'}
              </td>
              <td className="py-3 text-left pl-2">
                {m.status !== 'removed' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 px-2"
                    onClick={() => onRemove(m.id)}
                    title="إزالة العضو"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Owner view ─────────────────────────────────────────────────────────────────
function OwnerView({ info }: { info: OrgInfo }) {
  const [email, setEmail] = useState('');
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: membersData, isLoading: membersLoading, refetch } = useQuery({
    queryKey: ['org-members'],
    queryFn: async () => {
      const r = await apiFetch('/api/organizations/members');
      if (!r.ok) throw new Error('فشل تحميل الأعضاء');
      return r.json() as Promise<{ members: Member[] }>;
    },
  });

  const inviteMut = useMutation({
    mutationFn: async () => {
      const r = await apiFetch('/api/organizations/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error); }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: 'تم إرسال الدعوة', description: `أُرسلت دعوة إلى ${email}` });
      setEmail('');
      refetch();
    },
    onError: (e: Error) => toast({ title: 'خطأ', description: e.message, variant: 'destructive' }),
  });

  const removeMut = useMutation({
    mutationFn: async (memberId: number) => {
      const r = await apiFetch(`/api/organizations/members/${memberId}`, { method: 'DELETE' });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error); }
    },
    onSuccess: () => { toast({ title: 'تمت إزالة العضو' }); refetch(); },
    onError: (e: Error) => toast({ title: 'خطأ', description: e.message, variant: 'destructive' }),
  });

  const sub = info.subscription;
  const activeCount = membersData?.members.filter(m => m.status === 'active').length ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
            <Building2 className="w-6 h-6" /> {info.org.name}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">لوحة إدارة المنشأة</p>
        </div>
        <Badge variant="outline" className="gap-1 text-sm px-3 py-1">
          <Users className="w-3.5 h-3.5" /> {activeCount} عضو نشط
        </Badge>
      </div>

      {/* Quota overview */}
      {sub && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-primary" /> استهلاك الحصة المشتركة
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <QuotaBar used={sub.consultationsUsed} allowed={sub.consultationsAllowed} label="الاستشارات القانونية" />
            <QuotaBar used={sub.contractsUsed} allowed={sub.contractsAllowed} label="صياغة العقود" />
            {sub.endDate && (
              <p className="text-xs text-muted-foreground pt-1">
                تجدد الاشتراك: {format(new Date(sub.endDate), 'dd MMMM yyyy', { locale: arSA })}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Invite form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-primary" /> دعوة موظف جديد
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Mail className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="email"
                placeholder="البريد الإلكتروني للموظف"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="pr-9"
                onKeyDown={e => e.key === 'Enter' && email && inviteMut.mutate()}
              />
            </div>
            <Button
              onClick={() => inviteMut.mutate()}
              disabled={!email || inviteMut.isPending}
              className="gap-2"
            >
              {inviteMut.isPending
                ? <RefreshCw className="w-4 h-4 animate-spin" />
                : <UserPlus className="w-4 h-4" />}
              إرسال الدعوة
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            سيصل للموظف بريد يحتوي على رابط للانضمام إلى حساب المنشأة
          </p>
        </CardContent>
      </Card>

      {/* Members list */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" /> أعضاء الفريق
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => refetch()} className="h-8 gap-1 text-muted-foreground">
            <RefreshCw className="w-3.5 h-3.5" /> تحديث
          </Button>
        </CardHeader>
        <CardContent>
          {membersLoading ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : !membersData?.members.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>لا يوجد أعضاء بعد — أرسل دعوات لموظفيك</p>
            </div>
          ) : (
            <MembersTable
              orgId={info.org.id}
              members={membersData.members.filter(m => m.status !== 'removed')}
              onRemove={id => removeMut.mutate(id)}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Member view ────────────────────────────────────────────────────────────────
function MemberView({ info }: { info: OrgInfo }) {
  const sub = info.subscription;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
          <Building2 className="w-6 h-6" /> {info.org.name}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">أنت عضو في هذه المنشأة</p>
      </div>

      {sub && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-primary" /> الحصة المشتركة للفريق
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              تستهلك أنت وزملاؤك من حصة اشتراك المنشأة الموحد
            </p>
            <QuotaBar used={sub.consultationsUsed} allowed={sub.consultationsAllowed} label="الاستشارات القانونية" />
            <QuotaBar used={sub.contractsUsed} allowed={sub.contractsAllowed} label="صياغة العقود" />
            {sub.endDate && (
              <p className="text-xs text-muted-foreground pt-1">
                تجدد الاشتراك: {format(new Date(sub.endDate), 'dd MMMM yyyy', { locale: arSA })}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {!sub && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="text-amber-800 text-sm">اشتراك المنشأة غير نشط حالياً — تواصل مع مسؤول الحساب</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── No-org view ────────────────────────────────────────────────────────────────
function NoOrgView() {
  const qc = useQueryClient();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">حساب المنشأة</h1>
        <p className="text-muted-foreground mt-1">أضف موظفيك وشاركهم حصة اشتراكك</p>
      </div>
      <CreateOrgForm onCreated={() => qc.invalidateQueries({ queryKey: ['org-my'] })} />
      <Card className="bg-muted/40 border-dashed">
        <CardContent className="pt-6 space-y-3 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">كيف يعمل نظام المنشآت؟</p>
          <ul className="space-y-1.5 list-disc list-inside">
            <li>أنت صاحب الاشتراك والمسؤول عن الفوترة</li>
            <li>تدعو موظفيك عبر بريدهم الإلكتروني</li>
            <li>جميع الأعضاء يستهلكون من حصة اشتراك واحدة</li>
            <li>ترى استهلاك كل موظف بشكل منفصل</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function OrganizationPage() {
  const [location] = useLocation();

  // هل نحن في صفحة قبول دعوة؟
  const params = new URLSearchParams(window.location.search);
  const inviteToken = params.get('token');

  const { data: orgInfo, isLoading, isError } = useQuery({
    queryKey: ['org-my'],
    queryFn: async () => {
      const r = await apiFetch('/api/organizations/my');
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('فشل تحميل بيانات المنشأة');
      return r.json() as Promise<OrgInfo>;
    },
    retry: false,
  });

  // صفحة قبول الدعوة لا تحتاج نافبار شاملاً
  if (inviteToken) return <JoinOrgView token={inviteToken} />;

  return (
    <div className="min-h-screen flex flex-col bg-muted/20">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <RefreshCw className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : isError ? (
          <Card className="border-destructive/20">
            <CardContent className="pt-6 text-center text-destructive">
              <AlertCircle className="w-8 h-8 mx-auto mb-2" />
              <p>تعذّر تحميل بيانات المنشأة</p>
            </CardContent>
          </Card>
        ) : orgInfo ? (
          orgInfo.role === 'owner'
            ? <OwnerView info={orgInfo} />
            : <MemberView info={orgInfo} />
        ) : (
          <NoOrgView />
        )}
      </main>
      <Footer />
    </div>
  );
}
