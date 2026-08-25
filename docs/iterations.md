# Qualitäts-Loop: Reason → Act → Observe

Das erste Diagramm wurde nicht einmal erzeugt, sondern durch genau den Zyklus
geschickt, um den es inhaltlich geht: **generate → observe (PNG ansehen) →
critique (Checkliste) → refine**. Hier steht, was in welcher Runde aufgefallen
ist und was daraufhin geändert wurde.

Checkliste in jeder Runde:

1. Sind alle 3 Knoten und alle Pfeile (inkl. Rückpfeil) klar erkennbar?
2. Überlappen sich Text oder Elemente?
3. Ist der Kreis-/Loop-Charakter auf den ersten Blick erkennbar?
4. Ist es bei ca. 1/4 Bildschirmgröße (Video-Overlay) noch lesbar?

---

## Runde 1 — Pipeline steht, Optik unbrauchbar

**Beobachtet:** Konvertierung läuft durch (3 Knoten, 3 Pfeile), aber:

- `<br>` wurde als **Literaltext** gerendert: „Reason\<br\>LLM entscheidet…“
- Das dunkle Theme kam **invertiert** an — heller Hintergrund, helle Knoten.
- Wörter brachen mitten im Wort um („ausgefü / hrt“).

**Geändert:** Ursache für die Invertierung war `exportWithDarkMode: true`. Die
Elemente sind über `applyTheme()` bereits dunkel eingefärbt; Excalidraw legt bei
dieser Option zusätzlich einen Invert-Filter darüber und hellt damit alles
wieder auf. → auf `false` gesetzt.

## Runde 2 — Theme korrekt, `<br>` weiterhin literal

**Beobachtet:** Kontrast und Farben stimmen. `<br>` steht immer noch im Text.

**Geändert:** Ein Blick in `@excalidraw/mermaid-to-excalidraw` zeigte die
Ursache: der Parser übernimmt mit `entityCodesToText(vertex.text)` den **rohen**
Label-Text von mermaid und kennt keine `<br>`-Behandlung. Der Umbruch muss also
im eigenen Tool passieren — und zwar **am Skeleton, vor**
`convertToExcalidrawElements`, damit Excalidraw den mehrzeiligen Text danach
selbst vermisst und die Knoten passend dimensioniert
(`normalizeLineBreaks()` in `src/browser-entry.js`).

Wichtig dabei: mermaid muss auf `htmlLabels: true` bleiben, weil nur so die
Knotengröße mit echten Zeilenumbrüchen berechnet wird.

## Runde 3 — Text sauber, aber kein Kreis

**Beobachtet:** Beschriftung und Kontrast sind gut, keine Überlappungen.
Checkliste 1 + 2 erfüllt. Aber: dagre layoutet **hierarchisch**, also eine
Reihe von links nach rechts mit einem langen geraden Rückpfeil. Der Rückpfeil
schnitt zudem durch den Observe-Knoten. Checkliste 3 **nicht** erfüllt.

**Geändert:** `src/layout.mjs` ergänzt — ein Kreis-Layout als Post-Processing
(`--layout circle`). Es ordnet die Knoten gleichmäßig auf einem Kreis an und
zieht die Pfeile als Bögen im Uhrzeigersinn neu. Bewusst als eigener,
wiederverwendbarer Schritt, nicht als Sonderfall für dieses eine Diagramm.

## Runde 4 — Kreis da, Pfeile hängen in der Luft

**Beobachtet:** Echter Ring, Richtung im Uhrzeigersinn stimmt. Aber die
Pfeilenden schwebten sichtbar neben den Knoten statt an ihnen anzusetzen.

**Ursache:** Die Winkel-Reserve wurde pauschal aus `max(width, height)/2`
berechnet und in **alle** Richtungen angewandt — bei breiten, flachen Knoten
schiebt das die Endpunkte viel zu weit weg.

**Geändert:** `trimAngle()` sucht den Austrittswinkel jetzt numerisch, also den
Punkt, an dem der Bogen die (um `gap` vergrößerte) Knoten-Box tatsächlich
verlässt. Das funktioniert für breite und hohe Knoten gleichermaßen.

## Runde 5 — Regression: Pfeil-Stummel

**Beobachtet:** Der untere Pfeil (Act → Observe) war zu einem winzigen Stummel
zusammengefallen.

**Ursache:** Die beiden unteren Knoten standen nur ~60 px auseinander. Das
Trimmen von beiden Seiten fraß die komplette Strecke auf, die getrimmten Winkel
überholten sich.

**Geändert:** zwei Dinge —
`spacing` (Default 150 px) geht in die Radiusberechnung ein, damit zwischen
Nachbarn überhaupt Platz für einen sichtbaren Bogen bleibt; zusätzlich ein
Schutz gegen entartete Pfeile, falls sich die Winkel doch überholen.

## Runde 6 — Checkliste erfüllt

**Beobachtet:** Sauberer Ring im Uhrzeigersinn, drei vollständige Bögen, keine
Überlappungen, guter Kontrast. Gegenprobe zur Lesbarkeit: Rendering auf 240 px
Breite (≈ 1/8 Bild) — Struktur klar, Text zu klein. Auf 480 px (realistisches
1/4-Overlay in einer 1920er-Aufnahme) ist alles gut lesbar. Checkliste 1–4
erfüllt.

**Geändert:** nur Feinschliff — Leerzeile zwischen Schlagwort und Beschreibung
(`Reason<br/><br/>LLM entscheidet…`), damit die Kopfzeile beim schnellen
Überfliegen heraussticht; Schriftgröße auf 22 px als Theme-Default.

## Runde 7 — Struktur-Check der Szenendatei

**Beobachtet:** Optisch fertig. Prüfung der `.excalidraw`-Datei selbst zeigte
aber: die drei geklonten Pfeile trugen alle denselben `index` (`a3`) und
denselben `seed` wie ihr Template-Element.

**Warum das zählt:** Doppelte fractional indices lässt Excalidraw beim Import
"reparieren", die Elementreihenfolge kann sich dabei ändern. Gleiche seeds
ergeben außerdem drei identisch gezeichnete Bögen.

**Geändert:** Der Klon erbt `index` nicht mehr (Excalidraw vergibt ihn beim
Laden neu) und bekommt einen deterministisch abgeleiteten eigenen `seed` und
`versionNonce`. Verifiziert: 0 doppelte Indizes, 9 eindeutige seeds, alle drei
Pfeile an beide Knoten gebunden.

---

## Endstand

Alle vier Checklistenpunkte erfüllt. Die beiden inhaltlichen Erkenntnisse, die
über dieses Diagramm hinaus gelten:

- `<br>`-Umbrüche muss das Tool selbst am Skeleton auflösen — das macht der
  Konverter nicht.
- Für zyklische Diagramme ist `--layout circle` praktisch immer die bessere
  Wahl; dagre kann Zyklen nur als Reihe mit Rückpfeil darstellen.
