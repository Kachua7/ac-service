import { useCallback, useEffect, useState } from 'react';
import type { AuthUser, WSEvent } from '../shared/types';
import { AdminDashboard } from './components/AdminDashboard';
import { BookingWizard } from './components/BookingWizard';
import { type CustomerRoute, Header } from './components/Header';
import { LandingView } from './components/LandingView';
import { LoginView } from './components/LoginView';
import { TechnicianPortal } from './components/TechnicianPortal';
import { TrackingView } from './components/TrackingView';
import {
  api,
  type BootstrapResponse,
  type EnrichedBooking,
  getStoredToken,
  setStoredToken,
} from './lib/api';
import { useRealtimeRoom } from './lib/wsClient';

export default function App() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  const [customerRoute, setCustomerRoute] = useState<CustomerRoute>('home');
  const [bootstrap, setBootstrap] = useState<BootstrapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [bookingPreselectServiceId, setBookingPreselectServiceId] = useState<string | undefined>();
  const [bookingPreselectAreaId, setBookingPreselectAreaId] = useState<string | undefined>();
  const [trackingRef, setTrackingRef] = useState<string | undefined>();

  const fetchBootstrap = useCallback(async () => {
    try {
      const data = await api.getBootstrap();
      setBootstrap(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to reach VayuCare backend.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBootstrap();
    const token = getStoredToken();
    if (!token) {
      setAuthChecking(false);
      return;
    }
    api
      .getMe()
      .then((res) => setAuthUser(res.user))
      .catch(() => {
        setStoredToken(null);
        setAuthUser(null);
      })
      .finally(() => setAuthChecking(false));
  }, [fetchBootstrap]);

  const handleGlobalEvent = useCallback(
    (event: WSEvent) => {
      if (event.type === 'ops:refresh') {
        fetchBootstrap();
      }
    },
    [fetchBootstrap],
  );

  useRealtimeRoom('global', handleGlobalEvent);

  function handleAuthenticated(user: AuthUser) {
    setAuthUser(user);
    setCustomerRoute('home');
    setTrackingRef(undefined);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleLogout() {
    await api.logout();
    setAuthUser(null);
    setCustomerRoute('home');
    setTrackingRef(undefined);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleStartBooking(serviceId?: string, areaId?: string) {
    setBookingPreselectServiceId(serviceId);
    setBookingPreselectAreaId(areaId);
    setCustomerRoute('book');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleTrackLive(ref?: string) {
    setTrackingRef(ref);
    setCustomerRoute('track');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleBookingCreated(booking: EnrichedBooking) {
    setTrackingRef(booking.reference);
    setCustomerRoute('track');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (authChecking || (loading && !bootstrap)) {
    return (
      <div className="min-h-screen bg-slate-50 p-8">
        <div className="mx-auto max-w-5xl h-96 animate-pulse rounded-2xl bg-slate-200" />
      </div>
    );
  }

  if (loadError || !bootstrap) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-16 text-center">
        <h1 className="font-display text-xl font-bold text-slate-900">
          Service Temporarily Unavailable
        </h1>
        <p className="mt-2 text-sm text-slate-600">{loadError}</p>
        <button
          type="button"
          onClick={fetchBootstrap}
          className="mt-4 rounded-lg bg-sky-700 px-5 py-2 text-sm font-semibold text-white"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  if (!authUser) {
    return (
      <LoginView
        serviceAreas={bootstrap.serviceAreas}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Header
        user={authUser}
        currentRoute={customerRoute}
        onNavigate={(nextRoute) => {
          setCustomerRoute(nextRoute);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onLogout={handleLogout}
      />

      <main>
        {authUser.role === 'CUSTOMER' && (
          <>
            {customerRoute === 'home' && (
              <LandingView
                bootstrap={bootstrap}
                onStartBooking={handleStartBooking}
                onTrackLive={handleTrackLive}
              />
            )}

            {customerRoute === 'book' && (
              <BookingWizard
                bootstrap={bootstrap}
                initialServiceId={bookingPreselectServiceId}
                initialAreaId={bookingPreselectAreaId}
                defaultCustomerName={authUser.name}
                defaultCustomerPhone={authUser.identifier}
                onBookingCreated={handleBookingCreated}
                onCancel={() => setCustomerRoute('home')}
              />
            )}

            {(customerRoute === 'track' || customerRoute === 'bookings') && (
              <TrackingView
                initialBookingRef={trackingRef}
                listMode={customerRoute === 'bookings'}
                onBookNew={() => handleStartBooking()}
              />
            )}
          </>
        )}

        {authUser.role === 'TECHNICIAN' && <TechnicianPortal />}

        {authUser.role === 'ADMIN' && <AdminDashboard />}
      </main>
    </div>
  );
}
