import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TenantProvider, useTenant, APP_BASE_DOMAIN } from './context/TenantContext';
import AuthPage from './pages/AuthPage';
import Dashboard from './pages/Dashboard';
import Courses from './pages/Courses';
import CreateCourse from './pages/CreateCourse';
import EditCourse from './pages/EditCourse';
import MyCourses from './pages/MyCourses';
import Profile from './pages/Profile';
import Participants from './pages/Participants';
import Users from './pages/Users';
import Settings from './pages/Settings';
import Messages from './pages/Messages';
import VerifyEmail from './pages/VerifyEmail';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Layout from './components/Layout/Layout';

import LandingPage from './pages/LandingPage';
import OnboardingWizard from './pages/OnboardingWizard';
import LegalPage from './pages/LegalPage';

/** Mandanten-App: Guard → Auth → Layout → Kindroute (`Outlet`). Pathloses Layout, damit RR6/7 `/dashboard` & Co. zuverlässig matched (nicht `path="*"` + Kinder). */
const TenantAppShell: React.FC = () => (
  <TenantGuard>
    <ProtectedRoute>
      <Layout>
        <Outlet />
      </Layout>
    </ProtectedRoute>
  </TenantGuard>
);

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, userProfile, loading, isEmailConfirmed } = useAuth();
  const { tenant } = useTenant();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
      </div>
    );
  }

  if (user && isEmailConfirmed && !userProfile) {
    return <Navigate to="/auth?profile_missing=1" replace />;
  }

  if (user && isEmailConfirmed && userProfile && tenant && userProfile.tenant_id !== tenant.id) {
    return <Navigate to="/auth?wrong_studio=1" replace />;
  }

  if (!user || !isEmailConfirmed) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
};

/**
 * Tenant-Guard: Zeigt Ladeindikator während der Tenant aufgelöst wird.
 * Zeigt 404-Seite wenn Slug in URL, aber kein Tenant in DB.
 */
const TenantGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { tenantSlug, loading, notFound, lookupError } = useTenant();

  // Warte bis Tenant aufgelöst ist (gilt für Subdomain und Apex gleichermaßen)
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
      </div>
    );
  }

  if (tenantSlug && lookupError) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
        <div className="text-center max-w-lg">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Studio konnte nicht geladen werden</h1>
          <p className="text-gray-600 text-sm leading-relaxed">{lookupError}</p>
          <p className="text-gray-500 text-xs mt-4">
            Häufige Ursache: Die Live-App nutzt ein anderes Supabase-Projekt als in der Konsole (VITE_SUPABASE_URL /
            Anon-Key in Cloudflare Pages prüfen).
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 mr-4 inline-block rounded-lg bg-teal-600 text-white px-4 py-2 text-sm font-medium hover:bg-teal-700"
          >
            Neu laden
          </button>
          <a href={`https://${APP_BASE_DOMAIN}`} className="mt-4 inline-block text-teal-600 hover:underline text-sm">
            Zur Startseite
          </a>
        </div>
      </div>
    );
  }

  if (tenantSlug && notFound) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Studio nicht gefunden</h1>
          <p className="text-gray-500">Das Studio „{tenantSlug}" existiert nicht.</p>
          <a href={`https://${APP_BASE_DOMAIN}`}
             className="mt-4 inline-block text-teal-600 hover:underline">
            Zur Startseite
          </a>
        </div>
      </div>
    );
  }

  // Kein Tenant-Kontext (Apex-Domain omlify.de): App-Routen sind hier nicht erreichbar
  if (!tenantSlug) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

const Spinner = () => (
  <div className="min-h-screen bg-gray-100 flex items-center justify-center">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
  </div>
);

/**
 * Wurzel-Route:
 * - Mit Tenant (Subdomain / DEV-Override): eingeloggt → Dashboard, sonst → Login
 * - Apex / ohne Tenant → Marketing-Landing
 */
const HomeRoute: React.FC = () => {
  const { tenantSlug, tenant, loading: tenantLoading, notFound, lookupError } = useTenant();
  const { user, userProfile, loading: authLoading, isEmailConfirmed } = useAuth();

  if (tenantLoading || authLoading) return <Spinner />;

  if (tenantSlug) {
    if (lookupError) {
      return (
        <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-xl font-bold text-gray-800">Studio konnte nicht geladen werden</h1>
          <p className="text-gray-600 text-sm max-w-lg">{lookupError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-teal-600 text-white px-4 py-2 text-sm font-medium hover:bg-teal-700"
          >
            Neu laden
          </button>
          <a href={`https://${APP_BASE_DOMAIN}`} className="text-sm text-teal-600 hover:underline">
            Zur Startseite
          </a>
        </div>
      );
    }
    if (notFound) {
      return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <h1 className="text-2xl font-bold text-gray-800 mb-2">Studio nicht gefunden</h1>
            <p className="text-gray-500">Das Studio „{tenantSlug}" existiert nicht.</p>
            <a href={`https://${APP_BASE_DOMAIN}`} className="mt-4 inline-block text-teal-600 hover:underline">
              Zur Startseite
            </a>
          </div>
        </div>
      );
    }
    if (!tenant) {
      return (
        <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-gray-700 max-w-md">
            Studio-Daten sind noch nicht verfügbar oder die Verbindung zur Datenbank hat zu lange gedauert.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-teal-600 text-white px-4 py-2 text-sm font-medium hover:bg-teal-700"
          >
            Seite neu laden
          </button>
          <a href={`https://${APP_BASE_DOMAIN}`} className="text-sm text-teal-600 hover:underline">
            Zur Startseite
          </a>
        </div>
      );
    }

    const memberOk =
      !!user && isEmailConfirmed && !!userProfile && userProfile.tenant_id === tenant.id;
    if (memberOk) return <Navigate to="/dashboard" replace />;

    if (user && isEmailConfirmed && userProfile && userProfile.tenant_id !== tenant.id) {
      return <Navigate to="/auth?wrong_studio=1" replace />;
    }
    if (user && isEmailConfirmed && !userProfile) {
      return <Navigate to="/auth?profile_missing=1" replace />;
    }

    return <Navigate to="/auth" replace />;
  }

  return <LandingPage />;
};

function App() {
  return (
    <TenantProvider>
      <AuthProvider>
        <Router>
          <Routes>
            {/* Öffentliche Routen ohne Layout */}
            <Route path="/auth"            element={<AuthPage />} />
            <Route path="/reset-password"  element={<ResetPassword />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/verify-email"    element={<VerifyEmail />} />

            {/* Apex: Landing Page / Subdomain: Redirect zu Dashboard */}
            <Route path="/" element={<HomeRoute />} />

            {/* Öffentlich: Onboarding (kein Tenant-Kontext erforderlich) */}
            <Route path="/onboarding" element={<OnboardingWizard />} />

            {/* Rechtliche Seiten */}
            <Route path="/legal/agb"         element={<LegalPage type="agb" />} />
            <Route path="/legal/datenschutz" element={<LegalPage type="datenschutz" />} />

            {/* Mandanten-App (pathloses Layout — zuverlässiges Matching unter RR 6/7) */}
            <Route element={<TenantAppShell />}>
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="courses" element={<Courses />} />
              <Route path="create-course" element={<CreateCourse />} />
              <Route path="course/:courseId/edit" element={<EditCourse />} />
              <Route path="course/:courseId/participants" element={<Participants />} />
              <Route path="my-courses" element={<MyCourses />} />
              <Route path="profile" element={<Profile />} />
              <Route path="participants" element={<Participants />} />
              <Route path="users" element={<Users />} />
              <Route path="settings" element={<Settings />} />
              <Route path="messages" element={<Messages />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Routes>
        </Router>
      </AuthProvider>
    </TenantProvider>
  );
}

export default App;
