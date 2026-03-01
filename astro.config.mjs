// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
// Static output — deployed to Cloudflare Pages
// API is a separate Cloudflare Workers project (worker/)
export default defineConfig({
  vite: {
    server: {
      proxy: {
        '/api': 'http://localhost:8787',
      },
    },
    plugins: [
      {
        // dev server で _redirects 相当のリライトを再現
        // 本番は Cloudflare Pages の _redirects が処理する
        name: 'stock-detail-rewrite',
        configureServer(server) {
          server.middlewares.use((req, _res, next) => {
            if (req.url && /^\/stocks\/[^/]+/.test(req.url)) {
              req.url = '/stock-detail';
            }
            next();
          });
        },
      },
    ],
  },
});
