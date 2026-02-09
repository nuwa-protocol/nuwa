import { mkdir, readFile, stat, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  ActiveProfile,
  AgentKeyMaterial,
  DidCliConfig,
  DidCliProfile,
  makeDefaultConfig,
} from './types';

function resolveCliDir(): string {
  return path.join(os.homedir(), '.config', 'nuwa-did');
}

export interface CliPaths {
  dir: string;
  configFile: string;
  keysDir: string;
}

export function getCliPaths(): CliPaths {
  const dir = resolveCliDir();
  return {
    dir,
    configFile: path.join(dir, 'config.json'),
    keysDir: path.join(dir, 'keys'),
  };
}

export async function ensureCliDir(): Promise<CliPaths> {
  const paths = getCliPaths();
  await mkdir(paths.dir, { recursive: true, mode: 0o700 });
  await mkdir(paths.keysDir, { recursive: true, mode: 0o700 });
  return paths;
}

export async function loadConfig(): Promise<DidCliConfig> {
  const paths = await ensureCliDir();
  try {
    const raw = await readFile(paths.configFile, 'utf8');
    return normalizeConfig(JSON.parse(raw) as Partial<DidCliConfig>);
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException;
    if (!err?.code || err.code !== 'ENOENT') {
      throw error;
    }
    return makeDefaultConfig();
  }
}

export async function saveConfig(config: DidCliConfig): Promise<void> {
  const paths = await ensureCliDir();
  await writeFile(paths.configFile, JSON.stringify(config, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });
}

export async function keyExists(): Promise<boolean> {
  const config = await loadConfig();
  const keyFile = resolveProfileKeyFile(config, config.activeProfile);
  try {
    await stat(keyFile);
    return true;
  } catch {
    return false;
  }
}

export async function loadKeyMaterial(profileName?: string): Promise<AgentKeyMaterial> {
  const config = await loadConfig();
  const keyFile = resolveProfileKeyFile(config, profileName || config.activeProfile);
  let raw: string;
  try {
    raw = await readFile(keyFile, 'utf8');
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException;
    if (err?.code === 'ENOENT') {
      throw new Error('agent key not initialized; run `nuwa-id init`');
    }
    throw error;
  }

  try {
    return JSON.parse(raw) as AgentKeyMaterial;
  } catch {
    throw new Error(`invalid key file at ${keyFile}`);
  }
}

export async function saveKeyMaterial(key: AgentKeyMaterial, profileName?: string): Promise<void> {
  const config = await loadConfig();
  const keyFile = resolveProfileKeyFile(config, profileName || config.activeProfile);
  const paths = await ensureCliDir();
  await mkdir(path.dirname(keyFile), { recursive: true, mode: 0o700 });
  await writeFile(keyFile, JSON.stringify(key, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });
}

export function getActiveProfile(config: DidCliConfig): ActiveProfile {
  const profile = config.profiles[config.activeProfile];
  if (!profile) {
    throw new Error(`active profile not found: ${config.activeProfile}`);
  }
  return {
    name: config.activeProfile,
    profile,
  };
}

export function updateActiveProfile(
  config: DidCliConfig,
  updater: (profile: DidCliProfile) => DidCliProfile
): DidCliConfig {
  const active = getActiveProfile(config);
  return {
    ...config,
    profiles: {
      ...config.profiles,
      [active.name]: updater(active.profile),
    },
  };
}

function normalizeConfig(input: Partial<DidCliConfig>): DidCliConfig {
  if (input.version !== 2) {
    throw new Error('invalid config version');
  }

  const activeProfile = input.activeProfile;
  if (!activeProfile || typeof activeProfile !== 'string') {
    throw new Error('invalid config: activeProfile missing');
  }

  const profiles = input.profiles;
  if (!profiles || typeof profiles !== 'object') {
    throw new Error('invalid config: profiles missing');
  }

  const active = (profiles as Record<string, Partial<DidCliProfile>>)[activeProfile];
  if (!active) {
    throw new Error(`invalid config: active profile "${activeProfile}" missing`);
  }

  return {
    version: 2,
    activeProfile,
    profiles: profiles as Record<string, DidCliProfile>,
  };
}

function resolveProfileKeyFile(config: DidCliConfig, profileName: string): string {
  const profile = config.profiles[profileName];
  if (!profile) {
    throw new Error(`profile not found: ${profileName}`);
  }

  const keyFile = profile.keyFile;
  if (path.isAbsolute(keyFile) || keyFile.includes('..')) {
    throw new Error(`invalid keyFile in config for profile "${profileName}"`);
  }

  return path.join(getCliPaths().dir, keyFile);
}
