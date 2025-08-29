import React, { useState } from 'react';
import { DesktopNavigation, MobileNavigation } from './Navigation';
import { Header } from './Header';

interface MainLayoutProps {
  children: React.ReactNode;
  /** Whether to render the sidebar */
  hasSidebar?: boolean;
  /** Whether to render the header */
  hasHeader?: boolean;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children, hasSidebar = true, hasHeader = true }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(hasSidebar);

  const toggleSidebar = () => {
    if (hasSidebar) {
      setIsSidebarOpen(!isSidebarOpen);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      {hasHeader && <Header onToggleSidebar={toggleSidebar} />}

      {/* Sidebar */}
      {hasSidebar && (
        <aside
          className={`fixed inset-y-0 left-0 z-20 w-64 transform bg-white border-r border-gray-200 ${hasHeader ? 'pt-16' : 'pt-0'} lg:translate-x-0 lg:static lg:inset-0 ${
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } transition-transform duration-300 ease-in-out`}
        >
          <div className="h-full px-4 py-4">
            <DesktopNavigation />
          </div>
        </aside>
      )}

      {/* Main content */}
      <main
        className={`flex-1 pb-20 lg:pb-6 ${hasHeader ? 'pt-16' : 'pt-0'} ${
          hasSidebar && isSidebarOpen ? 'lg:pl-64' : ''
        } transition-padding duration-300 ease-in-out`}
      >
        <div className="px-4 sm:px-6 lg:px-8">{children}</div>
      </main>

      {/* Mobile bottom navigation */}
      {hasSidebar && (
        <nav className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-gray-200 lg:hidden">
          <MobileNavigation />
        </nav>
      )}
    </div>
  );
};
