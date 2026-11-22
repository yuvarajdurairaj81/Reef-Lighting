import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ReactNode } from 'react';
import { useAuth } from './auth/AuthContext';
import { Spinner } from './components/ui';
import { AppLayout } from './layouts/AppLayout';
import { LoginPage } from './pages/auth/Login';
import { RegisterPage } from './pages/auth/Register';
import { ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage } from './pages/auth/EmailFlows';
import { DashboardPage } from './pages/Dashboard';
import { TanksPage } from './pages/Tanks';
import { DevicesPage } from './pages/Devices';
import { LightingConfigPage } from './pages/LightingConfig';
import { ProfilesPage } from './pages/Profiles';
import { SchedulerPage } from './pages/Scheduler';
import { EnergyPage } from './pages/Energy';
import { AlertsPage } from './pages/Alerts';
import { SettingsPage } from './pages/Settings';
import { UsersPage } from './pages/Users';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner label="Starting…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

function RequireEnterpriseAdmin({ children }: { children: ReactNode }) {
  const { isEnterprise, can } = useAuth();
  return isEnterprise && can('admin') ? <>{children}</> : <Navigate to="/" replace />;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Starting…" />;
  return user ? <Navigate to="/" replace /> : <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
      <Route path="/register" element={<PublicOnly><RegisterPage /></PublicOnly>} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<DashboardPage />} />
        <Route path="tanks" element={<TanksPage />} />
        <Route path="devices" element={<DevicesPage />} />
        <Route path="lighting" element={<LightingConfigPage />} />
        <Route path="profiles" element={<ProfilesPage />} />
        <Route path="scheduler" element={<SchedulerPage />} />
        <Route path="energy" element={<EnergyPage />} />
        <Route path="alerts" element={<AlertsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="users" element={<RequireEnterpriseAdmin><UsersPage /></RequireEnterpriseAdmin>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
