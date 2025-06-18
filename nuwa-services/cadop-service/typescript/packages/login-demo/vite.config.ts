import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    // Allow connections from any IP address (for testing on local network)
    host: '0.0.0.0',
  },
  base: './',
})
