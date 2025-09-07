import { CryptoUtils, MultibaseCodec, KeyType, IdentityEnvBuilder, IdentityEnv, IdentityKit, KeyStore, MemoryKeyStore } from "@nuwa-ai/identity-kit";
import { createMcpClient } from "@nuwa-ai/payment-kit/mcp";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import os, { networkInterfaces } from "os";
import path from "path";
import http from "http";
import { URL } from "url";

/************************************************************
 * Configuration persistence helpers
 ************************************************************/

interface StoredConfig {
  agentDid: string;
  keyId: string;
  keyType: KeyType;
  privateKeyMultibase: string;
  publicKeyMultibase: string;
}

const CONFIG_DIR = path.join(os.homedir(), ".nuwa");
const CONFIG_PATH = path.join(CONFIG_DIR, "mcp-cli.json");

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

async function connectToCadop(cadopDomain = DEFAULT_CADOP_DOMAIN): Promise<StoredConfig> {
  console.log("No existing key found – starting connect flow…\n");

  // 1. Generate an Ed25519 key pair
  const { publicKey, privateKey } = await CryptoUtils.generateKeyPair(KeyType.ED25519);
  const publicKeyMultibase = MultibaseCodec.encodeBase58btc(publicKey);
  const privateKeyMultibase = MultibaseCodec.encodeBase58btc(privateKey);

  // 2. Build deep-link payload
  const state = randomUUID();
  const idFragment = `cli-${Date.now()}`;
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

  console.log("Please open the following URL in your browser to authorise the key:\n");
  console.log(deepLinkUrl + "\n");
  console.log(
    `Once you confirm the operation in CADOP Web, it will redirect to ${REDIRECT_URI}.\n` +
      "Leave this terminal open; the CLI is now waiting for the callback…\n"
  );

  // 3. Wait for browser redirect on a local HTTP server
  const result = await waitForCallback(state);

  if (!result.success) {
    throw new Error(result.error || "Authorization failed");
  }

  const { agentDid, keyId } = result;
  console.log(`Key authorised successfully.\nAgent DID: ${agentDid}\nKey ID: ${keyId}\n`);

  const config: StoredConfig = {
    agentDid,
    keyId,
    keyType: KeyType.ED25519,
    privateKeyMultibase,
    publicKeyMultibase,
  };
  await saveConfig(config);
  console.log(`Configuration saved to ${CONFIG_PATH}. Future runs will reuse it.`);
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
          ? `<html><body><h2>Key authorised successfully.</h2>You may now return to the CLI.</body></html>`
          : `<html><body><h2>Authorisation failed.</h2><pre>${error ?? "Unknown error"}</pre></body></html>`;
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

import type { SignerInterface } from "@nuwa-ai/identity-kit";

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

function createLocalKeyStore(cfg: StoredConfig): KeyStore {
  const privateKeyBytes = MultibaseCodec.decodeBase58btc(cfg.privateKeyMultibase);
  const publicKeyBytes = MultibaseCodec.decodeBase58btc(cfg.publicKeyMultibase);
  const fullId = cfg.keyId.includes("#") ? cfg.keyId : `${cfg.agentDid}#${cfg.keyId}`;

  return {
    async listKeyIds(): Promise<string[]> {
      return [fullId];
    },
    async load(keyId?: string) {
      if (!keyId || keyId === fullId) {
        return {
          keyId: fullId,
          keyType: cfg.keyType,
          publicKeyMultibase: cfg.publicKeyMultibase,
          privateKeyMultibase: cfg.privateKeyMultibase,
          meta: { source: "local-config" },
        } as any;
      }
      return null;
    },
    async save(_key) {
      // No-op: keys are persisted in local JSON config already
      return;
    },
    async clear(_keyId?: string) {
      // No-op: not mutating the local JSON config here
      return;
    },
    async sign(keyId: string, data: Uint8Array): Promise<Uint8Array> {
      if (keyId !== fullId) {
        throw new Error(`Unknown keyId ${keyId}`);
      }
      return CryptoUtils.sign(data, privateKeyBytes, cfg.keyType);
    },
  };
}


/************************************************************
 * Main
 ************************************************************/

async function main() {
  const cadopDomain = process.env.CADOP_DOMAIN || DEFAULT_CADOP_DOMAIN;
  let config = await loadConfig();
  if (!config) {
    config = await connectToCadop(cadopDomain);
  }

  const keyStore = createLocalKeyStore(config);
  // Build IdentityEnv and preload KeyManager state
  const env = await IdentityKit.bootstrap({
    method: "rooch",
    keyStore: keyStore,
    vdrOptions: {
      network: "test",
    },
  });
  // Note: for demo purposes we only need env.keyManager as signer; DID/key import not required here

  const payer = await createMcpClient(env as any, {
    baseUrl: process.env.MCP_URL || "http://localhost:8080/mcp",
    keyId: config.keyId,
    payerDid: config.agentDid,
    defaultAssetId: "0x3::gas_coin::RGas",
    maxAmount: BigInt(10_000_000),
    debug: true,
  });

  console.log("Calling nuwa.health via PaymentChannelMcpClient…");
  const health = await payer.healthCheck();
  console.log("Health:", health);

  console.log("Calling nuwa.discovery…");
  const { content } = await payer.callTool("nuwa.discovery");
  const discoveryText = content.find((c: any) => c?.type === "text");
  console.log("Discovery:", discoveryText?.text || content);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
}); 