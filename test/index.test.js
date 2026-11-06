'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { main, parseArgs, readAndParseFile, MAX_FILE_SIZE_BYTES } = require('../src/index.js');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

/**
 * Führt main() aus und fängt dabei alles ab, was tatsächlich auf
 * stdout/stderr geschrieben würde — das ist das, was ein Mensch am Terminal
 * sieht, nicht ein interner Rückgabewert.
 *
 * @param {string[]} argv
 * @returns {{exitCode: number, stdout: string, stderr: string}}
 */
function runCli(argv) {
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  let stdout = '';
  let stderr = '';
  process.stdout.write = (chunk) => {
    stdout += chunk;
    return true;
  };
  process.stderr.write = (chunk) => {
    stderr += chunk;
    return true;
  };

  try {
    const exitCode = main(argv);
    return { exitCode, stdout, stderr };
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }
}

test('parseArgs liest Dateien, --format <wert> und --format=<wert>', () => {
  assert.deepEqual(parseArgs(['a.jsonl', 'b.csv']), { files: ['a.jsonl', 'b.csv'], format: 'table', help: false });
  assert.deepEqual(parseArgs(['a.jsonl', '--format', 'json']), { files: ['a.jsonl'], format: 'json', help: false });
  assert.deepEqual(parseArgs(['a.jsonl', '--format=csv']), { files: ['a.jsonl'], format: 'csv', help: false });
  assert.deepEqual(parseArgs(['--help']), { files: [], format: 'table', help: true });
  assert.deepEqual(parseArgs(['-h']), { files: [], format: 'table', help: true });
});

test('ohne Datei zeigt die CLI die Hilfe auf stderr und meldet einen Fehler (nichts wortlos verschlucken)', () => {
  const { exitCode, stderr, stdout } = runCli([]);
  assert.equal(exitCode, 1);
  assert.equal(stdout, '');
  assert.match(stderr, /Verwendung: claude-cost-report-cli/);
});

test('--help zeigt die Hilfe auf stdout und bricht erfolgreich ab', () => {
  const { exitCode, stdout } = runCli(['--help']);
  assert.equal(exitCode, 0);
  assert.match(stdout, /Verwendung: claude-cost-report-cli/);
});

test('unbekanntes --format wird abgelehnt, bevor irgendetwas gelesen wird', () => {
  const { exitCode, stderr } = runCli([path.join(FIXTURES_DIR, 'mixed-errors.jsonl'), '--format', 'xml']);
  assert.equal(exitCode, 1);
  assert.match(stderr, /unbekanntes Format "xml"/);
});

test('eine nicht existierende Datei führt zu einer verständlichen Fehlermeldung statt zu einem Absturz', () => {
  const { exitCode, stderr } = runCli([path.join(FIXTURES_DIR, 'gibt-es-nicht.jsonl')]);
  assert.equal(exitCode, 1);
  assert.match(stderr, /claude-cost-report-cli:/);
});

test('eine leere Logdatei meldet "keine Nutzungsdaten", statt leer oder mit Fehler abzubrechen (das Nicht-Ereignis)', () => {
  const { exitCode, stdout, stderr } = runCli([path.join(FIXTURES_DIR, 'empty.jsonl')]);
  assert.equal(exitCode, 0);
  assert.equal(stdout.trim(), 'Keine Nutzungsdaten gefunden.');
  assert.equal(stderr, '');
});

test('fehlerhafte Zeilen werden am Ende als Warnung gemeldet, der Report bleibt trotzdem vollständig', () => {
  const { exitCode, stdout, stderr } = runCli([path.join(FIXTURES_DIR, 'mixed-errors.jsonl')]);
  assert.equal(exitCode, 0);
  assert.ok(stdout.includes('claude-sonnet-4-5'));
  assert.ok(stdout.includes('claude-opus-4-1'));
  assert.match(stderr, /4 Zeile\(n\) übersprungen/);
});

test('JSONL- und CSV-Datei zusammen werden in einem Report zusammengeführt', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-cost-report-cli-test-'));
  const jsonlPath = path.join(tmpDir, 'a.jsonl');
  const csvPath = path.join(tmpDir, 'b.csv');
  fs.writeFileSync(
    jsonlPath,
    '{"timestamp": "2026-11-01T08:00:00Z", "model": "claude-sonnet-4-5", "input_tokens": 100, "output_tokens": 50, "cost_usd": 0.01}\n',
  );
  fs.writeFileSync(csvPath, 'timestamp,model,input_tokens,output_tokens,cost_usd\n2026-11-01T09:00:00Z,claude-opus-4-1,200,80,0.05\n');

  const { exitCode, stdout } = runCli([jsonlPath, csvPath, '--format', 'json']);
  assert.equal(exitCode, 0);

  const parsed = JSON.parse(stdout);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.totals.requests, 2);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('readAndParseFile lehnt eine Datei über der Größengrenze ab, statt sie komplett einzulesen', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-cost-report-cli-test-'));
  const bigPath = path.join(tmpDir, 'big.jsonl');
  // Nicht wirklich 25 MB schreiben (unnötig langsam/groß für einen Unit-Test);
  // stattdessen die Grenze über opts.maxFileSizeBytes auf unter Dateigröße senken.
  fs.writeFileSync(bigPath, '{"timestamp": "2026-11-01T08:00:00Z", "model": "x", "input_tokens": 1, "output_tokens": 1, "cost_usd": 0.001}\n');

  assert.throws(
    () => readAndParseFile(bigPath, { maxFileSizeBytes: 10 }),
    /Datei zu groß/,
  );

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('MAX_FILE_SIZE_BYTES liegt bei 25 MB (Default-Grenze bleibt dieselbe wie im Vorgänger-Repo)', () => {
  assert.equal(MAX_FILE_SIZE_BYTES, 25 * 1024 * 1024);
});

test('--format csv liefert eine echte CSV-Ausgabe auf stdout', () => {
  const { exitCode, stdout } = runCli([path.join(FIXTURES_DIR, 'mixed-errors.csv'), '--format', 'csv']);
  assert.equal(exitCode, 0);
  const lines = stdout.trim().split('\n');
  assert.ok(lines[0].startsWith('Datum,Modell'));
  assert.ok(lines[lines.length - 1].startsWith(',GESAMT'));
});
