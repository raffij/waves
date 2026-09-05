#!/usr/bin/env node
// Standalone CLI: fetches current tide/wave/wind/sun conditions for
// Hastings Pier (or renders a --sample preview with no network calls) and
// writes a shareable PNG report card into a folder you choose.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';

import { computeCardData } from './compute.mjs';
import { renderCard } from './render.mjs';
import { buildSampleData } from './sampleData.mjs';
import { fetchTideData } from './tideClient.mjs';
import { formatLondon, londonDateKey } from './tideClock.mjs';
import { fetchWeatherData } from './weatherClient.mjs';

// Same default location expo/src/models/Location.ts ships as `DEFAULT_LOCATION`.
const STATION_ID = 'hastings_pier-hgp-gbr-cco';
const LATITUDE = '50.86';
const LONGITUDE = '0.60';

function parseArgs(argv) {
  const args = { sample: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--out' || arg === '-o') args.out = argv[++i];
    else if (arg === '--api-key') args.apiKey = argv[++i];
    else if (arg === '--sample') args.sample = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function printHelp() {
  console.log(`swim-card — generate a Hastings swim-report PNG card

Usage:
  npm run generate -- [--out <folder>] [--api-key <key>] [--sample]

Options:
  --out, -o <folder>   Folder to save the PNG into. Prompted for if omitted.
  --api-key <key>      TideCheck API key. Falls back to $TIDECHECK_API_KEY.
                        Not needed with --sample.
  --sample              Render with realistic sample data instead of fetching
                        live conditions — no API key or network access needed.
  --help, -h            Show this message.
`);
}

async function promptForFolder() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question('Where should I save the image? (folder path, default "."): ');
    return answer.trim() || '.';
  } finally {
    rl.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const now = new Date();

  let cardData;
  if (args.sample) {
    const { tide, weather } = buildSampleData(now);
    cardData = computeCardData({ tide, weather, now });
  } else {
    const apiKey = args.apiKey ?? process.env.TIDECHECK_API_KEY;
    if (!apiKey) {
      throw new Error(
        'No TideCheck API key found. Pass --api-key <key>, set $TIDECHECK_API_KEY, or run with --sample to preview without one.',
      );
    }
    const [tide, weather] = await Promise.all([
      fetchTideData(STATION_ID, apiKey),
      fetchWeatherData(LATITUDE, LONGITUDE, now),
    ]);
    cardData = computeCardData({ tide, weather, now });
  }

  const png = renderCard(cardData);

  const outArg = args.out ?? (await promptForFolder());
  const outDir = path.resolve(outArg);
  await mkdir(outDir, { recursive: true });

  const timeLabel = formatLondon(now, { hour: '2-digit', minute: '2-digit', hour12: false });
  const stamp = `${londonDateKey(now).replaceAll('-', '')}-${timeLabel.replace(':', '')}`;
  const outPath = path.join(outDir, `swim-hastings-${stamp}.png`);

  await writeFile(outPath, png);
  console.log(`Saved ${outPath}`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});
