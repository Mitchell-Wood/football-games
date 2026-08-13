import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  teams,
  trophies,
  nationalities,
  managers,
  playerTeams,
  playerTrophies,
  playerNationalities,
  playerManagers,
  players,
} from "@/lib/db/schema";
import { matchesPlayerName } from "@/lib/text-match";

/**
 * Data layer for Rarity Duel. Grid categories are drawn from real
 * clubs/trophies/nationalities/managers already tagged on the 16,661-player
 * pool (see the Rarity Duel data-layer scripts) — every DB round trip here
 * is a fast local query, no live external calls, same as the DB-driven
 * Career Path / Guess the Player games.
 */

export type CategoryType = "club" | "trophy" | "nationality" | "manager";
export type Category = { type: CategoryType; id: string; label: string };

async function loadCategoryPool(): Promise<Category[]> {
  const db = getDb();
  const [clubRows, trophyRows, nationalityRows, managerRows] = await Promise.all([
    db.select({ id: teams.id, name: teams.name }).from(teams).where(eq(teams.isCategory, true)),
    db.select({ id: trophies.id, name: trophies.name }).from(trophies),
    db.select({ id: nationalities.id, name: nationalities.name }).from(nationalities),
    db.select({ id: managers.id, name: managers.name }).from(managers),
  ]);

  return [
    ...clubRows.map((c) => ({ type: "club" as const, id: c.id, label: c.name })),
    // A few trophy names already end in "Winner" (e.g. "Premier League
    // Winner", from the domestic-league-title category) — strip that
    // before prepending "Won the" so it doesn't read "Won the Premier
    // League Winner".
    ...trophyRows.map((t) => ({
      type: "trophy" as const,
      id: t.id,
      label: `Won the ${t.name.replace(/\s+Winner$/, "")}`,
    })),
    ...nationalityRows.map((n) => ({ type: "nationality" as const, id: n.id, label: n.name })),
    ...managerRows.map((m) => ({ type: "manager" as const, id: m.id, label: `Played under ${m.name}` })),
  ];
}

async function playerIdsForCategory(category: Category): Promise<Set<string>> {
  const db = getDb();
  switch (category.type) {
    case "club": {
      const rows = await db
        .select({ playerId: playerTeams.playerId })
        .from(playerTeams)
        .where(eq(playerTeams.teamId, category.id));
      return new Set(rows.map((r) => r.playerId));
    }
    case "trophy": {
      const rows = await db
        .select({ playerId: playerTrophies.playerId })
        .from(playerTrophies)
        .where(eq(playerTrophies.trophyId, category.id));
      return new Set(rows.map((r) => r.playerId));
    }
    case "nationality": {
      const rows = await db
        .select({ playerId: playerNationalities.playerId })
        .from(playerNationalities)
        .where(eq(playerNationalities.nationalityId, category.id));
      return new Set(rows.map((r) => r.playerId));
    }
    case "manager": {
      const rows = await db
        .select({ playerId: playerManagers.playerId })
        .from(playerManagers)
        .where(eq(playerManagers.managerId, category.id));
      return new Set(rows.map((r) => r.playerId));
    }
  }
}

function pickRandomDistinct<T>(items: T[], count: number): T[] {
  const shuffled = [...items].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function intersectionSize(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const id of a) if (b.has(id)) count++;
  return count;
}

export type Grid = { rows: [Category, Category, Category]; cols: [Category, Category, Category] };

// Real category pairs can have very small (sometimes zero) valid-answer
// pools — verified live, e.g. Hamburger SV x Crystal Palace = 1 player.
// Each of the 9 squares needs at least a couple of real answers, so a
// randomly sampled set of 6 categories is validated as a whole and
// re-sampled (not patched square-by-square) on failure.
const MIN_INTERSECTION_SIZE = 2;
// A uniformly random 6-category sample from ~151 categories (99 of them
// individual clubs) fails this validity check more often than not — real
// club-pair intersections can be as small as 1 (verified live: Hamburger
// SV x Crystal Palace = 1). Each attempt is cheap (a handful of indexed
// lookups + an in-memory set intersection), so a much higher retry budget
// is the simple fix rather than loosening the threshold and risking
// single-answer "squares" that can never realistically be contested.
const MAX_GRID_ATTEMPTS = 200;

export async function generateGrid(): Promise<Grid> {
  const pool = await loadCategoryPool();

  for (let attempt = 0; attempt < MAX_GRID_ATTEMPTS; attempt++) {
    const picked = pickRandomDistinct(pool, 6);
    const rows = picked.slice(0, 3) as [Category, Category, Category];
    const cols = picked.slice(3, 6) as [Category, Category, Category];

    const [rowSets, colSets] = await Promise.all([
      Promise.all(rows.map(playerIdsForCategory)),
      Promise.all(cols.map(playerIdsForCategory)),
    ]);

    const allSquaresValid = rowSets.every((rowSet) =>
      colSets.every((colSet) => intersectionSize(rowSet, colSet) >= MIN_INTERSECTION_SIZE)
    );
    if (allSquaresValid) return { rows, cols };
  }

  throw new Error("Could not generate a valid Rarity Duel grid after multiple attempts");
}

export type GuessResult = { valid: boolean; playerName?: string; tier?: number };

// Among every real player whose name matches the guess (surname-only
// accepted, same as the other games — see matchesPlayerName) and who
// satisfies both categories, the highest-tier one is used. That's the most
// generous reading for the guesser, which matters here since tier is what
// a steal attempt is judged against.
export async function checkGuess(guess: string, row: Category, col: Category): Promise<GuessResult> {
  if (!guess.trim()) return { valid: false };

  const db = getDb();
  const [allPlayers, rowIds, colIds] = await Promise.all([
    db.select({ id: players.id, name: players.name, rarityTier: players.rarityTier }).from(players),
    playerIdsForCategory(row),
    playerIdsForCategory(col),
  ]);

  let best: { name: string; tier: number } | null = null;
  for (const p of allPlayers) {
    if (!matchesPlayerName(guess, p.name)) continue;
    if (!rowIds.has(p.id) || !colIds.has(p.id)) continue;
    const tier = p.rarityTier ?? 0;
    if (!best || tier > best.tier) best = { name: p.name, tier };
  }

  if (!best) return { valid: false };
  return { valid: true, playerName: best.name, tier: best.tier };
}
