import { build } from 'esbuild';
import { nodeExternalsPlugin } from 'esbuild-node-externals';
import fs from 'node:fs';

if (!fs.existsSync('./dist')) {
  fs.mkdirSync('./dist', { recursive: true });
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
    plugins: [
      nodeExternalsPlugin({
        allowList: [],
      }),
    ],
    // explicitly mark these packages as external dependencies
    external: [
      'sury',
      'effect',
      '@valibot/to-json-schema',
    ],
  });
  console.log('✅ Build completed successfully');
} catch (error) {
  console.error('❌ Build failed:', error);
  process.exit(1);
} 