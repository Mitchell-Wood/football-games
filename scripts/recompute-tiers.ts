// Ranks the entire player pool by sitelinksCount (descending) and assigns
// fameRank (position) + rarityTier (1-5 quintile band) accordingly. Run
// with `npm run recompute:tiers` after scripts/compute-fame.ts has given
// every player a sitelinksCount — this replaces the old "array position in
// top-players.ts = fame rank" approach entirely for the DB-backed data,
// giving one consistent signal across the curated legends and every
// squad-sourced player alike, rather than mixing two different measures.
//
// Safe to re-run any time (e.g. after importing more players) — it always
// recomputes from scratch across the current full pool.
import { config } from "dotenv";
config({ path: ".env.local" });

import { asc, eq } from "drizzle-orm";
import { getDb } from "../src/lib/db/client";
import { players } from "../src/lib/db/schema";
import { runWithConcurrency } from "./lib/http";

const TIER_COUNT = 5;
const DB_CONCURRENCY = 20; // plain local UPDATEs, not a flaky external API

async function main() {
  const db = getDb();
  // sitelinksCount is nullable only if compute-fame.ts hasn't run yet for
  // everyone — order nulls last so any stragglers land in the lowest tier
  // rather than skewing the ranking.
  const ranked = await db
    .select({ id: players.id, sitelinksCount: players.sitelinksCount })
    .from(players)
    .orderBy(asc(players.sitelinksCount));
  // asc puts nulls/lowest first — reverse so most-famous (highest count) is rank 0.
  ranked.reverse();

  const bandSize = Math.ceil(ranked.length / TIER_COUNT);
  console.log(`Ranking ${ranked.length} players, band size ${bandSize}.`);

  const withRank = ranked.map((p, index) => ({ ...p, index }));

  let done = 0;
  await runWithConcurrency(withRank, DB_CONCURRENCY, async (p) => {
    const rarityTier = Math.min(TIER_COUNT, Math.floor(p.index / bandSize) + 1);
    await db.update(players).set({ fameRank: p.index, rarityTier }).where(eq(players.id, p.id));
    done++;
    if (done % 500 === 0) console.log(`${done}/${ranked.length} updated`);
  });

  console.log(`Done. Updated ${done} players.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
