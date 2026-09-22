import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    manifest: true,
    rollupOptions: {
      input: {
        studio: fileURLToPath(new URL('./index.html', import.meta.url)),
        materials: fileURLToPath(new URL('./materials.html', import.meta.url)),
        capture: fileURLToPath(new URL('./capture.html', import.meta.url)),
        process: fileURLToPath(new URL('./process.html', import.meta.url)),
        materialQa: fileURLToPath(new URL('./material-qa.html', import.meta.url)),
        promote: fileURLToPath(new URL('./promote.html', import.meta.url)),
        productCapture: fileURLToPath(new URL('./product-capture.html', import.meta.url)),
      },
    },
  },
})
