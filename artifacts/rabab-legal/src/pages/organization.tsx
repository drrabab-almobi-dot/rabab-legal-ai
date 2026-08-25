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
import { useLang } from '@/hooks/use-language';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const apiFetch = (path: string, init?: RequestInit) =>
  fetch(`${API_BASE}${path}`, { credentials: 'include', ...init });
import {
  Building2, UserPlus, Users, Trash2, Mail, CheckCircle2,
  Clock, AlertCircle, BarChart2, RefreshCw, LogIn
} from 'lucide-react';
import { format } from 'date-fns';
import { arSA, enUS } from 'date-fns/locale';

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
  const { lang, t } = useLang();
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const { data: invite, isLoading, isError } = useQuery({
    queryKey: ['org-invite', token],
    queryFn: async () => {
      const r = await apiFetch(`/api/organizations/join/${token}`);
      if (!r.ok) throw new Error(t('رابط غير صالح', 'Invalid link'));
      return r.json() as Promise<{ email: string; orgName: string }>;
    },
  });

  const joinMut = useMutation({
    mutationFn: async () => {
      const r = await apiFetch(`/api/organizations/join/${token}`, { method: 'POST' });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(lang === 'ar' ? (e.error || t('تعذّر الانضمام إلى المنشأة', 'Could not join the organization')) : t('تعذّر الانضمام إلى المنشأة', 'Could not join the organization'));
      }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: t('تم الانضمام بنجاح', 'Joined successfully'), description: t('أصبحت الآن عضواً في المنشأة', 'You are now a member of the organization') });
      qc.invalidateQueries({ queryKey: ['org-my'] });
      setLocation('/organization');
    },
    onError: (e: Error) => toast({ title: t('خطأ', 'Error'), description: e.message || t('تعذّر الانضمام إلى المنشأة', 'Could not join the organization'), variant: 'destructive' }),
  });

  if (isLoading) return (
    <div className="min-h-screen flex flex-col" dir={lang === 'ar' ? 'rtl' : 'ltr'}><Navbar />
      <main className="flex-1 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
        <span className="sr-only">{t('جارٍ تحميل الدعوة', 'Loading invitation')}</span>
      </main>
    </div>
  );

  if (isError || !invite) return (
    <div className="min-h-screen flex flex-col" dir={lang === 'ar' ? 'rtl' : 'ltr'}><Navbar />
      <main className="flex-1 flex items-center justify-center">
        <Card className="max-w-md w-full mx-4 border-2 border-destructive/45 shadow-lg shadow-destructive/10">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">{t('رابط غير صالح', 'Invalid link')}</h2>
            <p className="text-muted-foreground">{t('رابط الدعوة غير موجود أو انتهت صلاحيته.', 'This invitation link does not exist or has expired.')}</p>
          </CardContent>
        </Card>
      </main>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col" dir={lang === 'ar' ? 'rtl' : 'ltr'}><Navbar />
      <main className="flex-1 flex items-center justify-center px-4">
        <Card className="max-w-md w-full border-2 border-primary/55 shadow-lg shadow-primary/10">
          <CardHeader className="text-center">
            <Building2 className="w-12 h-12 text-primary mx-auto mb-2" />
            <CardTitle>{t('دعوة للانضمام إلى منشأة', 'Organization invitation')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-lg">
              {t('تمت دعوتك للانضمام إلى منشأة', 'You have been invited to join')} <strong dir="auto">{invite.orgName}</strong>
            </p>
            <p className="text-sm text-muted-foreground">{t('البريد المدعو:', 'Invited email:')} <span dir="ltr">{invite.email}</span></p>

            {!user ? (
              <div className="space-y-3">
                <p className="text-muted-foreground text-sm">{t('يجب تسجيل الدخول بالبريد المدعو أولاً', 'You must first sign in with the invited email')}</p>
                <Button className="w-full gap-2" onClick={() => setLocation(`/login?returnTo=/join-org?token=${token}`)}>
                  <LogIn className="w-4 h-4" /> {t('تسجيل الدخول', 'Sign in')}
                </Button>
              </div>
            ) : user.email !== invite.email ? (
              <div className="p-3 bg-amber-50 text-amber-800 rounded-lg text-sm">
                {t('أنت مسجل دخولك بالبريد', 'You are signed in as')} <strong dir="ltr">{user.email}</strong>{t('، لكن الدعوة لـ', ', but this invitation is for')} <strong dir="ltr">{invite.email}</strong>.
                {' '}{t('يرجى تسجيل الدخول بالحساب الصحيح.', 'Please sign in with the correct account.')}
              </div>
            ) : (
              <Button
                className="w-full gap-2"
                onClick={() => joinMut.mutate()}
                disabled={joinMut.isPending}
              >
                {joinMut.isPending ? <><RefreshCw className="w-4 h-4 animate-spin" /><span className="sr-only">{t('جارٍ قبول الدعوة', 'Accepting invitation')}</span></> : <CheckCircle2 className="w-4 h-4" />}
                {t('قبول الدعوة والانضمام', 'Accept invitation and join')}
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
  const { lang, t } = useLang();
  const [name, setName] = useState('');
  const { toast } = useToast();
  const mut = useMutation({
    mutationFn: async () => {
      const r = await apiFetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(lang === 'ar' ? (e.error || t('تعذّر إنشاء المنشأة', 'Could not create the organization')) : t('تعذّر إنشاء المنشأة', 'Could not create the organization'));
      }
      return r.json();
    },
    onSuccess: () => { toast({ title: t('تم إنشاء المنشأة بنجاح', 'Organization created successfully') }); onCreated(); },
    onError: (e: Error) => toast({ title: t('خطأ', 'Error'), description: e.message || t('تعذّر إنشاء المنشأة', 'Could not create the organization'), variant: 'destructive' }),
  });

  return (
    <Card className="max-w-lg mx-auto border-2 border-primary/55 shadow-md shadow-primary/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-primary" /> {t('إنشاء منشأة جديدة', 'Create a new organization')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          {t('باقة الأعمال تتيح لك إنشاء حساب منشأة وإضافة موظفيك؛ جميعكم تستفيدون من حصة الاشتراك الواحد.', 'The Business plan lets you create an organization account and add employees, all sharing one subscription quota.')}
        </p>
        <div className="flex gap-2">
          <Input
            placeholder={t('اسم المنشأة أو الشركة', 'Organization or company name')}
            dir="auto"
            value={name}
            onChange={e => setName(e.target.value)}
            className="flex-1"
            onKeyDown={e => e.key === 'Enter' && name.trim() && mut.mutate()}
          />
          <Button onClick={() => mut.mutate()} disabled={!name.trim() || mut.isPending}>
            {mut.isPending ? <><RefreshCw className="w-4 h-4 animate-spin" /><span className="sr-only">{t('جارٍ إنشاء المنشأة', 'Creating organization')}</span></> : t('إنشاء', 'Create')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Quota Bar ──────────────────────────────────────────────────────────────────
function QuotaBar({ used, allowed, label }: { used: number; allowed: number; label: string }) {
  const { lang } = useLang();
  const pct = allowed > 0 ? Math.min(100, (used / allowed) * 100) : 0;
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-primary';
  const number = new Intl.NumberFormat(lang === 'ar' ? 'ar-SA' : 'en-US');
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{number.format(used)} / {number.format(allowed)}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Status badge ───────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const { t } = useLang();
  if (status === 'active') return <Badge className="bg-green-500 hover:bg-green-600 text-white gap-1"><CheckCircle2 className="w-3 h-3" /> {t('عضو نشط', 'Active member')}</Badge>;
  if (status === 'pending') return <Badge variant="secondary" className="gap-1"><Clock className="w-3 h-3" /> {t('بانتظار القبول', 'Pending acceptance')}</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">{t('مُزال', 'Removed')}</Badge>;
}

// ── Members table ──────────────────────────────────────────────────────────────
function MembersTable({ members, onRemove }: { members: Member[]; onRemove: (id: number) => void }) {
  const { lang, t } = useLang();
  const fmt = (d: string) => { try { return format(new Date(d), 'dd MMM yyyy', { locale: lang === 'ar' ? arSA : enUS }); } catch { return d; } };
  const number = new Intl.NumberFormat(lang === 'ar' ? 'ar-SA' : 'en-US');
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="text-start py-2 px-2 font-medium">{t('الموظف', 'Employee')}</th>
            <th className="text-start py-2 font-medium">{t('الحالة', 'Status')}</th>
            <th className="text-start py-2 font-medium">{t('الاستهلاك (هذا الشهر)', 'Usage (this month)')}</th>
            <th className="text-start py-2 font-medium">{t('تاريخ الانضمام', 'Join date')}</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {members.map(m => (
            <tr key={m.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
              <td className="py-3 px-2">
                <div className="font-medium" dir="auto">{m.name ?? '—'}</div>
                <div className="text-muted-foreground text-xs" dir="ltr">{m.email}</div>
              </td>
              <td className="py-3"><StatusBadge status={m.status} /></td>
              <td className="py-3">
                {m.status === 'active'
                  ? <span className="font-medium">{number.format(m.usageThisMonth)} {t('خدمة', 'services')}</span>
                  : <span className="text-muted-foreground">—</span>}
              </td>
              <td className="py-3 text-muted-foreground">
                {m.joinedAt ? fmt(m.joinedAt) : m.status === 'pending' ? `${t('مدعو', 'Invited')} ${fmt(m.invitedAt)}` : '—'}
              </td>
              <td className="py-3 text-end px-2">
                {m.status !== 'removed' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 px-2"
                    onClick={() => onRemove(m.id)}
                    title={t('إزالة العضو', 'Remove member')}
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
  const { lang, t } = useLang();
  const [email, setEmail] = useState('');
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: membersData, isLoading: membersLoading, refetch } = useQuery({
    queryKey: ['org-members'],
    queryFn: async () => {
      const r = await apiFetch('/api/organizations/members');
      if (!r.ok) throw new Error(t('فشل تحميل الأعضاء', 'Failed to load members'));
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
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(lang === 'ar' ? (e.error || t('تعذّر إرسال الدعوة', 'Could not send the invitation')) : t('تعذّر إرسال الدعوة', 'Could not send the invitation'));
      }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: t('تم إرسال الدعوة', 'Invitation sent'), description: `${t('أُرسلت دعوة إلى', 'An invitation was sent to')} ${email}` });
      setEmail('');
      refetch();
    },
    onError: (e: Error) => toast({ title: t('خطأ', 'Error'), description: e.message || t('تعذّر إرسال الدعوة', 'Could not send the invitation'), variant: 'destructive' }),
  });

  const removeMut = useMutation({
    mutationFn: async (memberId: number) => {
      const r = await apiFetch(`/api/organizations/members/${memberId}`, { method: 'DELETE' });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(lang === 'ar' ? (e.error || t('تعذّرت إزالة العضو', 'Could not remove the member')) : t('تعذّرت إزالة العضو', 'Could not remove the member'));
      }
    },
    onSuccess: () => { toast({ title: t('تمت إزالة العضو', 'Member removed') }); refetch(); },
    onError: (e: Error) => toast({ title: t('خطأ', 'Error'), description: e.message || t('تعذّرت إزالة العضو', 'Could not remove the member'), variant: 'destructive' }),
  });

  const sub = info.subscription;
  const activeCount = membersData?.members.filter(m => m.status === 'active').length ?? 0;
  const number = new Intl.NumberFormat(lang === 'ar' ? 'ar-SA' : 'en-US');
  const removeMember = (id: number) => {
    if (window.confirm(t('هل أنت متأكد من إزالة هذا العضو؟', 'Are you sure you want to remove this member?'))) {
      removeMut.mutate(id);
    }
  };

  return (
    <div className="space-y-6" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
             <Building2 className="w-6 h-6" /> <span dir="auto">{info.org.name}</span>
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{t('لوحة إدارة المنشأة', 'Organization management dashboard')}</p>
        </div>
        <Badge variant="outline" className="gap-1 text-sm px-3 py-1">
          <Users className="w-3.5 h-3.5" /> {number.format(activeCount)} {t('عضو نشط', activeCount === 1 ? 'active member' : 'active members')}
        </Badge>
      </div>

      {/* Quota overview */}
      {sub && (
        <Card className="border-2 border-primary/45 shadow-sm shadow-primary/10">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-primary" /> {t('استهلاك الحصة المشتركة', 'Shared quota usage')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <QuotaBar used={sub.consultationsUsed} allowed={sub.consultationsAllowed} label={t('الاستشارات القانونية', 'Legal consultations')} />
            <QuotaBar used={sub.contractsUsed} allowed={sub.contractsAllowed} label={t('صياغة العقود', 'Contract drafting')} />
            {sub.endDate && (
              <p className="text-xs text-muted-foreground pt-1">
                {t('تجدد الاشتراك:', 'Subscription renews:')} {format(new Date(sub.endDate), 'dd MMMM yyyy', { locale: lang === 'ar' ? arSA : enUS })}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Invite form */}
      <Card className="border-2 border-blue-400/50 shadow-sm shadow-blue-400/10">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
             <UserPlus className="w-4 h-4 text-primary" /> {t('دعوة موظف جديد', 'Invite a new employee')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <div className="relative flex-1">
               <Mail className={`w-4 h-4 absolute ${lang === 'ar' ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-muted-foreground`} />
              <Input
                type="email"
                 placeholder={t('البريد الإلكتروني للموظف', "Employee's email address")}
                value={email}
                onChange={e => setEmail(e.target.value)}
                 className={lang === 'ar' ? 'pr-9' : 'pl-9'}
                 dir="ltr"
                onKeyDown={e => e.key === 'Enter' && email && inviteMut.mutate()}
              />
            </div>
            <Button
              onClick={() => inviteMut.mutate()}
              disabled={!email || inviteMut.isPending}
              className="gap-2"
            >
              {inviteMut.isPending
                 ? <><RefreshCw className="w-4 h-4 animate-spin" /><span className="sr-only">{t('جارٍ إرسال الدعوة', 'Sending invitation')}</span></>
                : <UserPlus className="w-4 h-4" />}
               {t('إرسال الدعوة', 'Send invitation')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
             {t('سيصل للموظف بريد يحتوي على رابط للانضمام إلى حساب المنشأة', 'The employee will receive an email containing a link to join the organization account.')}
          </p>
        </CardContent>
      </Card>

      {/* Members list */}
      <Card className="border-2 border-emerald-400/50 shadow-sm shadow-emerald-400/10">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
             <Users className="w-4 h-4 text-primary" /> {t('أعضاء الفريق', 'Team members')}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => refetch()} className="h-8 gap-1 text-muted-foreground">
             <RefreshCw className="w-3.5 h-3.5" /> {t('تحديث', 'Refresh')}
          </Button>
        </CardHeader>
        <CardContent>
          {membersLoading ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
               <span className="sr-only">{t('جارٍ تحميل الأعضاء', 'Loading members')}</span>
            </div>
          ) : !membersData?.members.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
               <p>{t('لا يوجد أعضاء بعد — أرسل دعوات لموظفيك', 'There are no members yet — send invitations to your employees.')}</p>
            </div>
          ) : (
            <MembersTable
              members={membersData.members.filter(m => m.status !== 'removed')}
              onRemove={removeMember}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Member view ────────────────────────────────────────────────────────────────
function MemberView({ info }: { info: OrgInfo }) {
  const { lang, t } = useLang();
  const sub = info.subscription;
  return (
    <div className="space-y-6" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div>
        <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
          <Building2 className="w-6 h-6" /> <span dir="auto">{info.org.name}</span>
        </h1>
        <p className="text-muted-foreground text-sm mt-1">{t('أنت عضو في هذه المنشأة', 'You are a member of this organization')}</p>
      </div>

      {sub && (
        <Card className="border-2 border-primary/45 shadow-sm shadow-primary/10">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-primary" /> {t('الحصة المشتركة للفريق', 'Shared team quota')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
               {t('تستهلك أنت وزملاؤك من حصة اشتراك المنشأة الموحد', "You and your colleagues share the organization's subscription quota.")}
            </p>
            <QuotaBar used={sub.consultationsUsed} allowed={sub.consultationsAllowed} label={t('الاستشارات القانونية', 'Legal consultations')} />
            <QuotaBar used={sub.contractsUsed} allowed={sub.contractsAllowed} label={t('صياغة العقود', 'Contract drafting')} />
            {sub.endDate && (
              <p className="text-xs text-muted-foreground pt-1">
                {t('تجدد الاشتراك:', 'Subscription renews:')} {format(new Date(sub.endDate), 'dd MMMM yyyy', { locale: lang === 'ar' ? arSA : enUS })}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {!sub && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="text-amber-800 text-sm">{t('اشتراك المنشأة غير نشط حالياً — تواصل مع مسؤول الحساب', 'The organization subscription is currently inactive — contact the account administrator.')}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── No-org view ────────────────────────────────────────────────────────────────
function NoOrgView() {
  const { lang, t } = useLang();
  const qc = useQueryClient();
  return (
    <div className="space-y-6" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div>
        <h1 className="text-2xl font-bold text-primary">{t('حساب المنشأة', 'Organization account')}</h1>
        <p className="text-muted-foreground mt-1">{t('أضف موظفيك وشاركهم حصة اشتراكك', 'Add your employees and share your subscription quota with them.')}</p>
      </div>
      <CreateOrgForm onCreated={() => qc.invalidateQueries({ queryKey: ['org-my'] })} />
      <Card className="bg-muted/40 border-2 border-dashed border-secondary/60 shadow-sm shadow-secondary/10">
        <CardContent className="pt-6 space-y-3 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">{t('كيف يعمل نظام المنشآت؟', 'How do organization accounts work?')}</p>
          <ul className="space-y-1.5 list-disc list-inside">
            <li>{t('أنت صاحب الاشتراك والمسؤول عن الفوترة', 'You own the subscription and are responsible for billing.')}</li>
            <li>{t('تدعو موظفيك عبر بريدهم الإلكتروني', 'You invite employees using their email addresses.')}</li>
            <li>{t('جميع الأعضاء يستهلكون من حصة اشتراك واحدة', 'All members use one shared subscription quota.')}</li>
            <li>{t('ترى استهلاك كل موظف بشكل منفصل', "You can view each employee's usage separately.")}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function OrganizationPage() {
  const { lang, t } = useLang();

  // هل نحن في صفحة قبول دعوة؟
  const params = new URLSearchParams(window.location.search);
  const inviteToken = params.get('token');

  const { data: orgInfo, isLoading, isError } = useQuery({
    queryKey: ['org-my'],
    queryFn: async () => {
      const r = await apiFetch('/api/organizations/my');
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(t('فشل تحميل بيانات المنشأة', 'Failed to load organization data'));
      return r.json() as Promise<OrgInfo>;
    },
    retry: false,
  });

  // صفحة قبول الدعوة لا تحتاج نافبار شاملاً
  if (inviteToken) return <JoinOrgView token={inviteToken} />;

  return (
    <div className="min-h-screen flex flex-col bg-muted/20" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <RefreshCw className="w-8 h-8 animate-spin text-primary" />
             <span className="sr-only">{t('جارٍ تحميل بيانات المنشأة', 'Loading organization data')}</span>
          </div>
        ) : isError ? (
          <Card className="border-destructive/20">
            <CardContent className="pt-6 text-center text-destructive">
              <AlertCircle className="w-8 h-8 mx-auto mb-2" />
              <p>{t('تعذّر تحميل بيانات المنشأة', 'Could not load organization data.')}</p>
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
