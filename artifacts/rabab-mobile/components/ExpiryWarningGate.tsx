import React from 'react';
import { SubscriptionSheet } from '@/components/SubscriptionSheet';
import { useExpiryWarning } from '@/hooks/useExpiryWarning';

/**
 * Invisible gate component: monitors subscription expiry and shows an alert
 * + SubscriptionSheet when the subscription is within 3 days of expiring.
 * Mount once at the tab-layout level so it runs on every tab.
 */
export function ExpiryWarningGate() {
  const { showSheet, setShowSheet } = useExpiryWarning();
  return (
    <SubscriptionSheet
      visible={showSheet}
      onClose={() => setShowSheet(false)}
    />
  );
}
