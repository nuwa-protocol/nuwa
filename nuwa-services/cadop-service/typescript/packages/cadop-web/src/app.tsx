import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { MainLayout } from './components/layout/MainLayout';
import { DashboardPage } from './pages/dashboard';
import { CreateAgentDIDPage } from './pages/create-agent-did';
import { TestPage } from './pages/test';

const App: React.FC = () => {
  return (
    <Router>
      <MainLayout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/create-did" element={<CreateAgentDIDPage />} />
          <Route path="/test" element={<TestPage />} />
          {/* Add more routes as they are implemented */}
        </Routes>
      </MainLayout>
    </Router>
  );
};

export default App; 