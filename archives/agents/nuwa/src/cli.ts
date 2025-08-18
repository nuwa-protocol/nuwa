import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
// import { handleMessage } from './agent'; // No longer call agent directly
import * as schema from './a2a-schema.js'; // Add .js
import { A2AClient } from './client/client.js'; // Add .js
import { RpcError } from './client/error.js'; // Add .js
import { randomUUID } from 'node:crypto'; // For generating Task IDs
import { Command } from 'commander';
import axios from 'axios';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

// --- SDK Imports (Using default import + destructuring) ---
import roochSdk from '@roochnetwork/rooch-sdk';
const {
    Secp256k1Keypair,
    BitcoinAddress, 
    RoochAddress,
    BitcoinSignMessage,
    toB64,
    fromB64,
    toHEX,
    fromHEX
} = roochSdk;

// Import types separately using 'import type'
import type {
    Bytes, 
    Secp256k1Keypair as Secp256k1KeypairType 
} from '@roochnetwork/rooch-sdk';

// --- Helper Function from auth.ts (assuming it's moved or copied) ---
// If auth.ts is kept separate, import this instead
import { createHash } from 'crypto';
function createMessageHashForSigning(message: schema.Message): Buffer {
    const messageString = JSON.stringify(message.parts);
    return createHash('sha256').update(messageString).digest();
}

// --- Configuration & Constants ---
const DEFAULT_SERVER_URL = 'http://localhost:3000/a2a';
// Store key relative to the current working directory for simplified testing
const KEY_DIR = path.join(process.cwd(), '.rooch_config'); 
const KEY_FILE = path.join(KEY_DIR, 'active.key');
const BITCOIN_MESSAGE_INFO = "Agent authentication:\n"; // Consistent with auth.ts

// --- Key Management (Simplified) ---
async function loadOrCreateAndSaveKeypair(): Promise<Secp256k1KeypairType> {
    try {
        const privateKeyHex = await fs.readFile(KEY_FILE, 'utf-8');
        if (privateKeyHex && /^[0-9a-fA-F]+$/.test(privateKeyHex)) {
             console.log(`[CLI] Loaded existing key from ${KEY_FILE}`);
            // Assuming fromSecretKey expects a Buffer
             return Secp256k1Keypair.fromSecretKey(Buffer.from(privateKeyHex.trim(), 'hex'));
        } else {
            throw new Error('Invalid key format in file.'); // Treat invalid format as needing regeneration
        }
    } catch (error: any) {
        if (error.code === 'ENOENT' || error.message === 'Invalid key format in file.') {
            console.log(`[CLI] No valid key found at ${KEY_FILE}. Generating new key...`);
            const keypair = Secp256k1Keypair.generate();
            const secretKeyBytes = keypair.getSecretKey(); // Get the raw secret key bytes
            const privateKeyHex = Buffer.from(secretKeyBytes).toString('hex');
            
            try {
                await fs.mkdir(KEY_DIR, { recursive: true });
                await fs.writeFile(KEY_FILE, privateKeyHex, 'utf-8');
                 // Set restrictive permissions (example for Unix-like systems)
                try { await fs.chmod(KEY_FILE, 0o600); } catch (chmodError) { 
                     console.warn(`[CLI] Could not set permissions on ${KEY_FILE}. Proceeding anyway.`);
                }
                
                const btcAddress = keypair.getBitcoinAddress().toStr();
                const roochAddress = keypair.getBitcoinAddress().genRoochAddress().toStr();
                console.log(`[CLI] Saved new key to ${KEY_FILE}`);
                console.log(`      BTC Address: ${btcAddress}`);
                console.log(`      Rooch Address: ${roochAddress}`);
                return keypair;
            } catch (writeError) {
                 console.error(`[CLI] Failed to save new key to ${KEY_FILE}:`, writeError);
                 // Still return the generated keypair for this session, but warn it's not saved
                 console.warn("[CLI] Using generated keypair in memory for this session only.");
                 return keypair;
            }
        } else {
            // Other unexpected error reading the file
            console.error(`[CLI] Error loading key from ${KEY_FILE}:`, error);
            throw error; // Re-throw unexpected errors
        }
    }
}

// --- Authentication Helper ---
async function createAuthenticationInfo(message: schema.Message, keypair: Secp256k1KeypairType): Promise<schema.AuthenticationInfo> {
    console.debug("[CLI] Creating authentication info...");
    // 1. Prepare data to sign (must match server logic in auth.ts)
    const a2aMessageHash = createMessageHashForSigning(message);
    const btcSignMsg = new BitcoinSignMessage(a2aMessageHash, BITCOIN_MESSAGE_INFO);
    const btcMessageHash = btcSignMsg.hash();
    console.debug(`[CLI] Signing hash: ${toHEX(btcMessageHash)}`);

    // 2. Sign
    const signatureBytes = await keypair.sign(btcMessageHash);
    const signatureB64 = toB64(signatureBytes);
    console.debug("[CLI] Signature created (base64):", signatureB64.substring(0, 10) + "...");

    // 3. Get public key and address
    const publicKeyBytes = keypair.getPublicKey().toBytes();
    const publicKeyB64 = toB64(publicKeyBytes);
    const btcAddressStr = keypair.getBitcoinAddress().toStr();

    // 4. Construct Credentials
    const credentials: BtcCredentials = { // Assuming BtcCredentials type is available or defined here
        scheme: 'btc-signature',
        message: '', // Keep consistent with server which doesn't rely on this
        signature: signatureB64,
        btcAddress: btcAddressStr,
        btcPublicKey: publicKeyB64,
    };

    // 5. Construct AuthenticationInfo
    const authInfo: schema.AuthenticationInfo = {
        schemes: ['btc-signature'],
        credentials: JSON.stringify(credentials),
    };
    return authInfo;
}

// --- Main CLI Logic ---
const program = new Command();

program
    .name('nuwa-cli')
    .description('CLI to interact with Nuwa A2A Agent')
    .version('0.1.0');

program
    .command('chat')
    .description('Start an interactive chat session with the agent')
    .option('-s, --server-url <url>', 'A2A server URL', process.env.NUWA_SERVER_URL || DEFAULT_SERVER_URL)
    .option('-t, --task-id <id>', 'Reuse existing task ID')
    .action(handleChatCommand); // Use a separate async function

// Define BtcCredentials interface locally if not imported
interface BtcCredentials {
    scheme: "btc-signature";
    message: string;
    signature: string;
    btcAddress: string;
    btcPublicKey: string;
}

async function handleChatCommand(options: { serverUrl: string; taskId?: string }) {
    const serverUrl = options.serverUrl;
    let taskId = options.taskId || randomUUID(); // Generate new task ID if not provided
    let chatHistory: schema.Message[] = [];

    console.log(`Connecting to agent at: ${serverUrl}`);
    console.log(`Using Task ID: ${taskId}`);
    console.log('Type ".exit" to end the chat.');

    // --- Load or Create Keypair ---
    let keypair: Secp256k1KeypairType;
    try {
        keypair = await loadOrCreateAndSaveKeypair();
    } catch (err) {
         console.error("\nFailed to load or generate keypair. Cannot proceed with authenticated chat.");
         process.exit(1);
    }
    console.log(`[CLI] Using BTC Address: ${keypair.getBitcoinAddress().toStr()}`);
    // -------------------------------

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: '> ',
    });

    rl.prompt();

    for await (const line of rl) {
        if (line.trim().toLowerCase() === '.exit') {
            rl.close();
            break;
        }

        const userMessage: schema.Message = {
            role: 'user',
            parts: [{ type: 'text', text: line.trim() }],
        };

        try {
            // --- Create Authentication ---
            const authentication = await createAuthenticationInfo(userMessage, keypair);
            // ---------------------------

            const requestBody: schema.SendTaskRequest = {
                jsonrpc: '2.0',
                id: randomUUID(), // JSON-RPC request ID
                method: 'tasks/send',
                params: {
                    id: taskId, // A2A Task ID
                    message: userMessage,
                    // Include history if needed by agent (optional for now)
                    // historyLength: chatHistory.length,
                    authentication: authentication, // Add authentication info
                },
            };

            console.debug('[CLI] Sending request:', JSON.stringify(requestBody, null, 2));

            const response = await axios.post<schema.SendTaskResponse>(serverUrl, requestBody, {
                headers: { 'Content-Type': 'application/json' },
                 // Add timeout? Error handling for network issues?
            });

            console.debug('[CLI] Received response:', JSON.stringify(response.data, null, 2));

            if (response.data.error) {
                console.error(`Agent Error (${response.data.error.code}): ${response.data.error.message}`);
                if (response.data.error.data) {
                    console.error('  Data:', response.data.error.data);
                }
            } else if (response.data.result) {
                const task = response.data.result;
                taskId = task.id; // Update task ID if it changed (shouldn't for send)
                const agentMessage = task.status.message;
                if (agentMessage && agentMessage.role === 'agent') {
                    const agentTextPart = agentMessage.parts.find(
                        (part: schema.Part): part is schema.TextPart => part.type === 'text'
                    );
                    if (agentTextPart) {
                        console.log(`Agent: ${agentTextPart.text}`);
                         // Add both user and agent message to history for potential future use
                         // chatHistory.push(userMessage);
                         // chatHistory.push(agentMessage);
                    } else {
                        console.log('Agent responded with non-text content.');
                    }
                } else {
                     console.log(`Agent status: ${task.status.state}`);
                }
            } else {
                 console.error('Invalid response from agent.');
            }
        } catch (error: any) {
            if (axios.isAxiosError(error)) {
                console.error(`\nError connecting to agent: ${error.message}`);
                if (error.response) {
                    console.error(`  Status: ${error.response.status}`);
                    console.error('  Data:', error.response.data);
                }
            } else {
                console.error('\nAn unexpected error occurred:', error);
            }
        }

        rl.prompt();
    }

    console.log('\nChat session ended.');
}

// Export a function to run the CLI instead of parsing immediately
export function runCli() {
    program.parse(process.argv);
} 