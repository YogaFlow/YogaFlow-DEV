import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
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

const PUBLIC_PATHS = ['/reset-password', '/forgot-password', '/verify-email'];

/** Renders public pages when path matches, otherwise protected Layout. Stops /reset-password etc. from being caught by the inner * route. */
const ProtectedOrPublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const isPublic = PUBLIC_PATHS.includes(location.pathname);

  if (isPublic) {
    if (location.pathname === '/reset-password') return <ResetPassword />;
    if (location.pathname === '/forgot-password') return <ForgotPassword />;
    if (location.pathname === '/verify-email') return <VerifyEmail />;
  }

  return <ProtectedRoute>{children}</ProtectedRoute>;
};

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const { user, loading } = useAuth();

  // Doppelte Absicherung: Auch in ProtectedRoute keine Weiterleitung zu /auth auf öffentlichen Pfaden
  if (PUBLIC_PATHS.includes(location.pathname)) {
    if (location.pathname === '/reset-password') return <ResetPassword />;
    if (location.pathname === '/forgot-password') return <ForgotPassword />;
    if (location.pathname === '/verify-email') return <VerifyEmail />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  return user ? <>{children}</> : <Navigate to="/auth" replace />;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          {/* Explizite Routen zuerst, damit Links aus E-Mails sicher auf der richtigen Seite landen */}
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/*" element={
            <ProtectedOrPublicRoute>
              <Layout />
            </ProtectedOrPublicRoute>
          }>
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