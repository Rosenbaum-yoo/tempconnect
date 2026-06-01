# TempConnect — noindex-Entscheidungen pro Surface

> Erstellt: 2026-05-28 | Go-Live-Gate G
> Referenz: `99_GOLIVE_GATE.md` Abschnitt G — "noindex-Entscheidung pro Surface dokumentiert"

---

## Legende

| Symbol | Bedeutung |
|---|---|
| ✅ index | Seite soll von Suchmaschinen indexiert werden |
| 🚫 noindex | `<meta name="robots" content="noindex, nofollow">` gesetzt |
| ⚠️ offen | Entscheidung ausstehend oder Seite noch nicht geprüft |

---

## 1. Öffentliche Marketing-/Landing-Seiten (index erwünscht)

| Seite | Status | Begründung |
|---|---|---|
| `index.html` / `/` | ✅ index | Haupteinstieg — SEO-kritisch |
| `enterprise.html` | ✅ index | Marketing für Enterprise-Kunden |
| `about.html` | ✅ index | Über TempConnect |
| `capacity_exchange_feed.html` | ✅ index | Öffentlicher Marktplatz-Teaser |
| `pricing.html` / `plans.html` | ✅ index | Preisseite |
| `trust/security.html` | ✅ index | Sicherheits-Trust-Seite |
| `trust/compliance.html` | ✅ index | Compliance-Trust-Seite |
| `trust/platform-sla.html` | ✅ index | SLA-Übersicht (enthält "ohne Gewähr"-Disclaimer) |
| `trust/status.html` | ✅ index | Öffentliche Statusseite |

---

## 2. Legal-Seiten (index erwünscht — Pflicht nach §5 TMG)

| Seite | Status | Begründung |
|---|---|---|
| `legal/impressum.html` | ✅ index | Impressumspflicht — muss findbar sein |
| `legal/datenschutz.html` | ✅ index | Datenschutzerklärung — muss findbar sein |
| `legal/agb.html` | ✅ index | AGB — öffentlich zugänglich |
| `legal/sla.html` | ✅ index | SLA-Anlage — öffentlich zugänglich |
| `meine-agb.html` | 🚫 noindex | Konto-spezifische AGB-Ansicht — kein Index-Wert |

---

## 3. Öffentliche Profile (noindex — DSGVO)

| Seite | Status | Begründung |
|---|---|---|
| `worker-profile-public.html` | 🚫 noindex | **Personenbezogene Daten (DSGVO Art. 6)** — Indexierung ohne Einwilligungs-Tracking nicht zulässig. `noindex` hinzugefügt 2026-05-28. |
| `company_profile_public.html` | ✅ index | Firmenprofile sind legitim öffentlich (B2B-Marketing). Kein personenbezogener Fokus. Indexierung erwünscht. |

**Hinweis Worker-Profile:** Wenn Consent-Tracking (Art. 6 Abs. 1 lit. a DSGVO) eingeführt wird, kann `noindex` für Profile mit expliziter Einwilligung entfernt werden.

---

## 4. Staff Control Center (noindex — intern)

| Seite | Status | Begründung |
|---|---|---|
| `staff/staff.html` | 🚫 noindex | Internes Tool — bereits gesetzt: `noindex, nofollow` |

---

## 5. App-Seiten (auth-geschützt — noindex nachrangig)

Auth-geschützte Seiten sind für Suchmaschinen generell nicht erreichbar (kein Login-Redirect kann gecrawlt werden). Ein expliziter `noindex`-Tag ist zusätzliche Absicherung aber nicht P0.

| Bereich | Status | Hinweis |
|---|---|---|
| Hub (`hub.html`, `dashboard.html` etc.) | ⚠️ Kein explizites noindex | Auth-Guard verhindert Indexierung praktisch. P2: explizites `noindex` hinzufügen. |
| Admin Panel (`admin_panel.html`) | ⚠️ Kein explizites noindex | Auth-Guard + requireAdmin. P2. |
| OCC (`/owner-control/`) | ⚠️ Kein explizites noindex | Separate Vite-App, kein direkter HTML-Zugriff ohne Auth. P2. |
| Executive Dashboard | ⚠️ Kein explizites noindex | Auth-geschützt. P2. |
| Spend Analytics | ⚠️ Kein explizites noindex | Auth-geschützt. P2. |

---

## 6. Sonstige öffentliche Seiten

| Seite | Status | Begründung |
|---|---|---|
| `login.html` | ✅ index | Login-Seite soll findbar sein |
| `register.html` | ✅ index | Registrierung soll findbar sein |
| `system-status.html` | ✅ index | Öffentlicher Status |
| `hilfe.html` | ✅ index | Help Center — nützlich für SEO |
| `data-governance.html` | ✅ index | Trust-Seite |
| `compliance_overview.html` | ✅ index | Trust-Seite |

---

## Offene Entscheidungen (P2, nach Go-Live)

1. **App-Seiten noindex**: Expliziter `<meta name="robots" content="noindex">` auf allen auth-geschützten Seiten als Defense-in-Depth. Keine sofortige P0-Priorität da Auth-Guard schützt.
2. **Worker-Profil Consent-Tracking**: Wenn DSGVO-konforme Einwilligung für öffentliche Profile eingeführt wird, `noindex` für einwilligende Profile entfernen.
3. **robots.txt prüfen**: Sicherstellen dass robots.txt `/staff/`, `/public/admin_*` und `/public/internal_*` ausschließt.
