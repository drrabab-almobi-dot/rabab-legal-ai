import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, type AppStateStatus } from 'react-native';
import * as SecureStore from '@/utils/storage';
import { getGetMySubscriptionQueryKey, useGetMySubscription } from '@workspace/api-client-react';
import { useAuth } from '@/contexts/AuthContext';

const LAST_SHOWN_KEY = '@rabab_expiry_warning_last_shown';
/** Show warning when ≤ this many days remain */
const DAYS_THRESHOLD = 3;

/**
 * Fires an alert when the subscription expires within DAYS_THRESHOLD days.
 * Throttled to at most once per calendar day via SecureStore.
 * Returns `{ showSheet, setShowSheet }` so the caller can open SubscriptionSheet.
 */
export function useExpiryWarning() {
  const { user } = useAuth();
  const [showSheet, setShowSheet] = useState(false);

  const { data: subscription } = useGetMySubscription({
    query: { queryKey: getGetMySubscriptionQueryKey(), enabled: !!user, staleTime: 60_000 },
  });

  const checkAndWarn = useCallback(async () => {
    if (!user || !subscription?.endDate) return;

    const endDate = new Date(subscription.endDate);
    const now = new Date();
    const daysLeft = Math.ceil(
      (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Only warn if within threshold and not already expired (negative)
    if (daysLeft < 0 || daysLeft > DAYS_THRESHOLD) return;

    // Throttle: only once per calendar day
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    try {
      const lastShown = await SecureStore.getItemAsync(LAST_SHOWN_KEY);
      if (lastShown === today) return;
      await SecureStore.setItemAsync(LAST_SHOWN_KEY, today);
    } catch {
      // SecureStore failure is non-fatal; proceed with warning
    }

    const daysText =
      daysLeft === 0
        ? 'ينتهي اشتراكك اليوم!'
        : `ينتهي اشتراكك خلال ${daysLeft} ${daysLeft === 1 ? 'يوم' : 'أيام'}.`;

    Alert.alert(
      '⏰ تنبيه: اشتراكك يقترب من الانتهاء',
      `${daysText} جدّد اشتراكك الآن لتجنب انقطاع الخدمة.`,
      [
        { text: 'لاحقاً', style: 'cancel' },
        {
          text: 'جدّد الآن',
          onPress: () => setShowSheet(true),
        },
      ],
    );
  }, [user, subscription]);

  // Fire on every foreground transition
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;
      if (
        (prev === 'background' || prev === 'inactive') &&
        nextState === 'active'
      ) {
        checkAndWarn();
      }
    });
    return () => sub.remove();
  }, [checkAndWarn]);

  // Also fire once when subscription data first becomes available in the session
  const didInitialCheck = useRef(false);
  useEffect(() => {
    if (subscription && !didInitialCheck.current) {
      didInitialCheck.current = true;
      checkAndWarn();
    }
  }, [subscription, checkAndWarn]);

  return { showSheet, setShowSheet };
}
