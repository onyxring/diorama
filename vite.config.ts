import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl';

// diorama ships as an installable PWA so it can live on an iPad home screen and
// run offline. The manifest below drives "Add to Home Screen"; the service worker
// (autoUpdate) precaches the built assets.
export default defineConfig({
  // Bind to all interfaces so a tablet on the same network can reach the dev server
  // at http://<host>.local:5173 (Vite defaults to localhost-only, which just hangs
  // from another device). Vite prints the reachable "Network:" URL on start.
  server: {
    host: true,
    // Vite blocks requests whose Host header isn't allowlisted (DNS-rebinding guard).
    // This is a local IF-authoring dev tool on a trusted LAN, so allow any host — that
    // covers `<machine>.local`, the LAN IP, Tailscale, etc. without hardcoding a hostname.
    allowedHosts: true,
    // Proxy speech-to-text to the local Whisper server (server/run.sh) so the browser
    // only ever calls this same (https) origin — no CORS, no mixed content.
    proxy: {
      '/stt': { target: 'http://127.0.0.1:8760', changeOrigin: true },
      '/polish': { target: 'http://127.0.0.1:8760', changeOrigin: true },
    },
  },
  plugins: [
    // Serve dev over HTTPS with a self-signed cert. getUserMedia / MediaRecorder (the mic
    // capture behind hold-to-talk dictation) only work in a SECURE CONTEXT — i.e. https or
    // localhost — so plain http://<host>.local can't record. Accept the cert warning once on
    // the iPad and in-app dictation works. (Production/installed PWA is served over real https.)
    basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/diorama.svg'],
      workbox: {
        // Precache the app shell only. The Whisper WASM (~20 MB) and model weights are
        // huge and only needed once the user dictates, so they're runtime-cached on first
        // use instead of bloating the service-worker install — small base, offline after use.
        globPatterns: ['**/*.{js,css,html,svg,webmanifest}'],
        runtimeCaching: [
          {
            // ONNX Runtime WASM (large, served locally by transformers.js).
            urlPattern: ({ url }) => url.pathname.endsWith('.wasm'),
            handler: 'CacheFirst',
            options: { cacheName: 'onnx-wasm', cacheableResponse: { statuses: [0, 200] } },
          },
          {
            // Whisper model weights, fetched from the Hugging Face CDN on first dictation.
            urlPattern: ({ url }) => /huggingface\.co|hf\.co/.test(url.hostname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'whisper-model',
              expiration: { maxEntries: 40 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: 'diorama',
        short_name: 'diorama',
        description: 'Craft the world your story plays in.',
        theme_color: '#1c1917',
        background_color: '#1c1917',
        display: 'standalone',
        orientation: 'any',
        icons: [
          { src: 'icons/diorama.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      }
    })
  ]
});
