import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom'; // Provides Router context for hooks like useSearchParams
import App from './App.tsx';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    {/* Wrap the app in a Router so hooks like useLocation/useSearchParams have context */}
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
