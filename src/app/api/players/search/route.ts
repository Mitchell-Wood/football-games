import { NextRequest, NextResponse } from "next/server";
import { players as mockPlayers } from "@/data/players";
import { USE_LIVE_DATA, searchTransfermarktPlayers } from "@/lib/transfermarkt";
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

// transfermarkt-api's search is a live Transfermarkt scrape — typically
// 2-4 seconds, most of it spent on their end, not ours. Caching repeated
// queries (same name searched again, by this player or another) is the one
// lever that actually removes that wait rather than just hiding it.
const CACHE_TTL_MS = 10 * 60 * 1000;
const searchCache = new Map<string, { names: string[]; expiresAt: number }>();

function getCachedNames(key: string): string[] | undefined {
  const entry = searchCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    searchCache.delete(key);
    return undefined;
  }
  return entry.names;
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ names: [] });
  }

  if (USE_LIVE_DATA) {
    const cacheKey = q.toLowerCase();
    const cached = getCachedNames(cacheKey);
    if (cached) return NextResponse.json({ names: cached });

    try {
      const results = await searchTransfermarktPlayers(q);
      const names = [...new Set(results.map((r) => r.name))].slice(0, MAX_RESULTS);
      searchCache.set(cacheKey, { names, expiresAt: Date.now() + CACHE_TTL_MS });
      return NextResponse.json({ names });
    } catch {
      // transfermarkt-api down or Transfermarkt rate-limited us — fall back
      // below rather than leaving the player with no suggestions at all.
    }
  }

  return NextResponse.json({ names: mockFallback(q.toLowerCase()) });
}
