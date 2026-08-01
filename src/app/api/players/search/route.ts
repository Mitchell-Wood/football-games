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

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ names: [] });
  }

  if (USE_LIVE_DATA) {
    try {
      const results = await searchTransfermarktPlayers(q);
      const names = [...new Set(results.map((r) => r.name))].slice(0, MAX_RESULTS);
      return NextResponse.json({ names });
    } catch {
      // transfermarkt-api down or Transfermarkt rate-limited us — fall back
      // below rather than leaving the player with no suggestions at all.
    }
  }

  return NextResponse.json({ names: mockFallback(q.toLowerCase()) });
}
