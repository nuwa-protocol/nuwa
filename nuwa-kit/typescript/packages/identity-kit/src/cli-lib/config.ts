import { mkdir, readFile, stat, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { AgentKeyMaterial, DEFAULT_CONFIG, DidCliConfig } from './types';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'nuwa-did');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const KEY_FILE = path.join(CONFIG_DIR, 'agent-key.json');

export interface CliPaths {
  dir: string;
  configFile: string;
  keyFile: string;
}

export function getCliPaths(): CliPaths {
  return {
    dir: CONFIG_DIR,
    configFile: CONFIG_FILE,
    keyFile: KEY_FILE,
  };
}

export async function ensureCliDir(): Promise<CliPaths> {
  const paths = getCliPaths();
  await mkdir(paths.dir, { recursive: true, mode: 0o700 });
  return paths;
}

export async function loadConfig(): Promise<DidCliConfig> {
  const paths = await ensureCliDir();
  try {
    const raw = await readFile(paths.configFile, 'utf8');
    return {
      ...DEFAULT_CONFIG,
      ...(JSON.parse(raw) as Partial<DidCliConfig>),
    };
  } catch {
    return { ...DEFAULT_CONFIG };
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
  const paths = getCliPaths();
  try {
    await stat(paths.keyFile);
    return true;
  } catch {
    return false;
  }
}

export async function loadKeyMaterial(): Promise<AgentKeyMaterial> {
  const paths = await ensureCliDir();
  const raw = await readFile(paths.keyFile, 'utf8');
  return JSON.parse(raw) as AgentKeyMaterial;
}

export async function saveKeyMaterial(key: AgentKeyMaterial): Promise<void> {
  const paths = await ensureCliDir();
  await writeFile(paths.keyFile, JSON.stringify(key, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });
}

