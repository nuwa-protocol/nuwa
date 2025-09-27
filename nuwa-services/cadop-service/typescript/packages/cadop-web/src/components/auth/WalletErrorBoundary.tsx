import React from 'react';

interface WalletErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface WalletErrorBoundaryProps {
  children: React.ReactNode;
  onError?: (error: string) => void;
}

export class WalletErrorBoundary extends React.Component<
  WalletErrorBoundaryProps,
  WalletErrorBoundaryState
> {
  constructor(props: WalletErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): WalletErrorBoundaryState {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[WalletErrorBoundary] Wallet component error:', error, errorInfo);

    // Check if this is the specific getBitcoinAddressWith error
    const errorMessage = error.message || '';
    const errorStack = error.stack || '';
    console.error('[WalletErrorBoundary] Error message:', errorMessage);
    console.error('[WalletErrorBoundary] Error stack:', errorStack);
    const friendlyMessage =
      'Wallet connection failed due to a compatibility issue with the local wallet. Please install a Bitcoin wallet extension like UniSat or OKX Wallet for the best experience.';
    this.props.onError?.(friendlyMessage);
  }

  render() {
    if (this.state.hasError) {
      // Fallback UI
      return (
        <div className="space-y-4">
          <div className="text-center py-4">
            <p className="text-red-600 text-sm">
              Wallet component failed to load. Please refresh the page and ensure you have a Bitcoin
              wallet extension installed.
            </p>
          </div>
          <button
            type="button"
            className="w-full flex justify-center items-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-gray-50 cursor-not-allowed"
            disabled
          >
            Wallet Unavailable
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
