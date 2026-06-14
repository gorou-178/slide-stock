/// <reference types="astro/client" />

// astro.config.mjs の vite.define で注入される build-time 定数（ui-spec.md §4.1 footer）
declare const __APP_VERSION__: string;

type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

interface Env {
  DB: D1Database;
  TEST_MODE?: string;
  SESSION_SECRET: string;
  SESSION_MAX_AGE?: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  CALLBACK_URL: string;
}

declare namespace App {
  interface Locals extends Runtime {}
}
