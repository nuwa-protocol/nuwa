#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import {
    DIDAuth,
    CryptoUtils,
    MultibaseCodec,
    KeyType,
    type SignerInterface,
} from '@nuwa-ai/identity-kit';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import http from 'http';
import { URL } from 'url';

/**
 * CLI client demonstrating DID authentication with Identity Kit
 *
 * This example shows how to:
 * 1. Generate and manage Ed25519 keys
 * 2. Connect to CADOP for DID key authorization
 * 3. Make authenticated HTTP requests using DIDAuth.v1
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
}

interface ClientConfig {
    baseUrl: string;
    debug: boolean;
    cadopDomain?: string;
}

const CONFIG_DIR = path.join(os.homedir(), '.nuwa');
const CONFIG_PATH = path.join(CONFIG_DIR, 'identity-cli.json');

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

const DEFAULT_CADOP_DOMAIN = 'https://test-id.nuwa.dev';
const REDIRECT_PORT = 4379; // different port to avoid conflicts
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
    const idFragment = `identity-cli-${Date.now()}`;
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

    const config: StoredConfig = {
        agentDid,
        keyId,
        keyType: KeyType.ED25519,
        privateKeyMultibase,
        publicKeyMultibase,
        network,
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
                return;
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
                server.close();
            }
        });

        server.listen(REDIRECT_PORT, () => {
            // 5-minute timeout
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
 * Simple signer implementation
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

/************************************************************
 * Identity CLI Client
 ************************************************************/

class IdentityCLIClient {
    private config: ClientConfig;
    private storedConfig: StoredConfig | null = null;
    private signer: SignerInterface | null = null;

    constructor(config: ClientConfig) {
        this.config = config;
    }

    async initialize() {
        console.log(chalk.blue('🔑 Initializing Identity CLI Client...'));

        // Load or create configuration
        this.storedConfig = await loadConfig();
        if (!this.storedConfig) {
            const cadopDomain = this.config.cadopDomain || DEFAULT_CADOP_DOMAIN;
            const network = cadopDomain.includes('test-id') ? 'test' : 'main';
            this.storedConfig = await connectToCadop(cadopDomain, network);
        } else {
            console.log(chalk.green('✅ Using existing configuration'));
            console.log(chalk.cyan(`📝 Agent DID: ${this.storedConfig.agentDid}`));
            console.log(chalk.cyan(`🔑 Key ID: ${this.storedConfig.keyId}`));
        }

        // Create local signer
        this.signer = createLocalSigner(this.storedConfig);

        console.log(chalk.green('🔐 Identity client initialized'));
        return this.signer;
    }

    /**
     * Make an authenticated HTTP request
     */
    private async makeAuthenticatedRequest(
        method: 'GET' | 'POST',
        path: string,
        body?: any
    ): Promise<any> {
        if (!this.signer || !this.storedConfig) {
            throw new Error('Client not initialized. Call initialize() first.');
        }

        // Create the signed object for authentication
        const payload = {
            operation: `${method} ${path}`,
            params: body || {},
        };

        const signedObject = await DIDAuth.v1.createSignature(
            payload,
            this.signer,
            this.storedConfig.keyId
        );

        // Convert to Authorization header
        const authHeader = DIDAuth.v1.toAuthorizationHeader(signedObject);

        // Make the HTTP request
        const url = `${this.config.baseUrl}${path}`;
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            Authorization: authHeader,
        };

        const response = await fetch(url, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
        });

        const responseData = await response.json();

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${JSON.stringify(responseData)}`);
        }

        return responseData;
    }

    /**
     * Make a public (unauthenticated) HTTP request
     */
    private async makePublicRequest(method: 'GET' | 'POST', path: string): Promise<any> {
        const url = `${this.config.baseUrl}${path}`;
        const response = await fetch(url, { method });
        return response.json();
    }

    async getHealth() {
        console.log(chalk.blue('🔍 Checking server health...'));
        const result = await this.makePublicRequest('GET', '/health');
        console.log(chalk.green('✅ Server is healthy:'));
        console.log(chalk.white(`  Status: ${result.status}`));
        console.log(chalk.white(`  Timestamp: ${result.timestamp}`));
        return result;
    }

    async getInfo() {
        console.log(chalk.blue('🔍 Fetching service info...'));
        const result = await this.makePublicRequest('GET', '/info');
        console.log(chalk.green('📋 Service Information:'));
        console.log(chalk.white(`  Network: ${result.network}`));
        console.log(chalk.white(`  Version: ${result.version}`));
        console.log(chalk.white(`  Public endpoints: ${result.endpoints.public.join(', ')}`));
        console.log(chalk.white(`  Protected endpoints: ${result.endpoints.protected.join(', ')}`));
        return result;
    }

    async whoami() {
        console.log(chalk.blue('🔐 Calling /whoami (authenticated)...'));
        const result = await this.makeAuthenticatedRequest('GET', '/whoami');
        console.log(chalk.green('✅ Authentication successful:'));
        console.log(chalk.white(`  Your DID: ${result.callerDid}`));
        console.log(chalk.white(`  Your Key ID: ${result.callerKeyId}`));
        console.log(chalk.white(`  Message: ${result.message}`));
        return result;
    }

    async echo(message: string) {
        console.log(chalk.blue('🔊 Calling /echo (authenticated)...'));
        const result = await this.makeAuthenticatedRequest(
            'GET',
            `/echo?message=${encodeURIComponent(message)}`
        );
        console.log(chalk.green('✅ Echo Response:'));
        console.log(chalk.white(`  Echo: ${result.echo}`));
        console.log(chalk.white(`  Caller DID: ${result.callerDid}`));
        console.log(chalk.white(`  Timestamp: ${result.timestamp}`));
        return result;
    }

    async getProfile() {
        console.log(chalk.blue('👤 Fetching profile (authenticated)...'));
        const result = await this.makeAuthenticatedRequest('GET', '/profile');
        console.log(chalk.green('✅ Profile:'));
        console.log(chalk.white(`  DID: ${result.did}`));
        console.log(chalk.white(`  Key ID: ${result.keyId}`));
        console.log(chalk.white(`  Display Name: ${result.profile.displayName}`));
        return result;
    }

    async postData(data: any) {
        console.log(chalk.blue('📤 Posting data (authenticated)...'));
        const result = await this.makeAuthenticatedRequest('POST', '/data', data);
        console.log(chalk.green('✅ Data submitted:'));
        console.log(chalk.white(`  Message: ${result.message}`));
        console.log(chalk.white(`  Caller DID: ${result.callerDid}`));
        return result;
    }

    getStoredConfig() {
        return this.storedConfig;
    }
}

/************************************************************
 * Interactive mode
 ************************************************************/

async function interactiveMode(client: IdentityCLIClient) {
    console.log(chalk.blue('\n🎯 Interactive Mode - Choose an action:'));

    const { action } = await inquirer.prompt([
        {
            type: 'list',
            name: 'action',
            message: 'What would you like to do?',
            choices: [
                { name: '❤️ Health check (public)', value: 'health' },
                { name: '📋 Get service info (public)', value: 'info' },
                { name: '🔐 Who am I? (authenticated)', value: 'whoami' },
                { name: '🔊 Echo message (authenticated)', value: 'echo' },
                { name: '👤 Get profile (authenticated)', value: 'profile' },
                { name: '📤 Post data (authenticated)', value: 'post' },
                { name: '🔧 Show my config', value: 'config' },
                { name: '🚪 Exit', value: 'exit' },
            ],
        },
    ]);

    switch (action) {
        case 'health':
            await client.getHealth();
            break;

        case 'info':
            await client.getInfo();
            break;

        case 'whoami':
            await client.whoami();
            break;

        case 'echo':
            const { message } = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'message',
                    message: 'Enter message to echo:',
                    default: 'Hello from Identity CLI!',
                },
            ]);
            await client.echo(message);
            break;

        case 'profile':
            await client.getProfile();
            break;

        case 'post':
            const { dataInput } = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'dataInput',
                    message: 'Enter JSON data to post:',
                    default: '{"hello": "world"}',
                },
            ]);
            try {
                const data = JSON.parse(dataInput);
                await client.postData(data);
            } catch (e) {
                console.log(chalk.red('❌ Invalid JSON'));
            }
            break;

        case 'config':
            const cfg = client.getStoredConfig();
            if (cfg) {
                console.log(chalk.cyan('📋 Your Configuration:'));
                console.log(chalk.white(`  Agent DID: ${cfg.agentDid}`));
                console.log(chalk.white(`  Key ID: ${cfg.keyId}`));
                console.log(chalk.white(`  Key Type: ${cfg.keyType}`));
                console.log(chalk.white(`  Network: ${cfg.network}`));
                console.log(chalk.white(`  Config Path: ${CONFIG_PATH}`));
            }
            break;

        case 'exit':
            console.log(chalk.green('👋 Goodbye!'));
            return false;
    }

    return true;
}

/************************************************************
 * Main CLI program
 ************************************************************/

const program = new Command();

program
    .name('identity-cli')
    .description('CLI client for testing DID authentication with Identity Kit')
    .version('0.1.0')
    .option('-u, --url <url>', 'Server base URL', 'http://localhost:3004')
    .option('-d, --debug', 'Enable debug mode', false)
    .option('--cadop <domain>', 'CADOP domain for key authorization', DEFAULT_CADOP_DOMAIN);

program
    .command('health')
    .description('Check server health (public)')
    .action(async () => {
        const opts = program.opts();
        const client = new IdentityCLIClient({
            baseUrl: opts.url,
            debug: opts.debug,
            cadopDomain: opts.cadop,
        });
        await client.getHealth();
    });

program
    .command('info')
    .description('Get service information (public)')
    .action(async () => {
        const opts = program.opts();
        const client = new IdentityCLIClient({
            baseUrl: opts.url,
            debug: opts.debug,
            cadopDomain: opts.cadop,
        });
        await client.getInfo();
    });

program
    .command('whoami')
    .description('Get your authenticated identity')
    .action(async () => {
        const opts = program.opts();
        const client = new IdentityCLIClient({
            baseUrl: opts.url,
            debug: opts.debug,
            cadopDomain: opts.cadop,
        });
        await client.initialize();
        await client.whoami();
    });

program
    .command('echo [message]')
    .description('Echo a message (authenticated)')
    .action(async (message?: string) => {
        const opts = program.opts();
        const client = new IdentityCLIClient({
            baseUrl: opts.url,
            debug: opts.debug,
            cadopDomain: opts.cadop,
        });
        await client.initialize();
        await client.echo(message || 'Hello from CLI!');
    });

program
    .command('profile')
    .description('Get your profile (authenticated)')
    .action(async () => {
        const opts = program.opts();
        const client = new IdentityCLIClient({
            baseUrl: opts.url,
            debug: opts.debug,
            cadopDomain: opts.cadop,
        });
        await client.initialize();
        await client.getProfile();
    });

program
    .command('interactive')
    .description('Start interactive mode')
    .action(async () => {
        const opts = program.opts();
        const client = new IdentityCLIClient({
            baseUrl: opts.url,
            debug: opts.debug,
            cadopDomain: opts.cadop,
        });
        await client.initialize();

        let continueLoop = true;
        while (continueLoop) {
            try {
                continueLoop = await interactiveMode(client);
            } catch (error) {
                console.error(chalk.red('❌ Error:'), error);
            }
        }
    });

// Default to interactive mode if no command specified
program.action(async () => {
    const opts = program.opts();
    const client = new IdentityCLIClient({
        baseUrl: opts.url,
        debug: opts.debug,
        cadopDomain: opts.cadop,
    });
    await client.initialize();

    let continueLoop = true;
    while (continueLoop) {
        try {
            continueLoop = await interactiveMode(client);
        } catch (error) {
            console.error(chalk.red('❌ Error:'), error);
        }
    }
});

program.parse();
