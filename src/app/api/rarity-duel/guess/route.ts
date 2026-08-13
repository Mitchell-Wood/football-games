import { NextRequest, NextResponse } from "next/server";
import { checkGuess, type Category } from "@/lib/rarity-duel";

type GuessBody = { guess: string; row: Category; col: Category };

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Partial<GuessBody>;
  if (!body.guess || !body.row || !body.col) {
    return NextResponse.json({ valid: false }, { status: 400 });
  }

  const result = await checkGuess(body.guess, body.row, body.col);
  return NextResponse.json(result);
}
