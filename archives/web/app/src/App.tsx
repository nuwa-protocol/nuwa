import {
  BrowserRouter as Router,
  Routes,
  Route,
  useLocation,
} from "react-router-dom";
import { Sidebar } from "./components/layout/Sidebar";
import { Home } from "./pages/Home";
import { AIStudio } from "./pages/AIStudio";
import { CreateAgent } from "./pages/CreateAgent";
import { AllAgents } from "./pages/AllAgents";
import { ProfileRouter } from "./components/profile/ProfileRouter";
import { useState, useEffect, Suspense, lazy } from "react";
import { DocPage } from "./pages/docs/DocPage";
import { Header } from "./components/layout/Header";
import { HelmetProvider } from "react-helmet-async";
import { ThemeProvider, useTheme } from "./providers/ThemeProvider";
import { GetRGAS } from "./pages/GetRGAS";
import { GetRGASTestnet } from "./pages/GetRGASTestNet";
import { RiskWarningModal } from "./components/RiskWarningModal";
import { useConnectionStatus } from "@roochnetwork/rooch-sdk-kit";
import { LoadingScreen } from "./components/layout/LoadingScreen";
import { NotFound } from "./pages/NotFound";
import { AgentDebugger } from "./pages/AgentDebugger";
import { ToastContainer, Slide } from "react-toastify";
import { useLocalStorageState } from "ahooks";

// preload AgentChat component
const AgentChat = lazy(() =>
  import("./pages/AgentChat").then((module) => {
    // preload agent data after component is loaded
    const preloadAgent = (id: string) => {
      import("@/hooks/useAgent").then(({ default: useAgent }) => {
        useAgent(id);
      });
    };
    return {
      default: module.AgentChat,
      preload: preloadAgent,
    };
  }),
);

function AppContent() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const { theme } = useTheme();
  const location = useLocation();
  const connectionStatus = useConnectionStatus();
  const [showRiskWarning, setShowRiskWarning] = useState(false);

  const [hasSeenRiskWarning] = useLocalStorageState<boolean | undefined>(
    "nuwa-hasSeenRiskWarning",
    {
      defaultValue: false,
    },
  );

  // Scroll to top when route changes
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  // Show risk warning when wallet is connected
  useEffect(() => {
    if (connectionStatus === "connected") {
      if (!hasSeenRiskWarning) {
        setShowRiskWarning(true);
      }
    }
  }, [connectionStatus, hasSeenRiskWarning]);

  // preload agent data
  useEffect(() => {
    const agentId = location.pathname.match(/\/agent\/([^\/]+)/)?.[1];
    if (agentId) {
      // @ts-ignore - preload method will be available after component is loaded
      AgentChat.preload?.(agentId);
    }
  }, [location.pathname]);

  return (
    <div className="flex h-screen flex-col bg-gray-50 dark:bg-gray-900">
      <Header isDarkMode={theme === "dark"} />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden pt-16">
        <Sidebar
          onCollapse={setIsSidebarCollapsed}
          isCollapsed={isSidebarCollapsed}
        />
        <div
          className={`flex-1 overflow-auto ${
            isSidebarCollapsed ? "md:ml-16" : "md:ml-64"
          } transition-all duration-300`}
        >
          <Suspense fallback={<LoadingScreen />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/studio" element={<AIStudio />} />
              <Route path="/studio/create" element={<CreateAgent />} />
              <Route
                path="/agent/:username/:channelTitle?"
                element={<AgentChat />}
              />
              <Route path="/profile/:identifier" element={<ProfileRouter />} />
              {/* cSpell:ignore allagents */}
              <Route path="/allagents" element={<AllAgents />} />
              <Route path="/docs/:docId" element={<DocPage />} />
              {/* cSpell:ignore getrgas */}
              <Route path="/getrgas" element={<GetRGAS />} />
              <Route path="/getrgas-testnet" element={<GetRGASTestnet />} />
              <Route
                path="/profile/:identifier/debug"
                element={<AgentDebugger />}
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </div>
      </div>

      <RiskWarningModal
        isOpen={showRiskWarning}
        onClose={() => setShowRiskWarning(false)}
      />
    </div>
  );
}

function App() {
  const [theme] = useLocalStorageState<"dark" | "light">("nuwa-theme", {
    defaultValue: window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light",
  });

  return (
    <HelmetProvider>
      <ThemeProvider>
        <Router>
          <ToastContainer
            position="bottom-left"
            theme={theme}
            transition={Slide}
            hideProgressBar
          />
          <AppContent />
        </Router>
      </ThemeProvider>
    </HelmetProvider>
  );
}

export default App;
