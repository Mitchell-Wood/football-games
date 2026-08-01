"use client";

import { useState } from "react";
import type { Player } from "@/lib/types";

const MAX_GUESSES = 6;

function normalize(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export default function CareerPathGame({ answer }: { answer: Player }) {
  const [guess, setGuess] = useState("");
  const [guesses, setGuesses] = useState<string[]>([]);
  const [status, setStatus] = useState<"playing" | "won" | "lost">("playing");

  const clubsShown = Math.min(guesses.length + 1, answer.careerPath.length);
  const revealed = answer.careerPath.slice(0, clubsShown);
  const allRevealed = clubsShown >= answer.careerPath.length;

  function submitGuess(e: React.FormEvent) {
    e.preventDefault();
    if (status !== "playing" || !guess.trim()) return;

    const isCorrect = normalize(guess) === normalize(answer.name);
    const nextGuesses = [...guesses, guess.trim()];
    setGuesses(nextGuesses);
    setGuess("");

    if (isCorrect) {
      setStatus("won");
    } else if (nextGuesses.length >= MAX_GUESSES || allRevealed) {
      setStatus("lost");
    }
  }

  function playAgain() {
    window.location.reload();
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold mb-1">Career Path</h1>
      <p className="text-sm text-black/60 dark:text-white/60 mb-6">
        Guess the player from their club career, revealed one stop at a time.
        You have {MAX_GUESSES} guesses.
      </p>

      <ol className="mb-6 space-y-2">
        {revealed.map((stop, i) => (
          <li
            key={i}
            className="flex items-baseline justify-between rounded-md border border-black/10 dark:border-white/15 px-3 py-2"
          >
            <span className="font-medium">{stop.club}</span>
            <span className="text-xs text-black/50 dark:text-white/50">
              {stop.seasons}
            </span>
          </li>
        ))}
      </ol>

      {status === "playing" && (
        <form onSubmit={submitGuess} className="flex gap-2 mb-6">
          <input
            autoFocus
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            placeholder="Enter player name"
            className="flex-1 rounded-md border border-black/15 dark:border-white/20 bg-transparent px-3 py-2 outline-none focus:border-black/40 dark:focus:border-white/40"
          />
          <button
            type="submit"
            className="rounded-md bg-foreground text-background px-4 py-2 font-medium"
          >
            Guess
          </button>
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
