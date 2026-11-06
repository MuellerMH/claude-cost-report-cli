'use strict';

const fs = require('fs');
const path = require('path');
const { parseJsonl, parseCsv, detectFormat } = require('./parser');
const { aggregate } = require('./aggregator');
const { formatTable, formatJson, formatCsv } = require('./formatter');

const USAGE = `Verwendung: claude-cost-report-cli <datei> [<datei> ...] [--format table|json|csv]

Liest Claude Code-/Anthropic-API-Nutzungslogs (JSONL oder CSV, Format wird je
Datei automatisch anhand der Endung oder des Inhalts erkannt) und gibt einen
aggregierten Kosten-Report je Modell und Tag aus.

Optionen:
  --format <table|json|csv>  Ausgabeformat (Default: table)
  -h, --help                 Diese Hilfe anzeigen
`;

const KNOWN_FORMATS = ['table', 'json', 'csv'];

// Wird der Report in eine Pipe geschrieben, die der Empfänger vorzeitig
// schließt (z. B. `claude-cost-report-cli … | head -3`), meldet
// process.stdout ein EPIPE statt zu blocken. Ohne diesen Handler wirft Node
// das als unhandled 'error' event und bricht mit rohem Stacktrace ab, obwohl
// der Report-Teil bereits korrekt ausgegeben wurde; der Prozess soll in
// diesem Fall einfach sauber beenden.
process.stdout.on('error', (err) => {
  if (err.code === 'EPIPE') {
    process.exit(0);
  }
  throw err;
});

// Obergrenze für eine einzelne Logdatei. Das Tool liest Dateien komplett per
// fs.readFileSync statt zu streamen (bewusste Design-Entscheidung für ein
// lokales CLI-Tool); ohne Grenze würde eine versehentlich riesige Logdatei
// den gesamten verfügbaren Speicher belegen, statt mit einer verständlichen
// Fehlermeldung abzubrechen.
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

/**
 * Parst die Kommandozeilen-Argumente.
 *
 * @param {string[]} argv
 * @returns {{files: string[], format: string, help: boolean}}
 */
function parseArgs(argv) {
  const files = [];
  let format = 'table';
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      help = true;
    } else if (arg === '--format') {
      format = argv[i + 1];
      i++;
    } else if (arg.startsWith('--format=')) {
      format = arg.slice('--format='.length);
    } else {
      files.push(arg);
    }
  }

  return { files, format, help };
}

/**
 * Liest und parst eine einzelne Logdatei.
 *
 * @param {string} filePath
 * @param {{maxFileSizeBytes?: number}} [opts] maxFileSizeBytes überschreibt
 *   MAX_FILE_SIZE_BYTES (zum Testen)
 * @returns {{records: Array, errors: Array<{line: number, reason: string, file: string}>}}
 */
function readAndParseFile(filePath, opts = {}) {
  const maxFileSizeBytes = opts.maxFileSizeBytes || MAX_FILE_SIZE_BYTES;

  const stats = fs.statSync(filePath);
  if (stats.size > maxFileSizeBytes) {
    throw new Error(
      `Datei zu groß: ${stats.size} Bytes, Grenze ${maxFileSizeBytes} Bytes. ` +
        'Dieses Tool liest Dateien vollständig in den Speicher (kein Streaming); ' +
        'bitte die Logdatei vorher aufteilen.',
    );
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const format = detectFormat(filePath, content);
  const { records, errors } = format === 'jsonl' ? parseJsonl(content) : parseCsv(content);
  return { records, errors: errors.map((err) => ({ ...err, file: filePath })) };
}

/**
 * CLI-Einstiegspunkt: liest alle übergebenen Dateien, aggregiert und gibt den
 * Report auf stdout aus. Übersprungene Zeilen werden auf stderr gemeldet,
 * ändern aber nicht den Exit-Code (ein Teil-Erfolg ist kein Fehlschlag).
 *
 * @param {string[]} argv Kommandozeilen-Argumente ohne `node`/Skriptpfad
 * @returns {number} Exit-Code
 */
function main(argv) {
  const { files, format, help } = parseArgs(argv);

  if (help) {
    process.stdout.write(USAGE);
    return 0;
  }

  if (files.length === 0) {
    process.stderr.write(USAGE);
    return 1;
  }

  if (!KNOWN_FORMATS.includes(format)) {
    process.stderr.write(`claude-cost-report-cli: unbekanntes Format "${format}" (erlaubt: ${KNOWN_FORMATS.join(', ')})\n`);
    return 1;
  }

  let allRecords = [];
  let allErrors = [];

  for (const filePath of files) {
    let result;
    try {
      result = readAndParseFile(path.resolve(filePath));
    } catch (err) {
      process.stderr.write(`claude-cost-report-cli: ${filePath}: ${err.message}\n`);
      return 1;
    }
    allRecords = allRecords.concat(result.records);
    allErrors = allErrors.concat(result.errors);
  }

  const report = aggregate(allRecords);
  const formatted = format === 'json' ? formatJson(report) : format === 'csv' ? formatCsv(report) : formatTable(report);

  process.stdout.write(formatted);
  if (!formatted.endsWith('\n')) process.stdout.write('\n');

  if (allErrors.length > 0) {
    process.stderr.write(`\n${allErrors.length} Zeile(n) übersprungen (fehlerhaft oder unvollständig):\n`);
    for (const err of allErrors.slice(0, 20)) {
      process.stderr.write(`  ${err.file}:${err.line}: ${err.reason}\n`);
    }
    if (allErrors.length > 20) {
      process.stderr.write(`  … und ${allErrors.length - 20} weitere\n`);
    }
  }

  return 0;
}

module.exports = { main, parseArgs, readAndParseFile, USAGE, MAX_FILE_SIZE_BYTES };
