import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: '0.0.0.0',
    allowedHosts: 'all',
    port: 3000,
    watch: {
      usePolling: true
    }
  }
})
