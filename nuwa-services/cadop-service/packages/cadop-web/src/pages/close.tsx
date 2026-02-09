import { CheckCircle2, Copy, KeyRound, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  FixedCardActionButton,
  FixedCardActions,
  FixedCardLayout,
} from '@/components/ui/FixedCardLayout';

function displaySuccess(success: string | null): boolean | null {
  if (success === null) return null;
  if (success === '1' || success === 'true') return true;
  if (success === '0' || success === 'false') return false;
  return null;
}

export function ClosePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [copiedField, setCopiedField] = useState<'agent' | 'key' | null>(null);

  const result = useMemo(() => {
    const success = displaySuccess(searchParams.get('success'));
    const agentDid = searchParams.get('agent');
    const keyId = searchParams.get('key_id');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    return { success, agentDid, keyId, state, error };
  }, [searchParams]);

  const copyText = async (value: string, field: 'agent' | 'key') => {
    await navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  const handleClose = () => {
    // `window.close()` only works for windows opened by script in most browsers.
    window.close();

    setTimeout(() => {
      if (window.history.length > 1) {
        window.history.back();
        return;
      }
      navigate('/dashboard', { replace: true });
    }, 100);
  };

  const title =
    result.success === true
      ? 'Authentication key added'
      : result.success === false
        ? 'Add key failed'
        : 'Add key result';

  const subtitle =
    result.success === true
      ? 'Your key has been successfully linked to your DID.'
      : result.success === false
        ? result.error || 'The key was not added. Please retry from your agent.'
        : 'No result payload was found in this callback URL.';

  return (
    <FixedCardLayout
      icon={
        result.success === true ? (
          <CheckCircle2 className="h-12 w-12 text-green-600" />
        ) : (
          <XCircle className="h-12 w-12 text-red-500" />
        )
      }
      title={title}
      subtitle={subtitle}
      actions={
        <FixedCardActions>
          <FixedCardActionButton
            onClick={handleClose}
            size="lg"
          >
            Close
          </FixedCardActionButton>
        </FixedCardActions>
      }
    >
      <div className="space-y-4 pb-8">
        {result.agentDid && (
          <div className="rounded-lg border border-gray-200 p-4 bg-white">
            <div className="text-xs text-gray-500 mb-2">DID</div>
            <div className="font-mono text-sm break-all text-gray-900">{result.agentDid}</div>
            <button
              type="button"
              onClick={() => copyText(result.agentDid as string, 'agent')}
              className="mt-3 inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
            >
              <Copy className="h-4 w-4" />
              {copiedField === 'agent' ? 'Copied' : 'Copy DID'}
            </button>
          </div>
        )}

        {result.keyId && (
          <div className="rounded-lg border border-gray-200 p-4 bg-white">
            <div className="text-xs text-gray-500 mb-2 flex items-center gap-1">
              <KeyRound className="h-3 w-3" />
              Verification Method
            </div>
            <div className="font-mono text-sm break-all text-gray-900">{result.keyId}</div>
            <button
              type="button"
              onClick={() => copyText(result.keyId as string, 'key')}
              className="mt-3 inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
            >
              <Copy className="h-4 w-4" />
              {copiedField === 'key' ? 'Copied' : 'Copy Key ID'}
            </button>
          </div>
        )}

        {result.state && (
          <div className="rounded-lg border border-gray-100 p-3 bg-gray-50">
            <div className="text-xs text-gray-500 mb-1">State</div>
            <div className="font-mono text-xs break-all text-gray-700">{result.state}</div>
          </div>
        )}
      </div>
    </FixedCardLayout>
  );
}
