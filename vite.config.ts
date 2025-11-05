import { defineConfig } from 'vite'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineConfig({
  root: './http',
  resolve: {
    alias: {
      '/src': resolve(__dirname, './src')
    }
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: 'all',
    port: 3000,
    watch: {
      usePolling: true
    }
  }
})
