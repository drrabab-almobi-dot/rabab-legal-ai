import { useCallback, useState } from "react";
import { Link, useLocation } from "wouter";
import { CheckCircle2, ExternalLink, FileText, Gavel, Loader2, Search, ShieldCheck } from "lucide-react";
import { Footer, Navbar } from "@/components/layout";
import { useAuth } from "@/hooks/use-auth";
import { useLang } from "@/hooks/use-language";
import { setPageSEO } from "@/lib/seo";

const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type DocumentType = "" | "judgment" | "deed" | "circular" | "decision" | "principle" | "precedent";

interface ProfessionalResult {
  id: string;
  documentType: Exclude<DocumentType, "">;
  title: string;
  documentNumber: string | null;
  caseNumber: string | null;
  judgmentNumber: string | null;
  decisionNumber: string | null;
  circularNumber: string | null;
  court: string | null;
  circuit: string | null;
  issuingAuthority: string | null;
  hijriDate: string | null;
  year: string | null;
  subject: string | null;
  summary: string | null;
  excerpt: string | null;
  sourcePageStart: number;
  sourcePageEnd: number;
  source: { name: string; officialUrl: string | null };
  citation: { originalPages: [number, number]; originalFileAvailable: boolean };
  downloadAvailable: false;
}

const typeLabels: Record<Exclude<DocumentType, "">, string> = {
  judgment: "حكم",
  deed: "صك",
  circular: "تعميم",
  decision: "قرار",
  principle: "مبدأ قضائي",
  precedent: "سابقة قضائية",
};

function metadata(result: ProfessionalResult): Array<[string, string | null]> {
  return [
    ["النوع", typeLabels[result.documentType]],
    ["رقم الوثيقة", result.documentNumber ?? result.judgmentNumber ?? result.decisionNumber ?? result.circularNumber],
    ["رقم القضية", result.caseNumber],
    ["المحكمة", result.court],
    ["الدائرة", result.circuit],
    ["التاريخ الهجري", result.hijriDate],
    ["نطاق الأصل", `ص ${result.sourcePageStart}–${result.sourcePageEnd}`],
  ];
}

export default function ProfessionalLegalArchiveSearch() {
  const { lang, t } = useLang();
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const [type, setType] = useState<DocumentType>("");
  const [results, setResults] = useState<ProfessionalResult[]>([]);
  const [detail, setDetail] = useState<ProfessionalResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  setPageSEO({
    title: "الباحثة القانونية المهنية | RABAB LEGAL AI",
    description: "بحث قانوني مهني في الأحكام والوثائق المستقلة المعتمدة فقط، مع المصدر الرسمي ونطاق صفحات الأصل.",
    canonical: "https://rabablegal.com/legal-search",
  });

  const search = useCallback(async () => {
    const value = query.trim();
    if (value.length < 2) {
      setError("أدخل عبارتين على الأقل للبحث.");
      return;
    }
    if (!isAuthenticated) {
      navigate(`/login?returnTo=${encodeURIComponent("/legal-search")}`);
      return;
    }
    setLoading(true);
    setError("");
    setDetail(null);
    setSearched(true);
    try {
      const params = new URLSearchParams({ q: value });
      if (type) params.set("type", type);
      const response = await fetch(`${API_BASE}/api/legal-archive/search?${params}`, { credentials: "include" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "تعذر تنفيذ البحث.");
      setResults(payload.results ?? []);
    } catch (reason: unknown) {
      setResults([]);
      setError(reason instanceof Error ? reason.message : "تعذر تنفيذ البحث.");
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, navigate, query, type]);

  const openDetail = useCallback(async (id: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/legal-archive/documents/${id}`, { credentials: "include" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "تعذر فتح الوثيقة.");
      setDetail(payload.document as ProfessionalResult);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "تعذر فتح الوثيقة.");
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col" dir={lang === "ar" ? "rtl" : "ltr"}>
      <Navbar />
      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-8 sm:py-12">
        <section className="rounded-3xl border border-primary/25 bg-gradient-to-br from-primary to-primary/85 p-6 sm:p-9 text-primary-foreground shadow-xl">
          <div className="flex items-start gap-4">
            <div className="shrink-0 rounded-2xl bg-white/15 p-3"><Gavel className="h-7 w-7" /></div>
            <div className="min-w-0">
              <h1 className="text-2xl font-extrabold sm:text-3xl">الباحثة القانونية المهنية</h1>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-white/85">
                تظهر هنا فقط الوثائق القانونية التي اعتمدت بعد التحقق من المصدر الرسمي والنوع والمرجع ونطاق صفحات الأصل. لا تظهر ملفات الإيداع أو السجلات قيد المراجعة.
              </p>
            </div>
          </div>
          <form onSubmit={(event) => { event.preventDefault(); void search(); }} className="mt-6 grid gap-3 sm:grid-cols-[1fr_180px_auto]">
            <label className="sr-only" htmlFor="professional-legal-query">عبارة البحث</label>
            <input id="professional-legal-query" value={query} onChange={(event) => setQuery(event.target.value)}
              placeholder="مثال: حكم براءة في مخدرات أو رقم صك أو موضوع نزاع"
              className="h-12 rounded-xl border border-white/30 bg-white px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-secondary" />
            <select value={type} onChange={(event) => setType(event.target.value as DocumentType)}
              className="h-12 rounded-xl border border-white/30 bg-white px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-secondary">
              <option value="">كل الأنواع المعتمدة</option>
              {Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button type="submit" disabled={loading || query.trim().length < 2}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-secondary px-5 font-bold text-primary transition hover:bg-secondary/90 disabled:cursor-not-allowed disabled:opacity-55">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} بحث
            </button>
          </form>
        </section>

        <div className="mt-5 flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span>بوابة الجودة: مصدر رسمي موثق، وثيقة مستقلة، نطاق صفحات مثبت، اعتماد بشري، ولا تنزيل للأصل الخاص.</span>
        </div>

        {error && <p role="alert" className="mt-5 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</p>}

        {detail ? (
          <section className="mt-7 rounded-2xl border bg-card p-5 shadow-sm">
            <button onClick={() => setDetail(null)} className="mb-4 text-sm font-semibold text-primary hover:underline">العودة إلى النتائج</button>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
              <div>
                <div className="mb-2 inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">{typeLabels[detail.documentType]}</div>
                <h2 className="text-xl font-bold leading-8">{detail.title}</h2>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800"><CheckCircle2 className="h-3.5 w-3.5" /> معتمد للبحث</span>
            </div>
            <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {metadata(detail).filter(([, value]) => value).map(([label, value]) => <div key={label}><dt className="text-xs font-bold text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-semibold">{value}</dd></div>)}
              <div><dt className="text-xs font-bold text-muted-foreground">المصدر</dt><dd className="mt-1 text-sm font-semibold">{detail.source.name}</dd></div>
            </dl>
            {detail.excerpt && <div className="mt-6 rounded-xl bg-muted/45 p-4 text-sm leading-8 whitespace-pre-wrap">{detail.excerpt}</div>}
            <div className="mt-5 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
              <p className="font-bold">بطاقة الاستشهاد</p>
              <p className="mt-1 text-muted-foreground">{detail.title}، {detail.source.name}، الصفحات {detail.sourcePageStart}–{detail.sourcePageEnd}.</p>
              {detail.source.officialUrl && <a className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline" target="_blank" rel="noreferrer" href={detail.source.officialUrl}><ExternalLink className="h-3.5 w-3.5" /> فتح المصدر الرسمي</a>}
            </div>
          </section>
        ) : (
          <section className="mt-7">
            {loading && <div className="flex items-center justify-center gap-3 py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />جارٍ البحث في السجل المعتمد…</div>}
            {!loading && searched && results.length === 0 && <div className="rounded-2xl border border-dashed p-10 text-center"><FileText className="mx-auto h-8 w-8 text-muted-foreground" /><h2 className="mt-3 font-bold">لا توجد وثيقة معتمدة مطابقة بعد</h2><p className="mt-2 text-sm text-muted-foreground">لا يعني ذلك عدم وجود وثيقة في الأرشيف؛ فقد تكون ما زالت في مرحلة التحقق المهني.</p></div>}
            {!loading && results.length > 0 && <div className="grid gap-3">{results.map((result) => <button key={result.id} onClick={() => void openDetail(result.id)} className="rounded-2xl border bg-card p-5 text-right shadow-sm transition hover:border-primary/50 hover:shadow-md"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">{typeLabels[result.documentType]}</span><span className="text-xs text-muted-foreground">{result.source.name}</span></div><h2 className="mt-2 text-base font-bold leading-7">{result.title}</h2><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">{result.court && <span>{result.court}</span>}{result.documentNumber && <span>رقم {result.documentNumber}</span>}<span>ص {result.sourcePageStart}–{result.sourcePageEnd}</span></div>{result.excerpt && <p className="mt-3 line-clamp-3 text-sm leading-7 text-muted-foreground">{result.excerpt}</p>}</button>)}</div>}
            {!searched && <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">ابدأ بموضوع النزاع أو رقم الصك أو رقم القضية أو عبارة واردة في الحكم.</div>}
          </section>
        )}

        <p className="mt-8 text-center text-xs text-muted-foreground">للاستئناس المهني؛ المرجع هو الأصل الرسمي. لا تتاح ملفات الأرشيف الخاصة للتنزيل من هذه الصفحة.</p>
        <div className="mt-4 text-center"><Link href="/legal-codex" className="text-xs font-bold text-primary hover:underline">فتح عارض المدونات القضائية السابق</Link></div>
      </main>
      <Footer />
    </div>
  );
}
