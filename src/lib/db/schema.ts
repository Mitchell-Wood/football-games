import { pgTable, text, integer, boolean, date, primaryKey, serial } from "drizzle-orm/pg-core";

// Data layer for Rarity Duel. Every player is tagged with which real
// categories they satisfy (team, nationality, trophy, manager — league is
// derived via team.leagueId rather than stored directly, since it's fully
// determined by which teams a player played for) via normalized lookup +
// junction tables, so a guess can be validated with a single fast query
// instead of a live lookup. See docs/rarity-duel.md (once written) or the
// design memory for the full game rules and how this data was built.

export const players = pgTable("players", {
  id: text("id").primaryKey(), // transfermarkt id
  name: text("name").notNull(),
  nationality: text("nationality").notNull(), // primary citizenship, for display only
  imageUrl: text("image_url"),
  dateOfBirth: date("date_of_birth"), // needed to identity-match against Wikidata for sitelinksCount
  sitelinksCount: integer("sitelinks_count"), // Wikidata sitelinks — the actual fame signal
  fameRank: integer("fame_rank"), // position across the whole pool once ranked by sitelinksCount
  rarityTier: integer("rarity_tier"), // 1 (common) - 5 (rare), derived from fameRank band
  // fameRank/rarityTier are nullable: a player exists in the pool as soon
  // as they're imported, but isn't ranked until scripts/recompute-tiers.ts
  // runs after every player has a sitelinksCount.
  careerStatsFetched: boolean("career_stats_fetched").notNull().default(false),
  // Set true by scripts/build-career-stats.ts once attempted, regardless of
  // whether a Wikipedia match was actually found — same resumability
  // pattern as sitelinksCount being nullable, just as a boolean here since
  // "0 stints" isn't itself a meaningful value to store per player.
});

export const leagues = pgTable("leagues", {
  id: text("id").primaryKey(), // transfermarkt competition id, e.g. "GB1"
  name: text("name").notNull(),
});

export const teams = pgTable("teams", {
  id: text("id").primaryKey(), // real transfermarkt club id — enables exact
  // id-based matching against transfers[].clubTo.id instead of the old
  // hand-maintained alias list (transfermarkt's own club names are
  // inconsistent — "PSG" vs "Paris Saint-Germain" — which name-matching
  // could never fully cover; id matching sidesteps the problem entirely).
  name: text("name").notNull(),
  leagueId: text("league_id").references(() => leagues.id), // null if not a big-5 club
  isCategory: boolean("is_category").notNull().default(false), // usable as a grid row/column header
});

export const trophies = pgTable("trophies", {
  id: text("id").primaryKey(), // stable slug, e.g. "champions-league" — see src/data/categories.ts
  name: text("name").notNull(),
});

export const nationalities = pgTable("nationalities", {
  id: text("id").primaryKey(), // stable slug, e.g. "brazil"
  name: text("name").notNull(),
});

export const managers = pgTable("managers", {
  id: text("id").primaryKey(), // stable slug, e.g. "alex-ferguson"
  name: text("name").notNull(),
});

export const playerTeams = pgTable(
  "player_teams",
  {
    playerId: text("player_id")
      .notNull()
      .references(() => players.id),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.teamId] })]
);

export const playerTrophies = pgTable(
  "player_trophies",
  {
    playerId: text("player_id")
      .notNull()
      .references(() => players.id),
    trophyId: text("trophy_id")
      .notNull()
      .references(() => trophies.id),
    count: integer("count").notNull().default(1), // how many times won, not just "did they"
  },
  (t) => [primaryKey({ columns: [t.playerId, t.trophyId] })]
);

export const playerStints = pgTable("player_stints", {
  id: serial("id").primaryKey(),
  playerId: text("player_id")
    .notNull()
    .references(() => players.id),
  teamId: text("team_id").references(() => teams.id), // nullable — best-effort match, not required for display
  clubName: text("club_name").notNull(), // from the Wikipedia infobox, used directly for display
  startYear: integer("start_year").notNull(),
  endYear: integer("end_year"), // null = still there
  appearances: integer("appearances").notNull().default(0),
  goals: integer("goals").notNull().default(0),
});

export const playerNationalities = pgTable(
  "player_nationalities",
  {
    playerId: text("player_id")
      .notNull()
      .references(() => players.id),
    nationalityId: text("nationality_id")
      .notNull()
      .references(() => nationalities.id),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.nationalityId] })]
);

export const playerManagers = pgTable(
  "player_managers",
  {
    playerId: text("player_id")
      .notNull()
      .references(() => players.id),
    managerId: text("manager_id")
      .notNull()
      .references(() => managers.id),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.managerId] })]
);
