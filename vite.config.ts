import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// diorama ships as an installable PWA so it can live on an iPad home screen and
// run offline. The manifest below drives "Add to Home Screen"; the service worker
// (autoUpdate) precaches the built assets.
export default defineConfig({
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
