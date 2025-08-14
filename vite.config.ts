import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // make HMR work inside the https CodeSandbox iframe
    hmr: { clientPort: 443, protocol: 'wss' }
  },
  preview: { host: true, port: 4173 }
})
