import React, { useState, useEffect, ReactNode } from 'react';
import { BoltIcon, XIcon, SunIcon, MoonIcon, LoadingIcon } from './AppIcons'; // Import all required icon components

type ActiveSidePanel = 'examples' | 'tools';

interface HeaderProps {
  onRunClick: () => void;
  isRunning: boolean;
  isRunDisabled: boolean;
}

interface LayoutProps {
  headerProps: HeaderProps;
  sidebarContent: ReactNode;
  mainPanelTitle: string;
  mainPanelContent: ReactNode;
  scriptPanelTitle: string;
  scriptPanelContent: ReactNode;
  chatPanelContent: ReactNode;
  onSelectSidebarTab: (tab: ActiveSidePanel) => void;
  initialActiveSidePanel: ActiveSidePanel;
}

const Layout: React.FC<LayoutProps> = ({
  headerProps,
  sidebarContent,
  mainPanelTitle,
  mainPanelContent,
  scriptPanelTitle,
  scriptPanelContent,
  chatPanelContent,
  onSelectSidebarTab,
  initialActiveSidePanel,
}) => {
  const [activeSidePanel, setActiveSidePanel] = useState<ActiveSidePanel>(initialActiveSidePanel);
  const [scriptPanelHeight, setScriptPanelHeight] = useState<string>('40%');
  const [isDragging, setIsDragging] = useState(false);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const savedPreference = localStorage.getItem('darkMode');
    if (savedPreference !== null) {
      return savedPreference === 'true';
    }
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', darkMode.toString());
  }, [darkMode]);

  useEffect(() => {
    setActiveSidePanel(initialActiveSidePanel);
  }, [initialActiveSidePanel]);

  const handleSidebarTabClick = (tab: ActiveSidePanel) => {
    setActiveSidePanel(tab);
    onSelectSidebarTab(tab);
  };

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  const startResize = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const container = document.querySelector('.main-container-for-resize') as HTMLDivElement;
        if (container) {
          const containerRect = container.getBoundingClientRect();
          const y = e.clientY - containerRect.top;

          const height = containerRect.height || 1;
          const percentage = (y / height) * 100;

          const minHeightPercent = 15;
          const maxHeightPercent = 85;

          const clampedPercentage = Math.min(Math.max(percentage, minHeightPercent), maxHeightPercent);

          const scriptPanelHeightPercent = 100 - clampedPercentage;
          setScriptPanelHeight(`${scriptPanelHeightPercent}%`);
        }
      }
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
      }
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp, { once: true });
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div className="flex flex-col h-screen bg-gray-100 dark:bg-gray-900 main-container-for-resize">
      <header className="nuwa-header flex items-center justify-between px-4 py-2 shadow-md bg-white dark:bg-gray-800 flex-shrink-0">
        <div className="flex items-center space-x-4">
          <a href="https://github.com/rooch-network/nuwa" target="_blank" rel="noopener noreferrer" className="flex items-center">
            <img src="/nuwa-icon.svg" alt="Nuwa Logo" className="logo h-8 w-8" />
          </a>
          <div className="ml-2 text-lg font-semibold text-gray-800 dark:text-gray-200">NuwaScript Playground</div>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={toggleDarkMode}
            className="p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
          >
            {darkMode ? (
              <SunIcon className="theme-toggle-icon" />
            ) : (
              <MoonIcon className="theme-toggle-icon" />
            )}
          </button>
          <button
            onClick={headerProps.onRunClick}
            disabled={headerProps.isRunDisabled}
            className="nuwa-button flex items-center"
          >
            {headerProps.isRunning ? (
              <>
                <LoadingIcon size="small" className="-ml-1 mr-2 text-white" />
                Running...
              </>
            ) : (
              <>
                <BoltIcon className="mr-1" /> Run
              </>
            )}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside 
          className="fixed-sidebar-width bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col"
        >
          <div className="flex border-b border-gray-200 dark:border-gray-700">
            <button
              className={`flex-1 py-2 px-4 text-sm font-medium text-center ${activeSidePanel === 'examples' ? 'bg-gray-100 dark:bg-gray-700 text-brand-primary' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
              onClick={() => handleSidebarTabClick('examples')}
            >
              Examples
            </button>
            <button
              className={`flex-1 py-2 px-4 text-sm font-medium text-center ${activeSidePanel === 'tools' ? 'bg-gray-100 dark:bg-gray-700 text-brand-primary' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
              onClick={() => handleSidebarTabClick('tools')}
            >
              Tools
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {sidebarContent}
          </div>
        </aside>

        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 flex flex-col main-panel min-w-[600px]">
              <div className="flex-1 overflow-hidden relative bg-white flex flex-col">
                <div className="flex items-center px-4 py-2 bg-white border-b border-gray-200 flex-shrink-0">
                  <BoltIcon size="small" className="text-gray-700 mr-2 w-4 h-4" />
                  <span className="text-sm text-gray-700">{mainPanelTitle}</span>
                </div>
                <div className="flex-1 p-4 bg-white overflow-auto flex flex-col">
                    {mainPanelContent}
                </div>
              </div>

              <div className="border-t border-gray-200 flex flex-col" style={{ height: scriptPanelHeight }}>
                <div
                  className="resize-handle cursor-ns-resize w-full h-1 bg-gray-200 hover:bg-blue-300 flex-shrink-0"
                  onMouseDown={startResize}
                ></div>
                <div className="px-4 py-1 bg-white border-b border-gray-200 text-sm text-gray-700 flex justify-between items-center flex-shrink-0">
                  <div>{scriptPanelTitle}</div>
                  <button
                    onClick={() => setScriptPanelHeight('40%')}
                    className="text-gray-500 hover:text-gray-700 p-1"
                  >
                    <XIcon size="small" className="reset-icon" style={{ width: '16px', height: '16px', display: 'inline-block' }} />
                  </button>
                </div>
                <div className="flex-1 h-full">
                  {scriptPanelContent}
                </div>
              </div>
            </div>

            <div className="w-80 min-w-[320px] max-w-xs border-l border-gray-200 bg-white overflow-hidden flex flex-col flex-shrink-0">
              <div className="h-full flex flex-col">
                {chatPanelContent}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;