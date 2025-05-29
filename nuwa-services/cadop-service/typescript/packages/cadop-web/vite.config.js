import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
export default defineConfig({
    plugins: [react()],
    publicDir: 'public',
    server: {
        port: 3000,
        proxy: {
            '/api': 'http://localhost:8080',
            '/auth': 'http://localhost:8080',
            '/.well-known': 'http://localhost:8080'
        }
    },
    build: {
        outDir: 'dist/public',
        emptyOutDir: true,
        sourcemap: true
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src')
        },
        extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json']
    },
    optimizeDeps: {
        esbuildOptions: {
            target: 'es2020'
        }
    },
    esbuild: {
        logOverride: { 'this-is-undefined-in-esm': 'silent' }
    }
});
