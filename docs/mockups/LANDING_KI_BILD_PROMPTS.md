# Landing KI-Bild-Produktion (P7c) — Prompts, Specs & Drop-in-Plan

> **Status:** Produktionsreif (2026-08-02). Die Landing (`frontend/landing.html`) trägt an jedem
> `figure.story__visual` ein `data-motif` — die Zuordnung unten ist 1:1. Bilder generieren,
> unter dem exakten Ziel-Dateinamen ablegen, dann den Austausch beauftragen (mechanischer Swap).
>
> **Empfohlene Tools:** Bilder: Midjourney v7 / Flux 1.1 Pro / Ideogram 3 (alle können die Prompts
> unten direkt verarbeiten). Video: Runway Gen-4 / Kling 2 / Sora. Die Prompts sind auf Englisch —
> Bildmodelle liefern damit messbar bessere Ergebnisse.

---

## 1. Globaler Style-Guide (gilt für ALLE Assets — sorgt für den Aus-einem-Guss-Look)

**Look-Anker (diesen Block wörtlich in jeden Prompt anhängen):**

```
STYLE: cinematic editorial photography, warm muted color grade with deep teal-navy
shadows and soft amber highlights, shallow depth of field, natural window or dawn
light, shot on 35mm full-frame, f/2.0, subtle film grain, understated and premium —
like a Monocle or Brand Eins magazine feature, NOT stock photography.
MOOD: calm competence, quiet relief, professional warmth. No drama, no hustle.
```

**Warum diese Farbwelt:** Teal-Navy-Schatten harmonieren mit dem Dark-Theme (`#0a0f1e`),
warme Amber-Lichter mit dem Editorial-Creme (`#f4efe4`). Ein Bildsatz, beide Themes.

**Negative-Prompt (ebenfalls überall anhängen):**

```
NEGATIVE: no readable text, no logos, no brand marks, no watermarks, no oversaturated
colors, no corporate stock-photo smiles, no suits-shaking-hands cliché, no sterile
white office, no fluorescent lighting, no distorted hands, no extra fingers.
```

**Verbindliche Guardrails (aus der Media-Strategie, §6 Multi-Skill-Doku):**
- **Nur KI-generierte Personen** — niemals echte/erkennbare Menschen (DSGVO).
- **Keine Bewerber-/Arbeiterfotos in anonymen Angeboten** — Landing-Marketing ist davon
  getrennt; diese Bilder sind Werbewelt, keine Profildaten.
- **Kein lesbarer Text im Bild** (rendert schlecht + bricht Lokalisierung).
- **Vielfalt selbstverständlich, ohne Klischee-Inszenierung** (AGG-sicher: gemischte
  Teams zeigen, niemanden über Herkunft/Geschlecht „casten").
- **Alt-Text ist Pflicht** (steht pro Asset unten, kommt ins `alt`-Attribut).

**Konsistenz-Trick:** Motiv B (Frühschicht) zuerst generieren, bestes Ergebnis als
Style-/Bild-Referenz (`--sref` bzw. image-prompt) für A, C, D verwenden.

---

## 2. Technische Specs (für alle Bilder)

| Eigenschaft | Wert |
|---|---|
| Seitenverhältnis | **4:3** (die Story-Slots sind 480×360-Panels) |
| Generierungsgröße | mind. **1920×1440** (Retina-2x der Darstellungsgröße) |
| Auslieferung | **WebP**, Qualität ~80, Ziel **< 200 KB** pro Bild |
| Ablageort | `frontend/public/img/landing/` (Ordner wird beim Swap angelegt) |
| Laden | `loading="lazy"` + feste `width/height` (kein Layout-Shift) |
| Hero-Video | **16:9**, ~15–20 s nahtloser Loop, stumm, H.264/MP4 **< 4 MB** + WebP-Poster |

---

## 3. Die 4 Bild-Motive (Reihenfolge = Reihenfolge auf der Seite)

### Asset A — „Eine Person, viele Rollen" (Triptychon)
- **Sektion:** `#story-dienstleister` (Multi-Skill-Fan-out) · Visual rechts
- **Zieldatei:** `frontend/public/img/landing/story-multiskill.webp`
- **Alt-Text:** `Dieselbe Fachkraft in drei Einsätzen: Lagerhalle, Pflegestation, Werkbank`

```
PROMPT: Editorial triptych, three vertical panels side by side showing THE SAME
person (AI-generated woman, mid-30s, confident calm expression, short dark hair)
in three different work roles: left panel — warehouse aisle wearing a hi-vis vest
holding a scanner; center panel — bright care facility corridor in medical tunic;
right panel — workshop bench in work jacket with safety glasses pushed up. Same
face, same posture rhythm, three different uniforms and settings. Seamless panel
transitions with thin light gaps. [+ STYLE-Block] [+ NEGATIVE-Block]
```

- **Abnahme:** Gesicht in allen drei Panels identisch erkennbar; keine Uniform-Logos;
  funktioniert auf Dunkel UND Creme (Ränder nicht reinweiß/tiefschwarz).

### Asset B — „Ankunft der Frühschicht"
- **Sektion:** `#story-unternehmen` (Notdienst) · Visual links
- **Zieldatei:** `frontend/public/img/landing/story-notdienst.webp`
- **Alt-Text:** `Ein Team in Warnwesten betritt im Morgengrauen eine Logistikhalle`

```
PROMPT: Wide shot inside a German logistics hall at dawn, large gate opening, a
small team of four workers in hi-vis vests walking in together carrying helmets,
first warm sunlight cutting through the gate against cool blue hall shadows, light
morning haze, sense of quiet relief — the shift is saved. Backs and profiles
visible, faces not prominent. [+ STYLE-Block] [+ NEGATIVE-Block]
```

- **Abnahme:** Stimmung „Erleichterung, Ankunft" (nicht Hektik); Gegenlicht warm;
  keine lesbaren Schilder.

### Asset C — „Disposition über die Schulter"
- **Sektion:** `#story-workflow` (Deal → Rechnung) · Visual rechts
- **Zieldatei:** `frontend/public/img/landing/story-workflow.webp`
- **Alt-Text:** `Blick über die Schulter einer Disponentin auf ein Planungs-Board`

```
PROMPT: Over-the-shoulder shot of a dispatcher (AI-generated person, blurred
foreground shoulder) looking at a large wall-mounted planning board with abstract
glowing status cards and connecting lines — the board content is stylized and
UNREADABLE (soft glowing rectangles, no legible UI, no real screenshot). Calm
control-room atmosphere, warm desk lamp against cool screen glow.
[+ STYLE-Block] [+ NEGATIVE-Block]
```

- **Abnahme:** Board bewusst abstrakt (kein Fake-Screenshot unserer UI — Verwechslungsgefahr
  mit echten Daten ist ausgeschlossen); ruhige Souveränität statt Kontrollraum-Drama.

### Asset D — „Der Handschlag"
- **Sektion:** `#story-vertrauen` (Anonym bis Deal) · Visual links
- **Zieldatei:** `frontend/public/img/landing/story-vertrauen.webp`
- **Alt-Text:** `Zwei Menschen geben sich in einer Werkshalle die Hand, warmes Gegenlicht`

```
PROMPT: Two people shaking hands in a workshop doorway, warm backlight flare
between them, industrial hall softly blurred in the background, one wearing a
work jacket and one in smart-casual business wear, faces in gentle profile —
the moment an anonymous match becomes a team. Honest, warm, no posing.
[+ STYLE-Block] [+ NEGATIVE-Block]
```

- **Abnahme:** KEIN Stock-Foto-Klischee (kein Kamera-Lächeln, keine Anzug-Uniformität);
  Hände anatomisch sauber (häufigster KI-Fehler — mehrere Varianten generieren).

---

## 4. Hero-Video — „Der Anruf um 4:12 Uhr" (16:9, 15–20 s Loop)

- **Platzierung:** Hero rechts (ersetzt langfristig den heutigen zentrierten Hero oder
  ergänzt ihn — Entscheidung beim Einbau; Layout-Vorschlag liegt im Mockup v1).
- **Zieldateien:** `frontend/public/img/landing/hero-loop.mp4` + `hero-poster.webp`
- **Alt-/Aria-Text:** `Kurzfilm: Ein nächtlicher Personalausfall wird bis zum Morgen gelöst`

**Storyboard (4 Beats à ~4–5 s, nahtloser Schnitt, KEIN Ton, kein Text):**

1. **4:12 Uhr** — dunkle Werkhalle, ein leerer Arbeitsplatz, ein Telefon leuchtet auf
   (kühles Blau dominiert).
2. **Reaktion** — Nahaufnahme ruhiger Hände am Laptop im Halbdunkel, warmes
   Bildschirmlicht auf dem Gesicht, ein entschlossener Klick (abstrahiertes Interface,
   unlesbar).
3. **Bewegung** — Scheinwerfer eines Transporters in der Dämmerung, Team steigt aus,
   Warnwesten fangen das erste Licht.
4. **6:00 Uhr** — das Tor öffnet sich, das Team geht hinein, warmes Morgenlicht flutet
   die Halle → Match-Cut zurück auf Beat 1 (Loop).

```
VIDEO-PROMPT (pro Beat generieren, dann schneiden — oder als Ein-Shot-Prompt):
Cinematic sequence, German industrial setting at night transitioning to dawn:
an empty workstation in a dark factory hall, a phone screen lighting up; calm
hands typing on a laptop in warm screen glow; a transporter van arriving at dawn,
four workers in hi-vis vests stepping out; the hall gate opening with warm morning
light as the team walks in. Continuous mood of calm competence, no faces prominent,
no readable text or logos, warm amber against teal-navy, 35mm cinematic look,
seamless loop. [+ NEGATIVE-Block]
```

- **Abnahme:** Loop-Punkt unsichtbar; ohne Ton verständlich; < 4 MB (sonst neu encodieren:
  `ffmpeg -i in.mp4 -vf scale=1280:-2 -c:v libx264 -crf 26 -an hero-loop.mp4`);
  `prefers-reduced-motion` wird beim Einbau respektiert (Poster statt Autoplay).

---

## 5. Drop-in-Plan (was nach der Generierung passiert)

### Stand heute (2026-08-22) — bitte zuerst lesen

Ausgeliefert wird die **SVG-Illustration** in jedem `figure.story__visual`. Die Mechanik für
den Bild-Tausch liegt fertig daneben:

| Baustein | Datei | Zustand |
|---|---|---|
| Probe + Einblenden | `frontend/public/js/pages/landing.js` (Ende) | fertig |
| SVG ausblenden, sobald ein Bild da ist | `frontend/public/css/pages/landing.css` (`.story__visual.has-img svg`) | fertig |
| Motiv + Alt-Text am `figure` | `frontend/landing.html` (`data-motif`, `data-alt`) | fertig |
| **Adresse des Bildes** (`data-img`) | `frontend/landing.html` | **bewusst nicht gesetzt** |

`data-img` fehlt mit Absicht. Bis zum 2026-08-22 stand es dort — und zeigte auf vier Dateien,
die es nie gab. Das kostete auf der meistbesuchten Seite vier echte Anfragen pro Aufruf, und
der Server beantwortete sie nicht mit 404, sondern mit **HTTP 200 und der kompletten
Startseite** (je 71 KB): der Catch-All in `nginx/nginx.conf` fing sie ab. Ein Fehler, den
kein Monitoring sieht, weil der Status 200 ist. Beides ist behoben — der Catch-All greift für
Assets unter `/public/` nicht mehr, und die vier Adressen sind aus dem Markup raus.

### Was beim Ablegen der Bilder zu tun ist

1. Dateien unter den **exakten Zieldateinamen** in `frontend/public/img/landing/` legen
   (Verzeichnis anlegen).
2. `cd api && node scripts/run-tests.js` — der Lauf wird **rot**, und zwar in
   `assetWaechter.test.js`, Schicht C3. Die Meldung nennt zu jeder abgelegten Datei die
   Sektion und die Zeile, die in `frontend/landing.html` zu ergänzen ist:

   ```
   data-img="/public/img/landing/story-multiskill.webp"
   ```

   Das ist der ganze Einbau: eine Zeile je `figure`, direkt neben das vorhandene
   `data-motif`. `landing.js` blendet das Bild dann von selbst ein und versteckt die SVG.
   Die Gegenrichtung ist genauso abgesichert — steht `data-img` da und die Datei fehlt,
   wird derselbe Test rot. **Vergessen ist damit ausgeschlossen; ein stiller 404 kann nicht
   zurückkommen.**
3. Hero-Video mit Poster + `prefers-reduced-motion`-Fallback (eigener Schritt, s. §4).
4. Kosten-Guardrail: Gesamtgewicht Landing-Assets < 5 MB, alles lazy unterhalb des Folds.
5. Verifikation in allen 3 Themes + Konsole + Lighthouse-Stichprobe.
6. Editorial-Check: Bilder stehen auf Creme-Panels (`--lex-cream-warm`) — Ränder der
   Bilder dürfen nicht hart weiß/schwarz sein (Abnahme-Kriterium oben).

> **Die Zuordnung in §3 ist maschinenlesbar.** `assetWaechter.test.js` liest die Zeilen
> `**Sektion:**` und `**Zieldatei:**` aus diesem Dokument und prüft sie gegen `landing.html`.
> Wer hier ein Motiv umbenennt, umhängt oder ergänzt, ändert damit die Prüfung mit — und
> bekommt sofort gesagt, wenn Register und Seite auseinanderlaufen.

**Bewusst NICHT im Scope:** Kategorie-Bildwelt (Welle 8) und Einsatzort-Fotos (Welle 9)
haben eigene Wellen; dieselbe Style-Anker-Technik wird dort wiederverwendet.
