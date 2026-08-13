// Shared helpers for the import scripts. Two different "a team exists"
// operations are needed and must NOT be conflated:
//   - upsertTeamSeen: a player's real transfer history mentions a club we
//     might not know anything else about. Insert a bare row if missing,
//     but never overwrite better data another script may have already set
//     (ON CONFLICT DO NOTHING).
//   - upsertKnownTeam: we're authoritatively importing this exact club
//     (e.g. scripts/import-squads.ts pulling a competition's club list) —
//     safe to set/overwrite its league and mark it usable as a grid
//     category (ON CONFLICT DO UPDATE).
// Getting these backwards would let an opportunistic, incomplete insert
// permanently block a later authoritative one from setting the real
// league/is_category data.
import { getDb } from "../../src/lib/db/client";
import { teams, leagues, trophies, nationalities, managers } from "../../src/lib/db/schema";
import {
  BIG_FIVE_LEAGUES,
  extraLeagues,
  extraClubs,
  trophies as trophyBank,
  nationalities as nationalityBank,
  managers as managerBank,
} from "../../src/data/categories";
import { sql } from "drizzle-orm";

export async function upsertTeamSeen(id: string, name: string): Promise<void> {
  const db = getDb();
  await db.insert(teams).values({ id, name }).onConflictDoNothing({ target: teams.id });
}

export async function upsertKnownTeam(id: string, name: string, leagueId: string): Promise<void> {
  const db = getDb();
  await db
    .insert(teams)
    .values({ id, name, leagueId, isCategory: true })
    .onConflictDoUpdate({
      target: teams.id,
      set: { name, leagueId, isCategory: true },
    });
}

// Idempotent — safe to call from every import script at startup, since
// junction tables reference these lookup rows via foreign keys.
export async function seedLookupTables(): Promise<void> {
  const db = getDb();

  for (const league of [...BIG_FIVE_LEAGUES, ...extraLeagues]) {
    await db.insert(leagues).values(league).onConflictDoNothing({ target: leagues.id });
  }
  for (const club of extraClubs) {
    await upsertKnownTeam(club.id, club.name, club.leagueId);
  }
  for (const trophy of trophyBank) {
    await db.insert(trophies).values({ id: trophy.id, name: trophy.name }).onConflictDoNothing({ target: trophies.id });
  }
  for (const nat of nationalityBank) {
    await db
      .insert(nationalities)
      .values({ id: nat.id, name: nat.name })
      .onConflictDoNothing({ target: nationalities.id });
  }
  for (const manager of managerBank) {
    await db.insert(managers).values(manager).onConflictDoNothing({ target: managers.id });
  }
}

// Used by scripts that need "does this row already exist" without pulling
// full objects — e.g. deciding whether a squad-discovered player needs
// importing at all.
export async function existingPlayerIds(): Promise<Set<string>> {
  const db = getDb();
  const rows = await db.execute<{ id: string }>(sql`SELECT id FROM players`);
  return new Set(rows.rows.map((r) => r.id));
}
