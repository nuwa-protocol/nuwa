#!/usr/bin/env node

import { stat } from 'fs/promises';
import path from 'path';
import {
  ensureCliDir,
  getActiveProfile,
  getCliPaths,
  keyExists,
  loadConfig,
  loadKeyMaterial,
  saveConfig,
  saveKeyMaterial,
  updateActiveProfile,
} from '../cli-lib/config';
import { buildAddKeyDeepLink } from '../cli-lib/deeplink';
import { createDidAuthHeader } from '../cli-lib/authHeader';
import { sendDidAuthRequest } from '../cli-lib/http';
import { createAgentKeyMaterial } from '../cli-lib/keys';
import { verifyDidKeyBinding } from '../cli-lib/verify';
import { makeDefaultConfig } from '../cli-lib/types';

type ParsedArgs = {
  command?: string;
  options: Record<string, string | boolean | string[]>;
};

async function main(): Promise<void> {
  try {
    const parsed = parseArgs(process.argv.slice(2));
    const command = parsed.command;

    if (!command || command === 'help' || getBool(parsed.options.help)) {
      printHelp();
      return;
    }

    switch (command) {
      case 'init':
        await runInit(parsed.options);
        return;
      case 'set-did':
        await runSetDid(parsed.options);
        return;
      case 'profile:list':
        await runProfileList(parsed.options);
        return;
      case 'profile:use':
        await runProfileUse(parsed.options);
        return;
      case 'profile:create':
        await runProfileCreate(parsed.options);
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
  const config = await loadConfig();
  const active = getActiveProfile(config);
  const exists = await keyExists();
  const force = getBool(options.force);
  if (exists && !force) {
    throw new Error('key already exists, use --force to overwrite');
  }

  const keyFragment = getString(options['key-fragment']) || makeDefaultKeyFragment();
  const network = parseNetwork(getString(options.network) || active.profile.network);
  const roochRpcUrl = getString(options['rpc-url']) || active.profile.roochRpcUrl;
  const cadopDomain = getString(options['cadop-domain']) || active.profile.cadopDomain;

  const key = await createAgentKeyMaterial(keyFragment);
  await saveKeyMaterial(key);
  await saveConfig(
    updateActiveProfile(config, profile => ({
      ...profile,
      network,
      roochRpcUrl,
      cadopDomain,
      keyFragment,
    }))
  );

  console.log('initialized did-auth agent config');
  console.log(`publicKeyMultibase=${key.publicKeyMultibase}`);
  console.log(`keyFragment=${keyFragment}`);
  console.log(`activeProfile=${active.name}`);
  console.log(`configDir=${getCliPaths().dir}`);
}

async function runLink(options: ParsedArgs['options']): Promise<void> {
  const config = await loadConfig();
  const active = getActiveProfile(config);
  const key = await loadKeyMaterial();
  const cadopDomain = getString(options['cadop-domain']) || active.profile.cadopDomain;
  const redirectUri = getString(options['redirect-uri']);
  assertKeyFragmentMatch(active.profile.keyFragment, key.keyFragment);

  const link = buildAddKeyDeepLink({
    key,
    keyFragment: active.profile.keyFragment,
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

async function runSetDid(options: ParsedArgs['options']): Promise<void> {
  const did = requiredString(options.did, '--did is required');
  const config = await loadConfig();
  await saveConfig(updateActiveProfile(config, profile => ({ ...profile, did })));
  console.log(`saved did=${did} to ${getCliPaths().configFile}`);
}

async function runProfileList(options: ParsedArgs['options']): Promise<void> {
  const config = await loadConfig();
  const entries = Object.entries(config.profiles).map(([name, profile]) => ({
    name,
    active: name === config.activeProfile,
    did: profile.did || '',
    network: profile.network,
    cadopDomain: profile.cadopDomain,
    keyFragment: profile.keyFragment,
    keyFile: profile.keyFile,
  }));

  if (getBool(options.json)) {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  for (const entry of entries) {
    const prefix = entry.active ? '*' : ' ';
    console.log(
      `${prefix} ${entry.name} network=${entry.network} keyFragment=${entry.keyFragment} did=${entry.did || '-'}`
    );
  }
}

async function runProfileUse(options: ParsedArgs['options']): Promise<void> {
  const name = requiredString(options.name, '--name is required');
  const config = await loadConfig();
  if (!config.profiles[name]) {
    throw new Error(`profile not found: ${name}`);
  }

  await saveConfig({
    ...config,
    activeProfile: name,
  });
  console.log(`activeProfile=${name}`);
}

async function runProfileCreate(options: ParsedArgs['options']): Promise<void> {
  const name = requiredString(options.name, '--name is required');
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error('invalid --name, allowed chars: a-z A-Z 0-9 _ -');
  }

  const config = await loadConfig();
  if (config.profiles[name]) {
    throw new Error(`profile already exists: ${name}`);
  }
  const profileKeyFile = `keys/${name}.json`;
  const force = getBool(options.force);
  try {
    await stat(path.join(getCliPaths().dir, profileKeyFile));
    if (!force) {
      throw new Error(`key already exists for profile "${name}", use --force to overwrite`);
    }
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException;
    if (err?.code && err.code !== 'ENOENT') {
      throw error;
    }
  }

  const active = getActiveProfile(config);
  const keyFragment = getString(options['key-fragment']) || makeDefaultKeyFragment();
  const network = parseNetwork(getString(options.network) || active.profile.network);
  const roochRpcUrl = getString(options['rpc-url']) || active.profile.roochRpcUrl;
  const cadopDomain = getString(options['cadop-domain']) || active.profile.cadopDomain;
  const did = getString(options.did);

  const next = {
    ...config,
    profiles: {
      ...config.profiles,
      [name]: {
        did,
        network,
        roochRpcUrl,
        cadopDomain,
        keyFragment,
        keyFile: profileKeyFile,
      },
    },
  };
  await saveConfig(next);

  const key = await createAgentKeyMaterial(keyFragment);
  await saveKeyMaterial(key, name);
  console.log(`created profile=${name}`);
  console.log(`publicKeyMultibase=${key.publicKeyMultibase}`);
  console.log(`keyFragment=${keyFragment}`);
}

async function runVerify(options: ParsedArgs['options']): Promise<void> {
  const config = await loadConfig();
  const active = getActiveProfile(config);
  const did = active.profile.did;
  if (!did) throw new Error('did is not set; run `nuwa-id set-did --did DID`');
  const key = await loadKeyMaterial();
  assertKeyFragmentMatch(active.profile.keyFragment, key.keyFragment);
  const network = parseNetwork(getString(options.network) || active.profile.network || 'main');
  const rpcUrl = getString(options['rpc-url']) || active.profile.roochRpcUrl;
  const keyId = `${did}#${active.profile.keyFragment}`;

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
  const config = await loadConfig();
  const active = getActiveProfile(config);
  const did = active.profile.did;
  if (!did) throw new Error('did is not set; run `nuwa-id set-did --did DID`');
  const method = requiredString(options.method, '--method is required');
  const url = requiredString(options.url, '--url is required');
  const body = getString(options.body) || '';
  const audience = getString(options.audience);

  const key = await loadKeyMaterial();
  assertKeyFragmentMatch(active.profile.keyFragment, key.keyFragment);

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
  const config = await loadConfig();
  const active = getActiveProfile(config);
  const did = active.profile.did;
  if (!did) throw new Error('did is not set; run `nuwa-id set-did --did DID`');
  const method = requiredString(options.method, '--method is required');
  const url = requiredString(options.url, '--url is required');
  const body = getString(options.body) || '';
  const audience = getString(options.audience);

  const key = await loadKeyMaterial();
  assertKeyFragmentMatch(active.profile.keyFragment, key.keyFragment);
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
  const [first, ...tail] = argv;
  let command = first;
  let rest = tail;
  if (first === 'profile') {
    const action = tail[0];
    if (!action || action.startsWith('--')) {
      throw new Error('profile command requires subcommand: list | use | create');
    }
    command = `profile:${action}`;
    rest = tail.slice(1);
  }
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

function parseNetwork(input: string): 'main' | 'test' {
  if (input !== 'main' && input !== 'test') {
    throw new Error(`invalid network "${input}", allowed values: main | test`);
  }
  return input;
}

function makeDefaultKeyFragment(now = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hour = String(now.getUTCHours()).padStart(2, '0');
  const minute = String(now.getUTCMinutes()).padStart(2, '0');
  const second = String(now.getUTCSeconds()).padStart(2, '0');
  return `agent-auth-${year}${month}${day}${hour}${minute}${second}`;
}

function assertKeyFragmentMatch(expected: string, actual: string): void {
  if (expected === actual) return;
  throw new Error(
    `keyFragment mismatch: config has "${expected}" but key file has "${actual}". Run \`nuwa-id init --force --key-fragment ${actual}\` to resync.`
  );
}

function printHelp(): void {
  const defaults = makeDefaultConfig();
  const active = defaults.profiles[defaults.activeProfile];
  const lines = [
    'nuwa-id - DIDAuth helper CLI for remote agents',
    '',
    'Commands:',
    '  nuwa-id init [--force] [--network main|test] [--rpc-url URL] [--cadop-domain URL] [--key-fragment FRAGMENT]',
    '  nuwa-id set-did --did DID',
    '  nuwa-id profile list [--json]',
    '  nuwa-id profile use --name NAME',
    '  nuwa-id profile create --name NAME [--network main|test] [--rpc-url URL] [--cadop-domain URL] [--key-fragment FRAGMENT] [--did DID]',
    '  nuwa-id link [--cadop-domain URL] [--redirect-uri URL] [--json]',
    '  nuwa-id verify [--network main|test] [--rpc-url URL]',
    '  nuwa-id auth-header --method METHOD --url URL [--body RAW] [--audience URL]',
    '  nuwa-id curl --method METHOD --url URL [--body RAW] [--audience URL] [--header "K: V"]',
    '',
    `Defaults: network=${active.network}, cadop-domain=${active.cadopDomain}, profile=${defaults.activeProfile}`,
  ];
  console.log(lines.join('\n'));
}

void main();
