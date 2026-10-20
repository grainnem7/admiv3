import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import type { Server } from 'node:http'
import { attachRemoteRelay, lanAddresses } from './src/remote/relay'
import { REMOTE_INFO_PATH } from './src/remote/protocol'
import { createDiskStore, diskStoreHandler, STORE_PATH } from './src/storage/diskStore'

/**
 * The iPad remote's link (see src/remote/relay.ts), on the same local server as the app,
 * plus a tiny endpoint that tells the laptop page its own network address so it can show
 * the iPad link. Only reachable from other devices when the server is started with
 * `npm run dev:ipad` (which listens on the local network).
 */
function admiRemote(): Plugin {
  // `lan`: whether other devices can reach this server at all (it was started with --host).
  const info = (lan: boolean) => (req: { socket: { localPort?: number } }, res: { setHeader(k: string, v: string): void; end(s: string): void }): void => {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ addresses: lanAddresses(), port: req.socket.localPort ?? null, lan }))
  }
  // The laptop's copy of the Board Sequencer's loops, scenes and setup (src/storage/diskStore.ts).
  // ADMI_DATA_DIR points a test server somewhere else, so it never touches the real copy.
  const store = createDiskStore(process.env.ADMI_DATA_DIR || resolve(__dirname, '.admi-data'))
  return {
    name: 'admi-remote',
    configureServer(server) {
      if (server.httpServer) attachRemoteRelay(server.httpServer as Server)
      server.middlewares.use(REMOTE_INFO_PATH, info(!!server.config.server.host))
      server.middlewares.use(STORE_PATH, diskStoreHandler(store))
    },
    configurePreviewServer(server) {
      if (server.httpServer) attachRemoteRelay(server.httpServer as Server)
      server.middlewares.use(REMOTE_INFO_PATH, info(!!server.config.preview.host))
      server.middlewares.use(STORE_PATH, diskStoreHandler(store))
    },
  }
}

export default defineConfig({
  plugins: [react(), admiRemote()],
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
