// For every player without a sitelinksCount yet, look up their Wikidata
// sitelinks count (the real fame signal, same one src/data/top-players.ts
// was originally built from) by name + exact date of birth. Run with
// `npm run compute:fame`.
//
// Resumable — only players with sitelinksCount IS NULL are processed each
// run. Players with no usable date of birth (shouldn't happen in
// practice — see scripts/import-players.ts / import-squads.ts, both
// populate it) or no Wikidata match at all get sitelinksCount = 0, which
// correctly lands them in the lowest rarity tier once
// scripts/recompute-tiers.ts runs, rather than staying "unranked" forever.
//
// Much lower concurrency than the transfermarkt-api import scripts, plus a
// fixed pacing delay between requests — the public Wikidata endpoints
// rate-limit far more aggressively than transfermarkt-api under load
// (confirmed live: concurrency 3 with no pacing hit ~90% 429s). Retries
// with backoff live in src/lib/wikidata.ts itself; this just avoids
// triggering the rate limit in the first place.
import { config } from "dotenv";
config({ path: ".env.local" });

import { eq, isNull } from "drizzle-orm";
import { getDb } from "../src/lib/db/client";
import { players } from "../src/lib/db/schema";
import { findSitelinksCount } from "../src/lib/wikidata";
import { runWithConcurrency } from "./lib/http";

const CONCURRENCY = 1;
const PACING_DELAY_MS = 300;

async function main() {
  const db = getDb();
  const pending = await db
    .select({ id: players.id, name: players.name, dateOfBirth: players.dateOfBirth })
    .from(players)
    .where(isNull(players.sitelinksCount));

  console.log(`${pending.length} players need a sitelinks lookup.`);

  let done = 0;
  let failed = 0;
  await runWithConcurrency(pending, CONCURRENCY, async (p) => {
    try {
      const count = p.dateOfBirth ? await findSitelinksCount(p.name, p.dateOfBirth) : null;
      await db.update(players).set({ sitelinksCount: count ?? 0 }).where(eq(players.id, p.id));
      done++;
      if (done % 100 === 0) console.log(`${done}/${pending.length} processed (${failed} failed so far)`);
      await new Promise((r) => setTimeout(r, PACING_DELAY_MS));
    } catch (err) {
      failed++;
      console.error(`Failed to look up ${p.name} (${p.id}):`, err instanceof Error ? err.message : err);
    }
  });

  console.log(`Done. Processed ${done}, failed ${failed}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
