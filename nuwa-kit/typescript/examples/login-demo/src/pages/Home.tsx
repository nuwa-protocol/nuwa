import { useState } from 'react';
import { ConnectButton } from '../components/ConnectButton';
import { SignButton } from '../components/SignButton';
import { VerifyButton } from '../components/VerifyButton';
import { GatewayDebugPanel } from '../components/GatewayDebugPanel';
import { useAuth } from '../App';

export const DEFAULT_CADOP_DOMAIN = 'test-id.nuwa.dev';

export function getCadopDomain(): string {
  return localStorage.getItem('nuwa-login-demo:cadop-domain') || DEFAULT_CADOP_DOMAIN;
}

export function setCadopDomain(domain: string): void {
  localStorage.setItem('nuwa-login-demo:cadop-domain', domain);
}

export function Home() {
  const { state, logout } = useAuth();
  const [signatureObj, setSignatureObj] = useState<any | null>(null);
  const [signatureStr, setSignatureStr] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cadopDomain, setCadopDomainState] = useState(getCadopDomain());

  const handleConnecting = () => {
    setError(null);
  };

  const handleError = (err: Error) => {
    setError(err.message);
  };

  const handleSignatureCreated = (sig: unknown) => {
    setSignatureObj(sig);
    setSignatureStr(formatSignature(sig));
    setVerifyResult(null);
  };

  const handleDomainChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDomain = e.target.value;
    setCadopDomainState(newDomain);
    setCadopDomain(newDomain);
  };

  const resetDomain = () => {
    setCadopDomainState(DEFAULT_CADOP_DOMAIN);
    setCadopDomain(DEFAULT_CADOP_DOMAIN);
  };

  // Helper function to safely convert unknown to string
  const formatSignature = (value: unknown): string => {
    if (value === null || value === undefined) return '';

    if (typeof value === 'object') {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    }

    return String(value);
  };

  const handleDisconnect = () => {
    logout();

    setSignatureObj(null);
    setSignatureStr(null);
    setVerifyResult(null);
  };

  return (
    <div className="home-container">
      <header>
        <h1>Login with Nuwa Agent</h1>
        <p>Demo of deep-link integration with CADOP Web</p>
      </header>

      <main>
        {error && (
          <div className="error-message">
            <p>{error}</p>
            <button onClick={() => setError(null)}>Dismiss</button>
          </div>
        )}

        <div className="settings-container">
          <h2>Settings</h2>
          <div className="domain-setting">
            <label htmlFor="cadop-domain">CADOP Web Domain:</label>
            <input
              id="cadop-domain"
              type="text"
              value={cadopDomain}
              onChange={handleDomainChange}
              placeholder="Enter CADOP Web domain"
            />
            <button onClick={resetDomain} className="reset-button">
              Reset to Default
            </button>
          </div>
          <div className="domain-hint">
            <small>
              Use full URL（such as http://localhost:3000） or just domain（such as
              test-id.nuwa.dev）
            </small>
          </div>
        </div>

        <div className="connection-status">
          <h2>Connection Status</h2>
          <div className={`status-indicator ${state.isConnected ? 'connected' : 'disconnected'}`}>
            {state.isConnected ? 'Connected' : 'Not Connected'}
          </div>

          {state.isConnected && state.agentDid && (
            <div className="key-info">
              <p>
                <strong>Agent DID:</strong> {state.agentDid}
              </p>
              <p>
                <strong>Key ID:</strong> {state.keyId}
              </p>
              <button onClick={handleDisconnect} className="disconnect-button">
                Disconnect
              </button>
            </div>
          )}
        </div>

        <div className="action-container">
          {!state.isConnected ? (
            <div className="connect-container">
              <h2>Step 1: Connect your Agent DID</h2>
              <p>
                Click the button below to generate a new key and authorize it with your Nuwa Agent.
              </p>
              <ConnectButton onConnecting={handleConnecting} onError={handleError} />
            </div>
          ) : (
            <div className="login-container">
              <h2>Step 2: Sign a Challenge</h2>
              <p>Now you can sign a challenge using your authorized key.</p>
              <SignButton onSignatureCreated={handleSignatureCreated} onError={handleError} />
            </div>
          )}
        </div>

        {signatureStr && (
          <div className="signature-container">
            <h2>Signature Result</h2>
            <pre className="signature-output">{signatureStr}</pre>
            <VerifyButton signature={signatureObj} onVerified={ok => setVerifyResult(ok)} />
            {verifyResult !== null && (
              <p style={{ marginTop: '8px' }}>
                Verify Result: {verifyResult ? '✅ Passed' : '❌ Failed'}
              </p>
            )}
          </div>
        )}

        {/* Gateway Debug Panel */}
        {state.isConnected && <GatewayDebugPanel />}
      </main>

      <footer>
        <p>
          <a href="https://github.com/rooch-network/nuwa" target="_blank" rel="noopener noreferrer">
            Nuwa Project
          </a>{' '}
          |
          <a
            href="https://github.com/rooch-network/nuwa/tree/main/nuwa-services/cadop-service/docs/third_party_login_integration.md"
            target="_blank"
            rel="noopener noreferrer"
          >
            Integration Guide
          </a>
        </p>
      </footer>
    </div>
  );
}
