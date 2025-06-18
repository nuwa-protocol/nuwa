import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { LoginPage } from './pages/auth/login';
import { DashboardPage } from './pages/dashboard';
import { CreateAgentDIDPage } from './pages/create-agent-did';
import { AgentDetailPage } from './pages/agent-detail';
import { AddAuthMethodPage } from './pages/add-auth-method';
import { AddKeyPage } from './pages/add-key';
import { WebAuthnDebugPage } from './pages/webauthn-debug';

const App: React.FC = () => {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/auth/login" element={<LoginPage />} />
      <Route path="/debug/webauthn" element={<WebAuthnDebugPage />} />
      <Route path="/agent/:did" element={<AgentDetailPage />} />
      <Route path="/add-key" element={<AddKeyPage />} />

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

      {/* Default redirect to dashboard */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      {/* 404 page redirect to dashboard */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />

      <Route path="/create-agent-did" element={<CreateAgentDIDPage />} />
      {/* Add more routes as they are implemented */}
    </Routes>
  );
};

export default App;
