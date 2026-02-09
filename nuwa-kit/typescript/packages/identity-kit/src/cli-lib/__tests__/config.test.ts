import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { loadConfig, saveConfig, saveKeyMaterialWithRelativePath } from '../config';
import { KeyType } from '../../types/crypto';

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

  it('throws actionable error for invalid legacy config format', async () => {
    const configPath = path.join(tempHome, '.config', 'nuwa-did', 'config.json');
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(
      configPath,
      JSON.stringify({
        network: 'main',
        keyFragment: 'legacy-fragment',
      }),
      'utf8'
    );

    await expect(loadConfig()).rejects.toThrow(
      /invalid nuwa-id config.*Delete the file and run `nuwa-id init`/
    );
  });

  it('rejects unsafe key file paths', async () => {
    await expect(
      saveKeyMaterialWithRelativePath(
        {
          keyType: KeyType.ED25519,
          publicKeyMultibase: 'zPublic',
          privateKeyMultibase: 'zPrivate',
          keyFragment: 'support-agent-main',
          createdAt: new Date().toISOString(),
        },
        '../escape.json'
      )
    ).rejects.toThrow(/invalid keyFile path/);
  });
});
