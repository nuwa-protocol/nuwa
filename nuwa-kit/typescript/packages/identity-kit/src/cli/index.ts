#!/usr/bin/env node

import {
  ensureCliDir,
  keyExists,
  loadConfig,
  loadKeyMaterial,
  saveConfig,
  saveKeyMaterial,
} from '../cli-lib/config';
import { buildAddKeyDeepLink } from '../cli-lib/deeplink';
import { createDidAuthHeader } from '../cli-lib/authHeader';
import { sendDidAuthRequest } from '../cli-lib/http';
import { createAgentKeyMaterial } from '../cli-lib/keys';
import { verifyDidKeyBinding } from '../cli-lib/verify';
import { DEFAULT_CONFIG } from '../cli-lib/types';

type ParsedArgs = {
  command?: string;
  options: Record<string, string | boolean | string[]>;
};

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  const command = parsed.command;

  if (!command || command === 'help' || getBool(parsed.options.help)) {
    printHelp();
    return;
  }

  try {
    switch (command) {
      case 'init':
        await runInit(parsed.options);
        return;
      case 'link':
        await runLink(parsed.options);
        return;
      case 'verify':
        await runVerify(parsed.options);
        return;
      case 'auth-header':
        await runAuthHeader(parsed.options);
        return;
      case 'curl':
        await runCurl(parsed.options);
        return;
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`error: ${message}`);
    process.exit(1);
  }
}

async function runInit(options: ParsedArgs['options']): Promise<void> {
  await ensureCliDir();
  const exists = await keyExists();
  const force = getBool(options.force);
  if (exists && !force) {
    throw new Error('key already exists, use --force to overwrite');
  }

  const idFragment = getString(options['id-fragment']) || DEFAULT_CONFIG.idFragment;
  const network = (getString(options.network) || DEFAULT_CONFIG.network) as 'main' | 'test';
  const roochRpcUrl = getString(options['rpc-url']) || DEFAULT_CONFIG.roochRpcUrl;
  const cadopDomain = getString(options['cadop-domain']) || DEFAULT_CONFIG.cadopDomain;

  const key = await createAgentKeyMaterial(idFragment);
  await saveKeyMaterial(key);
  await saveConfig({
    network,
    roochRpcUrl,
    cadopDomain,
    idFragment,
  });

  console.log('initialized did-auth agent config');
  console.log(`publicKeyMultibase=${key.publicKeyMultibase}`);
  console.log(`configDir=~/.config/nuwa-did`);
}

async function runLink(options: ParsedArgs['options']): Promise<void> {
  const config = await loadConfig();
  const key = await loadKeyMaterial();
  const idFragment = getString(options['id-fragment']) || config.idFragment || key.idFragment;
  const cadopDomain = getString(options['cadop-domain']) || config.cadopDomain;
  const redirectUri = getString(options['redirect-uri']);

  const link = buildAddKeyDeepLink({
    key,
    idFragment,
    cadopDomain,
    redirectUri,
  });

  if (getBool(options.json)) {
    console.log(
      JSON.stringify(
        {
          deepLinkUrl: link.url,
          payload: link.payload,
        },
        null,
        2
      )
    );
    return;
  }

  console.log(link.url);
}

async function runVerify(options: ParsedArgs['options']): Promise<void> {
  const did = requiredString(options.did, '--did is required');
  const config = await loadConfig();
  const key = await loadKeyMaterial();
  const idFragment = getString(options['id-fragment']) || config.idFragment || key.idFragment;
  const network = (getString(options.network) || config.network || 'main') as 'main' | 'test';
  const rpcUrl = getString(options['rpc-url']) || config.roochRpcUrl;
  const keyId = `${did}#${idFragment}`;

  const result = await verifyDidKeyBinding({
    did,
    keyId,
    network,
    rpcUrl,
  });

  if (result.verificationMethodFound && result.authenticationBound) {
    console.log(`verified: ${result.did} contains ${result.keyId} in authentication`);
    return;
  }

  const reasons: string[] = [];
  if (!result.verificationMethodFound) reasons.push('verificationMethod missing');
  if (!result.authenticationBound) reasons.push('authentication binding missing');
  throw new Error(`verify failed: ${reasons.join(', ')}`);
}

async function runAuthHeader(options: ParsedArgs['options']): Promise<void> {
  const did = requiredString(options.did, '--did is required');
  const method = requiredString(options.method, '--method is required');
  const url = requiredString(options.url, '--url is required');
  const body = getString(options.body) || '';
  const audience = getString(options.audience);

  const config = await loadConfig();
  const key = await loadKeyMaterial();
  const idFragment = getString(options['id-fragment']) || config.idFragment || key.idFragment;
  key.idFragment = idFragment;

  const header = await createDidAuthHeader({
    did,
    key,
    method,
    url,
    body,
    audience,
  });
  console.log(header);
}

async function runCurl(options: ParsedArgs['options']): Promise<void> {
  const did = requiredString(options.did, '--did is required');
  const method = requiredString(options.method, '--method is required');
  const url = requiredString(options.url, '--url is required');
  const body = getString(options.body) || '';
  const audience = getString(options.audience);

  const config = await loadConfig();
  const key = await loadKeyMaterial();
  const idFragment = getString(options['id-fragment']) || config.idFragment || key.idFragment;
  key.idFragment = idFragment;
  const headers = parseHeaders(getStringArray(options.header));

  const response = await sendDidAuthRequest({
    did,
    key,
    method,
    url,
    body,
    audience,
    headers,
  });

  console.log(`HTTP ${response.status} ${response.statusText}`);
  console.log(response.body);
}

function parseArgs(argv: string[]): ParsedArgs {
  if (argv.length === 0) return { options: {} };
  const [command, ...rest] = argv;
  const options: ParsedArgs['options'] = {};

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (!token.startsWith('--')) continue;

    const [rawKey, inlineValue] = token.slice(2).split('=', 2);
    if (inlineValue !== undefined) {
      addOption(options, rawKey, inlineValue);
      continue;
    }

    const next = rest[i + 1];
    if (!next || next.startsWith('--')) {
      addOption(options, rawKey, true);
      continue;
    }

    addOption(options, rawKey, next);
    i += 1;
  }

  return { command, options };
}

function addOption(
  options: ParsedArgs['options'],
  key: string,
  value: string | boolean
): void {
  const existing = options[key];
  if (existing === undefined) {
    options[key] = value;
    return;
  }
  if (Array.isArray(existing)) {
    existing.push(String(value));
    options[key] = existing;
    return;
  }
  options[key] = [String(existing), String(value)];
}

function getBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value === 'true';
  return false;
}

function getString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length > 0) {
    return typeof value[value.length - 1] === 'string'
      ? (value[value.length - 1] as string)
      : undefined;
  }
  return undefined;
}

function getStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter(v => typeof v === 'string') as string[];
  if (typeof value === 'string') return [value];
  return [];
}

function requiredString(value: unknown, message: string): string {
  const result = getString(value);
  if (!result) throw new Error(message);
  return result;
}

function parseHeaders(entries: string[]): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const entry of entries) {
    const sep = entry.indexOf(':');
    if (sep <= 0) {
      throw new Error(`invalid --header value: ${entry}`);
    }
    const name = entry.slice(0, sep).trim();
    const value = entry.slice(sep + 1).trim();
    headers[name] = value;
  }
  return headers;
}

function printHelp(): void {
  const lines = [
    'nuwa-id - DIDAuth helper CLI for remote agents',
    '',
    'Commands:',
    '  nuwa-id init [--force] [--network main|test] [--rpc-url URL] [--cadop-domain URL] [--id-fragment FRAGMENT]',
    '  nuwa-id link [--cadop-domain URL] [--id-fragment FRAGMENT] [--redirect-uri URL] [--json]',
    '  nuwa-id verify --did DID [--network main|test] [--rpc-url URL] [--id-fragment FRAGMENT]',
    '  nuwa-id auth-header --did DID --method METHOD --url URL [--body RAW] [--audience URL] [--id-fragment FRAGMENT]',
    '  nuwa-id curl --did DID --method METHOD --url URL [--body RAW] [--audience URL] [--id-fragment FRAGMENT] [--header "K: V"]',
  ];
  console.log(lines.join('\n'));
}

void main();

