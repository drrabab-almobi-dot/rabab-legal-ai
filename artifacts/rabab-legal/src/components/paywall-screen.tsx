/**
 * PaywallScreen — شاشة الاشتراك بعد استنفاد التجربة المجانية
 * تظهر فوق المحتوى (overlay) مع الإبقاء على مخرجات الخدمات السابقة ظاهرة في الخلف
 */
import React from 'react';
import { Link } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ArrowLeft, CheckCircle2, Lock, Star } from 'lucide-react';
import { useQuota } from '@/hooks/useQuota';

const HIGHLIGHTS = [
  'استشارات قانونية متخصصة بمستوى مستشار سعودي خبير',
  'صياغة عقود محكمة وفق الأنظمة السعودية',
  'مراجعة قانونية شاملة بـ 17 محوراً',
  'مصادر معتمدة فقط — لا اختراع لأرقام مواد',
  'تصدير PDF احترافي مع الاستشهادات',
];

interface Props {
  show: boolean;
  onDismiss?: () => void;
  /** اسم الخدمة المحجوبة للعرض في الرسالة */
  serviceLabel?: string;
}

export function PaywallScreen({ show, onDismiss, serviceLabel }: Props) {
  const { quota } = useQuota();

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          dir="rtl"
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onDismiss} />

          {/* Card */}
          <motion.div
            initial={{ scale: 0.92, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 10 }}
            transition={{ type: 'spring', stiffness: 320, damping: 25 }}
            className="relative z-10 bg-card border-2 border-primary/30 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden"
          >
            {/* Gradient header */}
            <div className="bg-gradient-to-br from-primary to-primary/70 px-8 py-8 text-center">
              <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-black text-white mb-2">استنفدت خدماتك المجانية الثلاث</h2>
              <p className="text-white/80 text-sm leading-relaxed">
                {serviceLabel
                  ? `لفتح ${serviceLabel} يُرجى الاشتراك في إحدى الباقات`
                  : 'للاستمرار يرجى الاشتراك في إحدى الباقات'}
              </p>
            </div>

            {/* Body */}
            <div className="px-8 py-6">

              {/* Trial used notice */}
              <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5">
                <Star className="w-4 h-4 text-amber-600 shrink-0" />
                <p className="text-sm text-amber-800">
                  <strong>مخرجات خدماتك الثلاث محفوظة ومتاحة للتصدير</strong> — لم تُحجب ولن تُحذف
                </p>
              </div>

              {/* Features */}
              <ul className="space-y-2.5 mb-6">
                {HIGHLIGHTS.map((h, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                    <span className="text-sm text-foreground/80">{h}</span>
                  </li>
                ))}
              </ul>

              {/* CTA Buttons */}
              <div className="flex flex-col gap-3">
                <Link href="/pricing">
                  <button className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-2xl py-3.5 font-black text-base hover:bg-primary/90 transition shadow-lg shadow-primary/20">
                    <span>عرض الباقات والأسعار</span>
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                </Link>

                {onDismiss && (
                  <button
                    onClick={onDismiss}
                    className="w-full py-2.5 text-sm text-muted-foreground hover:text-foreground transition font-medium"
                  >
                    العودة لمشاهدة مخرجاتي السابقة
                  </button>
                )}
              </div>

              {/* Trust note */}
              <p className="text-center text-xs text-muted-foreground mt-4 leading-relaxed">
                🔒 جودة الاشتراك مطابقة تماماً لما جربته — لا قيود إضافية
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Hook مساعد: يُعيد true إذا كان المستخدم في وضع الانتظار (trial exhausted) */
export function usePaywall() {
  const { quota, loading } = useQuota();
  return {
    shouldShowPaywall: !loading && quota.needsUpgrade,
    quota,
    loading,
  };
}
