# TempConnect Theme System (Editorial / Dark / Light / Ultra Premium)

**Stand:** Produktiv im Frontend umgesetzt (Design System + Enterprise + Landing/Auth; siehe unten). `html[data-theme]` wird global gesetzt; Worker-/Einsatzportal-Seiten nutzen ein separates Stylesheet (siehe Abschnitt unten). **Plattform-Default seit 2026-06-08: `editorial`** (LEX-Look) — siehe *Default & persistence*.

## Overview

- **Editorial (Default):** The "LEX" editorial look (forest/cream/wine/gold, serif headlines, editorial layout) applied when `html[data-theme="editorial"]` is set. **This is the platform-wide default** — visitors who never picked a theme see it. Token-driven like the others, fully selectable and reversible (see *Default & persistence* and *Registry & feature flags*).
- **Dark (Classic):** The original TempConnect look, `html[data-theme="dark"]` (and the `:root` token defaults in `design-system.css`). Still fully selectable; it is also the **safety fallback** if Editorial is gated off.
- **Light:** A dedicated B2B light palette is applied when `html[data-theme="light"]` is set.
- **Ultra Premium (opt-in):** A refined dark theme applied when `html[data-theme="ultra_premium"]` is set — deeper obsidian ground, sapphire-tinted glass surfaces, stronger elevation hierarchy and a subtle ambient depth. Only active once the user selects it.
- **No color inversion:** every theme is token-driven (`--ds-*`, `--tc-*`), not a filter.

## Files

| File | Role |
|------|------|
| `frontend/public/css/design-system.css` | Core tokens (`:root`), semantic aliases (`--bg`, `--card`, …), `--tc-*` surface tokens, components, **and** the full `[data-theme="light"] { … }` override block **at the end of the file** (after `:root`, cascade-safe — do not `@import` a separate light file before `:root`). |
| `frontend/public/css/enterprise.css` | Legacy Model B / wrap styles; uses `--tc-legacy-*` tokens for surfaces that must track both themes. |
| `frontend/public/css/pages/landing.css` | Marketing + auth modal; includes light overrides for `.am-*`, toasts, plan cards (loaded after `design-system.css` on the landing page). |
| `frontend/public/js/theme.js` | Applies stored theme on load, exposes `TC.theme`, mounts the toggle in topbars (with retries + `load` fallback if the nav appears late). |
| `frontend/public/js/pageShell.js` | After injecting the enterprise topbar, calls `TC.theme.mountIntoNav(nav)` so the toggle appears inside the shell. |

> **Hinweis:** Früher lag Light in `theme-light.css` und wurde per `@import` **vor** dem `:root`-Block eingebunden — das konnte dazu führen, dass Dark-Tokens die Light-Palette überschrieben. Light-Regeln stehen jetzt **am Ende** von `design-system.css`.

## Default & persistence

- **Keys:** `localStorage["tempconnect-theme"]` (the chosen theme) **and** `localStorage["tempconnect-theme-explicit"]` (set to `"1"` only once the user actively picks a theme).
- **Values:** `"editorial"` | `"dark"` | `"light"` | `"ultra_premium"`
- **Default:** `editorial`. The default is applied **without persisting** — only an explicit toggle / `set()` is written to storage and marked. So a visitor who never chose a theme always follows the **live** default, even after it changes. A stale auto-persisted value from the previous controller (e.g. `"dark"`) is **ignored**, because it carries no explicit-choice marker — this is what made the platform-wide default flip reach returning visitors instead of being shadowed.
- **Configurable:** `window.__TC_THEME_FLAGS__.defaultTheme` overrides the platform default (e.g. `"dark"`).
- **Fallback:** an unknown/disabled stored value, or a configured default that is gated off (e.g. `editorial` while `editorialEnabled:false`), resolves to `dark` on load.
- **Reset:** `TC.theme.resetToDefault()` clears the explicit choice so the visitor follows the platform default again.
- System `prefers-color-scheme` is **not** auto-applied.

## Public API (`TC.theme`)

```js
TC.theme.get();                 // "editorial" | "dark" | "light" | "ultra_premium"
TC.theme.set("dark");           // explicit choice: persist + mark + set html[data-theme] (unknown/disabled -> default)
TC.theme.list();                // [{ id, label }, …] — themes enabled right now
TC.theme.cycle();               // advance to the next enabled theme (the toggle button uses this)
TC.theme.toggle();              // backwards-compatible binary dark <-> light
TC.theme.resetToDefault();      // clear explicit choice -> follow the live platform default
TC.theme.DEFAULT;               // resolved default ("editorial", or the fallback when gated off)
TC.theme.STORAGE_KEY;           // "tempconnect-theme"
TC.theme.CHOICE_KEY;            // "tempconnect-theme-explicit"
TC.theme.mountIntoNav(navElement); // idempotent; used by page shell
TC.theme.ensureToggleMounted();    // find .ds-topbar__nav and mount if still missing
```

Event: `tc-theme-change` on `document` with `detail.theme`.

### Registry & feature flags

The available themes live in a small registry inside `theme.js` (`dark`, `light`, `ultra_premium`, `editorial`).
Availability **and the default** can be gated **without editing the file** via an optional global set before `theme.js` loads:

```html
<script>window.__TC_THEME_FLAGS__ = { switcherEnabled: true, ultraPremiumEnabled: true, editorialEnabled: true, defaultTheme: "editorial" };</script>
```

- `switcherEnabled: false` → the toggle is not mounted (a previously stored theme is still honored).
- `ultraPremiumEnabled: false` → Ultra Premium drops out of `list()`/`cycle()`, and a stored `ultra_premium` falls back to the default.
- `editorialEnabled: false` → Editorial drops out of `list()`/`cycle()`, and the platform default **cleanly reverts to `dark`** (the documented rollback path).
- `defaultTheme: "dark"` → pins a different platform default; an unknown or disabled value falls back to `dark`.
- The booleans default to **enabled** and `defaultTheme` to **`editorial`** when the global is absent.

> **Phase J / Block 2 — Status (2026-06-03):** Die Env-Kill-Switches `THEME_SWITCHER_ENABLED` /
> `ULTRA_PREMIUM_THEME_ENABLED` **sind umgesetzt** (Config-Taxonomie Tier-2, Default-AN; nur
> `false/0/no/off` schaltet ab): `api/config/index.js` liest sie, `api/config/envValidator.js`
> validiert sie gegen Boolean-Tokens (Fail-Fast bei Tippfehlern wie `=nein`), dokumentiert in
> allen `.env*.example`.
> **Geliefert wird bisher nur der SCC-Scope:** Die SCC-React-App (`frontend/src/staff/`) erhält die
> Flags über ihr **eigenes** Bootstrap (`/staff/api/.../bootstrap` → `data.theme`) und nutzt einen
> eigenen Topbar-Registry-Cycle + `localStorage["scc-theme"]` — **getrennt** von diesem
> Static-Page-System hier (`window.TC.theme`, `localStorage["tempconnect-theme"]`).
> **Owner-gated offen:** (a) Injektion derselben Flags in `window.__TC_THEME_FLAGS__` für die ~80
> statischen Seiten (`platform` / `worker_portal` — braucht erst einen Runtime-Config-Auslieferungsweg,
> kein Shared-Head/Bootstrap vorhanden); (b) das per-Scope **Theme-Control**-Modul (Vorschau / Reset /
> Audit, eigener Settings-Store/Migration).

## Toggle UI

- **Class:** `.tc-theme-toggle` inside `.tc-theme-toggle-wrap`
- **Placement:** First item in `.ds-topbar__nav` when a design topbar exists. **Erkennung:** Shell (`#tc-shell`), Marketing (`.ds-wrap`), `main`, sonst **erste** `.ds-topbar__nav` (z. B. statische Legal-Seiten unter `.wrap`). Nav in einem **ausgeblendeten** `#paywall` wird übersprungen, bis die Shell injiziert ist.
- **Ohne Topbar:** Seiten nur mit Worker-/Einsatzportal-Layout (kein `.ds-topbar__nav`, kein `#tc-shell`) bekommen einen **schwebenden** Button unten rechts (`#tc-theme-floating-root`); sobald eine echte Topbar erscheint, wird der Floating-Toggle entfernt.
- **Behaviour:** one button that **cycles through all enabled themes** (dark → light → ultra_premium → dark). `toggle()` stays a binary dark/light helper for callers that need it.
- **Icons:** Moon (☾) for dark, sun (☀) for light, sparkle (✦) for ultra_premium. `aria-pressed` is `true` whenever a non-default theme is active; `aria-label` announces the current theme and the next one.

## Tokens (short guide)

- **`--ds-*`:** Design-system semantic colors (background, text, brand, borders, shadows).
- **`--tc-*`:** Themeable surfaces (glass / table / legacy enterprise wrappers) that must track both modes without per-page hacks.
- **Legacy:** `--tc-legacy-*` is used by `enterprise.css` (`.topbar`, `.btn`, `.card`, `.modal`, inputs, paywall, etc.).

## Building new UI

1. Prefer `var(--ds-*)` and existing DS classes (`.ds-btn`, `.ds-card`, …).
2. For one-off surfaces, add a `--tc-*` token in `:root` **and** assign a light value under `[data-theme="light"]` **in the light block at the end of** `design-system.css`.
3. Avoid hard-coded `rgba(255,255,255,…)` in new CSS; it will not track light mode.

## Troubleshooting

- **Seite per Doppelklick (`file://`) geöffnet:** Skripte/CSS mit Pfaden wie `/public/js/theme.js` laden nicht zuverlässig. **Immer über HTTP** testen (z. B. Docker/nginx, `http://localhost:…`).
- **Toggle fehlt:** `TC.theme.ensureToggleMounted()` in der Konsole; prüfen, ob `.ds-topbar__nav` existiert (Shell muss initialisiert sein).
- **Light sieht aus wie Dark:** Hard-Reload (Cache); prüfen, ob nur **eine** Version von `design-system.css` geladen wird und der Light-Block **nach** `:root` steht.

## QA checklist

- [ ] Toggle on an enterprise page with `#tc-shell` (shell injects topbar).
- [ ] Toggle on `landing.html` (static `.ds-wrap` topbar).
- [ ] Reload: choice persists.
- [ ] Forms, tables, modals, badges readable in both themes.

## Worker / Einsatzportal

Pages using `worker.css` only (einsatzportal, worker login) are a separate, already light visual stack. They load `theme.js` for consistency but do not use the DS topbar toggle pattern unless a `.ds-topbar` is added later.
