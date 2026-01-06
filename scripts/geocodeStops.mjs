import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const CSV_PATH = path.resolve('2024-09-21_2025-12-30.csv');
const OUT_PATH = path.resolve('public/data/stopCoords.json');
const USER_AGENT = 'trains-visualizer/1.0 (local script)';

const overrides = {
  '1e C. Huygensstraat': '1e Constantijn Huygensstraat, Amsterdam, Netherlands',
  '1e Con. Huygensstraat': '1e Constantijn Huygensstraat, Amsterdam, Netherlands',
  'Burg. Eliasstraat': 'Burgemeester Eliasstraat, Amsterdam, Netherlands',
  'Aachen Hbf': 'Aachen Hauptbahnhof, Aachen, Germany',
  'Amsterdam, Mosplein': 'Mosplein, Amsterdam, Netherlands',
  'Amsterdam, Stenendokweg': 'Stenendokweg, Amsterdam, Netherlands',
  'Apeldoorn, De Veenkamp': 'De Veenkamp, Apeldoorn, Netherlands',
  'Apeldoorn, Gedenknaald': 'Gedenknaald, Apeldoorn, Netherlands',
  'Apeldoorn, Station': 'Station Apeldoorn, Apeldoorn, Netherlands',
  'Centraal Station': 'Amsterdam Centraal Station, Amsterdam, Netherlands',
  'Centrum': 'Centrum, Den Haag, Netherlands',
  'C. van Eesterenlaan': 'C. van Eesterenlaan, Amsterdam, Netherlands',
  'Den Helder, Station': 'Station Den Helder, Den Helder, Netherlands',
  'Den Helder, Steiger Teso': 'Steiger TESO, Den Helder, Netherlands',
  'Frederik Hendrikplnts': 'Frederik Hendrikplantsoen, Amsterdam, Netherlands',
  'Heemstede, Stat.Heemstede-Aerd': 'Station Heemstede-Aerdenhout, Heemstede, Netherlands',
  'J.P. Heijestraat': 'Jan Pieter Heijestraat, Amsterdam, Netherlands',
  'Kievitslaan': 'Kievitslaan, Rotterdam, Netherlands',
  'muziekgebouw Bimhuis': 'Bimhuis, Amsterdam, Netherlands',
  'Noord': 'Amsterdam Noord, Amsterdam, Netherlands',
  'Purmerend, Anne Franklaan': 'Anne Franklaan, Purmerend, Netherlands',
  'Purmerend, Churchilllaan': 'Churchilllaan, Purmerend, Netherlands',
  'Purmerend, Kelvinstraat': 'Kelvinstraat, Purmerend, Netherlands',
  'Purmerend, Station Overwhere': 'Station Overwhere, Purmerend, Netherlands',
  'Purmerend, Tramplein': 'Tramplein, Purmerend, Netherlands',
  'Purmerend, Veenweidestraat': 'Veenweidestraat, Purmerend, Netherlands',
  'Schev.slag/beelden aan Zee': 'Beelden aan Zee, Scheveningen, Den Haag, Netherlands',
  'Station Blaak': 'Rotterdam Blaak, Rotterdam, Netherlands',
  'Station Hollands Spoor': 'Den Haag Hollands Spoor, Den Haag, Netherlands',
  'Station Lelylaan': 'Amsterdam Lelylaan, Amsterdam, Netherlands',
  'Station Mariahoeve': 'Den Haag Mariahoeve, Den Haag, Netherlands',
  'Station Zuid': 'Amsterdam Zuid, Amsterdam, Netherlands',
  'Van der Woertstraat': 'Van der Woertstraat, Den Haag, Netherlands',
  'Vogelenzang, Waterleiding': 'Waterleiding, Vogelenzang, Netherlands',
  'Zandvoort, Waterleiding/nw. Un': 'Waterleiding, Zandvoort, Netherlands',
  'Zandvoort, Zandvoort Centrum': 'Zandvoort Centrum, Zandvoort, Netherlands'
};

const denHaagStops = new Set([
  'Bierkade',
  'Hofzichtlaan',
  'Kievitslaan',
  'Kneuterdijk',
  'Kunstmuseum',
  'Kurhaus',
  'Schev.slag/beelden aan Zee',
  'Statenplein',
  'Vredespaleis',
  'Den Haag HS',
  'Den Haag Centraal',
  'Den Haag Mariahoeve',
  'Station Hollands Spoor',
  'Station Mariahoeve',
  'Centrum'
]);

const rotterdamStops = new Set([
  'Kruisplein',
  'Leuvehaven',
  'Nieuwe Haven',
  'Vasteland',
  'Weena',
  'Witte de Withstraat',
  'Woudestein',
  'Museumpark',
  'Rotterdam Centraal',
  'Rotterdam Blaak',
  'Station Blaak'
]);

const purmerendStops = new Set([
  'Purmerend Overwhere',
  'Purmerend, Anne Franklaan',
  'Purmerend, Churchilllaan',
  'Purmerend, Kelvinstraat',
  'Purmerend, Signaal',
  'Purmerend, Station Overwhere',
  'Purmerend, Tramplein',
  'Purmerend, Veenweidestraat'
]);

const zandvoortStops = new Set([
  'Zandvoort, Waterleiding/nw. Un',
  'Zandvoort, Zandvoort Centrum',
  'Zandvoort aan Zee'
]);

const allCityPrefixes = [
  'Amsterdam',
  'Rotterdam',
  'Den Haag',
  'Purmerend',
  'Zaandam',
  'Zandvoort',
  'Apeldoorn',
  'Arnhem',
  'Breda',
  'Delft',
  'Enschede',
  'Haarlem',
  'Heerlen',
  'Maastricht',
  'Nijmegen',
  'Aachen',
  'Alkmaar',
  'Den Helder',
  'Schiphol',
  'Velp',
  'Dieren',
  'Uitgeest',
  'Overveen',
  'Santpoort Noord',
  'Heemstede-Aerdenhout',
  'Zaandijk Zaanse Schans',
  'Mook-Molenhoek'
];

function guessQuery(name) {
  if (!name || name === 'Onbekend') return null;
  if (overrides[name]) return overrides[name];
  if (name.includes(',')) return `${name}, Netherlands`;
  if (allCityPrefixes.some((prefix) => name.startsWith(prefix))) {
    return `${name}, Netherlands`;
  }
  if (denHaagStops.has(name)) return `${name}, Den Haag, Netherlands`;
  if (rotterdamStops.has(name)) return `${name}, Rotterdam, Netherlands`;
  if (purmerendStops.has(name)) return `${name}, Purmerend, Netherlands`;
  if (zandvoortStops.has(name)) return `${name}, Zandvoort, Netherlands`;
  return `${name}, Amsterdam, Netherlands`;
}

async function readCsvStops() {
  const text = await fs.readFile(CSV_PATH, 'utf8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = lines[0].split(',');
  const vertrekIndex = headers.indexOf('Vertrek');
  const bestemmingIndex = headers.indexOf('Bestemming');
  const stops = new Set();

  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    const parts = parseCsvLine(line);
    const vertrek = parts[vertrekIndex];
    const bestemming = parts[bestemmingIndex];
    if (vertrek) stops.add(vertrek);
    if (bestemming) stops.add(bestemming);
  }

  return Array.from(stops).sort((a, b) => a.localeCompare(b));
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

async function geocode(name, query) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('q', query);
  url.searchParams.set('countrycodes', 'nl,de,be');

  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT
    }
  });
  if (!res.ok) {
    throw new Error(`Request failed ${res.status} for ${name}`);
  }
  const data = await res.json();
  if (!data.length) return null;
  const match = data[0];
  return {
    lat: Number(match.lat),
    lng: Number(match.lon),
    label: match.display_name,
    query
  };
}

async function main() {
  const stops = await readCsvStops();
  let existing = { generatedAt: null, stops: {}, unmatched: [] };

  try {
    const raw = await fs.readFile(OUT_PATH, 'utf8');
    existing = JSON.parse(raw);
  } catch {
    // No existing file.
  }

  const output = {
    generatedAt: new Date().toISOString(),
    stops: { ...existing.stops },
    unmatched: Array.isArray(existing.unmatched) ? existing.unmatched : []
  };

  for (const name of stops) {
    if (output.stops[name] || output.unmatched.includes(name)) continue;
    const query = guessQuery(name);
    if (!query) {
      output.unmatched.push(name);
      continue;
    }

    try {
      const result = await geocode(name, query);
      if (!result) {
        output.unmatched.push(name);
      } else {
        output.stops[name] = result;
      }
    } catch (err) {
      console.error(err.message);
      output.unmatched.push(name);
    }

    await fs.writeFile(OUT_PATH, JSON.stringify(output, null, 2));
    await delay(1100);
  }

  await fs.writeFile(OUT_PATH, JSON.stringify(output, null, 2));
  console.log(`Geocoded ${Object.keys(output.stops).length} stops.`);
  if (output.unmatched.length) {
    console.log('Unmatched stops:', output.unmatched.join(', '));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
