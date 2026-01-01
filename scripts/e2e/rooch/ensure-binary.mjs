#!/usr/bin/env node
/**
 * Rooch Binary Downloader
 *
 * Downloads and caches Rooch release binaries from GitHub.
 * Supports macOS, Linux, and Windows platforms.
 *
 * Environment Variables:
 * - ROOCH_E2E_VERSION: Version to download (default: 0.12.2)
 * - ROOCH_E2E_URL_TEMPLATE: URL template for downloads (default: GitHub releases)
 * - ROOCH_E2E_BIN_DIR: Cache directory (default: ~/.cache/rooch)
 *
 * Usage:
 *   node scripts/e2e/rooch/ensure-binary.mjs
 *
 * Outputs:
 *   stderr: Progress messages
 *   stdout: Binary path (for machine parsing)
 */

import { createWriteStream } from 'fs';
import { mkdir, chmod, rename, unlink, rm } from 'fs/promises';
import { execFileSync } from 'child_process';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';
import path from 'path';
import { existsSync } from 'fs';
import { homedir } from 'os';

// Platform mapping based on actual Rooch release naming
// Note: rooch-macos-latest.zip contains arm64 only (Apple Silicon)
const PLATFORM_MAP = {
  'darwin': {
    asset: 'rooch-macos-latest.zip',
    arch: 'arm64', // Only Apple Silicon is supported
    checkArch: true
  },
  'linux': {
    asset: 'rooch-ubuntu-latest.zip',
    arch: null, // Any architecture
    checkArch: false
  },
  'win32': {
    asset: 'rooch-windows-2022.zip',
    arch: null, // Any architecture
    checkArch: false
  }
};

// Configuration
const VERSION = process.env.ROOCH_E2E_VERSION || '0.12.2';
const URL_TEMPLATE = process.env.ROOCH_E2E_URL_TEMPLATE ||
  'https://github.com/rooch-network/rooch/releases/download/v${version}/${asset}';
const CACHE_DIR = process.env.ROOCH_E2E_BIN_DIR ||
  path.join(homedir(), '.cache', 'rooch');

/**
 * Get platform-specific asset name
 */
function getPlatformAsset() {
  const platform = process.platform;
  const arch = process.arch;
  const platformConfig = PLATFORM_MAP[platform];

  if (!platformConfig) {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  // Check architecture compatibility for macOS
  if (platformConfig.checkArch && platformConfig.arch) {
    if (arch !== 'arm64' && arch !== 'aarch64') {
      throw new Error(
        `Rooch macOS builds are only available for Apple Silicon (arm64).\n` +
        `Your architecture: ${arch}\n` +
        `For Intel Macs (x86_64), please:\n` +
        `  1. Build Rooch from source, or\n` +
        `  2. Use an Apple Silicon machine, or\n` +
        `  3. Set ROOCH_E2E_BIN to use a custom-built binary`
      );
    }
  }

  return platformConfig.asset;
}

/**
 * Resolve download URL from template
 */
function resolveDownloadUrl(version, asset) {
  return URL_TEMPLATE
    .replace('${version}', version)
    .replace('${asset}', asset);
}

/**
 * Download file with progress tracking
 */
async function downloadFile(url, destPath) {
  console.error(`Downloading: ${url}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
  }

  const totalSize = parseInt(response.headers.get('content-length') || '0');
  let downloadedSize = 0;
  let lastProgressSize = 0;
  const PROGRESS_INTERVAL = 1024 * 1024; // Report progress every 1MB

  const tempPath = destPath + '.tmp';
  const fileStream = createWriteStream(tempPath);

  // Transform stream to track progress
  const progressTransform = new Transform({
    transform(chunk, encoding, callback) {
      downloadedSize += chunk.length;
      if (totalSize > 0 && downloadedSize - lastProgressSize >= PROGRESS_INTERVAL) {
        const percent = ((downloadedSize / totalSize) * 100).toFixed(1);
        const mb = (downloadedSize / 1024 / 1024).toFixed(1);
        console.error(`Progress: ${percent}% (${mb} MB)`);
        lastProgressSize = downloadedSize;
      }
      callback(null, chunk);
    }
  });

  await pipeline(
    response.body,
    progressTransform,
    fileStream
  );

  return tempPath;
}

/**
 * Download with retry logic
 */
async function downloadWithRetry(url, destPath, maxRetries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await downloadFile(url, destPath);
    } catch (error) {
      lastError = error;

      // Clean up temporary file if download failed
      try {
        const tempPath = destPath + '.tmp';
        await unlink(tempPath);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        console.error(`Download failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

/**
 * Extract archive using system tools
 */
async function extractArchive(archivePath, extractDir) {
  console.error(`Extracting: ${archivePath}`);

  try {
    if (archivePath.endsWith('.zip')) {
      // On Windows, use PowerShell
      if (process.platform === 'win32') {
        execFileSync('powershell', [
          '-NoProfile',
          '-Command',
          '& { param($archivePath, $extractDir) Expand-Archive -Path $archivePath -DestinationPath $extractDir -Force }',
          archivePath,
          extractDir
        ], { stdio: 'inherit' });
      } else {
        // On Unix-like systems (Linux, macOS), use unzip
        execFileSync('unzip', ['-q', archivePath, '-d', extractDir], {
          stdio: 'inherit'
        });
      }
    } else {
      throw new Error(`Unsupported archive format: ${archivePath}`);
    }
  } catch (error) {
    throw new Error(`Failed to extract archive: ${error.message}`);
  }
}

/**
 * Locate the extracted binary
 */
async function locateExtractedBinary(extractDir) {
  const { readdir, stat } = await import('fs/promises');

  // Check for binary in root of extract dir
  const binaryName = process.platform === 'win32' ? 'rooch.exe' : 'rooch';
  const rootBinary = path.join(extractDir, binaryName);

  if (existsSync(rootBinary)) {
    return rootBinary;
  }

  // Search in subdirectories
  const entries = await readdir(extractDir);
  for (const entry of entries) {
    const entryPath = path.join(extractDir, entry);
    const statResult = await stat(entryPath);

    if (statResult.isDirectory()) {
      const binaryPath = path.join(entryPath, binaryName);
      if (existsSync(binaryPath)) {
        return binaryPath;
      }
    }
  }

  throw new Error('Could not locate rooch binary in extracted archive');
}

/**
 * Verify binary version
 */
async function verifyBinary(binaryPath, expectedVersion) {
  console.error(`Verifying binary: ${binaryPath}`);

  const { spawn } = await import('child_process');

  return new Promise((resolve, reject) => {
    const child = spawn(binaryPath, ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Binary verification failed with code ${code}: ${stderr}`));
        return;
      }

      // Parse version output (format: "rooch 0.12.2")
      const versionMatch = stdout.match(/rooch\s+(\d+\.\d+\.\d+)/);
      if (!versionMatch) {
        reject(new Error(`Could not parse version from: ${stdout}`));
        return;
      }

      const actualVersion = versionMatch[1];
      if (actualVersion !== expectedVersion) {
        console.error(`Warning: Version mismatch. Expected ${expectedVersion}, got ${actualVersion}`);
      }

      console.error(`Binary verified: rooch ${actualVersion}`);
      resolve();
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to spawn binary: ${error.message}`));
    });
  });
}

/**
 * Check if cached binary is valid
 */
async function isCachedBinaryValid(binaryPath, expectedVersion) {
  try {
    if (!existsSync(binaryPath)) {
      return false;
    }
    await verifyBinary(binaryPath, expectedVersion);
    return true;
  } catch {
    return false;
  }
}

/**
 * Main ensure binary logic
 */
async function ensureBinary() {
  try {
    // 1. Determine platform-specific asset
    const asset = getPlatformAsset();
    console.error(`Platform asset: ${asset}`);

    // 2. Resolve paths
    const version = VERSION;
    await mkdir(CACHE_DIR, { recursive: true });

    const binaryPath = path.join(CACHE_DIR, `rooch-${version}`);
    console.error(`Binary path: ${binaryPath}`);

    // 3. Check cache
    if (await isCachedBinaryValid(binaryPath, version)) {
      console.error(`Using cached binary: ${binaryPath}`);
      console.log(binaryPath); // stdout for machine parsing
      return;
    }

    // 4. Download archive
    const url = resolveDownloadUrl(version, asset);
    const archivePath = path.join(CACHE_DIR, asset);
    const tempArchivePath = await downloadWithRetry(url, archivePath);
    await rename(tempArchivePath, archivePath);

    // 5. Extract
    const extractDir = path.join(CACHE_DIR, `extract-${Date.now()}`);
    await mkdir(extractDir, { recursive: true });
    await extractArchive(archivePath, extractDir);

    // 6. Locate and move binary
    const extractedBinary = await locateExtractedBinary(extractDir);

    // Make executable on Unix-like systems
    if (process.platform !== 'win32') {
      await chmod(extractedBinary, 0o755);
    }

    await rename(extractedBinary, binaryPath);

    // 7. Cleanup
    await unlink(archivePath);
    await rm(extractDir, { recursive: true, force: true });

    // 8. Verify
    await verifyBinary(binaryPath, version);

    console.error(`Binary installed: ${binaryPath}`);
    console.log(binaryPath); // stdout for machine parsing

  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Run
ensureBinary();
