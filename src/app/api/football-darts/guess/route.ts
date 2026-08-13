import { NextRequest, NextResponse } from "next/server";
import { checkDartsGuess, type DartsCategory } from "@/lib/football-darts";

type GuessBody = { guess: string; category: DartsCategory; stat: "appearances" | "goals" };

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Partial<GuessBody>;
  if (!body.guess || !body.category || !body.stat) {
    return NextResponse.json({ valid: false }, { status: 400 });
  }

  const result = await checkDartsGuess(body.guess, body.category, body.stat);
  return NextResponse.json(result);
}
