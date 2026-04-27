import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, Outlet } from 'react-router-dom';
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

/** Pfad normalisieren: doppelte Schrägstriche entfernen (z.B. aus E-Mail-Links). */
function normalizePathname(p: string): string {
  return p.replace(/\/+/g, '/').replace(/^\/+/, '/') || '/';
}

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading, isEmailConfirmed } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
      </div>
    );
  }

  return user && isEmailConfirmed ? <>{children}</> : <Navigate to="/auth" replace />;
};

/**
 * Tenant-Guard: Zeigt Ladeindikator während der Tenant aufgelöst wird.
 * Zeigt 404-Seite wenn Slug in URL, aber kein Tenant in DB.
 */
const TenantGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { tenantSlug, loading, notFound } = useTenant();

  // Warte bis Tenant aufgelöst ist (gilt für Subdomain und Apex gleichermaßen)
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
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
  const { tenantSlug, loading: tenantLoading } = useTenant();
  const { user, loading: authLoading, isEmailConfirmed } = useAuth();

  if (tenantLoading || authLoading) return <Spinner />;
  if (tenantSlug) {
    if (user && isEmailConfirmed) return <Navigate to="/dashboard" replace />;
    return <Navigate to="/auth" replace />;
  }
  return <LandingPage />;
};

function RouteByPath() {
  const location = useLocation();
  const raw = typeof window !== 'undefined' ? window.location.pathname : location.pathname;
  const pathname = normalizePathname(raw);

  // Öffentliche Routen (kein Tenant-Kontext nötig)
  if (pathname === '/')                 return <HomeRoute />;
  if (pathname === '/auth')             return <AuthPage />;
  if (pathname === '/reset-password')   return <ResetPassword />;
  if (pathname === '/forgot-password')  return <ForgotPassword />;
  if (pathname === '/verify-email')     return <VerifyEmail />;

  // Tenant-App: geschützte Routen
  return (
    <TenantGuard>
      <ProtectedRoute>
        <Layout>
          <Outlet />
        </Layout>
      </ProtectedRoute>
    </TenantGuard>
  );
}

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

            {/* Tenant-App (geschützt) */}
            <Route path="*" element={<RouteByPath />}>
              <Route path="dashboard"                   element={<Dashboard />} />
              <Route path="courses"                     element={<Courses />} />
              <Route path="create-course"               element={<CreateCourse />} />
              <Route path="course/:courseId/edit"       element={<EditCourse />} />
              <Route path="course/:courseId/participants" element={<Participants />} />
              <Route path="my-courses"                  element={<MyCourses />} />
              <Route path="profile"                     element={<Profile />} />
              <Route path="participants"                element={<Participants />} />
              <Route path="users"                       element={<Users />} />
              <Route path="settings"                    element={<Settings />} />
              <Route path="messages"                    element={<Messages />} />
              <Route path="*"                           element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Routes>
        </Router>
      </AuthProvider>
    </TenantProvider>
  );
}

export default App;
