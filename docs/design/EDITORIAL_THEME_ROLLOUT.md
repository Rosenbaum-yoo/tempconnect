# Editorial Theme — Plattformweiter Rollout (Strukturierter Plan)

Stand: 2026-06-08 · Branch: `release/enterprise-premium-market-ready` · Status: Phase 0–3 + 5–7 umgesetzt + **Editorial = Plattform-Default** (2026-06-08, uncommitted); Phase 8 (per-Seite Inline-`<style>`) = Exemplar pricing.html + Batch 1 Public/Marketing (6 Seiten) erledigt, ~24 Seiten offen (Owner-Priorisierung); Phase 4 (interne React-SPAs) = Owner-Entscheidung offen

> **Fixplan Phase 1 — Design-Fundament (2026-06-09, Quelle `_TEMPCONNECT_FIXPLAN.md`/`_TEMPCONNECT_DESIGN_SPEC.md`, uncommitted→committed pro Phase):**
> **Owner-Entscheid „Cards dunkler" = Option A** (Creme-Karten, NICHT global-dunkel `#1c2a22`): landing.html nutzt real
> cremefarbene Karten `#ebe4d3`, dunkles Forest nur als *Signatur* (Pilot/CTA/Recommended). Also: Inhalts-Karten warm/creme,
> dunkles Forest reserviert für Hub-Kacheln (Phase 2) + Signatur-Panels. (Spec empfahl global-dunkel — widerspricht landings
> hellem Look + den ~22 bereits auf Creme gesetzten Seiten → Option A gewählt, Owner kann auf global-dunkel umstellen.)
> - **P1.1** `design-system.css` Editorial-Token: Content-Card-Surfaces `#fffdf6`→`#ebe4d3` (`--tc-card-surface`,
>   `--tc-kpi-bg`, `--tc-legacy-card`). Nested/Input/Modal (`--ds-bg-raised`/`--tc-input-bg`/`--card`) bleiben hell `#fffdf6`.
> - **P1.2** Wiederverwendbare `.ds-card--forest` (bg `#15291f`, Text `#faf7ee`, Eyebrow Gold `#b8935a`) = EINE Quelle für
>   den „dunklen Kasten" (spiegelt Pilot-Banner 1:1). Theme-agnostisch.
> - **P1.3** `.btn.primary` (enterprise.css) erbte dunkle Ink-Schrift auf dunklem Gradient → `color:#fff` global
>   (Bug „dunkler Button, dunkle Schrift", Screenshot 22). `.btn.good/.bad` Editorial-Kontrast (Ink auf Tint) nachgezogen.
> - **P1.4** Zentrale Editorial-`select`/`option`-Regel: Ink `#14201a` auf Creme `#fffdf6`, Creme-Warm-Highlight bei `:checked`.
> - **P1.5** `worker-profile-public.html` → `data-theme="editorial"` hart gesetzt (lud enterprise.css, hatte aber keine
>   Theme-Aktivierung → vorhandene Editorial-Overrides waren tot). OCC (`occ.html`) bleibt OCC-Design (Phase 4, Owner).
> - **P1.6** Dublette `api_docs.html` ist bereits `<meta refresh>`→`api-docs.html` (aktiv); alle Links konsistent → keine Aktion.
> - **Verifikation (Dev 4178, getComputedStyle):** `.ds-card`/`.ds-kpi` `#ebe4d3` editorial / Dark byte-identisch
>   (`rgba(255,255,255,.02)` zurück); `.ds-card--forest` `#15291f`+Creme; `.btn.primary` Forest→Wine-Gradient + `#fff`;
>   `select` Ink-auf-Creme; worker-profile Body `#faf7ee` + Hero `#15291f`.

> **Fixplan Phase 2 — Lebendige Hub-Cards + Glocke (2026-06-09, Quelle `_TEMPCONNECT_PHASE2_DETAIL.md`, committed pro Phase):**
> Backend war bereits da (`GET /api/notifications/surface-summary` → `{surfaces,total}`); Phase 2 = Frontend-Verdrahtung + 1 Backend-Bug-Fix.
> - **P2.1** `design-system.css`: `.ds-hub-card` Editorial → Ruhe dunkel `#1c2a22` (Cream-Text, Gold-Eyebrow, helle Icon-Box), AKTIV
>   `.ds-hub-card--active` `#15291f` + Gold-Glow (`box-shadow 0 0 0 1px #b8935a, 0 4px 24px rgba(184,147,90,.28)`) + Gold-Rand. Badge
>   `.ds-hub-card__badge` (Gold-Pille, nur bei `--active`; `position:relative` am Base-Card für alle Themes). `--current` editorial
>   dark-kompatibel gemacht (Gold-Ring auf `#15291f` statt hellem Blau-Tint — wird auf 5 Seiten genutzt).
> - **P2.2/2.3** Neu `frontend/public/js/hubCardBadges.js`: holt `surface-summary` (credentials:'include'), markiert Cards mit count>0
>   als `--active` + erzeugt/füllt Badge (Zahl, „99+"), 60s-Polling, 401/Fehler still. Badge per JS erzeugt (kein Markup-Duplikat über ~10 Cards).
>   In `enterprise.html` nach `notifications.js` eingebunden.
> - **P2.4** Deep-Link: aktive Card → `?filter=open&sort=newest` (idempotent via `data-base-href`; Ziel-Filter-Honorierung = inkrementeller Folgeschritt).
> - **P2.5** Glocke verifiziert (keine Änderung): Badge = `unread-count` (Gesamt), `/notifications` `ORDER BY created_at DESC` (neueste oben),
>   `resolveLink()` → Item-Detailseite (nicht Activity-Center).
> - **P2.6 (Bug-Fix „Deal abgeschlossen → Card ohne Benachrichtigung"):** `deal.completed` emittierte `type:'general'` → mappte auf KEINE
>   Surface. Fix: `type:'deal_completed'` (bereits im `notifications_type_check`, Mig 072 → KEINE Migration) + `linkPath` → `deal_management.html`
>   + `deal_completed:"deals"` in `notificationSurfaceMap`. Jetzt: Deal-Abschluss → Deals-Card leuchtet + Glocke zählt + Klick → Deal.
> - **Verifikation:** getComputedStyle (4178): Ruhe `#1c2a22`, Aktiv `#15291f`+Gold-Glow+Gold-Rand, Badge Gold `#b8935a`/Cream sichtbar bei
>   `--active`. `node --test` notificationMatrix/SurfaceMap/SurfaceSummary/Integrations/matchAlerts = **116 grün**. Editorial-scoped → dark/light/ultra unberührt.

> **P2 Farb-Revision (2026-06-09, Owner-Feedback Landing-Screenshot, Commit `9d73c2c`):** Hub-Kacheln ruhen jetzt im
> Creme `#ebe4d3` wie ALLE Inhalts-Karten (dunkle Schrift) — das dunkle `#15291f` + Gold-Glow + Ziffer-Badge ist NUR noch
> der Aktiv-/Benachrichtigungs-Zustand (helle Schrift, aktiv-gescoped). `--current` zurück auf Creme-Forest-Tint.
> Seiten-Hintergrund `--ds-bg` editorial `#faf7ee`→`#f4efe4` (etwas dunkler, nur wenig). Seite `#f4efe4` bleibt heller als
> die Karten `#ebe4d3` → Karten heben sich weiterhin als „dunklere Kästchen" ab.

> **Topbar an landing.html angeglichen (2026-06-09, Owner-Request):** Plattform- und Landing-Seiten nutzen DIESELBE
> `.ds-topbar`-Komponente; sie sahen nur anders aus, weil landing.html `landing-lex.css` (flacher Radius + sticky) lädt,
> die Plattform aber den Base-`.ds-topbar` (`border-radius: var(--ds-radius-full)` = Pille). Fix in `design-system.css`
> Editorial-`.ds-topbar`: `border-radius` → `var(--ds-radius-lg)` (14px, keine Pille) + `position:sticky; top:10px; z-index:50`
> — exakt wie landing. Eine geteilte Regel → **alle** `.ds-topbar`-Seiten (≈ alle Plattformseiten) angeglichen; bg/Blur/Border
> kamen schon aus dem Base-Token `--tc-topbar-bg`. Legacy `.topbar` (enterprise.css Pille) = auf keiner aktiven Seite genutzt;
> `.ep-topbar` (Einsatzportal Mobile) = eigenes Design, bewusst unberührt. Editorial-scoped → dark/light/ultra unverändert.
> **Sticky-Nachzug (2026-06-09):** Auf pageShell-Seiten saß die Topbar im kurzen `#tc-shell`-Mount → `sticky` löste sofort
> (kurzer Wrapper = keine Klebe-Strecke). Fix: `[data-theme="editorial"] #tc-shell { display:contents }` → Topbar klebt jetzt
> relativ zum echten Seiteninhalt (Scroll-Test: hält bei `top:10px` nach 700px Scroll). Statische `.ds-topbar`-Seiten waren
> schon ok (Topbar = direktes Kind des hohen `.wrap`). Außerdem enterprise.html: Inline-Blau-Boxen `#ce-activation-nudge`
> (Blau/Lila-Gradient) → Forest→Wine-Tint, `#value-report-widget` (Weiß-Alpha) → Creme `#ebe4d3` (Parent-Hook + !important).
> **Marktplatz-Karten stylischer (2026-06-09, Owner-Request):** `.ce-card` (capacity_exchange_feed, `marketplace-feed.css`) war
> `rgba(255,255,255,.025)` = fast unsichtbar auf Creme → Editorial: `#fffdf6` Raised-Fläche (heller als Seite `#f4efe4`) +
> warmer Layer-Schatten zum Abheben + Hover-Lift (`translateY(-2px)`, Forest-Akzent-Rand, stärkerer Schatten); Thumbnail-Slot
> `.ce-card__preview` als `#f4efe4`-Inset. getComputedStyle-verifiziert (#fffdf6 + Schatten gegen #f4efe4-Seite).
> **Angebots-Detailseite gleich behandelt (2026-06-09):** `capacity_exchange_detail.html` Inline-`<style>`: `.ce-section`
> (alle Abschnitts-Karten PERSONALANGEBOT/ZEITRAUM/STANDORT/VERTRAUENSSIGNALE/COMPLIANCE…) `rgba(255,255,255,.025)` →
> `#fffdf6` raised + gleicher warmer Schatten; `.ce-hero` → `#fffdf6`; `.ce-match-card` → `#f4efe4`-Inset; Hairlines/Track
> (`.ce-interaction-item`, `.ce-completeness__bar`) → Forest-Alpha. Selber Look wie der Feed (Marktplatz-Flow konsistent).

> **Default-Flip 2026-06-08 (Owner-Request):** Editorial ist jetzt der **plattformweite Default**
> (vorher `dark`). Umgesetzt in `theme.js` über ein **Explicit-Choice-Modell**: Der Default wird
> **ohne Persistierung** gesetzt; nur eine aktive Theme-Wahl schreibt `localStorage` (`tempconnect-theme`)
> + Marker `tempconnect-theme-explicit="1"`. Grund: `apply()` persistierte früher bei **jedem**
> `initFromStorage()` — ein Rückkehrer hatte also `"dark"` auto-fixiert und wäre beim reinen
> Default-Flip dunkel geblieben. Jetzt folgen Nicht-Wähler dem **Live-Default**; ein alter
> `dark`-Wert ohne Marker wird ignoriert. Konfigurierbar über `defaultTheme`, sicherer
> `dark`-Fallback wenn `editorialEnabled:false`. Test: `api/test/themeRegistry.test.js` (15/15).

> **Kritischer Fix 2026-06-07 (Render-Blocker behoben):** Der gesamte Editorial-Token-Block
> (`[data-theme="editorial"] { --ds-bg:#faf7ee … }`, design-system.css ~1906–2049) wurde vom
> **CSS-Parser stillschweigend verworfen** — ein versehentliches `*/` im Kommentar darüber
> (Zeile 1901, Text `--ds-*/--tc-*`) **schloss den Kommentar zu früh**; der danach „leckende"
> Kommentartext bildete einen ungültigen Selektor, der den kompletten Token-Block `{…}` als
> eine ungültige Regel mitverschluckte. Folge: **alle token-getriebenen Seiten blieben dunkel**
> (`--ds-bg` fiel auf den `:root`-Dunkelwert `#0a0f1e` zurück) — nur `landing.html` sah korrekt
> aus, weil `landing-lex.css` eigene Editorial-Regeln mitbringt. Das war die Ursache von
> „man sieht noch nichts". Fix: `*/` aus dem Kommentar entfernt (1 Zeile). Browser-verifiziert:
> Token-Regel wird jetzt geparst (Sheet 350→351 Regeln), `pricing.html` + `about.html` rendern
> Cremegrund + Forest-Serif-Headlines. **Lehre:** „CSS wird ausgeliefert" (curl/grep) ≠ „CSS
> wird geparst/gerendert" — Theme-Rollouts immer im Browser gegen `getComputedStyle` prüfen.

## Ziel
Den "LEX"-Editorial-Look (Forest/Cream/Wine/Gold, Serif-Headlines, redaktionelles Layout)
plattformweit als **Standard-Theme** etablieren — alle vier Themes (`editorial` = Default,
`dark`/Classic, `light`, `ultra_premium`) bleiben **wählbar**. Token-getrieben, reversibel,
zukunftssicher.

## Architektur-Entscheidung (ADR)
- Editorial ist ein **vierter `data-theme`-Eintrag** im bestehenden Token-System
  (`theme.js`-Registry + Theme-Block in `design-system.css`). **Keine 88 Einzel-Reskins.**
- Jede Seite, die `--ds-*`/`--tc-*`-Tokens nutzt, erbt den Look **automatisch**.
- **Serif nur auf Headlines** (`--ds-font-display`); Body/Tabellen bleiben Sans —
  Lesbarkeit/Dichte auf Arbeits-Seiten bleibt erhalten.
- **Plattform-Default + wählbar + persistent** über den vorhandenen `theme.js`-Umschalter.
  **Default ist `editorial`** (seit 2026-06-08). Der Default wird **ohne Persistierung** gesetzt;
  nur eine **explizite** Wahl schreibt `localStorage` (`tempconnect-theme` + Marker
  `tempconnect-theme-explicit`). Nicht-Wähler folgen dem Live-Default; ein alter auto-persistierter
  `dark`-Wert ohne Marker wird ignoriert. Classic + Light + Ultra bleiben unverändert wählbar.
- **Gated** über `window.__TC_THEME_FLAGS__` (Tier-2 Env-Kill-Switch, Default an):
  `editorialEnabled:false` nimmt Editorial aus der Registry **und stellt den `dark`-Default
  sauber wieder her**; `defaultTheme:"…"` setzt einen anderen Plattform-Default. Konsistent mit
  `ultra_premium`.
- Selbst-enthaltene System-Fonts (kein externer Request → CSP `font-src 'self'`-safe, DSGVO-safe).

## Rollback
- Editorial-Block aus `design-system.css` + Registry-Eintrag aus `theme.js` entfernen → weg.
- Oder per Env `editorialEnabled:false` deaktivieren → der Plattform-Default fällt **automatisch
  auf `dark` (Classic)** zurück, andere Themes bleiben unberührt.
- Oder nur den Default drehen ohne Editorial zu entfernen: `defaultTheme:"dark"`.

## Phasen
- [x] **Phase 0 — Fundament**: `[data-theme="editorial"]`-Token-Block in `design-system.css`
      (vollständiger Spiegel des Light-Blocks, umgefärbt) + Registrierung in `theme.js`
      (Registry, Icon, Gating) + Serif-Headline-Regel.
- [x] **Phase 1 — Landing-Harmonisierung**: `landing-lex.css` von `.design-lex` auf
      `[data-theme="editorial"]` umgestellt; Landing-eigener Schalter + FOUC-Guard entfernt
      (jetzt global via `theme.js`). Eine Mechanik für alle Seiten.
- [x] **Phase 2 — Public/Marketing**: pricing, about, legal/*, trust/*, worker-login,
      demo, enterprise(_anfrage), onboarding. **Erben Editorial automatisch** über die
      `enterprise.css`→`design-system.css`-Token-Kaskade (alle laden `theme.js`).
      Keine Einzel-Reskins; Cream-Lesbarkeit geprüft.
- [x] **Phase 3 — Anwendungs-Seiten + Hardcoded-Hex**:
      - Einsatzportal-Cluster (7 Seiten, eigener `--ep-*`-Namespace): `[data-theme="editorial"]`-
        Block in `einsatzportal.css` ergänzt (Spiegel des Light-Blocks + Badge/Alert-Lesbarkeit auf Cream).
      - **Feinheiten-Pass 2026-06-08 (Einsatzportal):** Elemente mit hartkodiertem Dunkel, die nicht
        token-getrieben waren und auf Cream falsch blieben: Bottom-Nav (`rgba(8,13,26,.97)`),
        Lade-Skeleton (`#1a243a`-Shimmer), Logo/Avatar-Gradient (`…,#7c5cff` blau→lila) →
        je `[data-theme]`-Override (Bottom-Nav/Skeleton **auch für Light** — dort war derselbe
        Dunkel-Bug latent, da nur die Topbar einen Light-Override hatte; Logo→Forest/Wine nur editorial).
        Zusätzlich: blaue Flächen-Tints (`.ep-detail-head`, `.ep-notif-icon`) → Forest-Tints,
        `--ep-surface-alt` für Editorial definiert (Doc-Kacheln). Und: globaler Floating-Theme-
        Switcher (`#tc-theme-floating-root`, theme.js) überlappte auf Mobile das letzte Nav-Item
        „Profil" → in `einsatzportal.css` per `@media(max-width:1023px)` über die Bottom-Nav gehoben
        (`calc(72px+16px)`, `html`-Präfix schlägt theme.js' zur Laufzeit injizierte `#id.class`-Regel).
        Browser-verifiziert (getComputedStyle, alle 3 Themes; Dark byte-identisch).
      - `timesheets.css`: 8 Hardcoded-Status-Hex → `--ds-*`-Token (verbessert **alle** Themes, nicht nur Editorial).
      - `marketplace-feed.css`: additive Editorial-Overrides für Supply/Demand-Type-Badges
        (Cream-Kontrast); Gold-Premium-Akzente bewusst belassen (harmonieren mit LEX).
      - `admin-panel.css`: additive Editorial-Overrides für die pale "Glow"-Card-State-Badges.
        Hinweis: dieselbe interne Seite nutzt Legacy-`rgba(255,255,255,…)`-Card-Surfaces, die auf
        **light UND editorial** verflachen (vorbestehend) — separater interner-Tooling-Polish, hier außer Scope.
      - `executive-dashboard.css` + `internal-control-center.css`: **kein Change nötig**
        (Hex ausschließlich in `[data-theme="light"]`-Blöcken bzw. `var(--ds-*, #fallback)`-Fallbacks).
- [~] **Phase 4 — Interne React-SPAs (Owner-Entscheidung offen)**: OCC, Staff-SCC, Support-Ops sind
      **separat gebaute Vite-Apps mit eigenen Theme-Systemen** (eigener `scc-theme`-Key, hartkodierte
      `dark|light|ultra_premium`-Registry in TS, serverseitiges Enable-Flag; `scc.css` importiert
      design-system.css **nicht**). OCC + Support-Ops sind **Single-Theme** (kein `data-theme`-Umschalter).
      Editorial erreicht sie **nicht** automatisch. Erweiterung = pro-SPA TS+CSS + **Vite-Rebuild** der
      getrennten Session-Welten → **owner-gated** (CLAUDE.md: Architektur / Trennung der Session-Welten).
      Die kundenseitige Plattform ist davon unabhängig vollständig abgedeckt.
- [x] **Phase 5 — Härtung (A11y-Stichprobe)**: WCAG-AA-Kontrast Editorial auf Cream `#faf7ee`:
      Body `#14201a` ~15:1 (AAA) · Sekundär `#5b5447` ~7.0:1 (AA) · Brand/Headline `#1f3a2e` ~11.5:1 ·
      Success `#2d6a4f` ~6.0:1 · Warning `#8a5f1a` ~5.3:1 · Danger `#8f2d2d` ~7.6:1 — alle ≥ AA.
      Einzig Tertiär/Muted `#8a8270` ~3.6:1 (nur AA-Large) — gewollte De-Emphasis, parallel zu
      Tertiär in dark/light/ultra. Serif nur auf Headlines; Body bleibt Sans → Dichte erhalten.

## Geänderte Dateien (Phase 0–5)
**Phase 0+1 (Fundament + Landing):**
- `frontend/public/css/design-system.css` — `[data-theme="editorial"]` Block (Token-Remap + Komponenten-Overrides + Serif-Headlines)
- `frontend/public/js/theme.js` — Editorial in Registry + Icon + `editorialEnabled`-Gate
- `frontend/public/css/pages/landing-lex.css` — Scope `.design-lex` → `[data-theme="editorial"]`
- `frontend/landing.html` — Landing-eigener Schalter + FOUC-Guard entfernt (global via theme.js)
- `frontend/public/css/pages/landing.css` — toter `.design-switch`-Block entfernt

**Phase 3 (Anwendungs-Seiten + Hardcoded-Hex):**
- `frontend/public/einsatzportal.css` — `[data-theme="editorial"]` Block (`--ep-*`-Namespace) + Badge/Alert-Cream-Lesbarkeit
- `frontend/public/css/pages/timesheets.css` — 8 Status-Hex → `--ds-*`-Token (Badges + Action-Buttons)
- `frontend/public/css/pages/marketplace-feed.css` — additive Editorial-Overrides (Supply/Demand-Type-Badges)
- `frontend/public/css/pages/admin-panel.css` — additive Editorial-Overrides (pale Card-State-Badges)

**Phase 6 (Einheitlichkeit / Accent-Leaks — 2026-06-08, uncommitted):** systematischer Sweep
(`#4a9eff`/`#7c5cff` in `frontend/public/**` JS+HTML+CSS) gegen verbleibende **hartkodierte**
Brand-/Accent-Blautöne, die auf Cream nicht mitliefen. Fix-Muster: Rohwert → `var(--ds-*,<roh>)`
(byte-identisch in dark, korrekt in editorial/light/ultra). Klassifikation: **gefixt** = sichtbare
Navigations-/Surface-Akzente; **gelassen** = semantische Farben (Plan-/Rollen-Badges, Chart-/KPI-Serien,
Status-/Priorität-Skalen, Approval-Dots) + bespoke Vollschwarz-Seiten + Landing-Auth-Modal (Referenz).
- `frontend/public/css/design-system.css` — neues Token `--ds-brand-ring` in **allen vier** Theme-Blöcken
  (`:root`/dark `rgba(74,158,255,.35)`, light `rgba(29,78,216,.30)`, ultra `rgba(95,168,255,.38)`, editorial `rgba(31,58,46,.30)`)
- `frontend/public/js/pageShell.js` — `.tc-shell-user__btn` (Profil-Button auf **jeder** Shell-Seite) Border/BG/Color + Hover + „Enterprise"-Label tokenisiert
- `frontend/public/js/userDropdown.js` — Login-/Profil-bearbeiten-Links → `var(--ds-brand,…)`
- `frontend/public/js/notifications.js` — ungelesener-Eintrag Akzent-Border → `var(--ds-brand,…)`
- `frontend/public/{legal/agb,trust/security,trust/compliance,trust/platform-sla,trust/status}.html` — statische `#tc-user-btn`-Kopien tokenisiert (5×)
- `frontend/public/einsatzportal.css` — `.profil-avatar` zur Editorial-Forest→Wine-Override-Regel ergänzt (war Forest→Purple)
- `frontend/public/marketplace_demand_detail.html` — „Meine Deals"-Link → `var(--ds-brand,…)`

**Phase 6 — bewusst offen (kein Half-Fix; > „minimale Unterschiede", Owner-Priorisierung):**
- `compliance_overview.html` — strukturelle `rgba(255,255,255,…)`-Fills + `#eaeff8`-Text (Dark-Surface-Annahme); braucht **vollen** Editorial-Pass (Dutzende Werte, betrifft dark/light), nicht 2 Blau-Zeilen
- `api-docs.html`, `timesheet-templates.html` — bespoke, vollständig token-umgehende Dark-Seiten (konventionell dunkel); Reskin = Per-Seite-Neubau

**Render-Verifikation (Browser, 2026-06-08):** Dev-Server Port 4178 + Preview, `getComputedStyle` mit
deaktivierter Transition. `#tc-user-btn` (trust/security.html): dark `rgb(74,158,255)`/`rgba(…,.12)`/`rgba(…,.35)`
**byte-identisch** zum Original · editorial Forest `rgb(31,58,46)` auf Cream · light `rgb(29,78,216)` · ultra
`rgb(95,168,255)` — Color+BG+Ring tracken in **allen** Themes kohärent. `.profil-avatar` (einsatzportal-profil.html):
editorial Forest→Wine `rgb(31,58,46)→rgb(122,46,46)`, dark Blau→Purple unverändert. `node --check` der 3 JS-Dateien OK.

**Phase 7 (Shared-CSS-Komponenten + „dunklere Kästchen" — 2026-06-08, uncommitted):** Owner-Feedback aus
Landing-Screenshots: (a) Buttons/Kästchen-**Farben + Schriftfarben** an den Landing-Referenz-Look angleichen,
(b) **alles durchscheinende Blaue** aus der Plattform entfernen (auch schwache Tints, vorher als vernachlässigbar
belassen), (c) Plattform soll **dunkle Forest-Kästchen** bekommen wie Landings `.tc-final-cta`-Panel. Befund: die
Rest-Blautöne saßen **nicht** in `design-system.css` (dort bereits umfassend editorial-überschrieben), sondern in
**geteilten Komponenten-Stylesheets**. Fix-Muster: durchgängig **`[data-theme="editorial"]`-scoped Override-Regeln**
(keine Inline-Tokenisierung) — die bestehenden Token-Opazitäten (z. B. `--ds-brand-muted` = .12) treffen die in den
Komponenten-Regeln benutzten spezifischen Werte (.08/.10/…) **nicht**; Tokenisieren würde dark **still verschieben**.
Editorial-scoped Overrides lassen dark/light/ultra **100 % unberührt** und sind reversibel.
- `frontend/public/css/enterprise.css` — Editorial-Abschnitt für Hub-Chrome (forest/wine/cream): `hub-card--locked`-CTA,
  Priority-Banner-Flächen/Pills/Aside, `tc-nudge--publish`, `tc-onboarding`-Box/Progress. **Highlight — die „dunklere
  Kästchen": `.tc-priority-banner--pilot` als Forest-Deep-Signatur-Panel** (`#15291f` BG, Gold-Eyebrow `#b8935a`,
  Cream-Heading `#faf7ee`, Cream-Body `#ebe4d3`, Cream-Outline-Pills/Aside) — exakt das Landing-`.tc-final-cta`-Muster,
  auf der sichtbarsten Hub-Fläche (eine Signatur-Dunkelfläche statt alles abzudunkeln, wie Landings Zurückhaltung).
- `frontend/public/css/approval-badges.css` — Editorial-Abschnitt re-tont **alle** Badge-Textfarben (waren helle Pastelle
  `#c2e0ff/#fff3c2/#ddd0ff` für Dark-Grund) zu Dunkeltönen für Cream-Kontrast + Blau→Forest, Lila→Wine, Weiß-Alpha→Forest:
  in-review/customer/pending/approved/rejected/correction/completed/expired (Text+BG+Border+Dot je); Buttons
  (`.approval-btn`/`--approve`/`--reject`/`--review`); Surfaces (`.approval-item`/`__icon`/`.approval-kpi`/
  `.approval-filter-pill`/`--active`/`.approval-reason` Fokus).
- `frontend/public/css/pages/executive-dashboard.css` — `.dash-onboarding-banner` Blau→Lila-Gradient → Forest→Wine-Tint.
- `frontend/public/css/pages/internal-control-center.css` — `.icc-tab.active` Blau-Fill → Forest-Tint.
- `frontend/public/css/pages/admin-panel.css` — `.admin-card-action--primary` Blau-Akzent → Forest (orthogonal; die
  breitere Weiß-Alpha-Surface-Verflachung bleibt dokumentierter interner-Tooling-Polish außer Scope, **kein** Half-Fix).
- `frontend/public/css/design-system.css` — `.ds-topbar__brand-dot`-Glow (hartkodiertes Blau, der einzige im Editorial-Block
  noch nicht überschriebene Komponenten-Rest) → Forest-Halo `rgba(31,58,46,.08)`.

**Render-Verifikation Phase 7 (Browser, 2026-06-08):** `getComputedStyle` auf `/public/pricing.html` mit injizierten
Stylesheets (enterprise.css + approval-badges.css) + Test-Markup (Priority-Banner + Approval-Badges). Editorial:
Banner `rgb(21,41,31)` Forest-Deep, Eyebrow `rgb(184,147,90)` Gold, Title `rgb(250,247,238)` Cream, Pills Cream-Outline,
in-review Forest, customer Wine, pending Dunkelgold, Review-Button Forest — **blueHits: [] (null Blau)**. **Dark
byte-identisch** geprüft (gleiches Markup, `data-theme="dark"`): Banner `linear-gradient(135deg, rgba(74,158,255,.06),
rgba(124,92,255,.03))`, Border `rgba(74,158,255,.22)`, Pill `rgba(74,158,255,.08)`, in-review `rgb(194,224,255)`/Dot
`rgb(74,158,255)`, customer-Dot `rgb(124,92,255)`, Review-Btn `rgba(74,158,255,.15)` — alle Originalwerte exakt erhalten.

**Phase 8 (Per-Seite Inline-`<style>` — Exemplar pricing.html — 2026-06-08, uncommitted):** Owner-Feedback: Plattform-
Kästchen sollen **dunkler wie landing.html** + restliches durchscheinendes Blau weg. Befund: viele Marketing-/App-Seiten
tragen **eigene Inline-`<style>`-Blöcke** mit hartkodierten `rgba(74,158,255,…)`/`rgba(124,92,255,…)` **und**
`rgba(255,255,255,0.0x)`-Flächen (Dark-Surface-Annahme → auf Cream **unsichtbar**, Karten wirken flach/blass). Diese
erben Editorial **nicht** über Tokens. Inventar-Sweep (`rgba(74,158,255|124,92,255` in `frontend/public/**/*.html`):
**38 Seiten / 118 Vorkommen.**
- **pricing.html** (Exemplar, vollständig + browser-verifiziert) — Inline-`<style>` um einen `[data-theme="editorial"]`-
  Block ergänzt, der landing.html **1:1 spiegelt**: Body-Glow Blau/Lila→Forest/Gold; Karten (`.plan-card`/`.vp-card`/
  `.faq-item`/`.pricing-tier-card`) → **Cream-Warm `#ebe4d3`** („dunklere Kästchen", waren `rgba(255,255,255,.02)`);
  **`.plan-card--recommended` → Dark-Forest-Inset** `#15291f` mit Cream-Typo + Gold-Bullets + Gold-Badge + Cream-CTA-
  Button (exakt landings `.plan-card--recommended`-Signatur); `.plan-card--enterprise` → Wine-Akzent; Comparison-
  `thead th` → Forest-Header; `.vp-card__tag` + `.audience-toggle__btn--active` → Forest; `.pilot-standard-band` →
  Forest→Wine-Tint; `.pricing-error__title` Hell-Pink→Wine. Fix-Muster wie Phase 7 (scoped Override, **kein** Entfernen
  der Rohwerte → dark byte-identisch).
- **Verifikation (Browser, getComputedStyle, Dev-Server 4178):** Editorial → Recommended-Inset `rgb(21,41,31)`, Name
  `rgb(250,247,238)`, Desc `rgb(235,228,211)`, Bullets/Badge `rgb(184,147,90)` Gold, CTA `rgb(250,247,238)` BG/
  `rgb(21,41,31)` Text, vp-Card `rgb(235,228,211)` Cream-Warm, Tag/Toggle Forest, Band Forest→Wine — **blueHits: []**.
  Dark byte-identisch: Body blau/lila-Radials zurück, `.plan-card--recommended` `rgba(74,158,255,.04)`, vp-Card
  `rgba(255,255,255,.016)`, Tag `rgba(74,158,255,.08)`, Bullet `rgb(52,211,153)` — alle Originalwerte erhalten.

**Phase 8 — Batch 1 Public/Marketing (6 Seiten — erledigt 2026-06-08, uncommitted):** Gleiches scoped-Override-Muster
wie pricing.html, je Seite ein `[data-theme="editorial"]`-Block ans Inline-`<style>` angehängt (append-only, Rohwerte
unangetastet → dark byte-identisch).
- `enterprise_anfrage.html` — Body-Glow→Forest/Gold; `.ent-card`→Cream-Warm `#ebe4d3`; `.addon-item`/`.form-input`/
  Seat-Inputs→`#fffdf6`; blaue `.addon-item.selected`+`:hover`+`:focus`→Forest-Tint; `.self-service-cta`→Forest→Wine-Band.
- `onboarding.html` — `.ob-step`→Cream-Warm `#ebe4d3`; `.ob-step__num` Blau-Rand→Forest (BG/Text via Token autom. Forest);
  `.role-card`→`#fffdf6` + Inline-Blau-Rand via `!important` neutralisiert. (Rest: 4 Mini-Stat-Boxen `rgba(255,255,255,.02)`
  = 2% Weiß auf Cream ≈ unsichtbar, kein Blau → bewusst belassen.)
- `hilfe.html` — `.help-card`/`.faq-item`→Cream-Warm; `.faq-q:hover`→Forest-Tint; **Inline-Blau-Band**
  `#onboarding-checklist > div` (`rgba(74,158,255,.03/.15)`) via `> div { … !important }` auf Forest-Tint umgestellt.
- `organization.html` — `.occ-card`/`.occ-stat`/`.occ-loc-card`/`.occ-tab` Weiß-Alpha→`#ebe4d3`/Rand `#d4cab3`; blaue
  `.occ-tab--active`→Forest; Tabellen-Hairlines→Forest-Alpha; `.occ-edit-row`→Forest-Tint. (Modal/Input/Key-Display
  = Schwarz-Alpha, nicht in Scope.)
- `company_profile_public.html` — `.pp-row`-Hairline→Forest-Alpha; `.pp-tag`/`.pp-score`/`.scr-input`→`#fffdf6`;
  `.scr-cta-card`→Cream-Warm; lila `.scr-input:focus`→Wine-Tint.
- `worker-profile-public.html` (am stärksten dark) — Dark-Body `#0a0f1e`→Paper `#faf7ee`/Ink; **`.hero` bekommt die
  Dark-Forest-Signatur** (`#15291f`, h1→Cream, p→`#ebe4d3`); `.card`/`.qual-item`→Cream-Warm/`#fffdf6`; blaue `.chip`→Forest;
  `.error`-BG→Cream (rote Semantik erhalten). Kein unsichtbarer Hell-Text (einzige Quelle = Body-Color, überschrieben).
- **Verifikation:** Statisch (Grep) — alle 6 Blöcke append-only/scoped, **keine Inline-Blau-Reste** (außer dem nun
  gefixten hilfe-Band), kein unsichtbarer Text. Browser (4178, onboarding.html): Editorial → `.ob-step` `rgb(235,228,211)`,
  `.role-card` `rgb(255,253,246)`, `.ob-step__num` Forest `rgba(31,58,46,.1)`, Body Paper — **kein Blau**; Dark byte-identisch
  (`.ob-step`/`.role-card` `rgba(255,255,255,.02)`, `.ob-step__num` `rgba(74,158,255,.12)` zurück).

**Phase 8 — offenes Inventar (gleiches Muster, per-Seite-Pass, Owner-Priorisierung):**
- *Bespoke Vollschwarz (Owner: vorerst außer Scope):* `api-docs.html`, `timesheet-templates.html`, `compliance_overview.html`.
- *Kundenseitig Marketing/Public:* ✅ **erledigt (Batch 1, s. o.)** — `enterprise_anfrage.html`, `onboarding.html`,
  `organization.html`, `company_profile_public.html`, `worker-profile-public.html`, `hilfe.html`.
- *Workforce-App:* `requisitions.html`, `offer_detail.html`, `bounties.html`, `deal_management.html`, `vendor_pool.html`,
  `rate-cards.html`, `spend-analytics.html`, `supplier_scorecard.html`, `activity.html`, `marketplace_demand_detail.html`,
  `data-governance.html`, `integrations.html`, `sso_config.html`, `system-health.html`.
- *Abo/SLA:* `sla_abo.html` (14 Vorkommen — am schwersten), `sla_profil.html`.
- *Einsatzportal (worker, `--ep`-Namespace, Shared-CSS in Phase 3 erledigt — Inline-Reste offen):* `einsatzportal-dashboard.html`,
  `einsatzportal-benachrichtigungen.html`, `einsatzportal-kontakt.html`, `einsatzportal-einsaetze.html`,
  `einsatzportal-profil.html`, `einsatzportal-stundenzettel.html`.

**Verifikation:** `tempconnect_frontend` (bind-mount) serviert alle Edits live (curl-geprüft);
design-system Editorial-Block 51 Marker, einsatzportal 27 Marker. Keine SPA-Rebuilds nötig (Static-Plattform).
**Render-Verifikation (Browser, 2026-06-07):** Statischer Dev-Server (`.claude/preview-server.js`,
Port 4178, Root `frontend/`, no-cache) + Preview-Browser. Geprüft: `getComputedStyle` —
`pricing.html` und `about.html` unter `data-theme="editorial"` → `--ds-bg #faf7ee`, body
`rgb(250,247,238)` Creme, Text `rgb(20,32,26)` Forest, Serif-Headlines; Token-Regel im
geparsten Stylesheet vorhanden (Index 308). Damit ist der oben beschriebene Parser-Render-Blocker
nachweislich behoben — curl/grep allein hätte ihn (erneut) übersehen. `.claude/` bleibt aus dem
Release-Artefakt ausgeschlossen.

## Test/Verifikation
- Editorial via globalen Umschalter wählbar; `dark`/`light`/`ultra_premium` unverändert erreichbar.
- Plattform-Default ist `editorial` (seit 2026-06-08); Nicht-Wähler folgen dem Live-Default ohne Persistenz, explizite Wahl (`tempconnect-theme-explicit`) bleibt erhalten. Rollback: `editorialEnabled:false` → Default fällt sauber auf `dark` zurück.
- Reversibel: Theme wechseln, oder `editorialEnabled:false`, oder Block/Registry entfernen.
