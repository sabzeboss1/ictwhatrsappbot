import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './lib/auth-context';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Overview } from './pages/Overview';
import { Conversations } from './pages/Conversations';
import { Leads } from './pages/Leads';
import { LeadDetail } from './pages/LeadDetail';
import { Settings } from './pages/Settings';
import { Simulator } from './pages/Simulator';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 10,
      retry: 1,
    },
  },
});

const ProtectedRoute: React.FC<{ children: React.ReactNode; requireAdmin?: boolean }> = ({
  children,
  requireAdmin,
}) => {
  const { user, loading, isAdmin } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b141a] flex items-center justify-center text-slate-500 text-xs">
        Chargement de l'application...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Overview />} />
              <Route path="conversations" element={<Conversations />} />
              <Route path="leads" element={<Leads />} />
              <Route path="leads/:id" element={<LeadDetail />} />
              <Route path="simulator" element={<Simulator />} />
              <Route
                path="settings"
                element={
                  <ProtectedRoute requireAdmin>
                    <Settings />
                  </ProtectedRoute>
                }
              />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
