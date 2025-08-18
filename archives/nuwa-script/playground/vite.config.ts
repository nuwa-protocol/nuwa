import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'], // Ensure single React instance
  },
  // optimizeDeps: { // Removed - should no longer be needed after fixing nuwa-script exports
  //   include: ['nuwa-script'],
  // },
})
