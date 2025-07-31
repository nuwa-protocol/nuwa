#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { 
  IdentityKit, 
  bootstrapIdentityEnv,
  DIDAuth,
  CryptoUtils,
  MultibaseCodec,
  KeyType,
  MemoryKeyStore,
  type SignerInterface,
  type IdentityEnv 
} from '@nuwa-ai/identity-kit';
import { 
  PaymentChannelHttpClient,
  PaymentChannelPayerClient, 
  PaymentChannelFactory,
  type ChainConfig,
  type SignedSubRAV 
} from '@nuwa-ai/payment-kit';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import http from 'http';
import { URL } from 'url';

/**
 * CLI client demonstrating PaymentChannelHttpClient usage
 * 
 * This example shows how to:
 * 1. Initialize PaymentChannelHttpClient with proper configuration
 * 2. Make HTTP requests with integrated payment functionality
 * 3. Handle different API endpoints with varying pricing models
 * 4. Use deeplink flow to connect to CADOP for DID management
 */

/************************************************************
 * Configuration persistence helpers
 ************************************************************/

interface StoredConfig {
  agentDid: string;
  keyId: string;
  keyType: KeyType;
  privateKeyMultibase: string;
  publicKeyMultibase: string;
  network: string;
  roochRpcUrl: string;
}

interface ClientConfig {
  baseUrl: string;
  debug: boolean;
  maxAmount?: bigint;
  cadopDomain?: string;
}

const CONFIG_DIR = path.join(os.homedir(), ".nuwa");
const CONFIG_PATH = path.join(CONFIG_DIR, "payment-cli.json");

async function loadConfig(): Promise<StoredConfig | null> {
  try {
    const json = await fs.readFile(CONFIG_PATH, "utf8");
    return JSON.parse(json) as StoredConfig;
  } catch (_) {
    return null;
  }
}

async function saveConfig(config: StoredConfig): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}

/************************************************************
 * Deep-link connect flow (one-time run)
 ************************************************************/

const DEFAULT_CADOP_DOMAIN = "https://test-id.nuwa.dev"; // can be overridden via env
const REDIRECT_PORT = 4378; // local HTTP port for callback
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;

async function connectToCadop(cadopDomain = DEFAULT_CADOP_DOMAIN, network = 'test'): Promise<StoredConfig> {
  console.log(chalk.blue("🔗 No existing configuration found – starting connect flow…\n"));

  // 1. Generate an Ed25519 key pair
  const { publicKey, privateKey } = await CryptoUtils.generateKeyPair(KeyType.ED25519);
  const publicKeyMultibase = MultibaseCodec.encodeBase58btc(publicKey);
  const privateKeyMultibase = MultibaseCodec.encodeBase58btc(privateKey);

  // 2. Build deep-link payload
  const state = randomUUID();
  const idFragment = `payment-cli-${Date.now()}`;
  const payload = {
    version: 1,
    verificationMethod: {
      type: KeyType.ED25519,
      publicKeyMultibase,
      idFragment,
    },
    verificationRelationships: ["authentication"],
    redirectUri: REDIRECT_URI,
    state,
  } as const;

  const encodedPayload = MultibaseCodec.encodeBase64url(JSON.stringify(payload));
  const cadopBase = cadopDomain.replace(/\/+$/, "");
  const deepLinkUrl = `${cadopBase}/add-key?payload=${encodedPayload}`;

  console.log(chalk.yellow("Please open the following URL in your browser to authorize the key:\n"));
  console.log(chalk.cyan(deepLinkUrl + "\n"));
  console.log(
    chalk.gray(`Once you confirm the operation in CADOP Web, it will redirect to ${REDIRECT_URI}.\n`) +
      chalk.gray("Leave this terminal open; the CLI is now waiting for the callback…\n")
  );

  // 3. Wait for browser redirect on a local HTTP server
  const result = await waitForCallback(state);

  if (!result.success) {
    throw new Error(result.error || "Authorization failed");
  }

  const { agentDid, keyId } = result;
  
  if (!agentDid || !keyId) {
    throw new Error('Missing required fields from authorization callback');
  }
  
  console.log(chalk.green(`\n✅ Key authorized successfully.`));
  console.log(chalk.white(`📝 Agent DID: ${agentDid}`));
  console.log(chalk.white(`🔑 Key ID: ${keyId}\n`));

  // Determine Rooch RPC URL based on network
  const roochRpcUrl = network === 'main' 
    ? 'https://main-seed.rooch.network'
    : 'https://test-seed.rooch.network';

  const config: StoredConfig = {
    agentDid,
    keyId,
    keyType: KeyType.ED25519,
    privateKeyMultibase,
    publicKeyMultibase,
    network,
    roochRpcUrl,
  };
  await saveConfig(config);
  console.log(chalk.green(`💾 Configuration saved to ${CONFIG_PATH}. Future runs will reuse it.`));
  return config;
}

/************************************************************
 * Local callback server helper
 ************************************************************/

interface CallbackResult {
  success: boolean;
  error?: string;
  agentDid?: string;
  keyId?: string;
  state?: string;
}

function waitForCallback(expectedState: string): Promise<CallbackResult> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const reqUrl = new URL(req.url || "", `http://localhost:${REDIRECT_PORT}`);
      if (reqUrl.pathname !== "/callback") {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
        return; // ignore unrelated paths
      }
      try {
        const params = reqUrl.searchParams;
        const state = params.get("state") || undefined;
        const success = params.get("success") === "1";
        const error = params.get("error") || undefined;
        const agentDid = params.get("agent") || params.get("agentDid") || undefined;
        const keyId = params.get("key_id") || params.get("keyId") || undefined;

        const htmlResponse = success
          ? `<html><body><h2>✅ Key authorized successfully.</h2><p>You may now return to the CLI.</p></body></html>`
          : `<html><body><h2>❌ Authorization failed.</h2><pre>${error ?? "Unknown error"}</pre></body></html>`;
        res.writeHead(success ? 200 : 400, { "Content-Type": "text/html" });
        res.end(htmlResponse);

        // Validate state to prevent CSRF
        if (state !== expectedState) {
          resolve({ success: false, error: "State mismatch" });
        } else {
          resolve({ success, error, agentDid, keyId, state });
        }
      } catch (e) {
        resolve({ success: false, error: (e as Error).message });
      } finally {
        // Close server after handling first request
        server.close();
      }
    });

    server.listen(REDIRECT_PORT, () => {
      // Add simple 5-minute timeout
      setTimeout(() => {
        server.close();
        resolve({ success: false, error: "Timeout waiting for callback" });
      }, 5 * 60 * 1000);
    });

    server.on("error", err => {
      reject(err);
    });
  });
}

/************************************************************
 * Simple signer implementation compatible with Identity Kit
 ************************************************************/

function createLocalSigner(cfg: StoredConfig): SignerInterface {
  const privateKeyBytes = MultibaseCodec.decodeBase58btc(cfg.privateKeyMultibase);
  const publicKeyBytes = MultibaseCodec.decodeBase58btc(cfg.publicKeyMultibase);

  return {
    async listKeyIds() {
      return [cfg.keyId];
    },
    async signWithKeyId(data: Uint8Array, keyId: string) {
      if (keyId !== cfg.keyId) {
        throw new Error(`Unknown keyId ${keyId}`);
      }
      return CryptoUtils.sign(data, privateKeyBytes, cfg.keyType);
    },
    async canSignWithKeyId(keyId: string) {
      return keyId === cfg.keyId;
    },
    async getDid() {
      return cfg.agentDid;
    },
    async getKeyInfo(keyId: string) {
      if (keyId !== cfg.keyId) return undefined;
      return {
        type: cfg.keyType,
        publicKey: publicKeyBytes,
      };
    },
  };
}

class PaymentCLIClient {
  private httpClient: PaymentChannelHttpClient | null = null;
  private config: ClientConfig;
  private storedConfig: StoredConfig | null = null;
  private signer: SignerInterface | null = null;

  constructor(config: ClientConfig) {
    this.config = config;
  }

  async initialize() {
    console.log(chalk.blue('🔑 Initializing Payment CLI Client...'));
    
    // Load or create configuration
    this.storedConfig = await loadConfig();
    if (!this.storedConfig) {
      const cadopDomain = this.config.cadopDomain || DEFAULT_CADOP_DOMAIN;
      const network = cadopDomain.includes('test-id') ? 'test' : 'main';
      this.storedConfig = await connectToCadop(cadopDomain, network);
    } else {
      console.log(chalk.green('✅ Using existing configuration'));
      console.log(chalk.cyan(`📝 Payer DID: ${this.storedConfig.agentDid}`));
      console.log(chalk.cyan(`🔑 Key ID: ${this.storedConfig.keyId}`));
    }

    // Create local signer
    this.signer = createLocalSigner(this.storedConfig);
    
    // Create PaymentChannelHttpClient
    this.httpClient = new PaymentChannelHttpClient({
      baseUrl: this.config.baseUrl,
      chainConfig: {
        chain: 'rooch' as const,
        network: this.storedConfig.network as any,
        rpcUrl: this.storedConfig.roochRpcUrl,
        debug: this.config.debug
      },
      signer: this.signer,
      keyId: this.storedConfig.keyId,
      payerDid: this.storedConfig.agentDid,
      defaultAssetId: '0x3::gas_coin::RGas',
      hubFundAmount: BigInt('1000000000'), // 10 RGas
      maxAmount: this.config.maxAmount,
      debug: this.config.debug
    });

    console.log(chalk.green('💳 HTTP Payment client initialized'));
    return this.httpClient;
  }

  private async makeHttpRequest(method: 'GET' | 'POST' | 'DELETE', path: string, body?: any): Promise<any> {
    if (!this.httpClient) {
      throw new Error('Client not initialized. Call initialize() first.');
    }

    try {
      if (method === 'GET') {
        return await this.httpClient.get(path);
      } else if (method === 'POST') {
        return await this.httpClient.post(path, body);
      } else if (method === 'DELETE') {
        return await this.httpClient.delete(path);
      } else {
        throw new Error(`Unsupported HTTP method: ${method}`);
      }
    } catch (error) {
      // Parse error response for better debugging
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(errorMessage);
    }
  }

  async getServiceInfo() {
    try {
      console.log(chalk.blue('🔍 Fetching service info...'));
      const info = await this.makeHttpRequest('GET', '/payment-channel/info');
      
      console.log(chalk.green('📋 Service Information:'));
      console.log(chalk.white(`  Service ID: ${info.serviceId}`));
      console.log(chalk.white(`  Service DID: ${info.serviceDid}`));
      console.log(chalk.white(`  Network: ${info.network}`));
      console.log(chalk.white(`  Default Asset: ${info.defaultAssetId}`));
      console.log(chalk.white(`  Default Price: ${info.defaultPricePicoUSD} picoUSD`));
      
      return info;
    } catch (error) {
      console.error(chalk.red('❌ Failed to get service info:'), error);
      throw error;
    }
  }

  async callEcho(message: string) {
    try {
      console.log(chalk.blue('🔊 Calling echo endpoint...'));
      const result = await this.makeHttpRequest('GET', `/api/echo?message=${encodeURIComponent(message)}`);
      
      console.log(chalk.green('✅ Echo Response:'));
      console.log(chalk.white(`  Echo: ${result.echo}`));
      console.log(chalk.white(`  Cost: ${result.cost} (${this.formatCost(result.cost)})`));
      console.log(chalk.white(`  Timestamp: ${result.timestamp}`));
      
      this.displaySubRAVInfo();
      
      return result;
    } catch (error) {
      console.error(chalk.red('❌ Echo request failed:'), error);
      throw error;
    }
  }

  async processText(text: string) {
    try {
      console.log(chalk.blue('⚙️ Calling text processing endpoint...'));
      const result = await this.makeHttpRequest('POST', '/api/process', { text });
      
      console.log(chalk.green('✅ Processing Response:'));
      console.log(chalk.white(`  Input: ${result.input}`));
      console.log(chalk.white(`  Output: ${result.output}`));
      console.log(chalk.white(`  Characters: ${result.characters}`));
      console.log(chalk.white(`  Cost: ${result.cost} (${this.formatCost(result.cost)})`));
      
      this.displaySubRAVInfo();
      
      return result;
    } catch (error) {
      console.error(chalk.red('❌ Text processing failed:'), error);
      throw error;
    }
  }

  async chatCompletion(messages: Array<{role: string, content: string}>, maxTokens = 100) {
    try {
      console.log(chalk.blue('🤖 Calling chat completion endpoint...'));
      const result = await this.makeHttpRequest('POST', '/api/chat/completions', {
        messages,
        max_tokens: maxTokens
      });
      
      console.log(chalk.green('✅ Chat Completion Response:'));
      console.log(chalk.white(`  Response: ${result.choices[0].message.content}`));
      console.log(chalk.white(`  Tokens Used: ${result.usage.total_tokens} (prompt: ${result.usage.prompt_tokens}, completion: ${result.usage.completion_tokens})`));
      console.log(chalk.white(`  Cost: ${result.cost} (${this.formatCost(result.cost)})`));
      
      this.displaySubRAVInfo();
      
      return result;
    } catch (error) {
      console.error(chalk.red('❌ Chat completion failed:'), error);
      throw error;
    }
  }

  async getChannelInfo() {
    if (!this.httpClient) {
      throw new Error('Client not initialized. Call initialize() first.');
    }
    try {
      console.log(chalk.blue('📊 Channel Information:'));
      
      const channelId = this.httpClient.getChannelId();
      if (channelId) {
        console.log(chalk.white(`  Channel ID: ${channelId}`));
      } else {
        console.log(chalk.yellow('⚠️ No active channel found'));
      }
      
      // Show basic client info
      console.log(chalk.white(`  Payer DID: ${this.storedConfig?.agentDid}`));
      console.log(chalk.white(`  Key ID: ${this.storedConfig?.keyId}`));
      console.log(chalk.white(`  Network: ${this.storedConfig?.network}`));
      
      return { 
        channelId: channelId, 
        payerDid: this.storedConfig?.agentDid,
        keyId: this.storedConfig?.keyId,
        network: this.storedConfig?.network
      };
    } catch (error) {
      console.error(chalk.red('❌ Failed to get channel info:'), error);
      throw error;
    }
  }

  async getAdminClaims() {
    if (!this.httpClient) {
      throw new Error('Client not initialized. Call initialize() first.');
    }
    try {
      console.log(chalk.blue('🔍 Admin Claims Status:'));
      
      const response = await this.makeHttpRequest('GET', '/payment-channel/admin/claims');
      
      console.log(chalk.white(`  Claims Status: ${JSON.stringify(response.claimsStatus, null, 2)}`));
      console.log(chalk.white(`  Processing Stats: ${JSON.stringify(response.processingStats, null, 2)}`));
      console.log(chalk.white(`  Timestamp: ${response.timestamp}`));
      
      return response;
    } catch (error) {
      console.error(chalk.red('❌ Failed to get admin claims:'), error);
      throw error;
    }
  }

  async triggerClaim(channelId: string) {
    if (!this.httpClient) {
      throw new Error('Client not initialized. Call initialize() first.');
    }
    try {
      console.log(chalk.blue(`🚀 Triggering Claim for Channel: ${channelId}`));
      
      const response = await this.makeHttpRequest('POST', `/payment-channel/admin/claim/${channelId}`);
      
      console.log(chalk.green('✅ Claim Triggered:'));
      console.log(chalk.white(`  Success: ${response.success}`));
      console.log(chalk.white(`  Channel ID: ${response.channelId}`));
      
      return response;
    } catch (error) {
      console.error(chalk.red('❌ Failed to trigger claim:'), error);
      throw error;
    }
  }

  async getSubRAV(channelId: string, nonce: string) {
    if (!this.httpClient) {
      throw new Error('Client not initialized. Call initialize() first.');
    }
    try {
      console.log(chalk.blue(`📋 Getting SubRAV for Channel: ${channelId}, Nonce: ${nonce}`));
      
      const response = await this.makeHttpRequest('GET', `/payment-channel/admin/subrav/${channelId}/${nonce}`);
      
      console.log(chalk.green('✅ SubRAV Retrieved:'));
      console.log(chalk.white(`  Channel ID: ${response.channelId}`));
      console.log(chalk.white(`  Nonce: ${response.nonce}`));
      console.log(chalk.white(`  Accumulated Amount: ${response.accumulatedAmount}`));
      console.log(chalk.white(`  Payer DID: ${response.payerDid}`));
      console.log(chalk.white(`  Payee DID: ${response.payeeDid}`));
      
      return response;
    } catch (error) {
      console.error(chalk.red('❌ Failed to get SubRAV:'), error);
      throw error;
    }
  }

  async cleanupExpiredProposals(maxAgeMinutes: number = 30) {
    if (!this.httpClient) {
      throw new Error('Client not initialized. Call initialize() first.');
    }
    try {
      console.log(chalk.blue(`🧹 Cleaning up expired proposals (max age: ${maxAgeMinutes} minutes)`));
      
      const response = await this.makeHttpRequest('DELETE', `/payment-channel/admin/cleanup?maxAge=${maxAgeMinutes}`);
      
      console.log(chalk.green('✅ Cleanup Completed:'));
      console.log(chalk.white(`  Cleared Count: ${response.clearedCount}`));
      console.log(chalk.white(`  Max Age Minutes: ${response.maxAgeMinutes}`));
      
      return response;
    } catch (error) {
      console.error(chalk.red('❌ Failed to cleanup expired proposals:'), error);
      throw error;
    }
  }

  getChannelId(): string | undefined {
    return this.httpClient?.getChannelId();
  }

  private formatCost(costStr: string): string {
    if (!costStr) return 'N/A';
    
    try {
      const cost = BigInt(costStr);
      // Convert from smallest unit to readable format
      // Assuming 6 decimals for gas coin (like RGas)
      const formatted = Number(cost) / 1_000_000;
      return `${formatted.toFixed(6)} RGas`;
    } catch {
      return costStr;
    }
  }

  private displaySubRAVInfo(): void {
    const pendingSubRAV = this.httpClient?.getPendingSubRAV();
    if (pendingSubRAV) {
      console.log(chalk.cyan(`  📋 Latest SubRAV:`));
      console.log(chalk.white(`    Nonce: ${pendingSubRAV.nonce}`));
      console.log(chalk.white(`    Accumulated Amount: ${pendingSubRAV.accumulatedAmount}`));
      console.log(chalk.white(`    Channel ID: ${pendingSubRAV.channelId}`));
    }
  }
}

async function interactiveMode(client: PaymentCLIClient) {
  console.log(chalk.blue('\n🎯 Interactive Mode - Choose an action:'));
  
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: '🔍 Get service info', value: 'info' },
        { name: '🔊 Echo message', value: 'echo' },
        { name: '⚙️ Process text', value: 'process' },
        { name: '🤖 Chat completion', value: 'chat' },
        { name: '📊 Channel info', value: 'channel' },
        { name: '🔧 Admin functions', value: 'admin' },
        { name: '🚪 Exit', value: 'exit' }
      ]
    }
  ]);

  switch (action) {
    case 'info':
      await client.getServiceInfo();
      break;
      
    case 'echo':
      const { message } = await inquirer.prompt([
        { type: 'input', name: 'message', message: 'Enter message to echo:', default: 'Hello from CLI!' }
      ]);
      await client.callEcho(message);
      break;
      
    case 'process':
      const { text } = await inquirer.prompt([
        { type: 'input', name: 'text', message: 'Enter text to process:', default: 'hello world' }
      ]);
      await client.processText(text);
      break;
      
    case 'chat':
      const { prompt } = await inquirer.prompt([
        { type: 'input', name: 'prompt', message: 'Enter your message:', default: 'What is the weather like?' }
      ]);
      await client.chatCompletion([{ role: 'user', content: prompt }]);
      break;
      
    case 'channel':
      await client.getChannelInfo();
      break;
      
    case 'admin':
      await handleAdminFunctions(client);
      break;
      
    case 'exit':
      console.log(chalk.green('👋 Goodbye!'));
      return false;
  }
  
  return true;
}

async function handleAdminFunctions(client: PaymentCLIClient) {
  console.log(chalk.blue('\n🔧 Admin Functions - Choose an action:'));
  
  const { adminAction } = await inquirer.prompt([
    {
      type: 'list',
      name: 'adminAction',
      message: 'What admin function would you like to perform?',
      choices: [
        { name: '📊 Get claims status', value: 'claims' },
        { name: '🚀 Trigger claim', value: 'trigger-claim' },
        { name: '📋 Get SubRAV', value: 'get-subrav' },
        { name: '🧹 Cleanup expired proposals', value: 'cleanup' },
        { name: '⬅️ Back to main menu', value: 'back' }
      ]
    }
  ]);

  switch (adminAction) {
    case 'claims':
      await client.getAdminClaims();
      break;
      
    case 'trigger-claim':
      const { channelId } = await inquirer.prompt([
        { type: 'input', name: 'channelId', message: 'Enter channel ID to claim:', default: client.getChannelId() || '' }
      ]);
      if (channelId) {
        await client.triggerClaim(channelId);
      } else {
        console.log(chalk.yellow('⚠️ Channel ID is required'));
      }
      break;
      
    case 'get-subrav':
      const { subravChannelId, nonce } = await inquirer.prompt([
        { type: 'input', name: 'subravChannelId', message: 'Enter channel ID:', default: client.getChannelId() || '' },
        { type: 'input', name: 'nonce', message: 'Enter nonce:', default: '0' }
      ]);
      if (subravChannelId && nonce) {
        await client.getSubRAV(subravChannelId, nonce);
      } else {
        console.log(chalk.yellow('⚠️ Channel ID and nonce are required'));
      }
      break;
      
    case 'cleanup':
      const { maxAge } = await inquirer.prompt([
        { type: 'input', name: 'maxAge', message: 'Enter max age in minutes:', default: '30' }
      ]);
      await client.cleanupExpiredProposals(parseInt(maxAge));
      break;
      
    case 'back':
      return;
      
    default:
      console.log(chalk.yellow('⚠️ Unknown admin action'));
  }
}

async function main() {
  const program = new Command();
  
  program
    .name('payment-client')
    .description('CLI client for Payment Kit HTTP integration example')
    .version('1.0.0');

  program
    .option('-u, --url <url>', 'Server base URL', 'http://localhost:3003')
    .option('-d, --debug', 'Enable debug logging', false)
    .option('-m, --max-amount <amount>', 'Maximum payment amount per request', '10000000000')
    .option('-c, --cadop <domain>', 'CADOP domain for DID management', 'https://test-id.nuwa.dev')
    .option('-i, --interactive', 'Run in interactive mode', false);

  // Info command
  program
    .command('info')
    .description('Get service information')
    .action(async (options) => {
      const config = getConfig(program.opts());
      const client = new PaymentCLIClient(config);
      await client.initialize();
      await client.getServiceInfo();
    });

  // Echo command
  program
    .command('echo <message>')
    .description('Send echo request')
    .action(async (message, options) => {
      const config = getConfig(program.opts());
      const client = new PaymentCLIClient(config);
      await client.initialize();
      await client.callEcho(message);
    });

  // Process command
  program
    .command('process <text>')
    .description('Process text (convert to uppercase)')
    .action(async (text, options) => {
      const config = getConfig(program.opts());
      const client = new PaymentCLIClient(config);
      await client.initialize();
      await client.processText(text);
    });

  // Chat command
  program
    .command('chat <prompt>')
    .description('Send chat completion request')
    .option('-t, --tokens <tokens>', 'Maximum tokens', '100')
    .action(async (prompt, cmdOptions) => {
      const config = getConfig(program.opts());
      const client = new PaymentCLIClient(config);
      await client.initialize();
      await client.chatCompletion(
        [{ role: 'user', content: prompt }], 
        parseInt(cmdOptions.tokens)
      );
    });

  // Channel command
  program
    .command('channel')
    .description('Show channel information')
    .action(async (options) => {
      const config = getConfig(program.opts());
      const client = new PaymentCLIClient(config);
      await client.initialize();
      await client.getChannelInfo();
    });

  // Admin claims command
  program
    .command('admin:claims')
    .description('Get admin claims status')
    .action(async (options) => {
      const config = getConfig(program.opts());
      const client = new PaymentCLIClient(config);
      await client.initialize();
      await client.getAdminClaims();
    });

  // Admin trigger claim command
  program
    .command('admin:claim <channelId>')
    .description('Trigger claim for a specific channel')
    .action(async (channelId, options) => {
      const config = getConfig(program.opts());
      const client = new PaymentCLIClient(config);
      await client.initialize();
      await client.triggerClaim(channelId);
    });

  // Admin get SubRAV command
  program
    .command('admin:subrav <channelId> <nonce>')
    .description('Get specific SubRAV')
    .action(async (channelId, nonce, options) => {
      const config = getConfig(program.opts());
      const client = new PaymentCLIClient(config);
      await client.initialize();
      await client.getSubRAV(channelId, nonce);
    });

  // Admin cleanup command
  program
    .command('admin:cleanup')
    .description('Clean up expired proposals')
    .option('-a, --max-age <minutes>', 'Maximum age in minutes', '30')
    .action(async (cmdOptions) => {
      const config = getConfig(program.opts());
      const client = new PaymentCLIClient(config);
      await client.initialize();
      await client.cleanupExpiredProposals(parseInt(cmdOptions.maxAge));
    });

  // Interactive mode
  program
    .command('interactive')
    .alias('i')
    .description('Run in interactive mode')
    .action(async (options) => {
      const config = getConfig(program.opts());
      const client = new PaymentCLIClient(config);
      await client.initialize();
      
      console.log(chalk.green('\n🎉 Welcome to Payment Kit CLI!'));
      console.log(chalk.cyan('This tool demonstrates payment-enabled HTTP requests.'));
      
      let shouldContinue = true;
      while (shouldContinue) {
        try {
          shouldContinue = await interactiveMode(client);
          if (shouldContinue) {
            console.log(); // Add spacing between actions
          }
        } catch (error) {
          console.error(chalk.red('❌ Action failed:'), error);
          const { retry } = await inquirer.prompt([
            { type: 'confirm', name: 'retry', message: 'Would you like to continue?', default: true }
          ]);
          shouldContinue = retry;
        }
      }
    });

  // Parse command line arguments
  const opts = program.opts();
  
  if (opts.interactive || process.argv.length <= 2) {
    // Default to interactive mode if no command specified
    program.parse(['node', 'client-cli.js', 'interactive']);
  } else {
    program.parse();
  }
}

function getConfig(opts: any): ClientConfig {
  return {
    baseUrl: opts.url,
    debug: opts.debug,
    maxAmount: opts.maxAmount ? BigInt(opts.maxAmount) : undefined,
    cadopDomain: opts.cadop
  };
}

// Run CLI if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error(chalk.red('❌ CLI failed:'), error);
    process.exit(1);
  });
}