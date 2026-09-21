import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { Layout } from './components/layout/Layout';
import { LoginPage } from './pages/LoginPage';
import { SetupAdminPage } from './pages/SetupAdminPage';
import { DashboardPage } from './pages/DashboardPage';
import { SOPListPage } from './pages/SOPListPage';
import { SOPCreatePage } from './pages/SOPCreatePage';
import { SOPDetailPage } from './pages/SOPDetailPage';
import { SOPPrintPage } from './pages/SOPPrintPage';
import { DepartmentManagementPage } from './pages/DepartmentManagementPage';
import { UserManagementPage } from './pages/UserManagementPage';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { ReportsPage } from './pages/ReportsPage';

const ProtectedRoute: React.FC<{ children: React.ReactNode; adminOnly?: boolean }> = ({
  children,
  adminOnly = false,
}) => {
  const { user, token, loading, isAdmin } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-400 text-sm">
        Initializing NKB SOP Portal...
      </div>
    );
  }

  if (!user && !token) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/setup" element={<SetupAdminPage />} />

            {/* Standalone print page without sidebar */}
            <Route
              path="/sops/:id/print"
              element={
                <ProtectedRoute>
                  <SOPPrintPage />
                </ProtectedRoute>
              }
            />

            {/* Main Application Layout */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="sops" element={<SOPListPage />} />
              <Route path="sops/create" element={<SOPCreatePage />} />
              <Route path="sops/:id" element={<SOPDetailPage />} />
              <Route path="departments" element={<DepartmentManagementPage />} />
              <Route
                path="users"
                element={
                  <ProtectedRoute adminOnly>
                    <UserManagementPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="audit-logs"
                element={
                  <ProtectedRoute adminOnly>
                    <AuditLogsPage />
                  </ProtectedRoute>
                }
              />
              <Route path="reports" element={<ReportsPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
