Die JSON-Tag-Runtime ist die gemeinsame Quelle für Core-, Browser-, Node- und
GTM-Kompatibilitäts-Builds. Änderungen an der Versandlogik gehören unter `src/` und
nicht direkt in generierte Dateien unter `dist/`.

Vor dem Abschluss von Änderungen immer ausführen:

```bash
npm run check
```

Die Kompatibilitätsdateien `dist/jsonTagSendData.js` und
`dist/jsonTagSendData-min.js` erhalten die globale Funktion
`jsonTagSendData(...)`. Ihre synchrone Signatur, Positionsparameter und ihr
Wire-Payload müssen für bestehende GTM-Installationen rückwärtskompatibel
bleiben. Relevante Kompatibilitätspfade benötigen Regressionstests.

Die Kompatibilitäts-Builds werden anschließend mit folgendem Befehl in das separate
JSON-Tag-Template-Repository übernommen:

```bash
npm run sync:json-tag -- /path/to/json-tag
```

Solange die Runtime noch nicht veröffentlicht ist, können die ESM-Builds für
Browser und Node.js reproduzierbar in beliebige Consumer-Pfade exportiert
werden:

```bash
npm run export:esm -- /path/to/browser.js /path/to/node.js
```

In Consumer-Repositories sind diese beiden Dateien reine Build-Artefakte und
dürfen nicht unabhängig weiterentwickelt werden. Runtime und Consumer behalten
getrennte Git-Historien.

Der Paket- und Repository-Name `json-tag-runtime` ist bis zur ersten
Veröffentlichung ein Arbeitsname. Kein npm-Publish, GitHub-Repository, Push
oder Release ohne ausdrückliche Freigabe ausführen.
