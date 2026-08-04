"use client";

import { useState } from "react";
import Image from "next/image";
import type { PhotoPlayer } from "@/lib/types";
import { matchesPlayerName } from "@/lib/text-match";
import PlayerNameInput from "@/components/PlayerNameInput";

const MAX_GUESSES = 5;
// Blur sharpens one step per guess, reaching 0 by the final (MAX_GUESSES-th)
// guess — one entry per guess taken so far, indexed by guesses.length.
const BLUR_STEPS = [20, 14, 8, 3, 0];

export default function GuessThePlayerGame({ answer }: { answer: PhotoPlayer }) {
  const [guess, setGuess] = useState("");
  const [guesses, setGuesses] = useState<string[]>([]);
  const [status, setStatus] = useState<"playing" | "won" | "lost">("playing");

  const blurPx =
    status === "playing" ? BLUR_STEPS[Math.min(guesses.length, BLUR_STEPS.length - 1)] : 0;

  function submitGuess(e: React.FormEvent) {
    e.preventDefault();
    if (status !== "playing" || !guess.trim()) return;

    const isCorrect = matchesPlayerName(guess, answer.name);
    const nextGuesses = [...guesses, guess.trim()];
    setGuesses(nextGuesses);
    setGuess("");

    if (isCorrect) {
      setStatus("won");
    } else if (nextGuesses.length >= MAX_GUESSES) {
      setStatus("lost");
    }
  }

  // A skip counts as a used guess (so the image still sharpens) but can
  // never be "correct".
  function skipGuess() {
    if (status !== "playing") return;

    const nextGuesses = [...guesses, "Skipped"];
    setGuesses(nextGuesses);
    setGuess("");

    if (nextGuesses.length >= MAX_GUESSES) {
      setStatus("lost");
    }
  }

  // Jumps straight to a fully sharpened photo with exactly one guess left —
  // same end state skipGuess() would eventually reach one step at a time.
  function revealAll() {
    if (status !== "playing") return;
    const remaining = MAX_GUESSES - 1 - guesses.length;
    if (remaining <= 0) return;

    setGuesses([...guesses, ...Array(remaining).fill("Skipped")]);
    setGuess("");
  }

  function playAgain() {
    window.location.reload();
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold mb-1">Guess the Player</h1>
      <p className="text-sm text-black/60 dark:text-white/60 mb-6">
        Guess the player from their photo, which sharpens with every guess.
        You have {MAX_GUESSES} guesses.
      </p>

      <div className="mb-6 overflow-hidden rounded-md border border-black/10 dark:border-white/15">
        <div className="relative aspect-square w-full overflow-hidden bg-black/5 dark:bg-white/10">
          <Image
            src={answer.imageUrl}
            alt={status === "playing" ? "Mystery player" : answer.name}
            fill
            unoptimized
            style={{ filter: `blur(${blurPx}px)`, transform: "scale(1.1)" }}
            className="object-cover transition-[filter] duration-500"
          />
        </div>
      </div>

      {status === "playing" && (
        <form onSubmit={submitGuess} className="relative flex gap-2 mb-6">
          <PlayerNameInput
            value={guess}
            onChange={setGuess}
            excludeNames={guesses}
            disabled={status !== "playing"}
          />
          <button
            type="submit"
            className="rounded-md bg-foreground text-background px-4 py-2 font-medium"
          >
            Guess
          </button>
          <button
            type="button"
            onClick={skipGuess}
            className="rounded-md border border-black/15 dark:border-white/20 px-4 py-2 font-medium"
          >
            Skip
          </button>
          {blurPx > 0 && (
            <button
              type="button"
              onClick={revealAll}
              className="rounded-md border border-black/15 dark:border-white/20 px-4 py-2 font-medium"
            >
              Reveal All
            </button>
          )}
        </form>
      )}

      {status !== "playing" && (
        <div className="mb-6 rounded-md border border-black/10 dark:border-white/15 p-4">
          <p className="font-semibold mb-2">
            {status === "won" ? "Correct! 🎉" : "Out of guesses"}
          </p>
          <p className="text-sm mb-3">
            The answer was <span className="font-medium">{answer.name}</span>{" "}
            ({answer.nationality}).
          </p>
          <button
            onClick={playAgain}
            className="rounded-md border border-black/15 dark:border-white/20 px-3 py-1.5 text-sm"
          >
            Play again
          </button>
        </div>
      )}

      {guesses.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wide text-black/50 dark:text-white/50 mb-2">
            Guesses ({guesses.length}/{MAX_GUESSES})
          </p>
          <ul className="space-y-1">
            {guesses.map((g, i) => (
              <li
                key={i}
                className="text-sm rounded-md bg-black/5 dark:bg-white/10 px-3 py-1.5"
              >
                {g}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
