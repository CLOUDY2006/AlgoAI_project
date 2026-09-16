import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { getOnboardingStatus } from "../../services/api";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

// Cached across the session so every route change doesn't re-hit the
// backend — onboarding status only actually changes once, the moment the
// user completes it (at which point handleGenerate navigates them away
// from /onboarding, past this check).
let cachedOnboardingCompleted: boolean | null = null;

/**
 * Called by Onboarding.tsx right after a successful submission, so the very
 * next navigation to a protected route (e.g. /roadmap) doesn't redirect
 * straight back to /onboarding on a stale cached `false`.
 */
export const markOnboardingCompleted = () => {
  cachedOnboardingCompleted = true;
};

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(
    cachedOnboardingCompleted,
  );
  const [statusLoading, setStatusLoading] = useState(cachedOnboardingCompleted === null);

  useEffect(() => {
    if (cachedOnboardingCompleted !== null) {
      return;
    }

    let cancelled = false;

    getOnboardingStatus()
      .then((res) => {
        if (cancelled) return;
        cachedOnboardingCompleted = res.onboardingCompleted;
        setOnboardingCompleted(res.onboardingCompleted);
      })
      .catch(() => {
        // Fail open: don't block access to the whole app over a status-check
        // network hiccup. Worst case here is onboarding shows again once.
        if (!cancelled) setOnboardingCompleted(true);
      })
      .finally(() => {
        if (!cancelled) setStatusLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || statusLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    const guestUserId = typeof window !== 'undefined' ? localStorage.getItem('guestUserId') : null;

    if (guestUserId && location.pathname.startsWith('/roadmap')) {
      return <>{children}</>;
    }

    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Part 12: the backend/DB is the source of truth for onboarding
  // completion, not localStorage/React state. If it isn't done, every
  // protected route except /onboarding itself redirects there.
  if (onboardingCompleted === false && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}