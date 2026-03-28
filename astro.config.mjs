// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
// SSR output — Cloudflare Pages with Workers runtime
// API routes are Astro API Routes (src/pages/api/) calling worker/handlers directly
export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    platformProxy: {
      enabled: true, // dev 環境で D1/Queue バインディングを利用可能に
    },
  }),
  vite: {
    server: {
      https: {
        key: './localhost+2-key.pem',
        cert: './localhost+2.pem',
      },
    },
  },
});
