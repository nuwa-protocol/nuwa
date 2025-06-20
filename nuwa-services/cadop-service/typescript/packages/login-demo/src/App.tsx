import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Home } from './pages/Home';
import { Callback } from './pages/Callback';
import './styles.css';
import { createContext, useContext, ReactNode } from 'react';
import { useNuwaIdentityKit, IdentityKitHook } from '@nuwa-ai/identity-kit-web';
import { getCadopDomain } from './pages/Home';

// Create a context for the auth state and methods
const AuthContext = createContext<IdentityKitHook | null>(null);

// Custom hook to access auth context
export function useAuth(): IdentityKitHook {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Auth Provider component
function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useNuwaIdentityKit({
    appName: 'Nuwa Login Demo',
    cadopDomain: getCadopDomain(),
    storage: 'local',
  });

  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/callback" element={<Callback />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
