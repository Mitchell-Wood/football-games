import { NextRequest, NextResponse } from "next/server";
import { players as mockPlayers } from "@/data/players";
import { USE_LIVE_DATA } from "@/lib/transfermarkt";
import { getDb } from "@/lib/db/client";
import { players } from "@/lib/db/schema";
import { foldDiacritics, matchesQuery } from "@/lib/text-match";

const MAX_RESULTS = 8;
const MIN_QUERY_LENGTH = 2;

function mockFallback(query: string) {
  const folded = foldDiacritics(query);
  return mockPlayers
    .map((p) => p.name)
    .filter((name) => matchesQuery(name, folded))
    .slice(0, MAX_RESULTS);
}

// Suggestions come from our own database (16,661 players) rather than a
// live transfermarkt-api search — this used to be a live scraper call
// (2-4s typical, since replaced everywhere else in the app for the same
// reason), and it also means what's suggested always matches what the
// games can actually validate a guess against, which a live search
// against Transfermarkt's full universe never guaranteed.
async function dbSearch(query: string): Promise<string[]> {
  const db = getDb();
  const folded = foldDiacritics(query);
  const rows = await db.select({ name: players.name }).from(players);
  const matches = rows.map((r) => r.name).filter((name) => matchesQuery(name, folded));
  return [...new Set(matches)].slice(0, MAX_RESULTS);
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ names: [] });
  }
  const folded = q.toLowerCase();

  if (USE_LIVE_DATA) {
    try {
      const names = await dbSearch(folded);
      return NextResponse.json({ names });
    } catch (err) {
      // DB unreachable (e.g. DATABASE_URL misconfigured) — degrade to
      // mock data rather than leaving the player with no suggestions.
      console.error("Player search DB query failed:", err);
    }
  }

  return NextResponse.json({ names: mockFallback(folded) });
}
