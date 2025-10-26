import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * LLM Gateway configuration interface
 */
export interface LLMGatewayConfig {
  // Server configuration
  port: number;
  host: string;

  // Service configuration
  serviceId?: string;
  serviceKey?: string;
  network?: 'local' | 'dev' | 'test' | 'main';
  rpcUrl?: string;
  defaultAssetId?: string;
  defaultPricePicoUSD?: string;
  adminDid?: string[];
  debug?: boolean;

  // Provider API keys
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  openrouterApiKey?: string;
  openrouterBaseUrl?: string;
  litellmApiKey?: string;
  litellmBaseUrl?: string;
  anthropicApiKey?: string;
  anthropicBaseUrl?: string;
  googleApiKey?: string;
  googleBaseUrl?: string;

  // Pricing configuration
  pricingOverrides?: string;
  openaiPricingVersion?: string;

  // Other configuration
  httpReferer?: string;
  xTitle?: string;
}

/**
 * Command line argument definitions
 */
interface CliArgs {
  port?: number;
  host?: string;
  config?: string;
  serviceId?: string;
  serviceKey?: string;
  network?: string;
  rpcUrl?: string;
  defaultAssetId?: string;
  defaultPricePicoUSD?: string;
  debug?: boolean;
  help?: boolean;
  version?: boolean;
}

/**
 * Parse command line arguments
 */
function parseCliArgs(): CliArgs {
  const args: CliArgs = {};
  const argv = process.argv.slice(2);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const nextArg = argv[i + 1];

    switch (arg) {
      case '--port':
      case '-p':
        if (nextArg && !nextArg.startsWith('-')) {
          args.port = parseInt(nextArg, 10);
          i++;
        }
        break;
      case '--host':
      case '-h':
        if (nextArg && !nextArg.startsWith('-')) {
          args.host = nextArg;
          i++;
        }
        break;
      case '--config':
      case '-c':
        if (nextArg && !nextArg.startsWith('-')) {
          args.config = nextArg;
          i++;
        }
        break;
      case '--service-id':
        if (nextArg && !nextArg.startsWith('-')) {
          args.serviceId = nextArg;
          i++;
        }
        break;
      case '--service-key':
        if (nextArg && !nextArg.startsWith('-')) {
          args.serviceKey = nextArg;
          i++;
        }
        break;
      case '--network':
        if (nextArg && !nextArg.startsWith('-')) {
          args.network = nextArg as any;
          i++;
        }
        break;
      case '--rpc-url':
        if (nextArg && !nextArg.startsWith('-')) {
          args.rpcUrl = nextArg;
          i++;
        }
        break;
      case '--default-asset-id':
        if (nextArg && !nextArg.startsWith('-')) {
          args.defaultAssetId = nextArg;
          i++;
        }
        break;
      case '--default-price-pico-usd':
        if (nextArg && !nextArg.startsWith('-')) {
          args.defaultPricePicoUSD = nextArg;
          i++;
        }
        break;
      case '--debug':
        args.debug = true;
        break;
      case '--help':
        args.help = true;
        break;
      case '--version':
        args.version = true;
        break;
    }
  }

  return args;
}

/**
 * Show help information
 */
export function showHelp() {
  console.log(`
LLM Gateway - Multi-provider LLM API gateway with DID authentication and payment integration

Usage: llm-gateway [options]

Options:
  -p, --port <port>                    Server port (default: 8080)
  -h, --host <host>                    Server host (default: 0.0.0.0)
  -c, --config <path>                  Configuration file path
  --service-id <id>                    Service identifier for payment system
  --service-key <key>                  Service private key for DID signing
  --network <network>                  Rooch network (local|dev|test|main, default: test)
  --rpc-url <url>                      Rooch RPC URL
  --default-asset-id <id>              Default asset ID for payments
  --default-price-pico-usd <price>     Default price in picoUSD
  --debug                              Enable debug logging
  --help                               Show this help message
  --version                            Show version information

Environment Variables:
  PORT                                 Server port
  HOST                                 Server host
  SERVICE_KEY                          Service private key
  ROOCH_NODE_URL                       Rooch node URL
  ROOCH_NETWORK                        Rooch network
  DEFAULT_ASSET_ID                     Default asset ID
  OPENAI_API_KEY                       OpenAI API key
  OPENROUTER_API_KEY                   OpenRouter API key
  LITELLM_API_KEY                      LiteLLM API key
  ANTHROPIC_API_KEY                    Anthropic Claude API key
  GOOGLE_API_KEY                       Google Gemini API key

Configuration File:
  The configuration file should be in JSON or YAML format.
  Example config.json:
  {
    "port": 8080,
    "host": "0.0.0.0",
    "serviceId": "llm-gateway",
    "network": "test",
    "debug": true
  }

Quick Start:
  1. Generate SERVICE_KEY:    https://test-id.nuwa.dev
  2. Set environment:         export SERVICE_KEY=0x...
  3. Set provider API key:    export OPENAI_API_KEY=sk-proj-...
  4. Start gateway:           llm-gateway --debug

Examples:
  llm-gateway --debug                  Start with debug logging enabled
  llm-gateway --port 8080              Start on port 8080
  llm-gateway --config config.json     Start with configuration file
  llm-gateway --service-key 0x...      Start with specific SERVICE_KEY

Testing:
  Use the Nuwa Login Demo for easy testing with DID authentication and payments:
  https://nuwa-login-demo.pages.dev/
  
  1. Start your gateway: llm-gateway --debug
  2. Open the demo and connect to http://localhost:8080
  3. Connect wallet and test API calls with proper authentication
`);
}

/**
 * Show version information
 */
export function showVersion() {
  try {
    const packageJsonPath = path.join(__dirname, '../../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    console.log(`LLM Gateway v${packageJson.version}`);
  } catch (error) {
    console.log('LLM Gateway (version unknown)');
  }
}

/**
 * Load configuration file
 */
function loadConfigFile(configPath: string): any {
  try {
    if (!fs.existsSync(configPath)) {
      throw new Error(`Configuration file not found: ${configPath}`);
    }

    const content = fs.readFileSync(configPath, 'utf8');
    const ext = path.extname(configPath).toLowerCase();

    if (ext === '.json') {
      return JSON.parse(content);
    } else if (ext === '.yaml' || ext === '.yml') {
      // For now, we'll only support JSON. YAML support can be added later if needed
      throw new Error('YAML configuration files are not yet supported. Please use JSON format.');
    } else {
      // Try to parse as JSON by default
      return JSON.parse(content);
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to load configuration file: ${error.message}`);
    }
    throw new Error('Failed to load configuration file: Unknown error');
  }
}

/**
 * Load configuration from CLI args, config file, and environment variables
 */
export function loadConfig(): LLMGatewayConfig {
  const args = parseCliArgs();

  // Handle help and version flags
  if (args.help) {
    showHelp();
    process.exit(0);
  }

  if (args.version) {
    showVersion();
    process.exit(0);
  }

  // Start with default configuration
  const config: LLMGatewayConfig = {
    port: 8080,
    host: '0.0.0.0',
    network: 'test',
    defaultAssetId: '0x3::gas_coin::RGas',
    defaultPricePicoUSD: '0',
    debug: false,
  };

  // Load from config file if specified
  if (args.config) {
    try {
      const fileConfig = loadConfigFile(args.config);
      Object.assign(config, fileConfig);
    } catch (error) {
      console.error(
        `Error loading config file: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      process.exit(1);
    }
  }

  // Override with environment variables
  if (process.env.PORT) config.port = parseInt(process.env.PORT, 10);
  if (process.env.HOST) config.host = process.env.HOST;
  if (process.env.SERVICE_KEY) config.serviceKey = process.env.SERVICE_KEY;
  if (process.env.ROOCH_NODE_URL) config.rpcUrl = process.env.ROOCH_NODE_URL;
  if (process.env.ROOCH_NETWORK) {
    const allowedNetworks = ['local', 'dev', 'test', 'main'];
    if (allowedNetworks.includes(process.env.ROOCH_NETWORK)) {
      config.network = process.env.ROOCH_NETWORK as 'local' | 'dev' | 'test' | 'main';
    } else {
      console.warn(
        `Invalid ROOCH_NETWORK value: ${process.env.ROOCH_NETWORK}. Using default: ${config.network}`
      );
    }
  }
  if (process.env.DEFAULT_ASSET_ID) config.defaultAssetId = process.env.DEFAULT_ASSET_ID;
  if (process.env.OPENAI_API_KEY) config.openaiApiKey = process.env.OPENAI_API_KEY;
  if (process.env.OPENAI_BASE_URL) config.openaiBaseUrl = process.env.OPENAI_BASE_URL;
  if (process.env.OPENROUTER_API_KEY) config.openrouterApiKey = process.env.OPENROUTER_API_KEY;
  if (process.env.OPENROUTER_BASE_URL) config.openrouterBaseUrl = process.env.OPENROUTER_BASE_URL;
  if (process.env.LITELLM_API_KEY) config.litellmApiKey = process.env.LITELLM_API_KEY;
  if (process.env.LITELLM_BASE_URL) config.litellmBaseUrl = process.env.LITELLM_BASE_URL;
  if (process.env.ANTHROPIC_API_KEY) config.anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (process.env.ANTHROPIC_BASE_URL) config.anthropicBaseUrl = process.env.ANTHROPIC_BASE_URL;
  if (process.env.GOOGLE_API_KEY) config.googleApiKey = process.env.GOOGLE_API_KEY;
  if (process.env.GOOGLE_BASE_URL) config.googleBaseUrl = process.env.GOOGLE_BASE_URL;
  if (process.env.ANTHROPIC_API_KEY) config.anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (process.env.ANTHROPIC_BASE_URL) config.anthropicBaseUrl = process.env.ANTHROPIC_BASE_URL;
  if (process.env.PRICING_OVERRIDES) config.pricingOverrides = process.env.PRICING_OVERRIDES;
  if (process.env.OPENAI_PRICING_VERSION)
    config.openaiPricingVersion = process.env.OPENAI_PRICING_VERSION;
  if (process.env.HTTP_REFERER) config.httpReferer = process.env.HTTP_REFERER;
  if (process.env.X_TITLE) config.xTitle = process.env.X_TITLE;
  if (process.env.ADMIN_DID)
    config.adminDid = process.env.ADMIN_DID.split(',').map(did => did.trim());
  if (process.env.DEBUG === 'true') config.debug = true;

  // Override with CLI arguments (highest priority)
  if (args.port !== undefined) config.port = args.port;
  if (args.host !== undefined) config.host = args.host;
  if (args.serviceId !== undefined) config.serviceId = args.serviceId;
  if (args.serviceKey !== undefined) config.serviceKey = args.serviceKey;
  if (args.network !== undefined)
    config.network = args.network as 'local' | 'dev' | 'test' | 'main';
  if (args.rpcUrl !== undefined) config.rpcUrl = args.rpcUrl;
  if (args.defaultAssetId !== undefined) config.defaultAssetId = args.defaultAssetId;
  if (args.defaultPricePicoUSD !== undefined) config.defaultPricePicoUSD = args.defaultPricePicoUSD;
  if (args.debug !== undefined) config.debug = args.debug;

  return config;
}

/**
 * Validate configuration
 */
export function validateConfig(config: LLMGatewayConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate port
  if (!config.port || config.port < 1 || config.port > 65535) {
    errors.push('Port must be between 1 and 65535');
  }

  // Validate host
  if (!config.host) {
    errors.push('Host is required');
  }

  // Validate network
  if (config.network && !['local', 'dev', 'test', 'main'].includes(config.network)) {
    errors.push('Network must be one of: local, dev, test, main');
  }

  // Validate SERVICE_KEY
  if (!config.serviceKey) {
    errors.push('SERVICE_KEY is required for DID authentication and payment functionality');
  }

  // Check if at least one provider API key is configured
  const hasProviderKey =
    config.openaiApiKey ||
    config.openrouterApiKey ||
    config.litellmApiKey ||
    config.anthropicApiKey;
  if (!hasProviderKey) {
    errors.push(
      'At least one provider API key is required (OPENAI_API_KEY, OPENROUTER_API_KEY, LITELLM_API_KEY, or ANTHROPIC_API_KEY)'
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
