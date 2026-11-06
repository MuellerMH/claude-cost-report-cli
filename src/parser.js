'use strict';

// Erkannte Feldnamen-Varianten für die Normalisierung von Rohdatensätzen.
// Unterschiedliche Exporte (Claude Code CLI, eigene API-Logging-Skripte) nennen
// dieselben Werte unterschiedlich; hier wird auf einen Kanon-Satz abgebildet,
// statt für jede Quelle ein eigenes Format zu verlangen.
const TIMESTAMP_KEYS = ['timestamp', 'time', 'ts', 'date', 'created_at'];
const MODEL_KEYS = ['model', 'model_name', 'modelName'];
const INPUT_TOKEN_KEYS = ['input_tokens', 'inputTokens', 'prompt_tokens'];
const OUTPUT_TOKEN_KEYS = ['output_tokens', 'outputTokens', 'completion_tokens'];
const COST_KEYS = ['cost_usd', 'costUsd', 'cost', 'estimated_cost_usd'];

/**
 * Liefert den ersten vorhandenen, nicht-leeren Wert für eine Liste möglicher
 * Feldnamen.
 *
 * @param {Object<string, *>} obj
 * @param {string[]} keys
 * @returns {*} undefined, wenn keiner der Schlüssel einen Wert liefert
 */
function firstDefined(obj, keys) {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
      return obj[key];
    }
  }
  return undefined;
}

/**
 * Wandelt einen Zeitstempel-Rohwert (ISO-String oder Epoch-Millisekunden) in
 * ein UTC-Datum (YYYY-MM-DD) um.
 *
 * @param {string|number} value
 * @returns {string|null} null, wenn der Wert kein gültiges Datum ergibt
 */
function toUtcDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

/**
 * Wandelt einen Rohwert in eine nicht-negative Zahl um.
 *
 * @param {*} value
 * @returns {number|null} null, wenn der Wert keine nicht-negative Zahl ist
 */
function toNonNegativeNumber(value) {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return num;
}

/**
 * Normalisiert einen Rohdatensatz (aus JSONL oder CSV) auf den Kanon-Satz
 * { date, model, inputTokens, outputTokens, costUsd }. Fehlt ein Pflichtfeld
 * oder lässt es sich nicht interpretieren, wird der Datensatz verworfen statt
 * mit einem geratenen Wert aufgefüllt zu werden.
 *
 * @param {Object<string, *>} raw
 * @returns {{date: string, model: string, inputTokens: number, outputTokens: number, costUsd: number}|null}
 */
function normalizeRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const rawTimestamp = firstDefined(raw, TIMESTAMP_KEYS);
  const model = firstDefined(raw, MODEL_KEYS);
  const rawInputTokens = firstDefined(raw, INPUT_TOKEN_KEYS);
  const rawOutputTokens = firstDefined(raw, OUTPUT_TOKEN_KEYS);
  const rawCostUsd = firstDefined(raw, COST_KEYS);

  if (
    rawTimestamp === undefined ||
    model === undefined ||
    rawInputTokens === undefined ||
    rawOutputTokens === undefined ||
    rawCostUsd === undefined
  ) {
    return null;
  }

  const date = toUtcDate(rawTimestamp);
  const inputTokens = toNonNegativeNumber(rawInputTokens);
  const outputTokens = toNonNegativeNumber(rawOutputTokens);
  const costUsd = toNonNegativeNumber(rawCostUsd);

  if (date === null || inputTokens === null || outputTokens === null || costUsd === null) {
    return null;
  }

  return { date, model: String(model), inputTokens, outputTokens, costUsd };
}

/**
 * Parst JSONL-Inhalt (eine JSON-Zeile pro Nutzungseintrag).
 *
 * @param {string} content
 * @returns {{records: Array, errors: Array<{line: number, reason: string}>}}
 */
function parseJsonl(content) {
  const records = [];
  const errors = [];
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    // Leere Zeilen (inkl. abschließendem Zeilenumbruch am Dateiende) sind kein
    // Fehler, sondern normaler Bestandteil von JSONL-Dateien.
    if (trimmed === '') return;

    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      errors.push({ line: index + 1, reason: `ungültiges JSON: ${err.message}` });
      return;
    }

    const record = normalizeRecord(parsed);
    if (record === null) {
      errors.push({ line: index + 1, reason: 'Pflichtfeld fehlt oder nicht interpretierbar' });
      return;
    }
    records.push(record);
  });

  return { records, errors };
}

/**
 * Parst eine einzelne CSV-Zeile (RFC-4180-artig: Komma-getrennt, Felder
 * optional in doppelte Anführungszeichen gefasst, `""` als Escape für ein
 * eingebettetes `"`).
 *
 * @param {string} line
 * @returns {string[]}
 */
function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

/**
 * Parst CSV-Inhalt mit Kopfzeile in Nutzungseinträge.
 *
 * @param {string} content
 * @returns {{records: Array, errors: Array<{line: number, reason: string}>}}
 */
function parseCsv(content) {
  const records = [];
  const errors = [];
  const rawLines = content.split(/\r?\n/);
  // Eine abschließende leere Zeile (Datei endet mit Zeilenumbruch) ist kein
  // Dateninhalt und wird nicht als leere/fehlerhafte Zeile gezählt.
  const lines = rawLines[rawLines.length - 1] === '' ? rawLines.slice(0, -1) : rawLines;

  if (lines.length === 0) {
    return { records, errors };
  }

  const header = parseCsvLine(lines[0]).map((h) => h.trim());

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;

    const fields = parseCsvLine(line);
    if (fields.length !== header.length) {
      errors.push({ line: i + 1, reason: `Spaltenzahl (${fields.length}) passt nicht zur Kopfzeile (${header.length})` });
      continue;
    }

    const raw = {};
    header.forEach((key, idx) => {
      raw[key] = fields[idx];
    });

    const record = normalizeRecord(raw);
    if (record === null) {
      errors.push({ line: i + 1, reason: 'Pflichtfeld fehlt oder nicht interpretierbar' });
      continue;
    }
    records.push(record);
  }

  return { records, errors };
}

/**
 * Erkennt das Format einer Logdatei anhand der Dateinamen-Endung, mit
 * Inhalts-Fallback (erste nicht-leere Zeile beginnt mit `{` → JSONL) für
 * Dateien ohne eindeutige Endung.
 *
 * @param {string} filePath
 * @param {string} content
 * @returns {'jsonl'|'csv'}
 */
function detectFormat(filePath, content) {
  if (filePath.endsWith('.jsonl') || filePath.endsWith('.json')) return 'jsonl';
  if (filePath.endsWith('.csv')) return 'csv';

  const firstLine = content.split(/\r?\n/).find((line) => line.trim() !== '');
  if (firstLine === undefined) return 'csv'; // leere Datei: Format ist irrelevant, CSV-Pfad liefert leere Records
  return firstLine.trim().startsWith('{') ? 'jsonl' : 'csv';
}

module.exports = {
  normalizeRecord,
  parseJsonl,
  parseCsv,
  parseCsvLine,
  detectFormat,
};
