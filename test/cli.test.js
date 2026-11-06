'use strict';

// End-to-End-Test: ruft das bin-Skript als eigenen Prozess auf, genau wie es
// ein Mensch nach `npm install -g .` am Terminal täte — nicht nur die
// internen Module direkt.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync, spawnSync } = require('node:child_process');

const BIN_PATH = path.join(__dirname, '..', 'bin', 'claude-cost-report-cli.js');
const EXAMPLES_DIR = path.join(__dirname, '..', 'examples');

test('bin-Skript erzeugt die Konsolen-Tabelle für die Beispieldatei (JSONL)', () => {
  const output = execFileSync('node', [BIN_PATH, path.join(EXAMPLES_DIR, 'sample-usage.jsonl')], { encoding: 'utf8' });
  assert.match(output, /Datum\s+Modell/);
  assert.ok(output.includes('claude-sonnet-4-5'));
  assert.ok(output.includes('claude-opus-4-1'));
  assert.ok(output.includes('GESAMT'));
});

test('bin-Skript liest JSONL- und CSV-Beispieldatei zusammen aus und exportiert als JSON', () => {
  const output = execFileSync(
    'node',
    [BIN_PATH, path.join(EXAMPLES_DIR, 'sample-usage.jsonl'), path.join(EXAMPLES_DIR, 'sample-usage.csv'), '--format', 'json'],
    { encoding: 'utf8' },
  );
  const parsed = JSON.parse(output);
  assert.ok(parsed.totals.requests >= 11); // 6 JSONL- + 5 CSV-Einträge aus den Beispieldateien
  assert.ok(parsed.rows.some((r) => r.model === 'claude-haiku-4-5'));
});

test('bin-Skript ohne Argumente beendet sich mit Exit-Code 1 und zeigt die Hilfe', () => {
  assert.throws(
    () => execFileSync('node', [BIN_PATH], { encoding: 'utf8' }),
    (err) => err.status === 1 && /Verwendung: claude-cost-report-cli/.test(err.stderr),
  );
});

test('bin-Skript beendet sich bei `| head -3` sauber statt mit rohem Node-Stacktrace (EPIPE)', () => {
  // `set -o pipefail` sorgt dafür, dass der Exit-Code der Pipeline der des
  // CLI-Aufrufs selbst ist (nicht der von `head`) — so wird sichtbar, ob der
  // Node-Prozess am geschlossenen stdout wirklich mit Exit-Code 0 endet statt
  // mit einer unbehandelten EPIPE-Exception abzustürzen.
  const result = spawnSync(
    'bash',
    ['-c', `set -o pipefail; node "${BIN_PATH}" "${path.join(EXAMPLES_DIR, 'sample-usage.jsonl')}" | head -3`],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 0);
  assert.ok(!/EPIPE/.test(result.stderr), `stderr sollte kein EPIPE-Stacktrace enthalten, war aber: ${result.stderr}`);
});
