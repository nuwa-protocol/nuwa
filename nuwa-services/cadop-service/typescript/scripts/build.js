const esbuild = require('esbuild');
const { nodeExternalsPlugin } = require('esbuild-node-externals');
const fs = require('fs-extra');
const path = require('path');

const isWatch = process.argv.includes('--watch');

// Ensure dist directory exists
fs.ensureDirSync('dist');
fs.ensureDirSync('dist/public');

// Copy static files
fs.copySync('public', 'dist/public', {
  filter: (src) => !src.endsWith('.html')
});

// Copy index.html from root
fs.copySync('index.html', 'dist/public/index.html');

// Process Tailwind CSS
const { execSync } = require('child_process');
const processTailwind = () => {
  try {
    execSync('npx tailwindcss -i src/styles/globals.css -o dist/public/styles/globals.css --minify', {
      stdio: 'inherit'
    });
  } catch (error) {
    console.error('Failed to process Tailwind CSS:', error.message);
  }
};

// Build configurations
const serverConfig = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node16',
  outfile: 'dist/index.js',
  plugins: [nodeExternalsPlugin()]
};

const clientConfig = {
  entryPoints: ['src/main.tsx'],
  bundle: true,
  minify: !isWatch,
  sourcemap: true,
  target: ['chrome58', 'firefox57', 'safari11', 'edge18'],
  outfile: 'dist/public/client.js',
  loader: {
    '.tsx': 'tsx',
    '.ts': 'ts',
    '.jsx': 'jsx',
    '.js': 'js',
    '.css': 'css',
    '.svg': 'dataurl',
  },
  plugins: [
    {
      name: 'css',
      setup(build) {
        build.onResolve({ filter: /\.css$/ }, args => {
          return { path: path.resolve(args.resolveDir, args.path) };
        });
      },
    },
  ]
};

// Build function
async function build() {
  try {
    // Process Tailwind CSS first
    processTailwind();
    
    // Build server and client
    if (isWatch) {
      console.log('Starting watch mode...');
      
      // Create contexts for watch mode
      const serverContext = await esbuild.context(serverConfig);
      const clientContext = await esbuild.context(clientConfig);
      
      // Start watching
      await Promise.all([
        serverContext.watch(),
        clientContext.watch()
      ]);
      
      console.log('Watching for changes...');
      
      // Keep the process running
      process.on('SIGTERM', async () => {
        await serverContext.dispose();
        await clientContext.dispose();
        process.exit(0);
      });
    } else {
      await Promise.all([
        esbuild.build(serverConfig),
        esbuild.build(clientConfig)
      ]);
      console.log('Build completed successfully');
    }
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

// Run build
build(); 