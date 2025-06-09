import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/auth/AuthContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { LoginPage } from './pages/auth/login';
import { DashboardPage } from './pages/dashboard';
import { CreateAgentDIDPage } from './pages/create-agent-did';

const App: React.FC = () => {
  return (
    <AuthProvider>
      <Routes>
        {/* Public routes */}
        <Route path="/auth/login" element={<LoginPage />} />
        
        {/* Protected routes */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
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
    </AuthProvider>
  );
};

export default App; 