export interface Env {
  DB: D1Database;
  TEST_MODE?: string;
  SESSION_SECRET: string;
  SESSION_MAX_AGE?: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  CALLBACK_URL: string;
}
