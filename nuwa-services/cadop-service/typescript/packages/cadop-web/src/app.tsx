import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/auth/AuthContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { LoginPage } from './pages/auth/login';
import { DashboardPage } from './pages/dashboard';
import { CreateAgentDIDPage } from './pages/create-agent-did';
import { TestPage } from './pages/test';

const App: React.FC = () => {
  return (
    <AuthProvider>
      <Routes>
        {/* 公开路由 */}
        <Route path="/auth/login" element={<LoginPage />} />
        
        {/* 受保护路由 */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        
        {/* 默认重定向到仪表板 */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        
        {/* 404 页面重定向到仪表板 */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
        
        <Route path="/create-did" element={<CreateAgentDIDPage />} />
        <Route path="/test" element={<TestPage />} />
        {/* Add more routes as they are implemented */}
      </Routes>
    </AuthProvider>
  );
};

export default App; 