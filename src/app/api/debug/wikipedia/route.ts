import { NextRequest, NextResponse } from "next/server";
import { findWikipediaTitle } from "@/lib/wikidata";
import { fetchWikipediaSeniorCareer } from "@/lib/wikipedia";

// Temporary diagnostic endpoint for the Wikidata->Wikipedia stats lookup —
// lets us see the actual failure (or lack of one) directly instead of
// hunting through host logs. Remove once the production issue is resolved.
// e.g. /api/debug/wikipedia?name=Lionel%20Messi&dob=1987-06-24
export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name");
  const dob = request.nextUrl.searchParams.get("dob");
  if (!name || !dob) {
    return NextResponse.json(
      { error: "provide ?name=<full name>&dob=YYYY-MM-DD" },
      { status: 400 }
    );
  }

  try {
    const title = await findWikipediaTitle(name, dob);
    if (!title) {
      return NextResponse.json({ name, dob, wikipediaTitle: null, stints: [] });
    }
    const stints = await fetchWikipediaSeniorCareer(title);
    return NextResponse.json({ name, dob, wikipediaTitle: title, stints });
  } catch (err) {
    return NextResponse.json(
      { name, dob, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
