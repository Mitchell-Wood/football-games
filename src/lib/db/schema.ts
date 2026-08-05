import { pgTable, text, integer, serial } from "drizzle-orm/pg-core";

// Data layer for Rarity Duel — see docs/rarity-duel.md (once written) or
// the design memory for the full game rules. Every one of the curated
// src/data/top-players.ts players is tagged here with which categories
// they satisfy (club, nationality, trophy, league, manager), so a guess
// can be validated with a single fast query instead of a live lookup.

export const players = pgTable("players", {
  id: text("id").primaryKey(), // transfermarkt id
  name: text("name").notNull(),
  nationality: text("nationality").notNull(),
  imageUrl: text("image_url"),
  fameRank: integer("fame_rank").notNull(), // position in top-players.ts
  rarityTier: integer("rarity_tier").notNull(), // 1 (common) - 5 (rare)
});

export const playerCategories = pgTable("player_categories", {
  id: serial("id").primaryKey(),
  playerId: text("player_id")
    .notNull()
    .references(() => players.id),
  categoryType: text("category_type").notNull(), // 'club' | 'nationality' | 'trophy' | 'league' | 'manager'
  categoryValue: text("category_value").notNull(), // must match a src/data/categories.ts entry exactly
});
