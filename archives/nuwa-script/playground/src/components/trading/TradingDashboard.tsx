import React, { useState, useEffect } from 'react';
import { 
  tradingState, 
  subscribeToTradingChanges, 
  TradingState, 
} from '../../examples/trading';

interface TradingDashboardProps {
  // Props for passing data or callback functions from external
  onRefresh?: () => void;
}

const TradingDashboard: React.FC<TradingDashboardProps> = ({ onRefresh }) => {
  const [data, setData] = useState<TradingState>({ ...tradingState });
  const [isLoading, setIsLoading] = useState(true);

  // Subscribe to trading state changes
  useEffect(() => {
    // Initial load
    const loadData = () => {
      setIsLoading(true);
      // Simulate API request delay
      setTimeout(() => {
        setData({ ...tradingState });
        setIsLoading(false);
      }, 500);
    };

    loadData();

    // Set up subscription to state changes
    const unsubscribe = subscribeToTradingChanges(() => {
      console.log('[TradingDashboard] Received trading state update');
      setData({ ...tradingState });
    });

    // Cleanup function
    return () => {
      unsubscribe();
    };
  }, []);

  // Format number as currency
  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  // Format date
  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString();
  };

  // Handle refresh button click
  const handleRefresh = () => {
    setIsLoading(true);
    // Simulate API request delay
    setTimeout(() => {
      setData({ ...tradingState });
      setIsLoading(false);
      if (onRefresh) onRefresh();
    }, 500);
  };

  return (
    <div className="trading-dashboard bg-white rounded-lg shadow p-4 w-full h-full overflow-auto">
      {isLoading ? (
        <div className="flex justify-center items-center h-full">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      ) : (
        <>
          {/* Top asset summary */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">DeFi Asset Overview</h2>
              <button 
                onClick={handleRefresh}
                className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
            </div>
            <div className="bg-gray-100 p-4 rounded-lg">
              <div className="text-sm text-gray-600 mb-1">Total Asset Value</div>
              <div className="text-2xl font-bold">{formatCurrency(data.totalValue)}</div>
              <div className="text-xs text-gray-500">Last updated: {formatDate(data.lastUpdated)}</div>
            </div>
          </div>

          {/* Asset list */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3">Asset Details</h3>
            <div className="bg-gray-50 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-100">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Asset</th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Balance</th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">24h Change</th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Value</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.assets.map((asset) => (
                    <tr key={asset.symbol}>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-medium text-gray-900">{asset.symbol}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-900">{asset.balance.toFixed(asset.symbol === 'USDC' ? 2 : 4)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-900">{formatCurrency(asset.price)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          asset.change24h === undefined ? 'bg-gray-100 text-gray-800' :
                          asset.change24h > 0 ? 'bg-green-100 text-green-800' : 
                          asset.change24h < 0 ? 'bg-red-100 text-red-800' : 
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {asset.change24h === undefined ? 'N/A' : 
                           asset.change24h > 0 ? `+${asset.change24h}%` : 
                           `${asset.change24h}%`}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-900">{formatCurrency(asset.balance * asset.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Trade history */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Trade History</h3>
            {data.tradeHistory.length > 0 ? (
              <div className="bg-gray-50 rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-100">
                    <tr>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trade</th>
                      <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {data.tradeHistory.map((trade) => (
                      <tr key={trade.id}>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{formatDate(trade.timestamp)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center">
                            <span className="font-medium text-gray-900">{trade.fromSymbol}</span>
                            <svg className="w-4 h-4 mx-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                            </svg>
                            <span className="font-medium text-gray-900">{trade.toSymbol}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <div className="text-sm text-gray-900">{trade.fromAmount.toFixed(2)} {trade.fromSymbol}</div>
                          <div className="text-sm text-gray-500">{trade.toAmount.toFixed(4)} {trade.toSymbol}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500">No trade records</div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default TradingDashboard; 