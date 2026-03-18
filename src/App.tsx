import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
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

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading, isEmailConfirmed } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  return user && isEmailConfirmed ? <>{children}</> : <Navigate to="/auth" replace />;
};

/** Pfad normalisieren: doppelte Schrägstriche (z. B. durch APP_URL mit trailing slash) entfernen. */
function normalizePathname(p: string): string {
  return p.replace(/\/+/g, '/').replace(/^\/+/, '/') || '/';
}

/**
 * Eine einzige Weiche: Pfad entscheidet, was gerendert wird.
 * window.location.pathname + Normalisierung, damit //reset-password aus E-Mail-Link funktioniert.
 */
function RouteByPath() {
  const location = useLocation();
  const raw =
    typeof window !== 'undefined' ? window.location.pathname : location.pathname;
  const pathname = normalizePathname(raw);

  if (pathname === '/auth') return <AuthPage />;
  if (pathname === '/reset-password') return <ResetPassword />;
  if (pathname === '/forgot-password') return <ForgotPassword />;
  if (pathname === '/verify-email') return <VerifyEmail />;

  return (
    <ProtectedRoute>
      <Layout>
        <Outlet />
      </Layout>
    </ProtectedRoute>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="*" element={<RouteByPath />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
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
  );
}

export default App;