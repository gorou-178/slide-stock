// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_VERSION = readFileSync(join(__dirname, 'VERSION'), 'utf-8').trim();

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
    define: {
      // VERSION ファイルを build-time 定数として注入（ui-spec.md §4.1 footer の v{BUILD_VERSION}）
      __APP_VERSION__: JSON.stringify(APP_VERSION),
    },
    server: {
      https: {
        key: './localhost+2-key.pem',
        cert: './localhost+2.pem',
      },
    },
  },
});
