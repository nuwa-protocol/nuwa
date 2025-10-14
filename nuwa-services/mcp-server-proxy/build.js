import { build } from 'esbuild';
import { nodeExternalsPlugin } from 'esbuild-node-externals';
import { mkdir, chmod, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

// Ensure dist directory exists
if (!existsSync('./dist')) {
  await mkdir('./dist', { recursive: true });
}

try {
  await build({
    entryPoints: ['src/server.ts'],
    outfile: 'dist/index.js',
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    sourcemap: true,
    // Don't add banner here, we'll handle it manually
    plugins: [
      nodeExternalsPlugin({
        allowList: [],
      }),
    ],
    // Mark problematic packages as external
    external: [
      'sury',
      'effect',
      '@valibot/to-json-schema',
    ],
    minify: process.env.NODE_ENV === 'production',
  });
  
  // Read the generated file and prepend shebang
  const { readFile } = await import('node:fs/promises');
  const content = await readFile('./dist/index.js', 'utf8');
  
  // Write the file with proper shebang
  const finalContent = `#!/usr/bin/env node
${content}`;
  
  await writeFile('./dist/index.js', finalContent, 'utf8');
  
  // Make the output file executable (Unix-like systems)
  if (process.platform !== 'win32') {
    try {
      await chmod('./dist/index.js', '755');
      console.log('✅ Made dist/index.js executable');
    } catch (chmodError) {
      console.warn('⚠️  Could not set executable permissions:', chmodError.message);
    }
  }
  
  console.log('✅ Build completed successfully');
} catch (error) {
  console.error('❌ Build failed:', error);
  process.exit(1);
} 