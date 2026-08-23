/**
 * QuotaConfirmModal — يظهر قبل أي عملية تستهلك أكثر من وحدتين.
 * الاستخدام: استدعِ confirm() ثم انتظر نتيجتها قبل تنفيذ العملية.
 */
import React, { createContext, useContext, useRef, useState, useCallback } from 'react';
import { AlertCircle, Zap } from 'lucide-react';
import { Button } from '@/components/ui';

interface ConfirmOptions {
  cost: number;
  remaining: number;
  serviceLabel: string;
}

type Resolver = (ok: boolean) => void;

interface CtxValue {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const Ctx = createContext<CtxValue>({ confirm: async () => true });

export function useQuotaConfirm(): CtxValue {
  return useContext(Ctx);
}

export function QuotaConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<Resolver | null>(null);

  const confirm = useCallback((o: ConfirmOptions): Promise<boolean> => {
    if (o.cost <= 2) return Promise.resolve(true); // لا تأكيد للعمليات الصغيرة
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setOpts(o);
    });
  }, []);

  const resolve = (ok: boolean) => {
    resolverRef.current?.(ok);
    resolverRef.current = null;
    setOpts(null);
  };

  return (
    <Ctx.Provider value={{ confirm }}>
      {children}
      {opts && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => resolve(false)} />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl p-6 max-w-sm w-full text-right">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
                <Zap className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="font-bold text-foreground mb-1">تأكيد استهلاك الرصيد</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  ستُخصم{' '}
                  <span className="font-bold text-amber-400">({opts.cost}) وحدات</span>{' '}
                  من رصيدك في خدمة {opts.serviceLabel}.
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  المتبقي بعدها:{' '}
                  <span className={`font-bold ${opts.remaining - opts.cost <= 0 ? 'text-red-400' : opts.remaining - opts.cost <= 2 ? 'text-amber-400' : 'text-green-400'}`}>
                    ({Math.max(0, opts.remaining - opts.cost)}) وحدة
                  </span>
                </p>
                {opts.remaining - opts.cost <= 0 && (
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-red-400">
                    <AlertCircle className="w-3.5 h-3.5" />
                    سينفد رصيدك بعد هذه العملية
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => resolve(false)}>إلغاء</Button>
              <Button size="sm" onClick={() => resolve(true)}>متابعة</Button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
