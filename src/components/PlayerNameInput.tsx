"use client";

import { useState, useEffect } from "react";
import { normalize } from "@/lib/text-match";

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 200;

/**
 * Player-name text input with a live autocomplete dropdown, shared across
 * games. Suggestions come from /api/players/search (transfermarkt-api's
 * full player database, not just a game's curated answer pool), debounced
 * and cached server-side — see that route for details.
 */
export default function PlayerNameInput({
  value,
  onChange,
  excludeNames,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  excludeNames: string[];
  disabled?: boolean;
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [rawSuggestions, setRawSuggestions] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const query = value.trim();
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
  }, [value]);

  const excludeNormalized = new Set(excludeNames.map(normalize));
  const suggestions =
    value.trim().length < MIN_QUERY_LENGTH
      ? []
      : rawSuggestions.filter((n) => !excludeNormalized.has(normalize(n)));
  const dropdownOpen =
    showSuggestions &&
    !disabled &&
    value.trim().length >= MIN_QUERY_LENGTH &&
    (suggestions.length > 0 || searching);

  // Reset the highlighted option whenever the suggestion list itself
  // changes, without the cascading-render cost of doing it in an effect.
  const [prevSuggestions, setPrevSuggestions] = useState(rawSuggestions);
  if (rawSuggestions !== prevSuggestions) {
    setPrevSuggestions(rawSuggestions);
    setHighlighted(0);
  }

  function selectSuggestion(name: string) {
    onChange(name);
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

  return (
    <div className="relative flex-1">
      <input
        autoFocus
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
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
        className="w-full rounded-md border border-black/15 dark:border-white/20 bg-transparent px-3 py-2 outline-none focus:border-black/40 dark:focus:border-white/40 disabled:opacity-50"
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
                  i === highlighted ? "bg-black/10 dark:bg-white/15" : ""
                }`}
              >
                {name}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
