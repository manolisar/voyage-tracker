#!/usr/bin/env node
// scripts/build-ports-catalog.mjs
//
// Builds public/ports.json from the open DataHub UN/LOCODE dump
// (https://datahub.io/core/un-locode; mirror at github.com/datasets/un-locode).
// Filters to port-function rows (Function column contains '1'), emits a
// trimmed catalog the in-app PortCombobox consumes.
//
// One-shot dev-time script. Not wired into `npm run build` — re-run it
// manually when UN/LOCODE refreshes (a few times a year).
//
// Usage:
//   node scripts/build-ports-catalog.mjs
//   node scripts/build-ports-catalog.mjs --src path/to/code-list.csv
//
// Output shape (array of objects):
//   { code: "MIA", name: "Miami", country: "US", locode: "USMIA" }
//
// The 3-letter `code` is the LOCODE suffix (last 3 of a 5-char LOCODE), and
// is what ends up in voyage filenames. The full `locode` is preserved so the
// combobox can disambiguate suffix collisions (GBMAN vs USMAN both have
// code "MAN").

import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const DEFAULT_URL = 'https://raw.githubusercontent.com/datasets/un-locode/master/data/code-list.csv';

function parseArgs(argv) {
  const args = { src: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--src') args.src = argv[++i];
  }
  return args;
}

// Minimal CSV parser (handles double-quoted fields with embedded commas /
// escaped quotes). The DataHub dump is well-formed; this is enough.
function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else { inQuotes = false; }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n') {
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function loadCsv(src) {
  if (src) {
    console.log(`Reading CSV from ${src}`);
    return readFile(src, 'utf8');
  }
  console.log(`Fetching UN/LOCODE from ${DEFAULT_URL}`);
  const res = await fetch(DEFAULT_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${DEFAULT_URL}`);
  return res.text();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const csv = await loadCsv(args.src);
  const rows = parseCsv(csv);
  if (!rows.length) throw new Error('Empty CSV');

  const header = rows[0].map((h) => h.trim());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const required = ['Country', 'Location', 'Name', 'Function', 'Status'];
  for (const col of required) {
    if (idx[col] == null) throw new Error(`CSV missing column: ${col}`);
  }

  const out = [];
  const seen = new Set();
  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r];
    const country  = (row[idx.Country]  || '').trim().toUpperCase();
    const location = (row[idx.Location] || '').trim().toUpperCase();
    const name     = (row[idx.Name]     || '').trim();
    const fn       = (row[idx.Function] || '').trim();
    const status   = (row[idx.Status]   || '').trim();

    if (!country || country.length !== 2) continue;
    if (!location || location.length !== 3) continue;
    if (!name) continue;
    // Skip rows marked for removal / deletion.
    if (status === 'XX' || status === 'RR' || status === 'RL') continue;
    // Keep only entries flagged as a port (function code includes '1').
    if (!fn.includes('1')) continue;

    const locode = `${country}${location}`;
    if (seen.has(locode)) continue;
    seen.add(locode);
    out.push({ code: location, name, country, locode });
  }

  out.sort((a, b) => a.locode.localeCompare(b.locode));

  const dest = resolve(ROOT, 'public', 'ports.json');
  await writeFile(dest, JSON.stringify(out, null, 0) + '\n', 'utf8');
  console.log(`Wrote ${out.length} port entries to ${dest}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
