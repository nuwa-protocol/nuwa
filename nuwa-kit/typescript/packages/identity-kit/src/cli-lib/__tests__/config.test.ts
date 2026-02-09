import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { mkdtemp, readFile, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { loadConfig, saveConfig } from '../config';

describe('cli config', () => {
  let tempHome: string;

  beforeEach(async () => {
    tempHome = await mkdtemp(path.join(os.tmpdir(), 'nuwa-id-home-'));
    jest.spyOn(os, 'homedir').mockReturnValue(tempHome);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await rm(tempHome, { recursive: true, force: true });
  });

  it('persists did in config.json', async () => {
    await saveConfig({
      version: 2,
      activeProfile: 'default',
      profiles: {
        default: {
          network: 'main',
          cadopDomain: 'https://id.nuwa.dev',
          keyFragment: 'support-agent-main',
          keyFile: 'keys/default.json',
          did: 'did:rooch:rooch1example',
        },
      },
    });

    const loaded = await loadConfig();
    expect(loaded.profiles.default.did).toBe('did:rooch:rooch1example');
    expect(loaded.activeProfile).toBe('default');
    expect(loaded.version).toBe(2);

    const raw = await readFile(
      path.join(tempHome, '.config', 'nuwa-did', 'config.json'),
      'utf8'
    );
    const parsed = JSON.parse(raw) as {
      profiles?: { default?: { did?: string; keyFile?: string } };
      version?: number;
      activeProfile?: string;
    };
    expect(parsed.version).toBe(2);
    expect(parsed.activeProfile).toBe('default');
    expect(parsed.profiles?.default?.did).toBe('did:rooch:rooch1example');
    expect(parsed.profiles?.default?.keyFile).toBe('keys/default.json');
  });
});
