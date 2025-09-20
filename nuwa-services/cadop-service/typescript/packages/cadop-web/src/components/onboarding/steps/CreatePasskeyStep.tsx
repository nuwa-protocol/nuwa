import { KeyRound, RefreshCw, ExternalLink } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  FixedCardActionButton,
  FixedCardLayout,
  FixedCardLoading,
} from '@/components/ui';
import { Button } from '@/components/ui/button';
import { PasskeyService } from '@/lib/passkey/PasskeyService';
import { usePasskeyErrorHandler, type PasskeyErrorInfo } from '@/lib/passkey/PasskeyErrorHandler';

interface Props {
  onComplete: (userDid: string) => void;
}

export const CreatePasskeyStep: React.FC<Props> = ({ onComplete }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorInfo, setErrorInfo] = useState<PasskeyErrorInfo | null>(null);
  const { t } = useTranslation();
  const errorHandler = usePasskeyErrorHandler();

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    setErrorInfo(null);
    try {
      const service = new PasskeyService();
      const did = await service.ensureUser();
      onComplete(did);
    } catch (e) {
      const parsedError = errorHandler.parseError(e);
      setError(e instanceof Error ? e.message : String(e));
      setErrorInfo(parsedError);
    } finally {
      setLoading(false);
    }
  };

  const handleErrorAction = () => {
    if (errorInfo?.actionType === 'refresh') {
      window.location.reload();
    } else if (errorInfo?.actionType === 'learnMore') {
      window.open('https://webauthn.guide/', '_blank');
    } else {
      // Default to retry
      handleCreate();
    }
  };

  if (loading) {
    return (
      <FixedCardLoading title={t('passkey.creating')} message={t('passkey.creatingMessage')} />
    );
  }

  if (error && errorInfo) {
    const getActionIcon = () => {
      switch (errorInfo.actionType) {
        case 'refresh':
          return <RefreshCw className="h-4 w-4" />;
        case 'learnMore':
          return <ExternalLink className="h-4 w-4" />;
        default:
          return null;
      }
    };

    return (
      <FixedCardLayout
        icon={<KeyRound className="h-12 w-12 text-red-400" />}
        title={errorInfo.title}
        actions={
          <div className="flex flex-col gap-3 w-full">
            <FixedCardActionButton onClick={handleErrorAction} size="lg">
              {getActionIcon()}
              {errorInfo.actionLabel || t('passkey.retry')}
            </FixedCardActionButton>
            {errorInfo.actionType !== 'retry' && (
              <Button variant="outline" size="lg" onClick={handleCreate} className="w-full">
                {t('passkey.retry')}
              </Button>
            )}
          </div>
        }
      >
        <Alert variant="destructive">
          <AlertTitle>{errorInfo.title}</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{errorInfo.description}</p>
            {errorInfo.showTechnicalDetails && (
              <details className="mt-2">
                <summary className="cursor-pointer text-sm opacity-75">
                  {t('common.technicalDetails', '技术详情')}
                </summary>
                <pre className="mt-1 text-xs bg-gray-100 p-2 rounded overflow-auto">{error}</pre>
              </details>
            )}
          </AlertDescription>
        </Alert>
      </FixedCardLayout>
    );
  }

  return (
    <FixedCardLayout
      icon={<KeyRound className="h-12 w-12 text-primary-600" />}
      title={t('passkey.createTitle')}
      subtitle={t('passkey.createSubtitle')}
      actions={
        <FixedCardActionButton onClick={handleCreate} size="lg">
          {t('passkey.createButton')}
        </FixedCardActionButton>
      }
    >
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-md text-center">
        <p className="text-blue-800 font-semibold text-md">{t('passkey.noteMessage')}</p>
      </div>
    </FixedCardLayout>
  );
};
