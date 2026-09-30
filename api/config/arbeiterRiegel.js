/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WAS EINE ARBEITERSITZUNG AUF DER PLATTFORM-API ERREICHEN DARF (M2.6)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Owner-Entscheid 2026-09-03: ein Riegel auf dem v1-Router, **fail-closed**.
 * Eine neue Route ist fuer Arbeiter ZU, bis jemand sie hier eintraegt.
 *
 * WARUM NICHT ROUTE FUER ROUTE
 * M2.5 hat 64 Routen von Hand eingestuft und sechs Befunde geschlossen. Alle
 * sechs trugen dieselbe Falle: `mine` oder `me` im Pfad, gemeint war die ORG —
 * `/subscription-requests/mine`, `/subscription-documents/mine`,
 * `/profile-bounties/me`, dazu `/org/departments`, `/org/locations`,
 * `/deal-feedback/pending`. Eine Namenskonvention, die sechsmal in dieselbe
 * Richtung taeuscht, taeuscht auch beim siebten Mal. Sie hat beim Einstufen
 * auch mich getaeuscht. Genau davor schuetzt fail-closed und kein Urteil.
 *
 * Diese Datei ist voller Belege dafuer. `POST /me/plan` steht NICHT auf der
 * Liste: der Pfad sagt "mein Tarif", die Handlung kauft der ORGANISATION einen
 * Plan. `POST /me/active-org` sagt "meine Org" und wechselt den Mandanten.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WAS DIESE LISTE IST — UND WAS DAS M2.5-REGISTER IST
 * ─────────────────────────────────────────────────────────────────────────
 * Der Entscheid sagt: "Das Register aus M2.5 ist diese Liste." Beim Bauen kam
 * heraus, dass es das allein NICHT sein kann, und der Grund steht in seinem
 * eigenen Kopf: gemessen wurden nur Routen, die MANDANTENDATEN zurueckgaben.
 * Alles ohne Mandantenbezug fehlt darin — `GET /csrf`, `GET /skills/catalog`,
 * `GET /auth/sessions`, `GET /notifications/stream`. Genau diese ruft das
 * Einsatzportal. Waere das Register allein die Ausnahmeliste, haette der Riegel
 * am ersten Tag das Portal ausgesperrt.
 *
 * Deshalb zwei Verzeichnisse, die einander pruefen statt sich zu wiederholen:
 *
 *   arbeiterSitzung.json  WAS EINE SITZUNG SIEHT — Messung, 49 erlaubt / 15
 *                         geschlossen. Tatsache.
 *   diese Datei           WAS SIE ERREICHEN DARF — Entscheidung.
 *
 * `arbeiterRiegel.test.js` haelt beide gegeneinander: jeder `erlaubt`-Eintrag
 * der Messung MUSS hier durchkommen (sonst bricht der Riegel etwas, das als
 * unbedenklich belegt ist), und jeder `geschlossen`-Eintrag MUSS scheitern
 * (sonst ist der Riegel schwaecher als das, was schon gebaut ist).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DIE 41 AUS DER MESSUNG, DIE DAS PORTAL GAR NICHT RUFT
 * ─────────────────────────────────────────────────────────────────────────
 * Von den 49 gemessenen liegen 41 ausserhalb des Portal-Namensraums
 * (`/marketplace/my-offers`, `/credits/balance`, `/company-profile` …). Sie
 * sind als "eigene Daten" belegt, aber das Einsatzportal ruft keine davon.
 * Enger waere also moeglich.
 *
 * Sie stehen trotzdem drauf, und das ist bewusst: der Entscheid nennt das
 * Register ausdruecklich als Liste, und sie WEGZUNEHMEN waere eine
 * Verhaltensaenderung an etwas, das heute nachweislich funktioniert — eine
 * eigene Entscheidung, keine Nebenwirkung dieser hier. Wer spaeter enger
 * ziehen will, streicht sie hier und sieht sofort im Test, was das kostet.
 */

/**
 * Ein Eintrag:
 *   pfad      Pfad relativ zum v1-Router. Endet er auf "/", gilt er als
 *             PRAEFIX fuer alles darunter. `:name`-Abschnitte treffen genau
 *             einen Pfadabschnitt.
 *   methoden  Array von HTTP-Methoden oder "*" fuer alle.
 *   grund     Warum das offen ist. Pflicht — ein Eintrag ohne Grund ist eine
 *             Ausnahme, an die sich in einem Jahr niemand mehr erinnert.
 */
export const ERLAUBT = Object.freeze([
  /* ── Das Einsatzportal ────────────────────────────────────────────────
   * Der ganze Namensraum, alle Methoden. Er ist FUER den Arbeiter gebaut:
   * Einsaetze bestaetigen/ablehnen, Stundenzettel, Abwesenheit, Nachweise,
   * Verspaetung, Faehigkeiten, Benachrichtigungen.
   *
   * Die Abgrenzung traegt der Name und sie ist scharf: `/worker/` (Einzahl,
   * mit Schraegstrich) ist das Portal. `/workers/...` (Mehrzahl) und
   * `/worker-invites`, `/worker-submissions`, `/worker-billing`,
   * `/worker-assignment-links` sind die AGENTURSEITE — sie beginnen nicht mit
   * "/worker/" und fallen deshalb nicht unter dieses Praefix. Das ist kein
   * Zufall, sondern der Grund, warum hier ein Praefix ueberhaupt vertretbar
   * ist; ein Praefix "/worker" ohne Schraegstrich haette die halbe
   * Agentursteuerung geoeffnet. */
  { pfad: "/worker/", methoden: "*",
    grund: "Das Einsatzportal. Der Namensraum ist fuer den Arbeiter gebaut; die Agenturseite heisst /workers/ und /worker-*, beginnt also nicht mit '/worker/'." },

  /* ── Sitzung und Anmeldung ───────────────────────────────────────────── */
  { pfad: "/csrf", methoden: ["GET"],
    grund: "Ohne Token kein einziger Schreibvorgang. Das Portal holt ihn beim ersten Laden." },
  { pfad: "/auth/sessions", methoden: ["GET"],
    grund: "Die eigenen offenen Sitzungen (I 8.1.2). Ausschliesslich das eigene Konto." },
  { pfad: "/auth/logout", methoden: ["POST"],
    grund: "Abmelden. Ein Riegel, der das Abmelden sperrt, sperrt den Menschen ein." },
  { pfad: "/auth/logout-all", methoden: ["POST"],
    grund: "Alle eigenen Sitzungen beenden — der Notausgang bei verlorenem Geraet." },
  { pfad: "/auth/worker/accept-invite", methoden: ["POST"],
    grund: "Einladung annehmen. Kann mit bestehender Sitzung aufgerufen werden." },

  /* ── Die eigene Person ───────────────────────────────────────────────
   * NUR was wirklich dem Menschen gehoert. Der Pfad `me` ist hier kein
   * Ausweis: `/me/plan` und `/me/active-org` fehlen mit Absicht (siehe
   * GESPERRT_MIT_ABSICHT weiter unten). */
  { pfad: "/me", methoden: ["GET"],
    grund: "Das eigene Konto samt Mitgliedschaft. Jede Oberflaeche loest darueber die Sitzung auf." },
  { pfad: "/me/memberships", methoden: ["GET"],
    grund: "Die eigenen Mitgliedschaften — die des Menschen, nicht die der Org." },
  { pfad: "/me/onboarding-status", methoden: ["GET"],
    grund: "Der eigene Einstiegsfortschritt." },
  { pfad: "/me/onboarding-complete", methoden: ["POST"],
    grund: "Den eigenen Einstieg abschliessen." },
  { pfad: "/me/export", methoden: ["GET"],
    grund: "DSGVO-Auskunft ueber die eigenen Daten (Art. 15). Darf nie gesperrt sein." },
  { pfad: "/me", methoden: ["DELETE"],
    grund: "DSGVO-Loeschung des eigenen Kontos (Art. 17). Darf nie gesperrt sein." },
  { pfad: "/me/change-password", methoden: ["POST"],
    grund: "Das eigene Passwort. Ein Riegel davor waere ein Sicherheitsproblem, kein Schutz." },
  { pfad: "/me/profile", methoden: ["PUT"],
    grund: "Name, Anrede, Kontaktangaben der eigenen Person. Beruehrt keine Org-Daten; das Portal bearbeitet sein Profil sonst ueber /worker/me." },
  { pfad: "/me/totp/setup", methoden: ["POST"], grund: "Eigene Zwei-Faktor-Anmeldung einrichten." },
  { pfad: "/me/totp/verify", methoden: ["POST"], grund: "Eigene Zwei-Faktor-Anmeldung bestaetigen." },
  { pfad: "/me/totp/disable", methoden: ["POST"], grund: "Eigene Zwei-Faktor-Anmeldung abschalten." },
  { pfad: "/me/entitlements", methoden: ["GET"],
    grund: "Der Tarif der Traegerorg. ORG-Daten, und trotzdem offen: das Portal muss wissen, welche Funktionen es anbieten darf. Einzige Ausnahme dieser Art, so auch im M2.5-Register begruendet." },
  { pfad: "/me/entitlements/feature/:key", methoden: ["GET"],
    grund: "Dieselbe Auskunft fuer eine einzelne Funktion." },

  /* ── Faehigkeiten ────────────────────────────────────────────────────── */
  { pfad: "/skills/catalog", methoden: ["GET"],
    grund: "Der Faehigkeiten-Katalog. Plattformweit und ohne Mandantenbezug — das Portal braucht ihn fuer die Auswahl." },
  { pfad: "/skills/categories", methoden: ["GET"], grund: "Die Kategorien desselben Katalogs." },
  { pfad: "/skills/propose", methoden: ["POST"],
    grund: "Eine fehlende Faehigkeit vorschlagen. Erzeugt einen Vorschlag, keine Zuordnung." },

  /* ── Benachrichtigungen ──────────────────────────────────────────────── */
  { pfad: "/notifications", methoden: ["GET"], grund: "Die eigenen Benachrichtigungen." },
  { pfad: "/notifications/stream", methoden: ["GET"],
    grund: "Der Live-Kanal derselben Liste (SSE). Ohne ihn bleibt die Glocke stumm." },
  { pfad: "/notification-preferences", methoden: ["GET", "PUT", "PATCH"],
    grund: "Die eigenen Benachrichtigungseinstellungen." },

  /* ── Aus der Messung M2.5 uebernommen ────────────────────────────────
   * Alle als `eigen` belegt (WHERE user_id = $1). Das Portal ruft keine davon
   * — siehe Kopf dieser Datei, Abschnitt "DIE 41". */
  { pfad: "/activity-feed", methoden: ["GET"], grund: "M2.5 gemessen: eigene Ereignisse." },
  { pfad: "/approvals/my-pending", methoden: ["GET"], grund: "M2.5 gemessen: eigene offene Freigaben." },
  { pfad: "/capacity-exchange/entries", methoden: ["GET"], grund: "M2.5 gemessen: eigene Eintraege." },
  { pfad: "/capacity-exchange/feed", methoden: ["GET"], grund: "M2.5 gemessen: eigener Feed." },
  { pfad: "/capacity-exchange/my-analytics", methoden: ["GET"], grund: "M2.5 gemessen: eigene Auswertung." },
  { pfad: "/capacity-exchange/stats", methoden: ["GET"], grund: "M2.5 gemessen: eigene Kennzahlen." },
  { pfad: "/company-profile", methoden: ["GET"], grund: "M2.5 gemessen: eigenes Profil." },
  { pfad: "/company-profile/certifications", methoden: ["GET"], grund: "M2.5 gemessen: eigene Nachweise." },
  { pfad: "/company-profile/contacts", methoden: ["GET"], grund: "M2.5 gemessen: eigene Kontakte." },
  { pfad: "/company-profile/locations", methoden: ["GET"], grund: "M2.5 gemessen: eigene Standorte." },
  { pfad: "/credits/balance", methoden: ["GET"], grund: "M2.5 gemessen: credit_accounts WHERE user_id = $1." },
  { pfad: "/credits/transactions", methoden: ["GET"], grund: "M2.5 gemessen: eigene Buchungen." },
  { pfad: "/emergency/active", methoden: ["GET"], grund: "M2.5 gemessen: eigene Notfaelle." },
  { pfad: "/emergency/history", methoden: ["GET"], grund: "M2.5 gemessen: eigene Historie." },
  { pfad: "/marketplace/demand-requests", methoden: ["GET"], grund: "M2.5 gemessen: eigene Anfragen." },
  { pfad: "/marketplace/my-deals", methoden: ["GET"], grund: "M2.5 gemessen: eigene Abschluesse." },
  { pfad: "/marketplace/my-offers", methoden: ["GET"], grund: "M2.5 gemessen: eigene Angebote." },
  { pfad: "/marketplace/received-offers", methoden: ["GET"], grund: "M2.5 gemessen: eigene eingegangene Angebote." },
  { pfad: "/marketplace/watchlist", methoden: ["GET"], grund: "M2.5 gemessen: eigene Merkliste." },
  { pfad: "/match-alerts", methoden: ["GET"], grund: "M2.5 gemessen: eigene Treffermeldungen." },
  { pfad: "/mentoring/sessions", methoden: ["GET"], grund: "M2.5 gemessen: eigene Sitzungen." },
  { pfad: "/milestones/me", methoden: ["GET"], grund: "M2.5 gemessen: eigene Meilensteine." },
  { pfad: "/my/listings", methoden: ["GET"], grund: "M2.5 gemessen: eigene Eintraege." },
  { pfad: "/my/requests/received", methoden: ["GET"], grund: "M2.5 gemessen: eigene eingegangene Anfragen." },
  { pfad: "/my/requests/sent", methoden: ["GET"], grund: "M2.5 gemessen: eigene gesendete Anfragen." },
  { pfad: "/payment/history", methoden: ["GET"], grund: "M2.5 gemessen: eigene Zahlungen." },
  { pfad: "/product-releases", methoden: ["GET"], grund: "M2.5 gemessen: Produktmeldungen, ohne Mandantenbezug." },
  { pfad: "/profile-visibility/favorites", methoden: ["GET"], grund: "M2.5 gemessen: eigene Favoriten." },
  { pfad: "/ratings/pending", methoden: ["GET"], grund: "M2.5 gemessen: eigene offene Bewertungen." },
  { pfad: "/referral/code", methoden: ["GET"], grund: "M2.5 gemessen: eigener Werbecode." },
  { pfad: "/referral/status", methoden: ["GET"], grund: "M2.5 gemessen: eigener Werbestand." },
  { pfad: "/requests/export/csv", methoden: ["GET"], grund: "M2.5 gemessen: eigene Anfragen als Datei." },
  { pfad: "/search/recent", methoden: ["GET"], grund: "M2.5 gemessen: eigene letzte Suchen." },
  { pfad: "/sla/match-alerts", methoden: ["GET"], grund: "M2.5 gemessen: eigene Treffermeldungen." },
  { pfad: "/sla/search-jobs", methoden: ["GET"], grund: "M2.5 gemessen: eigene gespeicherte Suchen." },
  { pfad: "/support-requests", methoden: ["GET"], grund: "M2.5 gemessen: eigene Support-Anfragen." },
  { pfad: "/value-report", methoden: ["GET"], grund: "M2.5 gemessen: eigener Wertbericht." },
]);

/**
 * Was AUSDRUECKLICH nicht auf der Liste steht, obwohl der Pfad es nahelegt.
 *
 * Rein dokumentarisch — der Riegel ist fail-closed, diese Wege waeren auch ohne
 * diese Aufzaehlung zu. Sie steht hier, weil genau diese Pfade beim Einstufen
 * getaeuscht haben und es wieder tun werden: sie tragen `me` im Namen und
 * meinen die Organisation. Ein Test haelt fest, dass keiner von ihnen je auf
 * die Liste oben rutscht.
 */
export const GESPERRT_MIT_ABSICHT = Object.freeze([
  { pfad: "/me/plan", methoden: ["POST"],
    grund: "Sagt 'mein Tarif', kauft der ORGANISATION einen Plan. Ein Arbeiter koennte den Tarif seines Arbeitgebers aendern." },
  { pfad: "/me/plan/cancel", methoden: ["POST"],
    grund: "Dieselbe Handlung rueckwaerts — kuendigt den Tarif der Organisation." },
  { pfad: "/me/active-org", methoden: ["POST"],
    grund: "Wechselt den Mandanten der Sitzung. Ein Arbeiter gehoert zu genau einer Org." },
  { pfad: "/me/active-location", methoden: ["GET", "POST", "DELETE"],
    grund: "Standortwahl ist ein Org-Begriff. Ein Arbeiter hat keine erlaubten Standorte (rbacService.getAllowedLocationsForMembership gibt fuer role_key='worker' eine leere Liste zurueck)." },
  { pfad: "/me/onboarding-reset", methoden: ["POST"],
    grund: "Setzt den Einstieg zurueck — eine Verwaltungshandlung, kein Selbstbedienungsweg." },
]);

/* Ein Pfadabschnitt, der auf ":" beginnt, trifft genau einen Abschnitt. */
function trifftPfad(muster, pfad) {
  if (muster.endsWith("/")) return pfad.startsWith(muster);
  const m = muster.split("/");
  const p = pfad.split("/");
  if (m.length !== p.length) return false;
  for (let i = 0; i < m.length; i++) {
    if (m[i].startsWith(":")) { if (!p[i]) return false; continue; }
    if (m[i] !== p[i]) return false;
  }
  return true;
}

/**
 * Darf eine Arbeitersitzung diesen Weg gehen?
 *
 * REINE FUNKTION, absichtlich ohne Anfrage-Objekt: die Frage "ist dieser Weg
 * offen?" ist der Kern des Riegels und muss einzeln pruefbar sein, ohne Express.
 */
export function istErlaubt(methode, pfad) {
  const m = String(methode || "").toUpperCase();
  /* Der Pfad wird auf seinen reinen Teil gekuerzt: Abfrageteil und
   * abschliessender Schraegstrich duerfen ueber die Erlaubnis nicht
   * entscheiden. `/notifications?x=1` und `/notifications/` sind derselbe Weg
   * wie `/notifications` — waeren sie es hier nicht, liesse sich der Riegel mit
   * einem Fragezeichen umgehen. */
  let p = String(pfad || "").split("?")[0].split("#")[0];
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  if (!p.startsWith("/")) p = "/" + p;

  for (const e of ERLAUBT) {
    if (e.methoden !== "*" && !e.methoden.includes(m)) continue;
    if (trifftPfad(e.pfad, p)) return true;
  }
  return false;
}
