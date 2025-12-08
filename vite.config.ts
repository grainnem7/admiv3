import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@tracking': resolve(__dirname, './src/tracking'),
      '@movement': resolve(__dirname, './src/movement'),
      '@mapping': resolve(__dirname, './src/mapping'),
      '@sound': resolve(__dirname, './src/sound'),
      '@calibration': resolve(__dirname, './src/calibration'),
      '@state': resolve(__dirname, './src/state'),
      '@ui': resolve(__dirname, './src/ui'),
      '@utils': resolve(__dirname, './src/utils'),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
})
