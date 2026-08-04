"use client";

import { useEffect, useState } from "react";
import type { Player } from "@/lib/types";
import { normalize } from "@/lib/text-match";

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 200;

export default function CareerPathGame({ answer }: { answer: Player }) {
  const [guess, setGuess] = useState("");
  const [guesses, setGuesses] = useState<string[]>([]);
  const [status, setStatus] = useState<"playing" | "won" | "lost">("playing");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [rawSuggestions, setRawSuggestions] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);

  // One guess per club, plus a bonus guess once every club is revealed —
  // that final round trades a new club reveal for nationality/honours.
  const maxGuesses = answer.careerPath.length + 1;
  const clubsShown = Math.min(guesses.length + 1, answer.careerPath.length);
  const revealed = answer.careerPath.slice(0, clubsShown);
  const bonusRevealed = guesses.length >= answer.careerPath.length;

  // Suggestions come from the transfermarkt-api search endpoint (see
  // src/app/api/players/search/route.ts), so they cover any player on
  // Transfermarkt, not just the small curated answer pool.
  useEffect(() => {
    const query = guess.trim();
    if (query.length < MIN_QUERY_LENGTH) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      fetch(`/api/players/search?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      })
        .then((res) => (res.ok ? res.json() : { names: [] }))
        .then((data: { names: string[] }) => {
          setRawSuggestions(data.names);
          setSearching(false);
        })
        .catch((err) => {
          if (err.name !== "AbortError") {
            setRawSuggestions([]);
            setSearching(false);
          }
          // AbortError means a newer keystroke superseded this request —
          // that one's setSearching(true) already covers the new wait.
        });
    }, DEBOUNCE_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [guess]);

  const guessedNormalized = new Set(guesses.map(normalize));
  const suggestions =
    guess.trim().length < MIN_QUERY_LENGTH
      ? []
      : rawSuggestions.filter((n) => !guessedNormalized.has(normalize(n)));
  const dropdownOpen =
    showSuggestions &&
    status === "playing" &&
    guess.trim().length >= MIN_QUERY_LENGTH &&
    (suggestions.length > 0 || searching);

  // Reset the highlighted option whenever the suggestion list itself
  // changes, without the cascading-render cost of doing it in an effect.
  const [prevSuggestions, setPrevSuggestions] = useState(rawSuggestions);
  if (rawSuggestions !== prevSuggestions) {
    setPrevSuggestions(rawSuggestions);
    setHighlighted(0);
  }

  function selectSuggestion(name: string) {
    setGuess(name);
    setShowSuggestions(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!dropdownOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter" && highlighted < suggestions.length) {
      e.preventDefault();
      selectSuggestion(suggestions[highlighted]);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  }

  function submitGuess(e: React.FormEvent) {
    e.preventDefault();
    if (status !== "playing" || !guess.trim()) return;

    const isCorrect = normalize(guess) === normalize(answer.name);
    const nextGuesses = [...guesses, guess.trim()];
    setGuesses(nextGuesses);
    setGuess("");
    setShowSuggestions(false);

    if (isCorrect) {
      setStatus("won");
    } else if (nextGuesses.length >= maxGuesses) {
      setStatus("lost");
    }
  }

  // A skip counts as a used guess (so it still advances to the next club,
  // or ends the game on the last one) but can never be "correct".
  function skipGuess() {
    if (status !== "playing") return;

    const nextGuesses = [...guesses, "Skipped"];
    setGuesses(nextGuesses);
    setGuess("");
    setShowSuggestions(false);

    if (nextGuesses.length >= maxGuesses) {
      setStatus("lost");
    }
  }

  // Jumps straight to the bonus round: every club plus the nationality/
  // honours clue, with exactly one guess left. Keeps whatever real guesses
  // were already made and pads the rest with "Skipped", so it lands on the
  // same final-guess state skipGuess() would eventually reach one club at a
  // time — this never ends the game itself, since a reveal isn't a guess.
  function revealAll() {
    if (status !== "playing") return;
    const remaining = maxGuesses - 1 - guesses.length;
    if (remaining <= 0) return;

    setGuesses([...guesses, ...Array(remaining).fill("Skipped")]);
    setGuess("");
    setShowSuggestions(false);
  }

  function playAgain() {
    window.location.reload();
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold mb-1">Career Path</h1>
      <p className="text-sm text-black/60 dark:text-white/60 mb-6">
        Guess the player from their club career, revealed one stop at a time.
        You have {maxGuesses} guesses.
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
              {stop.appearances !== undefined && (
                <>
                  {" "}
                  · {stop.appearances} {stop.appearances === 1 ? "app" : "apps"},{" "}
                  {stop.goals ?? 0} {stop.goals === 1 ? "goal" : "goals"}
                </>
              )}
            </span>
          </li>
        ))}
      </ol>

      {bonusRevealed && (
        <div className="mb-6 rounded-md border border-black/10 dark:border-white/15 px-3 py-2">
          <p className="text-xs uppercase tracking-wide text-black/50 dark:text-white/50 mb-1">
            Bonus clue
          </p>
          <p className="text-sm">
            <span className="font-medium">Nationality:</span> {answer.nationality}
          </p>
          {answer.achievements && answer.achievements.length > 0 && (
            <p className="text-sm">
              <span className="font-medium">Honours:</span>{" "}
              {answer.achievements
                .map((a) => (a.count > 1 ? `${a.title} (${a.count}x)` : a.title))
                .join(", ")}
            </p>
          )}
        </div>
      )}

      {status === "playing" && (
        <form onSubmit={submitGuess} className="relative flex gap-2 mb-6">
          <div className="relative flex-1">
            <input
              autoFocus
              value={guess}
              onChange={(e) => {
                setGuess(e.target.value);
                setShowSuggestions(true);
                setHighlighted(0);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setShowSuggestions(false)}
              onKeyDown={handleKeyDown}
              placeholder="Enter player name"
              role="combobox"
              aria-expanded={dropdownOpen}
              aria-controls="player-suggestions"
              aria-autocomplete="list"
              autoComplete="off"
              className="w-full rounded-md border border-black/15 dark:border-white/20 bg-transparent px-3 py-2 outline-none focus:border-black/40 dark:focus:border-white/40"
            />
            {dropdownOpen && (
              <ul
                id="player-suggestions"
                role="listbox"
                className="absolute z-10 mt-1 w-full rounded-md border border-black/15 dark:border-white/20 bg-background shadow-md overflow-hidden"
              >
                {suggestions.length === 0 && searching ? (
                  <li className="px-3 py-2 text-sm text-black/50 dark:text-white/50">
                    Searching…
                  </li>
                ) : (
                  suggestions.map((name, i) => (
                    <li
                      key={name}
                      role="option"
                      aria-selected={i === highlighted}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectSuggestion(name);
                      }}
                      onMouseEnter={() => setHighlighted(i)}
                      className={`px-3 py-2 text-sm cursor-pointer ${
                        i === highlighted
                          ? "bg-black/10 dark:bg-white/15"
                          : ""
                      }`}
                    >
                      {name}
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
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
          {!bonusRevealed && (
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
            Guesses ({guesses.length}/{maxGuesses})
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
