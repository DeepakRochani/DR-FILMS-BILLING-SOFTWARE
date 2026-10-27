import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const isAdmin = mode === 'admin';

  return {
    server: {
      host: '127.0.0.1',
      port: 5173,
      open: 'http://127.0.0.1:5173/'
    },
    build: {
      outDir: isAdmin ? 'dist-admin' : 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: isAdmin 
          ? resolve(__dirname, 'admin.html') 
          : resolve(__dirname, 'index.html'),
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('xlsx')) {
                return 'vendor-xlsx';
              }
              if (id.includes('html2pdf') || id.includes('jspdf') || id.includes('html2canvas')) {
                return 'vendor-pdf';
              }
              if (id.includes('lucide-react')) {
                return 'vendor-icons';
              }
              if (id.includes('@sentry')) {
                return 'vendor-sentry';
              }
              if (id.includes('@supabase')) {
                return 'vendor-supabase';
              }
              if (id.includes('react') || id.includes('scheduler') || id.includes('dexie')) {
                return 'vendor-core';
              }
            }
          }
        }
      }
    },
    plugins: [
      react(),
      ...(!isAdmin ? [
        VitePWA({
          registerType: 'prompt',
          includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png'],
          manifest: {
            name: 'DR FILMS — Creative Studio Billing',
            short_name: 'DR Films Billing',
            description: 'Offline-First Invoicing & Billing Software for DR FILMS Creative Services',
            theme_color: '#0f172a',
            background_color: '#090d16',
            display: 'standalone',
            orientation: 'portrait',
            start_url: '/',
            icons: [
              {
                src: 'pwa-192x192.png',
                sizes: '192x192',
                type: 'image/png'
              },
              {
                src: 'pwa-512x512.png',
                sizes: '512x512',
                type: 'image/png'
              },
              {
                src: 'pwa-512x512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any maskable'
              }
            ]
          },
          workbox: {
            globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
            maximumFileSizeToCacheInBytes: 6 * 1024 * 1024
          }
        })
      ] : [])
    ]
  };
});
