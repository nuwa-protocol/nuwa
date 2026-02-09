import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { LoginPage } from './pages/auth/login';
import { DashboardPage } from './pages/dashboard';
import { CreateAgentDIDPage } from './pages/create-agent-did';
import { AgentDetailPage } from './pages/agent-detail';
import { AddAuthMethodPage } from './pages/add-auth-method';
import { AddKeyPage } from './pages/add-key';
import { ClosePage } from './pages/close';
import { OnboardingGuard } from './components/onboarding/OnboardingGuard';
import { OnboardingPage } from './pages/onboarding';
import { RevenueHistoryPage } from './pages/revenue-history';
import { Toaster } from './components/ui/toaster';
import { DebugLogger } from '@nuwa-ai/identity-kit';

const GLOBAL_DEBUG = import.meta.env.DEV;

const App: React.FC = () => {
  DebugLogger.setGlobalLevel(GLOBAL_DEBUG ? 'debug' : 'info');
  return (
    <>
      <Routes>
        {/* Public routes */}
        <Route path="/auth/login" element={<LoginPage />} />
        <Route path="/agent/:did" element={<AgentDetailPage />} />
        <Route
          path="/add-key"
          element={
            <OnboardingGuard>
              <AddKeyPage />
            </OnboardingGuard>
          }
        />
        <Route path="/close" element={<ClosePage />} />
        <Route path="/setup" element={<OnboardingPage />} />

        {/* Protected routes */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/agent/:did/add-auth-method"
          element={
            <ProtectedRoute>
              <AddAuthMethodPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/agent/:did/revenue-history"
          element={
            <ProtectedRoute>
              <RevenueHistoryPage />
            </ProtectedRoute>
          }
        />

        {/* Default redirect to dashboard */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        {/* 404 page redirect to dashboard */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />

        <Route path="/create-agent-did" element={<CreateAgentDIDPage />} />
        {/* Add more routes as they are implemented */}
      </Routes>
      <Toaster />
    </>
  );
};

export default App;
