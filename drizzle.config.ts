import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit's CLI doesn't read .env.local by default (only .env) — this
// project's convention (matching src/lib/transfermarkt.ts) is .env.local.
config({ path: ".env.local" });

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
