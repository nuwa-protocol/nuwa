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
  type IdentityEnv,
} from '@nuwa-ai/identity-kit';
import {
  PaymentChannelPayerClient,
  PaymentChannelFactory,
  PaymentChannelHttpClient,
  PaymentChannelAdminClient,
  type SignedSubRAV,
  type ChainConfig,
  type PaymentResult,
  extractFragment,
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

const CONFIG_DIR = path.join(os.homedir(), '.nuwa');
const CONFIG_PATH = path.join(CONFIG_DIR, 'payment-cli.json');

async function loadConfig(): Promise<StoredConfig | null> {
  try {
    const json = await fs.readFile(CONFIG_PATH, 'utf8');
    return JSON.parse(json) as StoredConfig;
  } catch (_) {
    return null;
  }
}

async function saveConfig(config: StoredConfig): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

/************************************************************
 * Deep-link connect flow (one-time run)
 ************************************************************/

const DEFAULT_CADOP_DOMAIN = 'https://test-id.nuwa.dev'; // can be overridden via env
const REDIRECT_PORT = 4378; // local HTTP port for callback
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;

async function connectToCadop(
  cadopDomain = DEFAULT_CADOP_DOMAIN,
  network = 'test'
): Promise<StoredConfig> {
  console.log(chalk.blue('🔗 No existing configuration found – starting connect flow…\n'));

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
    verificationRelationships: ['authentication'],
    redirectUri: REDIRECT_URI,
    state,
  } as const;

  const encodedPayload = MultibaseCodec.encodeBase64url(JSON.stringify(payload));
  const cadopBase = cadopDomain.replace(/\/+$/, '');
  const deepLinkUrl = `${cadopBase}/add-key?payload=${encodedPayload}`;

  console.log(
    chalk.yellow('Please open the following URL in your browser to authorize the key:\n')
  );
  console.log(chalk.cyan(deepLinkUrl + '\n'));
  console.log(
    chalk.gray(
      `Once you confirm the operation in CADOP Web, it will redirect to ${REDIRECT_URI}.\n`
    ) + chalk.gray('Leave this terminal open; the CLI is now waiting for the callback…\n')
  );

  // 3. Wait for browser redirect on a local HTTP server
  const result = await waitForCallback(state);

  if (!result.success) {
    throw new Error(result.error || 'Authorization failed');
  }

  const { agentDid, keyId } = result;

  if (!agentDid || !keyId) {
    throw new Error('Missing required fields from authorization callback');
  }

  console.log(chalk.green(`\n✅ Key authorized successfully.`));
  console.log(chalk.white(`📝 Agent DID: ${agentDid}`));
  console.log(chalk.white(`🔑 Key ID: ${keyId}\n`));

  // Determine Rooch RPC URL based on network
  const roochRpcUrl =
    network === 'main' ? 'https://main-seed.rooch.network' : 'https://test-seed.rooch.network';

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
      const reqUrl = new URL(req.url || '', `http://localhost:${REDIRECT_PORT}`);
      if (reqUrl.pathname !== '/callback') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return; // ignore unrelated paths
      }
      try {
        const params = reqUrl.searchParams;
        const state = params.get('state') || undefined;
        const success = params.get('success') === '1';
        const error = params.get('error') || undefined;
        const agentDid = params.get('agent') || params.get('agentDid') || undefined;
        const keyId = params.get('key_id') || params.get('keyId') || undefined;

        const htmlResponse = success
          ? `<html><body><h2>✅ Key authorized successfully.</h2><p>You may now return to the CLI.</p></body></html>`
          : `<html><body><h2>❌ Authorization failed.</h2><pre>${error ?? 'Unknown error'}</pre></body></html>`;
        res.writeHead(success ? 200 : 400, { 'Content-Type': 'text/html' });
        res.end(htmlResponse);

        // Validate state to prevent CSRF
        if (state !== expectedState) {
          resolve({ success: false, error: 'State mismatch' });
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
      setTimeout(
        () => {
          server.close();
          resolve({ success: false, error: 'Timeout waiting for callback' });
        },
        5 * 60 * 1000
      );
    });

    server.on('error', err => {
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
  private adminClient: PaymentChannelAdminClient | null = null;
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
        debug: this.config.debug,
      },
      signer: this.signer,
      keyId: this.storedConfig.keyId,
      payerDid: this.storedConfig.agentDid,
      defaultAssetId: '0x3::gas_coin::RGas',
      maxAmount: this.config.maxAmount,
      debug: this.config.debug,
    });

    // Create admin client
    this.adminClient = new PaymentChannelAdminClient(this.httpClient);

    console.log(chalk.green('💳 HTTP Payment client initialized'));
    console.log(chalk.green('🔧 Admin client initialized'));
    return this.httpClient;
  }

  private async makeHttpRequest(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: any
  ): Promise<any> {
    if (!this.httpClient) {
      throw new Error('Client not initialized. Call initialize() first.');
    }

    try {
      let result: PaymentResult<any>;

      // Use the appropriate method to make the request with payment tracking
      if (method === 'GET') {
        result = await this.httpClient.get(path);
      } else if (method === 'POST') {
        result = await this.httpClient.post(path, body);
      } else if (method === 'DELETE') {
        result = await this.httpClient.delete(path);
      } else {
        throw new Error(`Unsupported HTTP method: ${method}`);
      }

      // Add payment information to the result if available
      if (result.payment) {
        return {
          ...result.data,
          __paymentInfo: {
            cost: result.payment.cost.toString(),
            nonce: result.payment.nonce.toString(),
            serviceTxRef: result.payment.serviceTxRef,
          },
        };
      }

      return result.data;
    } catch (error) {
      // Parse error response for better debugging
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(errorMessage);
    }
  }

  async getServiceInfo() {
    try {
      console.log(chalk.blue('🔍 Fetching service info...'));
      const info = await this.makeHttpRequest('GET', '/.well-known/nuwa-payment/info');

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
      const result = await this.makeHttpRequest(
        'GET',
        `/echo?message=${encodeURIComponent(message)}`
      );

      console.log(chalk.green('✅ Echo Response:'));
      console.log(chalk.white(`  Echo: ${result.echo}`));
      console.log(chalk.white(`  Timestamp: ${result.timestamp}`));

      // Extract payment info from headers (not from business response)
      if (result.__paymentInfo) {
        console.log(
          chalk.white(
            `  Cost: ${result.__paymentInfo.cost} (${this.formatCost(result.__paymentInfo.cost)}) [from headers]`
          )
        );
        console.log(chalk.white(`  Nonce: ${result.__paymentInfo.nonce} [from headers]`));
      }

      this.displaySubRAVInfo();

      // Return clean business data without payment info
      const { __paymentInfo, ...businessData } = result;
      return businessData;
    } catch (error) {
      console.error(chalk.red('❌ Echo request failed:'), error);
      throw error;
    }
  }

  async processText(text: string) {
    try {
      console.log(chalk.blue('⚙️ Calling text processing endpoint...'));
      const result = await this.makeHttpRequest('POST', '/process', { text });

      console.log(chalk.green('✅ Processing Response:'));
      console.log(chalk.white(`  Input: ${result.input}`));
      console.log(chalk.white(`  Output: ${result.output}`));
      console.log(chalk.white(`  Characters: ${result.characters}`));
      console.log(chalk.white(`  Timestamp: ${result.timestamp}`));

      // Extract payment info from headers (not from business response)
      if (result.__paymentInfo) {
        console.log(
          chalk.white(
            `  Cost: ${result.__paymentInfo.cost} (${this.formatCost(result.__paymentInfo.cost)}) [from headers]`
          )
        );
        console.log(chalk.white(`  Nonce: ${result.__paymentInfo.nonce} [from headers]`));
      }

      this.displaySubRAVInfo();

      // Return clean business data without payment info
      const { __paymentInfo, ...businessData } = result;
      return businessData;
    } catch (error) {
      console.error(chalk.red('❌ Text processing failed:'), error);
      throw error;
    }
  }

  async chatCompletion(messages: Array<{ role: string; content: string }>, maxTokens = 100) {
    try {
      console.log(chalk.blue('🤖 Calling chat completion endpoint...'));
      const result = await this.makeHttpRequest('POST', '/chat/completions', {
        messages,
        max_tokens: maxTokens,
      });

      console.log(chalk.green('✅ Chat Completion Response:'));
      console.log(chalk.white(`  Response: ${result.choices[0].message.content}`));
      console.log(
        chalk.white(
          `  Tokens Used: ${result.usage.total_tokens} (prompt: ${result.usage.prompt_tokens}, completion: ${result.usage.completion_tokens})`
        )
      );

      // Extract payment info from headers (not from business response)
      if (result.__paymentInfo) {
        console.log(
          chalk.white(
            `  Cost: ${result.__paymentInfo.cost} (${this.formatCost(result.__paymentInfo.cost)}) [from headers - post-billing]`
          )
        );
        console.log(chalk.white(`  Nonce: ${result.__paymentInfo.nonce} [from headers]`));
      }

      this.displaySubRAVInfo();

      // Return clean business data without payment info
      const { __paymentInfo, ...businessData } = result;
      return businessData;
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
      if (!channelId) {
        console.log(chalk.yellow('⚠️ No active channel found'));
        // Still show basic client info
        console.log(chalk.white(`  Payer DID: ${this.storedConfig?.agentDid}`));
        console.log(chalk.white(`  Key ID: ${this.storedConfig?.keyId}`));
        console.log(chalk.white(`  Network: ${this.storedConfig?.network}`));
        return {
          channelId: undefined,
          payerDid: this.storedConfig?.agentDid,
          keyId: this.storedConfig?.keyId,
          network: this.storedConfig?.network,
        };
      }

      console.log(chalk.white(`  Channel ID: ${channelId}`));

      const payerClient = this.httpClient.getPayerClient();

      // Fetch detailed channel info in parallel
      const [channelInfo, chainId] = await Promise.all([
        payerClient.getChannelInfo(channelId),
        payerClient.getChainId().catch(() => undefined),
      ]);

      // Derive vmIdFragment from stored keyId if available
      let vmIdFragment: string | undefined;
      try {
        if (this.storedConfig?.keyId) {
          vmIdFragment = extractFragment(this.storedConfig.keyId);
        }
      } catch (_) {
        // ignore
      }

      // Optionally fetch sub-channel state if vmIdFragment is known
      const subChannelState = vmIdFragment
        ? await payerClient.getSubChannelInfo(channelId, vmIdFragment).catch(() => null)
        : null;

      // Fetch asset info and price
      const [assetInfo, assetPrice] = await Promise.all([
        payerClient.getAssetInfo(channelInfo.assetId).catch(() => undefined),
        payerClient.getAssetPrice(channelInfo.assetId).catch(() => undefined),
      ]);

      // Pretty print details
      console.log(chalk.cyan('  Channel Metadata:'));
      console.log(chalk.white(`    Payer DID: ${channelInfo.payerDid}`));
      console.log(chalk.white(`    Payee DID: ${channelInfo.payeeDid}`));
      console.log(chalk.white(`    Asset ID: ${channelInfo.assetId}`));
      console.log(chalk.white(`    Epoch: ${channelInfo.epoch.toString()}`));
      console.log(chalk.white(`    Status: ${channelInfo.status}`));
      if (chainId !== undefined) {
        console.log(chalk.white(`    Chain ID: ${chainId.toString()}`));
      }

      if (assetInfo) {
        console.log(chalk.cyan('  Asset Info:'));
        console.log(chalk.white(`    Symbol: ${assetInfo.symbol ?? 'N/A'}`));
        console.log(chalk.white(`    Decimals: ${assetInfo.decimals}`));
        console.log(chalk.white(`    Name: ${assetInfo.name ?? 'N/A'}`));
      }
      if (assetPrice !== undefined) {
        console.log(chalk.white(`    Price (picoUSD per unit): ${assetPrice.toString()}`));
      }

      if (vmIdFragment) {
        console.log(chalk.cyan('  Sub-Channel:'));
        console.log(chalk.white(`    vmIdFragment: ${vmIdFragment}`));
        if (subChannelState) {
          console.log(
            chalk.white(`    lastClaimedAmount: ${subChannelState.lastClaimedAmount.toString()}`)
          );
          console.log(
            chalk.white(`    lastConfirmedNonce: ${subChannelState.lastConfirmedNonce.toString()}`)
          );
          console.log(chalk.white(`    epoch: ${subChannelState.epoch.toString()}`));
        } else {
          console.log(chalk.yellow('    No local sub-channel state found'));
        }
      }

      // Also show basic client info for reference
      console.log(chalk.cyan('  Client:'));
      console.log(chalk.white(`    Payer DID: ${this.storedConfig?.agentDid}`));
      console.log(chalk.white(`    Key ID: ${this.storedConfig?.keyId}`));
      console.log(chalk.white(`    Network: ${this.storedConfig?.network}`));

      return {
        channelId,
        payerDid: this.storedConfig?.agentDid,
        keyId: this.storedConfig?.keyId,
        network: this.storedConfig?.network,
        channelInfo,
        chainId,
        vmIdFragment,
        subChannelState: subChannelState ?? undefined,
        assetInfo: assetInfo ?? undefined,
        assetPrice: assetPrice ?? undefined,
      };
    } catch (error) {
      console.error(chalk.red('❌ Failed to get channel info:'), error);
      throw error;
    }
  }

  async getSystemStatus() {
    if (!this.adminClient) {
      throw new Error('Client not initialized. Call initialize() first.');
    }
    try {
      console.log(chalk.blue('🔍 Admin Claims Status:'));

      const response = await this.adminClient.getSystemStatus();

      console.log(chalk.white(`  Claims Status: ${JSON.stringify(response.claims, null, 2)}`));
      console.log(
        chalk.white(`  Processing Stats: ${JSON.stringify(response.processor, null, 2)}`)
      );
      console.log(chalk.white(`  Timestamp: ${response.timestamp}`));

      return response;
    } catch (error) {
      console.error(chalk.red('❌ Failed to get admin claims:'), error);
      throw error;
    }
  }

  async triggerClaim(channelId: string) {
    if (!this.adminClient) {
      throw new Error('Client not initialized. Call initialize() first.');
    }
    try {
      console.log(chalk.blue(`🚀 Triggering Claim for Channel: ${channelId}`));

      const response = await this.adminClient.triggerClaim({ channelId });

      console.log(chalk.green('✅ Claim Triggered:'));
      console.log(chalk.white(`  Channel ID: ${response.channelId}`));
      console.log(chalk.white(`  Queued: ${JSON.stringify(response.queued, null, 2)}`));
      console.log(chalk.white(`  Skipped: ${JSON.stringify(response.skipped, null, 2)}`));

      return response;
    } catch (error) {
      console.error(chalk.red('❌ Failed to trigger claim:'), error);
      throw error;
    }
  }

  async getSubRAV(nonce: string) {
    if (!this.adminClient) {
      throw new Error('Client not initialized. Call initialize() first.');
    }
    try {
      console.log(chalk.blue(`📋 Getting SubRAV for Nonce: ${nonce}`));

      const response = await this.adminClient.querySubRav({ nonce });
      const subRav = response.subRav;
      console.log(chalk.green('✅ SubRAV Retrieved:'));
      console.log(chalk.white(`  Channel ID: ${subRav.channelId}`));
      console.log(chalk.white(`  Nonce: ${subRav.nonce}`));
      console.log(chalk.white(`  Accumulated Amount: ${subRav.accumulatedAmount}`));

      return response;
    } catch (error) {
      console.error(chalk.red('❌ Failed to get SubRAV:'), error);
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
        { name: '📋 Get SubRAV', value: 'get-subrav' },
        { name: '🔧 Admin functions', value: 'admin' },
        { name: '🚪 Exit', value: 'exit' },
      ],
    },
  ]);

  switch (action) {
    case 'info':
      await client.getServiceInfo();
      break;

    case 'echo':
      const { message } = await inquirer.prompt([
        {
          type: 'input',
          name: 'message',
          message: 'Enter message to echo:',
          default: 'Hello from CLI!',
        },
      ]);
      await client.callEcho(message);
      break;

    case 'process':
      const { text } = await inquirer.prompt([
        { type: 'input', name: 'text', message: 'Enter text to process:', default: 'hello world' },
      ]);
      await client.processText(text);
      break;

    case 'chat':
      const { prompt } = await inquirer.prompt([
        {
          type: 'input',
          name: 'prompt',
          message: 'Enter your message:',
          default: 'What is the weather like?',
        },
      ]);
      await client.chatCompletion([{ role: 'user', content: prompt }]);
      break;

    case 'channel':
      await client.getChannelInfo();
      break;

    case 'get-subrav':
      const { nonce } = await inquirer.prompt([
        { type: 'input', name: 'nonce', message: 'Enter nonce:', default: '0' },
      ]);
      if (nonce) {
        await client.getSubRAV(nonce);
      } else {
        console.log(chalk.yellow('⚠️ Nonce is required'));
      }
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
        { name: '📊 Get system status', value: 'status' },
        { name: '🚀 Trigger claim', value: 'trigger-claim' },
        { name: '⬅️ Back to main menu', value: 'back' },
      ],
    },
  ]);

  switch (adminAction) {
    case 'status':
      await client.getSystemStatus();
      break;

    case 'trigger-claim':
      const { channelId } = await inquirer.prompt([
        {
          type: 'input',
          name: 'channelId',
          message: 'Enter channel ID to claim:',
          default: client.getChannelId() || '',
        },
      ]);
      if (channelId) {
        await client.triggerClaim(channelId);
      } else {
        console.log(chalk.yellow('⚠️ Channel ID is required'));
      }
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
    .action(async options => {
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
      await client.chatCompletion([{ role: 'user', content: prompt }], parseInt(cmdOptions.tokens));
    });

  // Channel command
  program
    .command('channel')
    .description('Show channel information')
    .action(async options => {
      const config = getConfig(program.opts());
      const client = new PaymentCLIClient(config);
      await client.initialize();
      await client.getChannelInfo();
    });

  // Get SubRAV command
  program
    .command('subrav <nonce>')
    .description('Get specific SubRAV')
    .action(async (nonce, options) => {
      const config = getConfig(program.opts());
      const client = new PaymentCLIClient(config);
      await client.initialize();
      await client.getSubRAV(nonce);
    });

  // Admin claims command
  program
    .command('admin:status')
    .description('Get admin system status')
    .action(async options => {
      const config = getConfig(program.opts());
      const client = new PaymentCLIClient(config);
      await client.initialize();
      await client.getSystemStatus();
    });

  // Admin trigger claim command
  program
    .command('admin:trigger-claim <channelId>')
    .description('Trigger claim for a specific channel')
    .action(async (channelId, options) => {
      const config = getConfig(program.opts());
      const client = new PaymentCLIClient(config);
      await client.initialize();
      await client.triggerClaim(channelId);
    });

  // Interactive mode
  program
    .command('interactive')
    .alias('i')
    .description('Run in interactive mode')
    .action(async options => {
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
            {
              type: 'confirm',
              name: 'retry',
              message: 'Would you like to continue?',
              default: true,
            },
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
    cadopDomain: opts.cadop,
  };
}

// Run CLI if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error(chalk.red('❌ CLI failed:'), error);
    process.exit(1);
  });
}
