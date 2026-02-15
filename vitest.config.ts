import {
  defineWorkersConfig,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers/config";
import path from "node:path";

export default defineWorkersConfig(async () => {
  const migrationsPath = path.join(__dirname, "migrations");
  const migrations = await readD1Migrations(migrationsPath);

  return {
    test: {
      globals: true,
      exclude: ["e2e/**", "node_modules/**", ".worktrees/**"],
      poolOptions: {
        workers: {
          wrangler: {
            configPath: "./wrangler.toml",
          },
          miniflare: {
            d1Databases: ["DB"],
            bindings: {
              TEST_MIGRATIONS: migrations,
            },
          },
        },
      },
    },
  };
});
