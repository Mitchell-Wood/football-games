# transfermarkt-api (data source)

Player data can come from
[felipeall/transfermarkt-api](https://github.com/felipeall/transfermarkt-api),
a self-hosted FastAPI service that scrapes Transfermarkt. It is not a hosted
API — you have to run it yourself.

By default this repo uses a small hardcoded dataset (`src/data/players.ts`)
so the games are playable without any setup. Setting `DATA_SOURCE=transfermarkt`
switches to live data from a running transfermarkt-api instance instead (see
below).

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed
  and running.

## Run it locally

The upstream repo doesn't ship a `docker-compose.yml` — build and run the
image directly:

```bash
git clone https://github.com/felipeall/transfermarkt-api.git .transfermarkt-api
cd .transfermarkt-api
docker build -t transfermarkt-api .
docker run -d -p 8000:8000 --name transfermarkt-api transfermarkt-api
```

(`.transfermarkt-api/` at the repo root is gitignored, so this is a
convenient place to clone it into without polluting this repo.)

The API will be available at `http://localhost:8000`, with interactive docs
at `http://localhost:8000/docs`.

Useful endpoints for Career Path:

- `GET /players/search/{name}` — find a player by name (used for guess
  suggestions — see `src/app/api/players/search/route.ts`).
- `GET /players/{id}/profile` — player bio/nationality.
- `GET /players/{id}/transfers` — full transfer history (club-by-club career
  path), which is the core data this game needs.
- `GET /competitions/{id}/clubs` — clubs in a competition, e.g. `GB1`
  (Premier League).
- `GET /clubs/{id}/players?season_id={year}` — a club's squad for a given
  season (omit `season_id` for the current one). Historical seasons include
  retired players, tagged `currentClub: "Retired"`, with their market value
  as of that season.
- `GET /players/{id}/achievements` — a player's trophies/awards, each with
  a `count`. Used as the fame proxy for seasons where market value doesn't
  exist (see below), and also fetched for the final answer itself to power
  the in-game "bonus clue" (see below) — unlike market value, this goes
  back decades.
- `GET /players/{id}/stats` — **currently broken.** It's meant to return
  per-competition/season appearances, goals, assists etc., but returns an
  empty list for every player tested (Haaland, Llorente, an old legend, even
  an invalid ID). The scraper looks for `<table class="items">` on
  Transfermarkt's stats page, which no longer exists there — the page is
  apparently JS-rendered now and the static HTML this scraper fetches has no
  `<table>` at all. Not fixable without patching the scraper's XPath/parsing
  logic (out of scope here). Per-club appearances/goals now come from
  Wikipedia instead — see below.

Note: Transfermarkt sits behind Cloudflare and occasionally returns a
transient `502`/`503` to the scraper. A retry a few seconds later usually
works; this isn't a Docker or networking problem on our end.

## Wiring it into this app

Player data flows through `src/lib/data-source.ts`. The game only calls
`fetchRandomPlayer()` — it never imports the mock dataset directly.

`data-source.ts` already implements the live path: when `DATA_SOURCE=transfermarkt`
is set, `fetchRandomPlayer()` first picks a random *season* between 1980
(`OLDEST_SEASON_YEAR`) and the current year, then branches on it:

**2004 onward** (`MARKET_VALUE_SEASON_YEAR`) — roughly when Transfermarkt's
market-value data starts existing at all:

1. a random competition from the big five leagues
   (`src/lib/transfermarkt.ts` → `TOP_LEAGUE_COMPETITION_IDS`: Premier
   League `GB1`, LaLiga `ES1`, Serie A `IT1`, Bundesliga `L1`, Ligue 1
   `FR1`), scoped to that season (so a club that's since been
   promoted/relegated is only in the pool for seasons it actually played);
2. a random club in it;
3. from that club's squad that season, a random player among the **top 15
   by market value at the time** (`GUESSABLE_SQUAD_SIZE`) — a full squad is
   ~25-40 names including fringe/reserve players nobody would recognise,
   and market value ranked *within* the squad is an era-robust "was a
   first-team regular" proxy (avoids the trap of a fixed cutoff — €30m was
   a superstar in 2007, a squad player today).

**Before 2004** — no market-value data exists to rank by (verified: even
the dedicated `/players/{id}/market_value` endpoint returns an empty
history for a player whose career predates this). Trophy count
(`/players/{id}/achievements`) is the fallback proxy instead, but it only
works if the club itself was competitive that season — a fringe player at
a mid-table club scores 0 same as everyone else on that roster, so "most
decorated of a random sample" can still land on a nobody. So for these
seasons, club selection is restricted to `HISTORICAL_POWERHOUSE_CLUBS` — a
short hardcoded list of ~15 clubs (Man Utd, Liverpool, Arsenal, Real
Madrid, Barcelona, Bayern, AC Milan, Juventus, etc.) that were realistically
title-contending across most of the last ~45 years — instead of any
current big-five club. Then: probe a random sample of 6 squad members'
achievement counts, and draw from the top 3.

If any step comes back empty the whole pick is retried (up to 5 attempts)
with fresh random choices. Competition→clubs and club→squad lookups are
cached in memory per server process, keyed by season, since neither changes
within a session; achievement scores are cached per player. If live
selection fails entirely, it falls back to a random pick from the mock
dataset rather than breaking the page.

Guess suggestions (the autocomplete dropdown) are separate: they search
Transfermarkt's full player database via `/players/search/{name}` — not
restricted to the five leagues above — so you can type any player's name
while guessing, even if they're never the actual answer.

The game grants one guess per `careerPath` stop plus a bonus guess
(`src/components/CareerPathGame.tsx` → `maxGuesses`). Once every stop has
been shown, that bonus round doesn't reveal a new club — there isn't one —
it instead shows the answer's nationality and, if fetched, their
`achievements` (trophy titles + counts) as a final clue. `fetchPlayerDetails`
in `data-source.ts` fetches achievements for every live answer, not just
the pre-2004 candidate-filtering step; the mock dataset has no achievements
data, so the bonus round for mock players just shows nationality.

Retired players' final `careerPath` stop is literally the club name
"Retired" (Transfermarkt's own pseudo-transfer marking career end) — this
is left in deliberately, so it reads like one more entry in their career
list rather than being filtered out.

## Per-club appearances/goals (Wikipedia, via Wikidata identity matching)

Since transfermarkt-api's own `/players/{id}/stats` is broken (see above),
appearances/goals per `careerPath` stop are parsed straight out of the
answer's English Wikipedia infobox (`src/lib/wikipedia.ts`). Wikidata's own
structured claims were tried first and abandoned as a stats *source* — its
`P54` (member of sports team) data turned out to be incomplete for major
stints: querying it for Messi returned his reserve-team spells but not his
main 16-year, 520-appearance senior Barcelona career at all. Wikipedia's
infobox had the real number. Wikidata is still used, just for a narrower
job — identity matching:

1. `src/lib/wikidata.ts`: `wbsearchentities` (Wikidata's search API) for
   the player's name → up to 10 candidate items, then one SPARQL query
   (`https://query.wikidata.org/sparql`) filtered to whichever candidate
   has an exact day-precision date-of-birth match (parsed from
   transfermarkt's `profile.description` text, since — like `/stats` — the
   structured `dateOfBirth` field on the profile endpoint is also
   broken/missing), returning that person's English Wikipedia sitelink
   (`schema:about`/`schema:isPartOf`) as an article title.
2. `src/lib/wikipedia.ts`: fetches that article's raw wikitext
   (`action=query&prop=revisions`) and regex-parses the
   `{{Infobox football biography}}` template's numbered senior-career
   fields — `years1`/`clubs1`/`caps1`/`goals1`, `years2`/... in career
   order. Deliberately excludes `youthyearsN`/`youthclubsN` (no stats) and
   `nationalyearsN`/`nationalteamN`/`nationalcapsN`/`nationalgoalsN`
   (international caps, not club career) — the parameter-name prefixes
   make this a simple anchored-regex distinction, not a semantic one.

Matching by name + exact DOB was validated against real edge cases before
building this: two different footballers both named "David Silva," both
born in 1986 but on different days, correctly disambiguate on full date;
"Paul Davis" returns 10 Wikidata entries but only one footballer, already
tagged as such in the search result. Wikidata's own "Transfermarkt player
ID" property (P2276) was *not* used as the join key — tested against
Fernando Llorente and it pointed to a stale/invalid Transfermarkt ID.

`data-source.ts` then attaches each infobox stint to whichever
`careerPath` stop it overlaps most, in years — but only if the club names
are at least plausibly the same (token-prefix match, so "Barça"/"Barcelona"
or "Man"/"Manchester" still connect) **and** the overlap covers at least
half of the stop's own duration. Both checks exist because of real bugs
found testing against Messi's actual career: without the name check, his
childhood Newell's Old Boys stats (176 apps / 234 goals — genuinely his, as
a kid) matched onto his separate Barça youth spell, purely from a
transfer-date-rounding artifact sharing one calendar year. Without the
duration check, that same kind of 1-year boundary overlap matched his
16-year senior Barcelona career to Barcelona's reserve team, showing ~22
apps for a stint that should show ~778. Attaching stats to the wrong stop
is a confidently wrong answer, not just a missing one, so a stop is left
with no appearances/goals rather than guessing when neither check clears.

To enable it locally, create `.env.local`:

```
DATA_SOURCE=transfermarkt
TRANSFERMARKT_API_URL=http://localhost:8000
```

Known limitations:

- Pre-2004 seasons only draw from the 15 curated powerhouse clubs, not the
  full big-five pool — a legend who spent that era at a club outside that
  list won't come up.
- The answer pool only reaches back to 1980 (`OLDEST_SEASON_YEAR`).
- Loan spells aren't distinguished from permanent transfers in `careerPath`.
- Both fame filters are proxies, not guarantees — a very young player who
  was already valuable, or a fringe player who happened to be on a
  trophy-winning squad, can still slip in with a short or unremarkable
  career path.
- Appearances/goals are best-effort, not guaranteed per stop:
  - No match at all if the player isn't on Wikidata (no article, or no
    English Wikipedia sitelink), or their Wikidata DOB only has year/month
    precision (exact-day match required) — falls back to no stats, not the
    mock dataset's absence of the feature.
  - Club-name matching is prefix-based, not alias-aware — pure acronyms
    like transfermarkt's "PSG" vs the infobox's spelled-out "Paris
    Saint-Germain" don't share a text prefix, so that stint is silently
    skipped rather than matched.
  - Adjacent same-club youth/reserve tiers (e.g. a club's U16 vs U19 vs "C"
    team) can still occasionally get attributed to the wrong neighbouring
    tier when the infobox's own year ranges for those transitions overlap
    by a single boundary year — the numbers end up small and plausible
    either way, just not necessarily attached to the exact right tier.
  - Relies on the `{{Infobox football biography}}` template's numbered
    `yearsN`/`clubsN`/`capsN`/`goalsN` convention, which is near-universal
    on English Wikipedia footballer articles but not something every
    article is guaranteed to use.
