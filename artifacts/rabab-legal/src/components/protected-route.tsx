import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { Loader2 } from 'lucide-react';

export function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode, adminOnly?: boolean }) {
  const { isAuthenticated, isLoading, isAdmin } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        // Preserve the current path so login can redirect back after authentication.
        // This is critical for the payment callback (/payment/callback?id=...&status=paid)
        // which must complete even if the session was lost during the Moyasar redirect.
        const returnTo = encodeURIComponent(location + window.location.search);
        setLocation(`/login?returnTo=${returnTo}`);
      } else if (adminOnly && !isAdmin) {
        setLocation('/');
      }
    }
  }, [isAuthenticated, isLoading, isAdmin, adminOnly, location, setLocation]);

  if (isLoading) {
    return (
      <div className="flex h-[50vh] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated || (adminOnly && !isAdmin)) {
    return null; // Will redirect in useEffect
  }

  return <>{children}</>;
}

export function GuestOnlyRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (isAuthenticated) {
      setLocation('/dashboard');
    }
  }, [isAuthenticated, setLocation]);

  if (isAuthenticated) {
    return null; // Will redirect
  }

  return <>{children}</>;
}
