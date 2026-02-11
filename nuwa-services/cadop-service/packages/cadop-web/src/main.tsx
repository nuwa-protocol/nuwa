import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './lib/auth/AuthContext';
import { VDRProvider } from './lib/identity/VDRProvider';
import { RoochWalletProvider } from './components/providers/RoochWalletProvider';

import App from './app';
import i18n from './i18n';
import './styles/index.css';

// Cadop web is intentionally light-only for now.
document.documentElement.classList.remove('dark');
document.body.classList.remove('dark');
document.documentElement.style.colorScheme = 'light';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <BrowserRouter>
          <RoochWalletProvider>
            <VDRProvider>
              <AuthProvider>
                <App />
              </AuthProvider>
            </VDRProvider>
          </RoochWalletProvider>
        </BrowserRouter>
      </I18nextProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
