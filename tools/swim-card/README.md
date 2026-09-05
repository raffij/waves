# Swim Hastings card generator

A standalone CLI that renders a shareable "swim report" PNG for Hastings
Pier — current tide state, sea temperature, wave height, wind and sunset —
and saves it into a folder you choose. It's a one-shot script, not a
long-running client: no cache, no persisted key, run it whenever you want a
fresh card.

Like every other client in this repo, it reads TideCheck and Open-Meteo
directly with its own fetch/parse code — see `../../docs/architecture.md`.

## Setup

```sh
cd tools/swim-card
npm install
```

You'll need a free [TideCheck](https://tidecheck.com) API key (50
requests/day on the free tier) unless you're using `--sample` below.

## Usage

```sh
# Prompts for an output folder, fetches live conditions
TIDECHECK_API_KEY=your-key-here npm run generate

# Or pass the folder and key as flags
npm run generate -- --out ~/Desktop/swim-cards --api-key your-key-here

# Preview the design with realistic sample data — no key or network needed
npm run generate -- --sample --out ./out
```

The image is saved as `swim-hastings-<date>-<time>.png` in the folder you
chose (created if it doesn't exist).

### Options

| Flag | Description |
| --- | --- |
| `--out`, `-o <folder>` | Where to save the PNG. Prompted for if omitted. |
| `--api-key <key>` | TideCheck API key. Falls back to `$TIDECHECK_API_KEY`. |
| `--sample` | Render with realistic sample data instead of fetching live conditions. |
| `--help`, `-h` | Show usage. |

## What's real data and what's unverified

The tide state/times, sea temperature, wave height, wind, air temperature,
sky condition and sunset are all live readings for Hastings Pier (or, with
`--sample`, a synthetic-but-realistic stand-in for the same shape of data).

The illustrated coastline strip's beach flags (Bexhill, Glyne Gap,
Bulverhythe, St Leonards, Pelham, Rock-a-Nore, Fairlight) are meant to
reflect real water quality, computed from the water companies' storm-outflow
data — but **`src/beachQuality.mjs`'s integration against the Environment
Agency's Bathing Water Quality open data is unverified**: this was built
without live access to `environment.data.gov.uk` to confirm the request
shape or response fields, from training knowledge of how the EA's other
Linked Data APIs work, not from tested docs. Run it for real and see what
comes back — if the query shape is wrong, every beach will read
**"unknown"** (a dashed gray pin), which is the deliberately safe failure
mode: this tool never guesses a beach "clear" when the lookup didn't
actually work. See
`docs/decisions/2026-09-05-beach-water-quality-flags.md` for the full
reasoning, what was considered and rejected, and what's still open
(the EA's *seasonal classification* is what's wired up today, not the
finer-grained live storm-overflow discharge events the flags are meant to
reflect — Southern Water's Rivers and Seas Watch or the Water UK storm-
overflow hub would be a closer match once one of their exact endpoints can
be confirmed).

## How it's built

- `src/tideClient.mjs` / `src/weatherClient.mjs` — one-shot fetches against
  TideCheck and Open-Meteo (no cache; this script doesn't stay running).
- `src/beachQuality.mjs` — per-beach water-quality flags from the
  Environment Agency's open data, fetched independently of tide/weather.
  **Unverified** — see the section above.
- `src/series.mjs` / `src/tideClock.mjs` — small standalone interpolation
  and London-time helpers (a fresh implementation, not imported from
  `expo/`, per this repo's no-shared-code-between-clients convention).
- `src/compute.mjs` — turns raw API responses into a plain `CardData`
  object the renderer draws from.
- `src/sampleData.mjs` — synthetic `CardData` inputs for `--sample`.
- `src/render.mjs` — draws the PNG with
  [`@napi-rs/canvas`](https://github.com/Brooooooklyn/canvas) (prebuilt
  native bindings via npm — no headless browser to install).
- `src/cli.mjs` — argument parsing, the output-folder prompt, and
  orchestration.
