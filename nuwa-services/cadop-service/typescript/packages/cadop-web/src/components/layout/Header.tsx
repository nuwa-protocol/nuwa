import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui';
import { useAuth } from '@/lib/auth/AuthContext';

interface HeaderProps {
  onToggleSidebar: () => void;
}

export const Header = ({ onToggleSidebar }: HeaderProps) => {
  const { t, i18n } = useTranslation();
  const { signOut } = useAuth();

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
  };

  return (
    <header className="fixed top-0 z-30 w-full bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <button
              type="button"
              className="text-gray-500 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-300 lg:hidden"
              onClick={onToggleSidebar}
            >
              <span className="sr-only">Open sidebar</span>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
            <div className="ml-4 text-xl font-semibold text-gray-900 dark:text-white">
              Nuwa CADOP
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* Language Select */}
            <Select value={i18n.language} onValueChange={handleLanguageChange}>
              <SelectTrigger className="h-8 w-20 border-none bg-transparent px-2 text-gray-500 dark:text-gray-400 focus:ring-0">
                <SelectValue placeholder={i18n.language === 'en' ? 'EN' : '中文'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">EN</SelectItem>
                <SelectItem value="zh">中文</SelectItem>
              </SelectContent>
            </Select>

            {/* Theme toggle removed temporarily */}

            {/* Sign Out */}
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="text-gray-500 dark:text-gray-400"
            >
              {t('dashboard.signOut')}
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};
