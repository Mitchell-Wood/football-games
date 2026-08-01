# transfermarkt-api (data source)

Player data will eventually come from
[felipeall/transfermarkt-api](https://github.com/felipeall/transfermarkt-api),
a self-hosted FastAPI service that scrapes Transfermarkt. It is not a hosted
API — you have to run it yourself.

This repo currently uses a small hardcoded dataset
(`src/data/players.ts`) so the games are playable without any setup. The
steps below are for when we're ready to wire up real data.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed
  and running (not currently installed on this machine — install it before
  following the steps below).

## Run it locally

```bash
git clone https://github.com/felipeall/transfermarkt-api.git
cd transfermarkt-api
docker compose up -d
```

The API will be available at `http://localhost:8000`, with interactive docs
at `http://localhost:8000/docs`.

Useful endpoints for Career Path:

- `GET /players/search/{name}` — find a player and their Transfermarkt ID.
- `GET /players/{id}/profile` — player bio/nationality.
- `GET /players/{id}/transfers` — full transfer history (club-by-club career
  path), which is the core data this game needs.

## Wiring it into this app

Player data flows through `src/lib/data-source.ts`. Game components only
call `fetchPlayers()` / `fetchPlayerById()` — they never import the mock
dataset directly. To switch to live data:

1. Add an environment variable, e.g. `TRANSFERMARKT_API_URL=http://localhost:8000`.
2. Implement fetch functions in `src/lib/data-source.ts` that call the
   endpoints above and map the response into the `Player` / `CareerStop`
   shape in `src/lib/types.ts`.
3. Decide on caching (the scraper is slow per-request) — likely fetch a
   curated player list at build/deploy time and cache it, rather than
   scraping on every game load.
