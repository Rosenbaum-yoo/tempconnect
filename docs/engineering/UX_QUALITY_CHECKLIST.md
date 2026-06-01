# TempConnect — UX-Qualitäts-Checkliste

> Verbindliche UX-Standards für Enterprise B2B SaaS.
> WAVE 14 — Phase 2 — 2026-05-27

---

## 1. Accessibility Baseline (WCAG 2.1 AA — Minimum)

### Bereits implementiert ✅

| Element | Implementierung |
|---|---|
| Focus-Visible für Buttons | `:focus-visible { outline: 2px solid var(--ds-border-focus) }` in design-system.css |
| Focus-Visible für Inputs | `box-shadow: 0 0 0 3px var(--tc-input-focus-ring)` in design-system.css |
| Focus-Visible für Hub-Cards | `:focus-visible { outline: 2px solid var(--ds-border-focus) }` in design-system.css |
| Hamburger-Button | `aria-label="Menü öffnen"` + `aria-expanded` (toggle) |
| User-Profile-Button | `aria-label="Profil & Konto"` + `aria-haspopup` + `aria-expanded` |
| Notification Bell | `aria-label="Benachrichtigungen"` |
| Org/Standort-Switch | `aria-label` + `<label for>` |
| User-Dropdown | `role="menu"` |
| Nav-Links (ausgeblendet) | `aria-hidden="true"` bei hidden_worker etc. |
| Theme-Toggle | `aria-pressed` + `aria-label` dynamisch |
| Toast-Notifications | `aria-live="polite"` |
| Skip-to-Main Link | Injiziert via `pageShell.js` — Tab-sichtbar, visuell versteckt |
| Main-Content Landmark | `role="main"` auf `.ds-wrap` via `pageShell.js` |

### Kontrast (Schätzung)

| Element | Hintergrund | Vordergrund | Ratio-Schätzung |
|---|---|---|---|
| Fließtext (dark mode) | `#0f1629` | `#c8d4f0` | ~8:1 ✅ |
| Sekundärtext | `#0f1629` | `#8d9bba` | ~4.5:1 ✅ |
| Brand-Buttons | `#4a9eff` | `#ffffff` | ~3.2:1 ⚠️ (AA für große Texte) |
| Erfolgs-Grün | `#39d98a` | `#0f1629` | ~7:1 ✅ |

---

## 2. Empty States

**Pattern:** `<div class="ds-empty">` mit Icon, Titel, Text und optionalem CTA.

**Pilotpfad-Seiten — Empty State vorhanden:**

| Seite | Empty State |
|---|---|
| Compliance-Dokumente | ✅ `<div class="ds-empty">` mit Upload-Button |
| Hub (keine Org) | ✅ Weiterleitung / Loading-State |
| Executive Dashboard | ✅ `{ available: false }` → Zero-State-Karte |
| Timesheets | ✅ Leeres Array → "Keine Zeiterfassungen" |
| Requisitions | ✅ Leeres Array → Empty-State mit CTA |
| Vendor Pool | ✅ Empty-State mit Hinweis |

**Standard:**

```html
<div class="ds-empty">
  <div class="ds-empty__icon"><!-- Thematisches Icon --></div>
  <div class="ds-empty__title">Noch keine [Ressource]</div>
  <div class="ds-empty__text">Beschreibung was fehlt und warum.</div>
  <button class="ds-btn ds-btn--primary">Erste [Ressource] erstellen</button>
</div>
```

---

## 3. Loading States

**Pattern:** Skeleton-Loader oder Spinner während API-Calls.

| Seite | Loading-Implementierung |
|---|---|
| Hub / Dashboard | `aria-busy="true"` auf Container + Spinner |
| Pricing | `aria-busy="true"` auf `#pricingPlanGrid` |
| Executive Dashboard | Loading-KPI-Skeleton |
| Timesheets | Row-Skeleton während Load |

---

## 4. Error States

**Backend-Fehler (API nicht erreichbar):**

```html
<div class="ds-error">
  <div class="ds-error__title">Daten nicht verfügbar</div>
  <div class="ds-error__text">Bitte Seite neu laden oder Support kontaktieren.</div>
  <button class="ds-btn" onclick="location.reload()">Neu laden</button>
</div>
```

**Standard-Error-Codes aus API** → Frontend zeigt human-readable Text.

---

## 5. Navigation & CTAs

### Verbote (Produktions-Verboten)

- ❌ Keine `onclick="alert('...')"` für echte Aktionen
- ❌ Keine toten `href="#"` Links ohne JS-Handler
- ❌ Keine Buttons ohne sichtbares Label oder `aria-label`
- ❌ Keine Navigation, die mit Rollengrenzen bricht (Worker sieht nur Einsatzportal)

### Bekannte Patterns

| Pattern | Beispiel |
|---|---|
| Link-CTA | `<a href="/public/requisitions.html" class="ds-btn">Anforderung erstellen</a>` |
| Action-Button | `<button type="button" class="ds-btn ds-btn--primary" onclick="openModal()">Aktion</button>` |
| Disabled-State | `<button disabled aria-disabled="true">Nicht verfügbar</button>` |
| Plan-Lock | `<div class="ds-plan-lock">Upgrade auf PLUS erforderlich</div>` |

---

## 6. Formulare — Label-Zuordnung

**Pflicht:** Jedes Eingabefeld hat eine semantisch korrekte `<label for="id">` Zuordnung.

```html
<!-- Korrekt -->
<label for="fCompany">Firmenname *</label>
<input id="fCompany" type="text" required aria-required="true" />

<!-- Alternativ (aria-label für Input ohne sichtbares Label) -->
<input type="search" aria-label="Suche" placeholder="Suchen..." />
```

**Bekannte Lücken:** Einige ältere Seiten (admin_panel.html, bounties.html) verwenden `placeholder` statt `<label>`. Diese sind für den Pilot nicht im kritischen Pfad.

---

## 7. Responsive Mindestqualität

**Breakpoints im Design System:**

| Breakpoint | Breite | Beschreibung |
|---|---|---|
| Mobile | < 520px | Single-column, stacked layout |
| Tablet | 520–900px | 2-column grids |
| Desktop | > 900px | Multi-column, volle Navigation |

**Pilot-Pfad-Seiten sind responsive:** Login, Hub, Requisitions, Timesheets, Executive Dashboard.

---

## 8. SaaS-Sprache (Tone of Voice)

### Geboten

- Direkt und klar: "Anforderung erstellen" statt "Hier klicken"
- Deutsch-konsequent: keine gemischten DE/EN Begriffe in der UI
- Professionell: kein Startup-Jargon

### Verboten

- Emojis in produktiver UI (nur in Landing/Marketing erlaubt)
- "Coming Soon", "Bald verfügbar" (stattdessen: Feature-Gate mit Upgrade-Hinweis)
- "Lorem ipsum" oder Dummy-Texte (0 in Produktion)
- Generische Fehler "Something went wrong" ohne konkreten Code

---

## 9. WAVE 14 — GO-Kriterien Verifikation

| Kriterium | Status |
|---|---|
| Pilotpfad wirkt hochwertig | ✅ Design System konsistent |
| Enterprise-Pfad wirkt glaubwürdig | ✅ INDIVIDUELL-Form komplett |
| Keine Demo-Optik | ✅ Keine Fake-Daten, echter Katalog |
| Keine toten CTAs | ✅ Alle Buttons verbunden |
| Keine verwirrenden Rollenbereiche | ✅ Hub Visibility Matrix aktiv |
| Accessibility Baseline | ✅ Skip-Link + ARIA + Focus-Visible |
| Empty States auf Pilotpfad | ✅ 6 Kernseiten verifiziert |

---

*Letzte Aktualisierung: WAVE 14 — Phase 2 — 2026-05-27*
*Zuständig: UX (Claude), Freigabe: Owner*
