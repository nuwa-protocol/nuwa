import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const DashboardPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const quickActions = [
    {
      title: t('dashboard.createDID'),
      icon: '🆕',
      onClick: () => navigate('/create-did'),
    },
    {
      title: t('dashboard.verifyIdentity'),
      icon: '✅',
      onClick: () => navigate('/verification'),
    },
    {
      title: t('dashboard.manageDID'),
      icon: '⚙️',
      onClick: () => navigate('/did-management'),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="text-center py-8">
        <h1 className="text-3xl font-bold text-gray-900">
          {t('dashboard.welcome')}
        </h1>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {quickActions.map((action) => (
          <div
            key={action.title}
            className="cursor-pointer"
            onClick={action.onClick}
          >
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-6 text-center">
                <div className="text-4xl mb-4">{action.icon}</div>
                <h3 className="text-lg font-medium text-gray-900">{action.title}</h3>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>

      {/* Status Overview */}
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.status.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">0</div>
              <div className="text-sm text-gray-500">{t('dashboard.status.totalDIDs')}</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">0</div>
              <div className="text-sm text-gray-500">{t('dashboard.status.verifiedIdentities')}</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">-</div>
              <div className="text-sm text-gray-500">{t('dashboard.status.recentActivity')}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}; 