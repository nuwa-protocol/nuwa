import { ExampleConfig, ComponentStateManager } from '../types/Example';
// Import z for schema definition
import { z } from 'zod';
// Import necessary types from nuwa-script (re-exported via services)
import type { 
  // ToolSchema, // No longer needed directly for definitions here
  // ToolFunction, // User functions won't directly use this type now
  // EvaluatedToolArguments, // Not needed for user functions
  StateValueWithMetadata,
  ToolRegistry,
  JsonValue,
  // NormalizedToolSchema // This will be implicitly handled by registration
} from '../services/interpreter';

// --- Trading State Management ---

// Asset state interface
export interface Asset {
  symbol: string;
  balance: number;
  price: number;
  change24h?: number;
}

// Trade history interface
export interface TradeHistory {
  id: string;
  fromSymbol: string;
  toSymbol: string;
  fromAmount: number;
  toAmount: number;
  timestamp: number;
}

// Trading state interface
export interface TradingState {
  assets: Asset[];
  tradeHistory: TradeHistory[];
  totalValue: number;
  lastUpdated: number;
}

// Initialize trading state
export const tradingState: TradingState = {
  assets: [
    { symbol: 'USDC', balance: 10000, price: 1.0, change24h: 0 },
    { symbol: 'BTC', balance: 0.5, price: 67500.42, change24h: 2.3 },
    { symbol: 'ETH', balance: 5.0, price: 3250.18, change24h: -1.2 },
    { symbol: 'SOL', balance: 100.0, price: 142.87, change24h: 5.7 },
  ],
  tradeHistory: [
    {
      id: '1',
      fromSymbol: 'USDC',
      toSymbol: 'BTC',
      fromAmount: 1000,
      toAmount: 0.01478,
      timestamp: Date.now() - 3600000 * 2, // 2 hours ago
    },
    {
      id: '2',
      fromSymbol: 'USDC',
      toSymbol: 'ETH',
      fromAmount: 500,
      toAmount: 0.1525,
      timestamp: Date.now() - 3600000 * 24, // 1 day ago
    },
    {
      id: '3',
      fromSymbol: 'ETH',
      toSymbol: 'SOL',
      fromAmount: 0.5,
      toAmount: 11.26,
      timestamp: Date.now() - 3600000 * 48, // 2 days ago
    },
  ],
  totalValue: 0, // Will be calculated during updateTradingState
  lastUpdated: Date.now()
};

// Calculate total value of assets
const calculateTotalValue = (assets: Asset[]): number => {
  return assets.reduce((sum, asset) => sum + asset.balance * asset.price, 0);
};

// Function for React components to subscribe to changes
let tradingChangeListeners: (() => void)[] = [];
export const subscribeToTradingChanges = (listener: () => void): (() => void) => {
  tradingChangeListeners.push(listener);
  // Return unsubscribe function
  return () => {
    tradingChangeListeners = tradingChangeListeners.filter(l => l !== listener);
  };
};

// Notify all listeners of state changes
const notifyTradingChange = () => {
  tradingChangeListeners.forEach(listener => listener());
};

// Helper function to create state with metadata
function createState<T>(value: T, description: string, formatter?: (value: unknown) => string): StateValueWithMetadata {
  return {
    value: value as unknown as JsonValue,
    metadata: {
      description,
      formatter: formatter as unknown as ((value: JsonValue) => string) | undefined
    }
  };
}

// Update trading state in the registry
export function updateTradingState(): void {
  // Always try to get global registry now
  const globalObj = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : {});
  const registry = (globalObj as { __toolRegistry?: ToolRegistry }).__toolRegistry;
  if (!registry) return;
  updateTradingStateWithRegistry(registry);
}

// Helper function to update state with a registry
function updateTradingStateWithRegistry(registry: ToolRegistry): void {
  // Update total value
  tradingState.totalValue = calculateTotalValue(tradingState.assets);
  tradingState.lastUpdated = Date.now();
  
  // Store basic trading information
  registry.setState('trading_asset_count', createState(
    tradingState.assets.length,
    "Number of assets in portfolio"
  ));
  
  registry.setState('trading_total_value', createState(
    tradingState.totalValue,
    "Total value of all assets in USD",
    (value) => {
      const amount = value as number;
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(amount);
    }
  ));
  
  registry.setState('trading_assets', createState(
    tradingState.assets,
    "List of all assets in portfolio"
  ));
  
  registry.setState('trading_trade_history', createState(
    tradingState.tradeHistory,
    "History of recent trades"
  ));
  
  // Store asset breakdown
  const assetValues: Record<string, number> = {};
  tradingState.assets.forEach(asset => {
    assetValues[asset.symbol] = asset.balance * asset.price;
  });
  
  registry.setState('trading_asset_values', createState(
    assetValues,
    "Value breakdown by asset",
    (value) => {
      const values = value as Record<string, number>;
      return Object.entries(values)
        .map(([symbol, value]) => `${symbol}: ${new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD'
        }).format(value)}`)
        .join(', ');
    }
  ));
  
  // Store latest trade if available
  if (tradingState.tradeHistory.length > 0) {
    const latestTrade = tradingState.tradeHistory[0];
    
    registry.setState('trading_last_trade', createState(
      latestTrade,
      "Details of the most recent trade"
    ));
    
    const tradeDescription = `${latestTrade.fromAmount} ${latestTrade.fromSymbol} to ${latestTrade.toAmount.toFixed(4)} ${latestTrade.toSymbol}`;
    
    registry.setState('trading_last_trade_description', createState(
      tradeDescription,
      "Description of the most recent trade"
    ));
  }
  
  // Store last updated timestamp
  registry.setState('trading_last_updated', createState(
    tradingState.lastUpdated,
    "Timestamp of last trading state update",
    (value) => {
      const timestamp = value as number;
      const date = new Date(timestamp);
      return `${timestamp} (${date.toLocaleString()})`;
    }
  ));
}

// Add asset to portfolio or update existing asset
export function updateAsset(asset: Asset): void {
  const existingIndex = tradingState.assets.findIndex(a => a.symbol === asset.symbol);
  
  if (existingIndex >= 0) {
    tradingState.assets[existingIndex] = asset;
  } else {
    tradingState.assets.push(asset);
  }
  
  tradingState.totalValue = calculateTotalValue(tradingState.assets);
  tradingState.lastUpdated = Date.now();
  notifyTradingChange();
}

// Add trade to history
export function addTrade(trade: TradeHistory): void {
  // Add trade to beginning of history
  tradingState.tradeHistory.unshift(trade);
  
  // Update asset balances
  const fromAsset = tradingState.assets.find(a => a.symbol === trade.fromSymbol);
  const toAsset = tradingState.assets.find(a => a.symbol === trade.toSymbol);
  
  if (fromAsset) {
    fromAsset.balance -= trade.fromAmount;
  }
  
  if (toAsset) {
    toAsset.balance += trade.toAmount;
  } else if (trade.toSymbol) {
    // Create new asset if it doesn't exist
    const mockPrice = 1.0; // This would normally come from API
    tradingState.assets.push({
      symbol: trade.toSymbol,
      balance: trade.toAmount,
      price: mockPrice,
      change24h: 0
    });
  }
  
  tradingState.totalValue = calculateTotalValue(tradingState.assets);
  tradingState.lastUpdated = Date.now();
  notifyTradingChange();
}

// Trading state manager that implements ComponentStateManager interface
export const tradingStateManager: ComponentStateManager<TradingState> = {
  getState: () => ({ ...tradingState }),
  subscribe: subscribeToTradingChanges,
  updateStateInRegistry: updateTradingState,
  resetState: () => {
    console.log('[trading.ts] Resetting trading state...');
    // Reset assets to initial state (deep copy needed for nested objects)
    tradingState.assets = [
      { symbol: 'USDC', balance: 10000, price: 1.0, change24h: 0 },
      { symbol: 'BTC', balance: 0.5, price: 67500.42, change24h: 2.3 },
      { symbol: 'ETH', balance: 5.0, price: 3250.18, change24h: -1.2 },
      { symbol: 'SOL', balance: 100.0, price: 142.87, change24h: 5.7 },
    ];
    // Reset trade history to initial state (deep copy)
    tradingState.tradeHistory = [
      { id: '1', fromSymbol: 'USDC', toSymbol: 'BTC', fromAmount: 1000, toAmount: 0.01478, timestamp: Date.now() - 3600000 * 2 },
      { id: '2', fromSymbol: 'USDC', toSymbol: 'ETH', fromAmount: 500, toAmount: 0.1525, timestamp: Date.now() - 3600000 * 24 },
      { id: '3', fromSymbol: 'ETH', toSymbol: 'SOL', fromAmount: 0.5, toAmount: 11.26, timestamp: Date.now() - 3600000 * 48 },
    ];
    // Recalculate total value and update timestamp
    tradingState.totalValue = calculateTotalValue(tradingState.assets);
    tradingState.lastUpdated = Date.now();

    // Notify listeners and update registry
    notifyTradingChange();
    updateTradingState(); // Update registry with reset state
  }
};

// --- End Trading State Management ---

// --- Tool Definitions (Using Zod) ---

// Define Zod schemas for parameters and return types
const symbolParam = z.object({ 
    symbol: z.string().describe('Cryptocurrency symbol, e.g. BTC, ETH') 
});

const swapParams = z.object({
    fromSymbol: z.string().describe('Source asset symbol to exchange'),
    toSymbol: z.string().describe('Target asset symbol to receive'),
    amount: z.number().positive('Amount must be positive').describe('Amount to exchange')
});

const tradeResultSchema = z.object({
    tradeId: z.string(),
    fromAmount: z.number(),
    fromSymbol: z.string(),
    toAmount: z.number(),
    toSymbol: z.string(),
    fee: z.number(),
    rate: z.number(),
    timestamp: z.number()
});

const numberReturn = z.number();

// --- Tool Implementations (using inferred types) ---

// getPrice implementation
async function getPrice(args: z.infer<typeof symbolParam>): Promise<z.infer<typeof numberReturn>> {
  const { symbol } = args; // Destructure with type safety
  const asset = tradingState.assets.find(a => a.symbol === symbol);
  if (asset) { return asset.price; }
  
  // Mock prices
  const prices: Record<string, number> = { BTC: 67500.42, ETH: 3250.18, SOL: 142.87, AVAX: 35.62, DOT: 7.81, USDC: 1.0 };
  if (prices[symbol]) { return prices[symbol]; }
  
  throw new Error(`Price unavailable for symbol: ${symbol}`);
}

// getBalance implementation
async function getBalance(args: z.infer<typeof symbolParam>): Promise<z.infer<typeof numberReturn>> {
  const { symbol } = args;
  const asset = tradingState.assets.find(a => a.symbol === symbol);
  return asset ? asset.balance : 0;
}

// swap implementation
async function swap(args: z.infer<typeof swapParams>): Promise<z.infer<typeof tradeResultSchema>> {
  const { fromSymbol, toSymbol, amount } = args;

  // Amount positivity check is now handled by Zod schema
  
  const fromAsset = tradingState.assets.find(a => a.symbol === fromSymbol);
  if (!fromAsset) { throw new Error(`Asset not found: ${fromSymbol}`); }
  if (fromAsset.balance < amount) { throw new Error(`Insufficient balance: ${fromAsset.balance} ${fromSymbol} available, ${amount} ${fromSymbol} requested`); }
  
  let toAssetPrice = 0;
  const toAsset = tradingState.assets.find(a => a.symbol === toSymbol);
  if (toAsset) { toAssetPrice = toAsset.price; } 
  else { 
      const prices: Record<string, number> = { BTC: 67500.42, ETH: 3250.18, SOL: 142.87, AVAX: 35.62, DOT: 7.81, USDC: 1.0 };
      if (!prices[toSymbol]) { throw new Error(`Unsupported asset: ${toSymbol}`); }
      toAssetPrice = prices[toSymbol];
  }
  
  const fromValue = amount * fromAsset.price;
  // Ensure toAssetPrice is not zero to avoid division by zero
  if (toAssetPrice <= 0) {
      throw new Error(`Invalid price for asset: ${toSymbol}`);
  }
  const toAmount = fromValue / toAssetPrice;
  const finalAmount = toAmount * 0.99; // 1% fee
  const fee = toAmount * 0.01;
  
  const tradeId = `trade_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const trade: TradeHistory = { id: tradeId, fromSymbol, toSymbol, fromAmount: amount, toAmount: finalAmount, timestamp: Date.now() };
  
  addTrade(trade); // This updates state and notifies listeners
  
  const result = { 
      tradeId, 
      fromAmount: amount, 
      fromSymbol, 
      toAmount: finalAmount, 
      toSymbol, 
      fee: fee, 
      rate: fromAsset.price / toAssetPrice, // Avoid division by zero here too if fromAsset.price could be 0
      timestamp: trade.timestamp 
  };
  // Zod validation of the return happens in the registry adapter
  return result;
}

// getMarketSentiment implementation
async function getMarketSentiment(args: z.infer<typeof symbolParam>): Promise<z.infer<typeof numberReturn>> {
  const { symbol } = args;
  const sentiments: Record<string, number> = { BTC: 65, ETH: 48, SOL: 72, AVAX: 30, DOT: -12 };
  return sentiments[symbol] ?? 0; // Use nullish coalescing
}

// --- Register Tools --- 

// Function to register these tools, using the correct single-object signature
export function registerTradingTools(registry: ToolRegistry) {
    // Register getPrice
    registry.register({
        name: 'getPrice',
        description: 'Get the current price of a cryptocurrency',
        parameters: symbolParam,
        returns: { description: 'The price as a number, or throws error if unavailable', schema: numberReturn },
        execute: getPrice,
    });

    // Register getBalance
    registry.register({
        name: 'getBalance',
        description: "Get user's asset balance",
        parameters: symbolParam,
        returns: { description: 'The asset balance as a number', schema: numberReturn },
        execute: getBalance,
    });

    // Register swap
    registry.register({
        name: 'swap',
        description: 'Execute asset exchange',
        parameters: swapParams,
        returns: { description: 'Object containing details of the completed trade', schema: tradeResultSchema },
        execute: swap,
    });

    // Register getMarketSentiment
    registry.register({
        name: 'getMarketSentiment',
        description: 'Get market sentiment index (-100 to 100)',
        parameters: symbolParam,
        returns: { description: 'Sentiment score as a number', schema: numberReturn },
        execute: getMarketSentiment,
    });
}

// --- Trading Example Configuration (Update tools field) ---
export const tradingExample: ExampleConfig = {
  id: 'trading',
  name: 'Trading Example',
  description: 'Trading simulation API allowing users to fetch price data and execute trades.',
  category: 'Intermediate',
  script: `// Auto-trading decision script
LET INVESTMENT = 1000  // USDC investment amount

// Get BTC and ETH prices using tool call expression
LET btcPrice = CALL getPrice {symbol: "BTC"}
LET ethPrice = CALL getPrice {symbol: "ETH"}
PRINT(FORMAT("BTC Price: {price}", {price: btcPrice}))
PRINT(FORMAT("ETH Price: {price}", {price: ethPrice}))

// Get market sentiment
LET btcSentiment = CALL getMarketSentiment {symbol: "BTC"}
LET ethSentiment = CALL getMarketSentiment {symbol: "ETH"}
PRINT(FORMAT("BTC Sentiment: {sentiment}", {sentiment: btcSentiment}))
PRINT(FORMAT("ETH Sentiment: {sentiment}", {sentiment: ethSentiment}))

// Get current balance
LET usdcBalance = CALL getBalance {symbol: "USDC"}
PRINT(FORMAT("USDC Balance: {balance}", {balance: usdcBalance}))

// Check if we have enough balance
IF usdcBalance >= INVESTMENT THEN
  PRINT("Sufficient balance. Evaluating trade...")
  // Decide which asset to invest in based on market sentiment
  IF btcSentiment > ethSentiment THEN
    PRINT("BTC sentiment is higher. Swapping USDC for BTC...")
    // Use CALL statement as we don't need the return value immediately
    CALL swap {fromSymbol: "USDC", toSymbol: "BTC", amount: INVESTMENT}
    PRINT("Swap requested for BTC.")
  ELSE
    PRINT("ETH sentiment is higher or equal. Swapping USDC for ETH...")
    CALL swap {fromSymbol: "USDC", toSymbol: "ETH", amount: INVESTMENT}
    PRINT("Swap requested for ETH.")
  END
ELSE
  // Insufficient balance
  PRINT(FORMAT("Insufficient balance, need {investment} USDC but only have {balance}", {
    investment: INVESTMENT,
    balance: usdcBalance
  }))
END
`,
  tools: [], // Placeholder - Registration should happen elsewhere
  aiPrompt: `You are an AI assistant specialized in generating NuwaScript code for a simulated cryptocurrency trading environment. 
  Your goal is to translate user requests related to portfolio management, market analysis, and trade execution into accurate NuwaScript code using the available tools.
  # Trading Environment Context:
    - This is a simulation. No real funds are involved.
    - Available assets include USDC, BTC, ETH, SOL, DOT (prices may be mocked).
    - Trades incur a simulated 1% fee on the received amount.
  # Using Portfolio State:
    - Before executing trades or providing analysis, ALWAYS check the current portfolio state provided via state variables like 'trading_assets', 'trading_asset_values', 'trading_total_value', and 'trading_trade_history'.
    - Pay close attention to available balances using 'trading_assets' or the \`getBalance\` tool before attempting a \`swap\`.
  # Strategy & Execution Guidelines:
    - When asked to implement a strategy (e.g., "buy BTC if sentiment is high"), translate it into logical NuwaScript using IF/THEN/ELSE and tool calls.
    - Calculate required amounts carefully. For example, if swapping 1000 USDC for BTC, first get the BTC price, then calculate the expected BTC amount, before calling \`swap\`.
    - If a user request cannot be fulfilled due to insufficient balance or unsupported assets, clearly state the reason using \`PRINT\`.
  # NuwaScript Generation Instructions:
    - The following sections define the NuwaScript syntax, available tools, and current state format. Adhere strictly to these rules when generating code.
  
    __NUWA_SCRIPT_INSTRUCTIONS_PLACEHOLDER__
  
    # Explain Your Reasoning:
    - Use \`PRINT\` function to explain calculations, strategy decisions, or reasons for not executing a trade. 
    # Final Output:
    - Generate ONLY the raw NuwaScript code needed for the user's request.
    - Do not include external explanations, markdown, or comments outside of the NuwaScript itself (use // for NuwaScript comments if needed, but PRINT is preferred for user messages).`,
  componentId: 'trading_dashboard',
  stateManager: tradingStateManager
};

export default tradingExample;