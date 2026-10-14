import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Content Security Policy: Die App lädt nichts von fremden Servern, alles kommt von der eigenen
 * Adresse. GitHub Pages kann keine eigenen Header setzen, daher als <meta> im Build. Nicht im
 * Dev-Server, denn dort fügt Vite Styles inline ein und HMR läuft über einen WebSocket.
 */
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  // data: für die Wellen-Maske in styles.css
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
        injectTo: 'head-prepend',
      },
    ],
  };
}

export default defineConfig({
  // Relative Pfade: Der Build funktioniert unter jedem Pfad (eigene Domain, Unterordner, Pages).
  base: './',
  plugins: [
    contentSecurityPolicy(),
    VitePWA({
      // Updates nie automatisch neu laden: Das würde eine laufende Einheit abbrechen.
      // platform/pwa.ts registriert selbst und meldet neue Versionen an die App.
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'Atemtrainer fürs Tauchen',
        short_name: 'Atemtrainer',
        description: 'Zwerchfellatmung, Lippenbremse und CO₂-Tabellen fürs Tauchen.',
        lang: 'de',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#e6f0ef',
        theme_color: '#0f3546',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
    }),
  ],
});
