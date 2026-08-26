import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// diorama ships as an installable PWA so it can live on an iPad home screen and
// run offline. The manifest below drives "Add to Home Screen"; the service worker
// (autoUpdate) precaches the built assets.
export default defineConfig({
  // Bind to all interfaces so a tablet on the same network can reach the dev server
  // at http://<host>.local:5173 (Vite defaults to localhost-only, which just hangs
  // from another device). Vite prints the reachable "Network:" URL on start.
  server: {
    host: true,
    // HMR over an mDNS ".local" host: point the live-reload socket at the same host
    // the page was loaded from, so hot-reload works from the iPad too.
    hmr: { clientPort: 5173 },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/diorama.svg'],
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
