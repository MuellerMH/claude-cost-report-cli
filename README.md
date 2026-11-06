# claude-cost-report-cli

Eine Kommandozeilen-CLI, die Nutzungs-/Kostenlogs von Claude Code bzw. der
Anthropic API (JSONL oder CSV, mit Feldern wie Zeitstempel, Modellname,
Input-/Output-Tokens und geschätzten Kosten) einliest und daraus einen
aggregierten Kosten-Report je Modell und Tag erzeugt, als Tabelle in der
Konsole oder als JSON-/CSV-Export.

Die Verarbeitung läuft vollständig lokal und offline: keine Netzwerkzugriffe,
keine offene Schnittstelle, nur Dateien lesen und aggregieren.

Jede Datei wird komplett in den Speicher gelesen (kein Streaming). Dateien
über 25 MB werden mit einer Fehlermeldung abgelehnt, statt den Prozess durch
unkontrollierten Speicherverbrauch zu gefährden.

## Installation

```bash
npm install -g .
```

Voraussetzung: Node.js >= 18, keine externen Abhängigkeiten (nur Node-Stdlib).

Alternativ ohne globale Installation:

```bash
npm install
node bin/claude-cost-report-cli.js examples/sample-usage.jsonl
```

## Beispielaufruf

```bash
claude-cost-report-cli examples/sample-usage.jsonl examples/sample-usage.csv
```

Mehrere Dateien können gemischt übergeben werden (JSONL und CSV in einem
Aufruf); das Format wird je Datei automatisch anhand der Endung oder, falls
die Endung nicht eindeutig ist, anhand des Inhalts erkannt.

### Beispiel-Output

```
Datum       Modell             Anfragen  Input-Tokens  Output-Tokens  Tokens gesamt  Kosten (USD)
----------  -----------------  --------  ------------  -------------  -------------  ------------
2026-11-01  claude-opus-4-1           1          6000           2200           8200        0.1860
2026-11-01  claude-sonnet-4-5         2          7300           2000           9300        0.0408
2026-11-02  claude-haiku-4-5          1          1500            400           1900        0.0019
2026-11-02  claude-opus-4-1           1          7200           3100          10300        0.2430
2026-11-02  claude-sonnet-4-5         1          5300           1800           7100        0.0357
2026-11-03  claude-haiku-4-5          1          2100            500           2600        0.0026
2026-11-03  claude-opus-4-1           1          5800           2000           7800        0.1710
2026-11-03  claude-sonnet-4-5         1          3900           1200           5100        0.0225
2026-11-04  claude-opus-4-1           1          6400           2500           8900        0.2040
2026-11-04  claude-sonnet-4-5         1          4700           1500           6200        0.0291
----------  -----------------  --------  ------------  -------------  -------------  ------------
            GESAMT                   11         50200          17200          67400        0.9366
```

### Export als JSON oder CSV

```bash
claude-cost-report-cli examples/sample-usage.jsonl --format json
claude-cost-report-cli examples/sample-usage.jsonl --format csv
```

`--format json` liefert `{ "rows": [...], "totals": {...} }` mit je einem
Eintrag pro Modell-und-Tag-Kombination; `--format csv` liefert dieselben
Spalten als Kopfzeile + Datenzeilen + abschließende `GESAMT`-Zeile, geeignet
für den Import in eine Tabellenkalkulation.

## Erkannte Felder

Je Zeile (JSONL-Objekt oder CSV-Spalte) werden folgende Feldnamen-Varianten
akzeptiert: Fehlt eines der vier, wird die Zeile verworfen, nicht geraten:

| Kanon-Feld     | akzeptierte Namen                                      |
| -------------- | ------------------------------------------------------- |
| Zeitstempel    | `timestamp`, `time`, `ts`, `date`, `created_at`          |
| Modell         | `model`, `model_name`, `modelName`                       |
| Input-Tokens   | `input_tokens`, `inputTokens`, `prompt_tokens`            |
| Output-Tokens  | `output_tokens`, `outputTokens`, `completion_tokens`      |
| Kosten (USD)   | `cost_usd`, `costUsd`, `cost`, `estimated_cost_usd`       |

Zeitstempel müssen von `Date` interpretierbar sein (ISO-8601-String oder
Epoch-Millisekunden). Fehlerhafte oder unvollständige Zeilen werden
übersprungen und am Ende auf stderr mit Datei- und Zeilennummer gemeldet. Der
Report für die restlichen, gültigen Zeilen wird trotzdem ausgegeben.

## Transparenz: Dateizugriff

Die Datei-/Pfadangaben kommen direkt von der Kommandozeile und werden ohne
Einschränkung (kein Sandboxing, keine Prüfung auf `..`/absolute Pfade)
geöffnet. Das ist kein zusätzliches Risiko gegenüber jedem anderen lokalen
Kommandozeilenprogramm: Das Tool liest genau das, was der aufrufende
Nutzer mit seinen eigenen Dateisystemrechten ohnehin lesen könnte, und
nichts darüber hinaus. Es gibt keine Netzwerkschnittstelle, über die ein
Dritter einen Pfad vorgeben könnte.

## Tests

```bash
npm test
```

Läuft mit Node's eingebautem `node:test`: Unit-Tests für Parser,
Aggregation und Formatierung, sowie End-to-End-Tests, die das `bin`-Skript
tatsächlich als eigenen Prozess aufrufen (so wie es nach `npm install -g .`
am Terminal ausgeführt würde).

## Lizenz

MIT, siehe [LICENSE](LICENSE).
