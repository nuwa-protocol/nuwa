import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
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
const DEFAULT_TITLE = 'Nuwa ID';
const DEFAULT_DESCRIPTION =
  'Create and manage your Nuwa DID with passkey authentication, then securely authorize keys for agent and app workflows.';

function getPageMeta(pathname: string): { title: string; description: string } {
  if (pathname.startsWith('/add-key')) {
    return {
      title: 'Authorize Key Request | Nuwa ID',
      description: 'Review the key request and authorize it to your DID only when you trust the source.',
    };
  }
  if (pathname.startsWith('/setup')) {
    return {
      title: 'Create Your DID | Nuwa ID',
      description: 'Set up your passkey and create your DID in a guided flow.',
    };
  }
  if (pathname.startsWith('/auth/login')) {
    return {
      title: 'Sign In | Nuwa ID',
      description: 'Sign in with passkey or wallet to continue to your DID workspace.',
    };
  }
  if (pathname.startsWith('/dashboard')) {
    return {
      title: 'Dashboard | Nuwa ID',
      description: 'Manage your DID profile, keys, and service authorization status.',
    };
  }
  if (pathname.startsWith('/create-agent-did')) {
    return {
      title: 'Create Agent DID | Nuwa ID',
      description: 'Create a DID for agent workflows and keep ownership under your account.',
    };
  }
  if (pathname.startsWith('/close')) {
    return {
      title: 'Completed | Nuwa ID',
      description: 'This authorization flow is completed. You can close this window safely.',
    };
  }

  return {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  };
}

const App: React.FC = () => {
  const location = useLocation();

  DebugLogger.setGlobalLevel(GLOBAL_DEBUG ? 'debug' : 'info');

  React.useEffect(() => {
    const { title, description } = getPageMeta(location.pathname);
    document.title = title;

    const descriptionMeta = document.querySelector('meta[name="description"]');
    if (descriptionMeta) {
      descriptionMeta.setAttribute('content', description);
    }
  }, [location.pathname]);

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
