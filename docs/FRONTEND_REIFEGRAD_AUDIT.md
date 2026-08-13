# Frontend-Reifegrad — Audit

**Erhoben am 2026-08-13** von sechs parallelen Agenten, je ein eigener Blickwinkel:
tote Enden, ungenutzte Fähigkeiten, unvollständige Verdrahtung, Entscheidungs-Drift,
Zustände und Sprache, Frontend-Sicherheit. Jeder Befund am Code belegt.

> **Anlass:** Das Backend ist seit den Mutation-Wellen 0–4 nachweislich bug-fangend
> (91,49 % über RBAC, Mandantenkontext und Org-Grenze). Die Frage des Owners war:
> *ist das im Frontend genauso verankert?* — Die Antwort ist nein, und zwar nicht
> wegen fehlender Sorgfalt, sondern weil dem Frontend **jede automatisierte
> Gegenprobe fehlt**, dass ein Knopf, ein Link oder eine Anfrage auch wirklich ankommt.

**Verteilung:** 27 hoch · 44 mittel · 14 niedrig

---

## Das Muster hinter den Funden

Die Befunde sind selten Tippfehler. Durchgängig ist etwas anderes:
**der Fehler wird geschluckt statt gezeigt.**

Ein Aufruf trifft die richtige Route, geht aber ohne CSRF-Token raus und bekommt 403 —
und weil jeder Aufruf mit `.catch(function(){})` endet, erfährt niemand davon.
Der Nutzer füllt ein Formular aus, klickt Speichern, sieht keine Fehlermeldung, und die
Daten sind trotzdem weg.

Das Backend hat gegen genau diese Klasse inzwischen eine Waffe: ein eingebauter Bug
wird von einem Test gefangen. Das Frontend hat sie nicht.

---

## Hoch — der Nutzer erlebt einen Fehler oder verliert Daten (27)

Diese Punkte kosten unmittelbar: verlorene Eingaben, tote Hauptaktionen, eine Sitzung, die nicht endet.

### Benachrichtigungs-Einstellungen: leeres catch lässt Ladeplatzhalter stehen — der Speichern-Knopf schreibt dann Defaults über die echten Einstellungen

**Beleg:** `frontend/public/js/pages/activity.js:757`  ·  **Aufwand:** klein

Schlägt GET /api/notification-preferences fehl, bleibt im Einstellungs-Panel dauerhaft "Lade Einstellungen…" stehen (activity.html:278) — renderPrefs() wird nie aufgerufen. Der Speichern-Knopf ist trotzdem gebunden (activity.js:923); ein Klick sendet PUT mit den Fallback-Werten aus activity.js:779-780 (channel_in_app:true, channel_email:false für JEDE Kategorie) und überschreibt damit die real gespeicherten Präferenzen des Nutzers, ohne dass er es merkt.

### Kostenvorschau der Individuell-Anfrage rechnet mit fest kodiertem Sockelpreis weiter, wenn der Preiskatalog nicht geladen wurde

**Beleg:** `frontend/public/js/pages/enterpriseAnfrage.js:478`  ·  **Aufwand:** klein

loadCatalogSafe() fängt den Katalog-Fehler ab und setzt nur catalogError (enterpriseAnfrage.js:1157-1160). window.recalc() prüft catalogReady nie — es rechnet weiter mit den Defaults BASE_PRICE=2499, SEAT_INCLUDED=50, SEAT_PRICE=29 (enterpriseAnfrage.js:346-348) und schreibt eine konkrete Monatssumme in #invoiceMonthly (Zeile 514). Der Interessent sieht also einen belastbar wirkenden EUR-Betrag, der nicht aus dem Katalog stammt; nur das Add-on-Gitter darüber zeigt einen Fehlerhinweis.

### Enterprise-Hub stuft bei fehlgeschlagenem /api/me still auf DEMO herunter und sperrt bezahlte Karten

**Beleg:** `frontend/public/js/pages/enterpriseHub.js:765`  ·  **Aufwand:** mittel

Bei Netzwerkfehler oder 500 setzt der catch window._slaPlan = "DEMO" und ruft applyStaticCardLocks("DEMO") (enterpriseHub.js:767/773). applyStaticCardLocks (Zeile 438-467) hängt an jede nicht freigeschaltete Karte ein Schloss-Symbol, den Text "Verfügbar ab PLUS" und einen Upgrade-Link auf sla_abo.html. Ein zahlender PRO-Kunde sieht seine bezahlten Flächen als gesperrt und wird zum Upgrade aufgefordert. enterprise.html enthält kein einziges Fehler-Element (kein ds-alert, kein page-state) — es gibt keinen Weg, den Ausfall anzuzeigen.

### Fehlgeschlagenes /me wird zur Berechtigungsaussage: Executive Dashboard und Lieferantenpool zeigen "kein Zugriff" statt eines Fehlers

**Beleg:** `frontend/public/js/pages/executiveDashboard.js:893`  ·  **Aufwand:** mittel

api() schluckt jeden Fehler und gibt null zurück; init() übergibt dieses null direkt an resolveSurfaceAccess (executiveDashboard.js:1241-1249). Ohne me.surface_access fällt surfaceAccess.js:412-433 auf die clientseitige Regellogik zurück, roleAllowed('') ist false, und analyticsSurface (surfaceAccess.js:254) liefert canRead=false. Der Nutzer bekommt "Zugriff versteckt / Steuerung & Analytik bleibt für Executive-/Finance-Rollen reserviert" — obwohl nur ein Request fehlgeschlagen ist. Identisch im Lieferantenpool: vendorPool.js:676 (apiGet gibt null zurück) und vendorPool.js:693-702. Damit trifft das Frontend die Berechtigungsentscheidung selbst, entgegen der Projektregel.

### Rollen-Dropdown fuer bestehende Mitglieder weicht vom Backend-Enum ab — stille Owner-Beforderung

**Beleg:** `frontend/public/organization.html:673`  ·  **Aufwand:** klein

Das Select fuer Rollenwechsel wird aus ROLE_ORDER.slice(0,8) gebaut (Zeile 716): owner, admin, program_manager, hiring_manager, manager, finance, dispatcher, member. Das Backend-Enum (api/routes/orgControlCenter.js:34) kennt kein 'manager' (auch rbacService.ROLE_HIERARCHY nicht) und dafuer supplier_manager, recruiter, supplier_user, viewer, die im Select fehlen. Wer 'Manager' waehlt, bekommt 400 VALIDATION. Schlimmer: bei einem Mitglied mit role_key supplier_manager/recruiter/viewer/supplier_user trifft die selected-Bedingung (r===m.role_key) auf keine Option zu, der Browser waehlt die erste — 'Owner'. Ein Klick auf 'Speichern' ohne Absicht befoerdert das Mitglied zum Owner. Die Einladen-Maske derselben Datei (Zeile 118) fuehrt die richtige Liste — zwei Rollenlisten in einer Datei, die sich widersprechen.

### surface_access kennt nur die Plan-Stufe — gekaufte Add-ons bleiben im Frontend gesperrt

**Beleg:** `api/services/enterpriseSurfaceAccessService.js:38`  ·  **Aufwand:** mittel

isProPlus() entscheidet allein anhand des Plans (PRO/INDIVIDUELL). Add-ons sind aber ein eigener Kaufweg: entitlementService.js:44-49 mappt 'ratecards' -> rate_card_management, 'spend' -> spend_analytics, 'governance' -> data_governance, und applyActiveAddonsToFeatures (Zeile 517) setzt allowed=true. Die Routen gaten genau darueber (api/routes/spendAnalytics.js:17 requireOrgFeature('spend_analytics'), api/routes/rateCards.js:41). Ein PLUS-Kunde mit gekauftem Spend- oder Ratecard-Add-on wird von der API bedient, sieht im Frontend aber die Plan-Paywall: rate-cards.html:605 uebernimmt srv.mode='plan_locked', spend-analytics.html:502 deaktiviert alle Bedienelemente. Bezahlte Funktion bleibt unsichtbar.

### hubVisibility.js entscheidet mit einer eigenen Rollen-Blacklist, bevor es die Backend-Antwort ueberhaupt liest

**Beleg:** `frontend/public/js/hubVisibility.js:81`  ·  **Aufwand:** klein

hiddenRoles fuer vendor_pool enthaelt hiring_manager. Diese Pruefung laeuft in Zeile 187 — also VOR der Auswertung von me.surface_access in Zeile 197. Das Backend erlaubt hiring_manager den Lieferantenpool ausdruecklich: rbacService.js:48 (vendor_pool.view) und enterpriseSurfaceAccessService.js:85/112 liefern mode read_only mit canRead:true. Ein Hiring-Manager sieht die Karte 'Lieferantensteuerung' auf dem Hub (enterprise.html:167) nie, obwohl die Seite fuer ihn lesend freigegeben ist. Die Liste ist eine reine Frontend-Erfindung ohne Gegenstueck im Backend.

### Spend & Kosten wird fuer Rollen geoeffnet, die die Route sofort mit 403 abweist

**Beleg:** `frontend/public/spend-analytics.html:502`  ·  **Aufwand:** mittel

Die Seite schaltet alle Filter und Ladepfade frei, sobald spendAnalyticsAccess.canRead true ist. Dieser Wert kommt aus surface_access.spend_analytics, wo canRead: proPlan gesetzt wird (enterpriseSurfaceAccessService.js:134) — unabhaengig von der Rolle. Die Route verlangt aber rperm('report.executive') (api/routes/spendAnalytics.js:57), und diese Permission haben nur owner, admin, program_manager, finance (rbacService.js:61). hiring_manager, supplier_manager, dispatcher, recruiter, member und viewer bekommen eine funktionsfaehig wirkende Seite, in der jede einzelne Kachel in 403 laeuft. Die Frontend-Ersatzlogik in surfaceAccess.js:322 haette es richtig gemacht (EXECUTIVE_READ_ROLES), sie wird aber vom Serverwert ueberstimmt.

### Finance verliert Steuerung & Analytik komplett, obwohl RBAC den Zugriff gewaehrt

**Beleg:** `api/services/enterpriseSurfaceAccessService.js:103`  ·  **Aufwand:** klein

edMode = isSenior ? 'full' : 'role_locked'; SENIOR_ROLES (Zeile 21) enthaelt finance nicht. Die Route /reporting/dashboard verlangt report.executive (api/routes/reporting.js:45), und diese Permission hat finance ausdruecklich (rbacService.js:61). Folge im Frontend, dreifach: die Hub-Karte wird ausgeblendet (hubVisibility.js:200 via surfaceKey executive_dashboard), der Topbar-Eintrag 'Steuerung' verschwindet (hubVisibility.js:117), und die Seite selbst deaktiviert alle Bedienelemente (executiveDashboard.js:930/934/936). Eine Finance-Rolle findet die Managementsicht auf keinem Weg, obwohl der Server sie ausliefern wuerde.

### Preferred-Vendors-Selbstverwaltung: kompletter Router (8 Endpunkte) ohne jede Oberflaeche — obwohl im Pricing verkauft

**Beleg:** `api/routes/preferredVendors.js:35`  ·  **Aufwand:** gross

Der Kunde bezahlt laut api/config/planCatalog.js:348 fuer "Lieferantensteuerung … Preferred First, Coverage" (visible_in_pricing:true) und kann im Produkt weder seine Preferred-Liste sehen (:35), noch die Abdeckungsluecken (:66 coverage), noch Vorschlaege (:79 suggest), noch die Live-Kapazitaet seiner bevorzugten Lieferanten (:93), noch mehrere Lieferanten auf einmal hoch-/herabstufen (:138 bulk) — die Zeichenkette "preferred-vendors" kommt im gesamten Frontend null mal vor.

### Marktplatz-Sichtbarkeit ist nur lesbar: Opt-in, Einreichen und Pausieren haben keinen Aufrufer

**Beleg:** `api/routes/profileVisibility.js:62`  ·  **Aufwand:** mittel

Die Zeitarbeitsfirma sieht auf sla_profil.html:606 ihren Sichtbarkeitsstatus, kann ihn aber nie aendern: POST /profile-visibility/settings/opt-in (:62), /submit (:80) und /pause (:95) werden nirgends aufgerufen — und bei Status "draft" verlinkt sla_profil.html:621 auf "/public/sla_profil.html", also auf genau die Seite, auf der der Nutzer bereits steht. Wer nicht gelistet ist, hat keinen Weg, gelistet zu werden.

### Reporting: 6 von 8 fertigen Berichten sind im Frontend nicht abrufbar

**Beleg:** `api/routes/reporting.js:95`  ·  **Aufwand:** gross

Das Frontend ruft ausschliesslich /reporting/dashboard (frontend/public/js/pages/executiveDashboard.js:1290) und /reporting/finance-truth/export auf. Unerreichbar bleiben Anforderungs-Report (:95), Anforderungs-Zeitverlauf (:104), Lieferanten-Report (:114), Compliance-Report (:125), SLA-Report (:132) und die meistgesuchten Rollen (:142) — sechs Auswertungen, die ein Einkaufsleiter fuer Verhandlungen und Personalplanung sofort nutzen wuerde.

### Analytics: 11 von 14 Endpunkten ohne Aufrufer, inklusive der kompletten Produkt-Analytics

**Beleg:** `api/routes/analytics.js:102`  ·  **Aufwand:** gross

Das Frontend nutzt von /analytics/* nur provider-config und track-public. Nie sichtbar werden: Lieferanten-Reaktionsgeschwindigkeit (:102), Belegschafts-Analytics (:86), Conversion-Funnel (:94), Event-Historie (:111) und Event-Summary (:125) sowie die sieben Produkt-Analytics-Endpunkte (:133–:190). Der Kunde koennte damit sehen, welcher Lieferant wie schnell antwortet und wo Anfragen versanden.

### Stundenzettel: Sammelfreigabe und Sammelablehnung existieren im Backend, nicht in der UI

**Beleg:** `api/routes/timesheets.js:405`  ·  **Aufwand:** mittel

POST /timesheets/batch-approve (:405) und /batch-reject (:417) haben keinen Aufrufer — das Frontend kennt nur /api/timesheets und Einzelaktionen. Ein Unternehmen mit 80 Stundenzetteln pro Woche muss jeden einzeln freigeben, obwohl die Massenfreigabe inkl. Audit-Eintrag fertig gebaut ist. Ebenfalls unbenutzt: /timesheets/worker-summary (:434, KPIs je Mitarbeiter) und /timesheets/status-meta (:429, Status-Labels und -Farben vom Server).

### Stored XSS: frei eingegebenes Feld-Label laeuft unescaped in ein value-Attribut

**Beleg:** `frontend/public/timesheet-templates.html:325`  ·  **Aufwand:** klein

Ein Nutzer legt ein Stundenzettel-Template mit dem Feld-Label " autofocus onfocus=alert(1) x=" an; sobald ein Kollege derselben Organisation den Template-Editor oeffnet, bricht der Wert aus dem value-Attribut aus und fremder JavaScript-Code laeuft in dessen angemeldeter Sitzung.

### esc() in timesheet-templates.html escapt keine Anfuehrungszeichen (Ursache des XSS)

**Beleg:** `frontend/public/timesheet-templates.html:200`  ·  **Aufwand:** klein

esc() ist als document.createElement('div'); d.textContent=s; return d.innerHTML gebaut — die HTML-Serialisierung von Textknoten ersetzt nur & < >, niemals " oder '. Jede Verwendung dieses esc() innerhalb eines Attributs ist damit wirkungslos, obwohl sie im Code wie abgesichert aussieht; das Muster wiederholt sich in weiteren Dateien (js/pageShell.js:452, js/notifications.js:26, js/pages/adminPanel.js:834, js/pages/executiveDashboard.js:890).

### OCC-Logout ruft eine Route, die es nicht gibt — die Session wird nie beendet

**Beleg:** `frontend/src/owner-control/components/shell/Topbar.tsx:18`  ·  **Aufwand:** klein

Der Owner klickt im Owner Control Center auf "Logout", sieht den Toast "Session beendet." und landet auf der Landing — die Session-Cookie tc.sid bleibt aber gueltig; wer /owner-control/ erneut aufruft, ist weiter eingeloggt. Beleg der Luecke: occApi setzt BASE="/api/v1/owner-control" (frontend/src/owner-control/api/client.ts:11), aber weder api/routes/ownerControlCenter.js noch api/routes/occ/*.js definieren /auth/logout — der Aufruf faellt in den 404-Catch-all (api/app.js:441). Die echte, session-zerstoerende Route liegt auf POST /api/auth/logout (api/routes/auth.js:312-323, req.session.destroy + clearCookie).

### Onboarding-Wizard sendet alle schreibenden Requests ohne CSRF-Token — jeder endet in 403, der Fehler wird verschluckt

**Beleg:** `frontend/public/js/onboardingWizard.js:205`  ·  **Aufwand:** klein

Der eigene api()-Helfer setzt nur Content-Type, nie x-csrf-token (Zeilen 205-217). csrfProtect haengt global unter app.use("/api/", csrfProtect) (api/app.js:310) und antwortet ohne passenden Token mit 403 CSRF_INVALID (api/middleware/auth.js:28-33). Betroffen sind alle sechs Mutationen des Wizards: /me/onboarding-complete (Zeilen 401, 415, 472), /me/onboarding-reset (403), PUT /me/profile (439), PUT /company-profile (450). Fuer den Nutzer heisst das: die im Wizard eingegebenen Profildaten werden nie gespeichert, und "nicht mehr anzeigen" wird serverseitig nie gesetzt — der Wizard erscheint bei jedem Login erneut. Es erscheint keine Fehlermeldung, weil jeder Aufruf mit .catch(function(){}) abgefangen wird.

### Onboarding-Wizard ruft zusaetzlich einen Endpunkt, den es nicht gibt: PUT /api/company-profile

**Beleg:** `frontend/public/js/onboardingWizard.js:450`  ·  **Aufwand:** klein

Selbst mit korrektem CSRF-Token liefe dieser Aufruf ins Leere: api/routes/companyProfile.js kennt nur GET /company-profile (Zeile 62) und PUT /company-profile/overview (Zeile 95) — ein PUT auf /company-profile faellt in den 404-Catch-all. Die im Wizard erfassten Firmendaten (legal_name, contact_email, contact_phone, headquarters_city) landen damit nie in company_profiles; das Firmenprofil bleibt leer, obwohl der Nutzer es ausgefuellt hat.

### Stundenzettel-Freigabe an den Kunden: beide Knoepfe rufen Funktionen auf, die es nirgends gibt

**Beleg:** `frontend/public/worker-submissions-review.html:464`  ·  **Aufwand:** klein

onclick="scrollToBundlePreview()" (Zeile 464) und onclick="scrollToBundleSent()" (Zeile 465) verweisen auf Funktionen, die im gesamten frontend/public nirgends definiert sind — die beiden Zeilen sind die einzigen Fundstellen der Namen. Der erste Knopf ist die Hauptaktion des Kundenabrechnungs-Blocks und wird von js/pages/workerSubmissionsReview.js:2335-2341 aktiv geschaltet, sobald versandbereite Positionen existieren (Beschriftung wird dann zu "N Positionen an Kunde senden"). Der Nutzer klickt den freigeschalteten Hauptknopf, bekommt einen ReferenceError in der Konsole und es passiert nichts. Der zweite Knopf ist nie deaktiviert, also durchgehend tot.

### Benachrichtigungs-Links werfen die Entity-ID weg — jede Meldung endet auf einer allgemeinen Liste

**Beleg:** `frontend/public/js/notifications.js:42`  ·  **Aufwand:** klein

Klickt ein Nutzer die Meldung "Requisition freigegeben", landet er auf der gesamten Requisitions-Liste und muss den Eintrag von Hand suchen — obwohl das Ziel den Deep-Link koennte.

### Zweite, identisch schwache Kopie derselben Routing-Tabelle im Aktivitaetsfeed

**Beleg:** `frontend/public/js/pages/activity.js:474`  ·  **Aufwand:** klein

Im Aktivitaetsfeed fuehren zusaetzlich die Typen capacity, demand, deal und offer auf Uebersichtsseiten statt auf den konkreten Eintrag; die Tabelle existiert dreimal im Repo und driftet auseinander.

### Der Server schreibt statische Uebersichts-Links in die Benachrichtigung, obwohl die ID vorliegt

**Beleg:** `api/services/notificationMatrix.js:20`  ·  **Aufwand:** mittel

Auch wenn das Frontend korrigiert wuerde, bliebe die Sackgasse: link_path ist fest auf /public/requisitions.html bzw. /public/capacity_exchange_manage.html gesetzt (Zeile 134), waehrend der Aufrufer die entityId mitliefert (api/routes/capacityExchange.js:665).

### Stundenzettel: "Weitere laden" ruft eine Funktion auf, die es nicht gibt

**Beleg:** `frontend/public/timesheets.html:121`  ·  **Aufwand:** mittel

Der Knopf wuerde beim Klick einen ReferenceError werfen; sein Container #loadMoreWrap (Zeile 120) wird ausserdem nie sichtbar geschaltet — ab dem 101. Stundenzettel (Limit in js/pages/timesheets.js:366) sieht der Nutzer den Rest schlicht nie.

### organization.html ist vollstaendig einsprachig — 933 Zeilen ohne einen einzigen i18n-Marker

**Beleg:** `frontend/public/organization.html:90`  ·  **Aufwand:** gross

Eine in der Sichtbarkeitsmatrix registrierte, fuer company und agency dauerhaft offene Flaeche (api/config/visibilityMatrix.js:142) zeigt einem EN-Nutzer ausschliesslich deutschen Text; js/i18n.js wird gar nicht erst geladen.

### Das i18n-Testgate prueft nur Seiten, die i18n bereits eingebunden haben

**Beleg:** `api/test/i18nFoundation.test.js:224`  ·  **Aufwand:** klein

Die Zeile `if (!html.includes("js/i18n.js")) continue;` schliesst jede unmigrierte Seite still aus. Deshalb ist die DE/EN-Paritaet der erfassten Seiten perfekt (7130/7130 Schluessel, 0 Luecken), waehrend organization.html, sso_config.html, system-health.html und timesheet-templates.html unbemerkt einsprachig bleiben.

### Der Cookie-/Datenschutz-Banner existiert nur auf Deutsch

**Beleg:** `frontend/public/js/cookieConsent.js:59`  ·  **Aufwand:** mittel

Der einwilligungsrelevante Banner erscheint auf jeder Seite und zeigt einem EN-Nutzer "Datenschutz-Einstellungen", "Nur notwendige", "Alle akzeptieren" auf Deutsch — TCi18n wird in der Datei nirgends aufgerufen.

---

## Mittel — wirkt unfertig (44)

Kein Datenverlust, aber der Nutzer läuft in Sackgassen oder bekommt stille Fehlschläge.

### Rollen-CTAs im Marktplatz-Feed verschwinden ersatzlos, wenn /me scheitert

**Beleg:** `frontend/public/js/pages/marketplaceFeed.js:1093`  ·  **Aufwand:** klein

#feed-ctas ist im Markup ein leerer Container (capacity_exchange_feed.html:29) und wird ausschliesslich in diesem then-Zweig gefüllt. Das leere catch bedeutet: bei Fehler bleibt die Zeile leer — die Haupteinstiege "Personal einstellen" / "Bedarf anlegen" / "Verwalten" fehlen komplett, ohne Hinweis. Zusätzlich bleiben die per JS gesetzten Ziele von #feed-nav-card2/3 auf der rollenfalschen Default-URL stehen.

### Aktivitäts-Statistikleiste des Feeds bleibt dauerhaft auf "?" stehen

**Beleg:** `frontend/public/js/pages/marketplaceFeed.js:1059`  ·  **Aufwand:** klein

Die vier Kacheln starten im Markup mit dem Literal "?" (capacity_exchange_feed.html:53-54). Scheitert GET /capacity-exchange/stats, greift das leere catch und die Leiste zeigt dem Nutzer dauerhaft "? Aktives Personal / ? Dienstleister" — weder Ladehinweis noch Leer- noch Fehlerzustand, und kein Retry.

### Stundenzettel-Prüfung: bei Netzwerk-Transient wird das Panel vollständig leer, ohne Meldung und ohne Retry

**Beleg:** `frontend/public/js/pages/workerSubmissionsReview.js:2272`  ·  **Aufwand:** mittel

fetchJson wirft bei jedem echten Netzfehler (Offline, ERR_NETWORK_CHANGED) ApiError('NETWORK_TRANSIENT') (Zeile 2070-2078). loadSubs blendet daraufhin nur den Ladeindikator aus und kehrt zurück — #ctSubs wurde zuvor in Zeile 2234 versteckt und bleibt es. Ergebnis: weisse Fläche, kein Spinner, kein Text, kein Wiederholen-Knopf; erst ein manueller Tab-Wechsel lädt neu. Gleiche Stelle im Mitarbeiter-Tab: workerSubmissionsReview.js:2974.

### Executive Dashboard gibt Abruffehler als Leerzustand aus — Ausfall ist von "keine Daten" nicht unterscheidbar

**Beleg:** `frontend/public/js/pages/executiveDashboard.js:2151`  ·  **Aufwand:** klein

Der catch von loadDsgvo rendert sectionMessage(t('exe.dsgvo.none')) = "Keine DSGVO-Daten" (Wörterbuch Zeile 388). Identisch bei loadCeStats: executiveDashboard.js:2108 rendert "Keine CE-Daten" (Zeile 379). Ein 500er oder 403 auf /data-governance/inventory bzw. /capacity-exchange/feed sieht für den Nutzer exakt aus wie ein leerer Datenbestand — er hat keinen Anlass, es erneut zu versuchen oder zu melden. Der Nachbar loadActivityFeed macht es in Zeile 2127 richtig ('exe.act.error').

### Mitarbeiterseite wirft den Nutzer bei jedem /me-Fehler kommentarlos auf die Startseite

**Beleg:** `frontend/public/js/pages/mitarbeiter.js:1445`  ·  **Aufwand:** klein

Der catch der Init-Kette macht ausnahmslos window.location.href = "/" — auch bei einem 500er oder einem kurzen Netzabriss, nicht nur bei 401. Der Nutzer verliert seinen Seitenkontext und landet ohne jede Meldung auf der Landingpage; für ihn sieht das aus wie ein unerklärter Logout.

### Admin-Panel: Feature-Key-Liste scheitert lautlos, das Auswahlfeld bleibt leer

**Beleg:** `frontend/public/js/pages/adminPanel.js:1999`  ·  **Aufwand:** klein

loadFeatureKeys setzt im catch nur _foKeysLoaded=false und rendert nichts. Scheitert /admin/feature-keys, enthält #foFeatureKey keine Optionen; das Formular "Feature-Override anlegen" ist damit unbedienbar, ohne dass irgendwo steht warum. Der umgebende Bereich loadFeatureOverrides (Zeile 2036) zeigt korrekt einen Fehlertext — die Key-Liste daneben bleibt stumm.

### Clientseitige Zugriffsbegründungen sind fest kodiert und nur auf Deutsch, werden aber unübersetzt in die UI geschrieben

**Beleg:** `frontend/public/js/surfaceAccess.js:342`  ·  **Aufwand:** mittel

Die Fallback-Begründungen (surfaceAccess.js:267, 270, 273, 276, 279, 292-294, 308-310, 324-326, 340-342, 431) sind deutsche String-Literale ohne i18n-Schlüssel. vendorPool.js:598 gibt access.reason zurück, setPoolEmptyRaw schreibt ihn per textContent roh ins DOM (vendorPool.js:503); executiveDashboard.js:910 reicht ihn ebenso durch. Ein Nutzer mit englischer Oberfläche liest damit "Steuerung & Analytik bleibt fuer Executive-/Finance-Rollen reserviert" mitten in einer sonst englischen Seite — inklusive fehlender Umlaute.

### requisitions.js baut die Preisrahmen-Berechtigung komplett selbst nach und liest surface_access nie

**Beleg:** `frontend/public/js/pages/requisitions.js:330`  ·  **Aufwand:** mittel

resolveRateCardAccess() vergleicht Plan ('PRO'/'INDIVIDUELL'), org_type und eine hartcodierte Rollen-Map (Zeile 314) im Browser. Kein Zweig liest me.surface_access.rate_cards, und requisitions.html bindet surfaceAccess.js gar nicht ein (verifiziert ueber die Script-Tags). Damit ist das die vierte unabhaengige Kopie derselben Regel — neben pageShell.js:174, vendorPool.js:575 und enterpriseHub.js:321. rate-cards.html:590 hat den Fehler bereits erkannt und dokumentiert behoben ('P9 C1'), die Korrektur wurde nicht nachgezogen. Der Deep-Link 'Preisrahmen' auf der Bedarfsseite (applyRateCardLinkVisibility, Zeile 346) folgt deshalb einer veralteten Wahrheit und blendet ihn u.a. fuer Add-on-Kunden aus.

### Die Standorte-Karte prueft einen surface_access-Key, den das Backend nie liefert

**Beleg:** `frontend/public/js/hubVisibility.js:101`  ·  **Aufwand:** klein

location_management setzt surfaceKey: 'org_settings'. resolveEnterpriseSurfaceAccess liefert diesen Key nicht — die Multi-Standort-Flaeche heisst dort 'multi_location' (enterpriseSurfaceAccessService.js:168); 'org_settings' ist ein Plan-Feature-Key (api/config/planFeatures.js:96, nur INDIVIDUELL). getSurfaceAccess gibt darum immer null zurueck und die Plan-Sperre in Zeile 197-208 greift nie — obwohl der Kommentar in Zeile 96 sie ausdruecklich verspricht. Ein Owner auf BASIS sieht die Karte 'Standorte & Struktur' (enterprise.html:233), und die Aktionen dahinter sind serverseitig org_settings-gated (api/routes/orgControlCenter.js:89) — Knopf fuehrt ins 403. Gleichzeitig werden die beiden Keys, die das Backend wirklich liefert (multi_location, audit_trail), im gesamten Frontend nirgends gelesen.

### Preisrahmen anlegen: das Frontend versteckt den Knopf fuer Rollen, die ihn laut RBAC benutzen duerfen

**Beleg:** `frontend/public/rate-cards.html:759`  ·  **Aufwand:** klein

createBtn und saveBtn haengen an access.canWrite, das aus surface_access uebernommen wird. Dort gilt canWrite: proPlan && isAdmin (enterpriseSurfaceAccessService.js:128), ADMIN_ROLES sind nur platform_admin/owner/admin. Die schreibende Route verlangt aber rate_card.create, und das haben zusaetzlich program_manager und finance (rbacService.js:115). Beide Rollen sehen eine rein lesende Seite, obwohl ihr POST durchginge. Dieselbe Divergenz steht auch in der Frontend-Ersatzlogik richtig (surfaceAccess.js:17 RATE_CARD_WRITE_ROLES) — sie wird nur nicht verwendet.

### Schreib-CTAs werden nach einer Rollenregel ausgeblendet, die es im Backend nicht gibt

**Beleg:** `frontend/public/js/pages/enterpriseHub.js:708`  ·  **Aufwand:** klein

applyCTAVisibility blendet alle [data-cta-write]-Elemente (enterprise.html:108, 109, 123) fuer die harte Liste ['viewer','finance'] aus. Ein Backend-Gegenstueck existiert nicht: POST /marketplace/demand-requests ist nur ueber requireFeature('sla_access') gesichert (api/routes/marketplace.js:757 und 292), ohne jede Rollenpruefung. Die Regel lebt ausschliesslich im Browser — hubVisibility.js:44 dokumentiert sie sogar als Produktentscheidung, ohne dass irgendein Server sie kennt. Finance und Viewer koennen also einen Bedarf anlegen, bekommen den Knopf aber nie zu sehen.

### slaGuard sperrt 23 Seiten anhand eines Plan-Vergleichs im Browser statt anhand des Entitlement-Snapshots

**Beleg:** `frontend/public/js/slaGuard.js:118`  ·  **Aufwand:** mittel

PlanFeatures.hasFeature(plan, feature) vergleicht me.plan gegen eine statische Plan-Matrix aus /api/plan-features (api/routes/plans.js:13 — ohne Auth, ohne Org-Kontext, ohne Add-ons, ohne Abo-Status). Die Backend-Guards entscheiden dagegen ueber requireOrgFeature, das Add-ons, Feature-Overrides, maturity_locked, pending approvals UND einen inaktiven Abo-Status beruecksichtigt (api/middleware/entitlementGuard.js:61-92). Damit driftet es in beide Richtungen: eine Org mit ausgelaufenem Abo passiert den Frontend-Guard und laeuft danach auf jedem Endpunkt in 403 SUBSCRIPTION_INACTIVE, ein Add-on-Kunde bekommt die Paywall trotz Kauf. Der richtige Client existiert bereits — entitlements.js:113 wertet genau diese Felder aus — ist aber nur an [data-feature-key]-Elemente auf wenigen Seiten verdrahtet.

### Capacity Discovery: aggregierte Verfuegbarkeits-Sicht (4 Endpunkte) komplett unsichtbar

**Beleg:** `api/routes/capacityDiscovery.js:12`  ·  **Aufwand:** mittel

Kein Aufrufer fuer "capacity-discovery" im Frontend. Ein Unternehmen koennte damit vor dem Ausschreiben sehen, wie viel Personal je Rolle (:12), je Region (:22) und je Kategorie (:32) ueberhaupt verfuegbar ist, statt blind eine Anforderung zu stellen und auf Antworten zu warten.

### Workforce-Router (Uebersicht, KPIs, offene Aktionen, Einsatzdetail) ohne Oberflaeche

**Beleg:** `api/routes/workforce.js:16`  ·  **Aufwand:** mittel

Alle vier Endpunkte — /workforce/overview (:16), /kpis (:34), /pending-actions (:44) und /:assignmentId/detail (:56) — werden nirgends aufgerufen; das Frontend nutzt stattdessen nur /company/live-workforce (frontend/public/js/pages/companyTimesheets.js:541). Die priorisierte Liste "was muss ich heute entscheiden" und die konsolidierte Einsatzakte bekommt der Kunde nie zu sehen.

### Internal Control Center: 15 Endpunkte, die zugehoerige Seite ist nur eine Weiterleitung

**Beleg:** `api/routes/internalControlCenter.js:17`  ·  **Aufwand:** gross

frontend/public/internal_control_center.html:8 ist ein reiner Meta-Refresh auf das Admin Panel; die Zeichenkette "internal-control" kommt im gesamten Frontend null mal vor. Damit sind Plattform-Dashboard, Organisationsliste, sieben Produkt-Insight-Auswertungen, Support-Aktionen, Operations-Uebersicht und Audit-Sicht fuer das Team unerreichbar — und die Produkt-Analytics sind hier ein zweites Mal gebaut (:42–:99) und ebenfalls tot.

### Capacity-Exchange Premium-Analytics: Dashboard nicht angezeigt UND Klick-Tracking nie ausgeloest

**Beleg:** `api/routes/capacityExchange.js:711`  ·  **Aufwand:** mittel

Die Zeitarbeitsfirma sieht nie, wie oft ihr Angebot aufgerufen, angeklickt, gematcht und zum Abschluss gebracht wurde (GET /capacity-exchange/my-analytics, :711). Verschaerfend: auch POST /capacity-exchange/entries/:id/click (:723) wird nirgends gefeuert — die Zeichenkette "/click" existiert im Frontend nicht. Selbst wenn das Dashboard nachgeruestet wird, stuende click_count dauerhaft auf 0.

### Reputation: Note wird angezeigt, die Begruendung dahinter und das Leaderboard nicht

**Beleg:** `api/routes/reputation.js:48`  ·  **Aufwand:** klein

frontend/public/js/pageShell.js:701 holt nur /reputation/:id/card und zeigt "Gold · 87 Punkte". Warum diese Note zustande kommt (GET /reputation/:id/signals, :48) und wer im Markt vorne liegt (GET /reputation/top, :68) hat keinen Aufrufer — der Nutzer sieht eine Bewertung, die er weder nachvollziehen noch einordnen kann. Zusaetzlich redundant und unbenutzt: /reputation/my-card (:18).

### Credits: Guthaben, Umsaetze, Pakete und Kauf komplett ohne Oberflaeche

**Beleg:** `api/routes/credits.js:8`  ·  **Aufwand:** mittel

Die Zeichenkette "credits" existiert im gesamten Frontend nicht. Guthabenstand (:8), Transaktionshistorie (:15), kaufbare Pakete (:23) und der Kauf selbst (:30) sind gebaut und ueber api/app.js:430 live — ein vollstaendiger Umsatzkanal, den kein Kunde erreichen kann.

### Mentoring-Sitzungen (5 Endpunkte) ohne Oberflaeche

**Beleg:** `api/routes/mentoring.js:8`  ·  **Aufwand:** mittel

Sitzungen anlegen (:16), abschliessen (:31), absagen (:38) und bewerten (:45) sind fertig und ueber api/app.js:429 gemountet, aber "mentoring" kommt im Frontend null mal vor. Ein Betreuungs-/Einarbeitungsangebot, das nicht existiert, solange es niemand sehen kann.

### Smart Pricing: Preisvorschlag mit eigenem Plan-Gate, aber ohne Aufrufer

**Beleg:** `api/routes/smartPricing.js:29`  ·  **Aufwand:** klein

GET /pricing/suggest (:29) laeuft hinter einem eigenen Zugriffs-Gate (pricingAccess) und wird nirgends aufgerufen — "pricing/suggest" kommt im Frontend null mal vor. Eine Zeitarbeitsfirma bekaeme damit beim Anlegen eines Angebots einen datenbasierten Stundensatz-Vorschlag statt zu raten.

### Integrationen: Webhook-Zustellhistorie und Wiederholung fehlgeschlagener Zustellungen unsichtbar

**Beleg:** `api/routes/integrations.js:153`  ·  **Aufwand:** klein

Die Integrationsseite ruft nur /integrations und /integrations/events auf. GET /integrations/:id/deliveries (:153) und POST /integrations/retry-failed (:167) haben keinen Aufrufer — bei einer stillen Webhook-Stoerung sieht der Kunde weder, dass Zustellungen fehlgeschlagen sind, noch kann er sie neu anstossen; er merkt den Datenverlust erst im ERP.

### Vertrag kuendigen: Endpunkt vorhanden, im Frontend nur Unterschreiben verdrahtet

**Beleg:** `api/routes/contracts.js:93`  ·  **Aufwand:** klein

POST /contracts/:id/terminate (:93) inkl. Grund, Org-Grenze und Audit hat keinen Aufrufer; im Frontend existiert von /contracts/* ausschliesslich /contracts/:id/sign. Ein Kunde kann einen Rahmenvertrag im Produkt abschliessen, aber nicht beenden — das muss per Mail an den Support laufen.

### Rundruf an alle passenden Partner (Broadcast-Anfrage) ohne Oberflaeche

**Beleg:** `api/routes/requests.js:159`  ·  **Aufwand:** mittel

POST /requests/broadcast (:159) verteilt eine Anfrage gefiltert an alle passenden Gegenparteien inkl. Kontingentpruefung und NOTDIENST-Prioritaet, hat aber keinen Aufrufer — das Frontend kennt nur Einzelanfragen (/requests/sent, /requests/received, /requests/:id). Bei kurzfristigem Personalbedarf muss der Kunde jeden Lieferanten einzeln anschreiben.

### Bestaetigungs-E-Mail erneut senden: kein Knopf im Frontend

**Beleg:** `api/routes/auth.js:216`  ·  **Aufwand:** klein

POST /auth/resend-verification (:216) erzeugt bei Bedarf ein neues Token und verschickt die Bestaetigungsmail, wird aber nirgends aufgerufen. Geht die erste Mail im Spam unter, hat der neue Nutzer keinen Selbsthilfe-Weg und muss den Support kontaktieren — direkt im ersten Kontakt mit dem Produkt.

### Stundenzettel-Vorlage je Einsatz wird nicht abgefragt

**Beleg:** `api/routes/timesheetTemplates.js:82`  ·  **Aufwand:** klein

GET /timesheet-templates/for-assignment/:id (:82) liefert genau die Vorlage, die fuer einen konkreten Einsatz gilt; kein Aufrufer im Frontend (dort nur /timesheet-templates und /timesheet-templates/). Der Mitarbeiter bekommt beim Erfassen also nicht automatisch das richtige Formularschema vorgelegt.

### Zweite Attribut-Injektion auf derselben Seite: field_key im title-Attribut

**Beleg:** `frontend/public/timesheet-templates.html:244`  ·  **Aufwand:** klein

Derselbe quote-unsichere esc() steht im title="..."-Attribut des Feld-Chips. field_key wird serverseitig nur als z.string().min(1).max(100) geprueft (api/routes/timesheetTemplates.js:13) — ein ueber die API gesetzter Schluessel mit Anfuehrungszeichen bricht aus dem Attribut aus, sobald die Template-Liste gerendert wird.

### dangerouslySetInnerHTML auf Artikeltext ohne jeden Sanitizer im Stack

**Beleg:** `frontend/src/support/modules.tsx:419`  ·  **Aufwand:** mittel

Der Body eines Knowledge-Artikels wird als rohes HTML in die Support-Oberflaeche geschrieben. Heute nicht ausnutzbar, weil support_knowledge ausschliesslich per Migration befuellt wird (sql/migrations/110_soc_phase3_support.sql:329) und api/routes/support.js nur lesend darauf zugreift — es existiert aber weder ein Sanitizer im Projekt noch ein Test, der das absichert. Der erste Redaktions-Endpunkt fuer Support-Artikel macht daraus sofort Stored XSS in der Support-Flaeche.

### Enterprise-Seite ohne ein einziges Design-Token — 73 hardcodierte Farbwerte

**Beleg:** `frontend/public/timesheet-templates.html:10`  ·  **Aufwand:** mittel

Die Seite laedt /public/css/enterprise.css (Zeile 8), ueberschreibt aber sofort :root, body-Hintergrund und Textfarbe mit festen Werten (#4a9eff, #0a0f1e, #eaeff8) und nutzt 0 (null) --ds-/--tc-/--wk-Tokens. Ein Theme- oder Markenwechsel geht an dieser Seite spurlos vorbei; sie bricht als einzige aus dem Look der Enterprise-Flaeche aus.

### Enterprise-Seite compliance_overview: 68 hardcodierte Farbwerte gegen nur 10 Tokens

**Beleg:** `frontend/public/compliance_overview.html:14`  ·  **Aufwand:** mittel

Die gesamte Ampel-Semantik (gruen/gelb/rot) ist mit #34d399, #fbbf24, #f87171 fest verdrahtet statt ueber Status-Tokens. Aendert das Design-System seine Warnfarben, zeigt ausgerechnet die Compliance-Uebersicht weiter die alten — Statusfarben laufen hier auseinander statt zusammen.

### Enterprise-Seite marketplace_demand_detail: 62 hardcodierte Farbwerte, 1 Token

**Beleg:** `frontend/public/marketplace_demand_detail.html:18`  ·  **Aufwand:** mittel

SLA-Badges (running/met/breached) tragen feste Hexwerte #3b82f6, #22c55e, #ef4444. Dieselben SLA-Zustaende werden auf tokenbasierten Seiten anders eingefaerbt — der Nutzer sieht fuer denselben Status je nach Seite eine andere Farbe.

### Emojis in der globalen Page-Shell — auf praktisch jeder Seite sichtbar

**Beleg:** `frontend/public/js/pageShell.js:445`  ·  **Aufwand:** klein

Benachrichtigungsglocke (U+1F514) und Profilbutton (U+1F464, Zeile 452) sind als Emoji-Codepoints in die Shell einkodiert. Das Projekt verbietet Emojis in produktiver UI; hier stehen sie in der Kopfzeile jeder Seite und werden je nach Betriebssystem unterschiedlich (teils bunt, teils als Ersatzzeichen) gerendert.

### Emojis in der Enterprise-UI von timesheet-templates

**Beleg:** `frontend/public/timesheet-templates.html:136`  ·  **Aufwand:** klein

Die Seitenueberschrift lautet woertlich 'U+1F4CB Stundenzettel-Templates'; weitere Emojis stehen im Leerzustand (Zeile 232), in den Meta-Angaben (Zeile 258 Ordner, Zeile 259 Person), im Standard-Badge (Zeile 253) und auf den Aktionsbuttons (Zeilen 264, 265, 335). Eine B2B-Enterprise-Flaeche wirkt damit wie ein Hobbyprojekt.

### sla_profil.html holt das CSRF-Token von /api/csrf-token — diese Route existiert nicht

**Beleg:** `frontend/public/sla_profil.html:474`  ·  **Aufwand:** klein

Backend bietet nur GET /csrf (api/routes/csrf.js:10); alle anderen 25+ Frontend-Stellen nutzen korrekt /api/csrf. Hier liefert der Aufruf 404, csrfR.ok ist false, csrfToken bleibt "" — die nachfolgenden Mutationen DELETE /api/profile-bounties/:id (Zeile 477) und POST /api/profile-bounties/me (Zeile 500) enden in 403 CSRF_INVALID. Beim Stornieren eines Sichtbarkeits-Antrags (window.promoCancel, Zeilen 470-484) faengt catch(e){} alles ab: der Nutzer bestaetigt den Dialog und nichts geschieht, ohne jede Meldung. Zweite identische Fundstelle: Zeile 496.

### Profil-Nudge im Kapazitaets-Manager verlinkt auf eine Seite, die es nicht gibt

**Beleg:** `frontend/public/capacity_exchange_manage.html:130`  ·  **Aufwand:** klein

Der Call-to-Action zeigt auf /public/company_profile.html; im gesamten Repo existiert nur company_profile_public.html. nginx beantwortet /public/*.html ohne Datei mit hartem 404 (nginx/nginx.conf:126-128). Der Hinweis ist kein Randfall: capacity_exchange_manage.html:809-815 blendet ihn nach jedem /api/me-Load ein, sobald auch nur eines von fuenf Profilfeldern leer ist. Der Nutzer wird also aktiv aufgefordert, sein Profil zu vervollstaendigen, und landet auf einer 404-Seite.

### Merkzettel im Deal-Management fuehrt auf eine nicht existierende Marktplatz-Seite

**Beleg:** `frontend/public/deal_management.html:835`  ·  **Aufwand:** klein

Der Leerzustand des Merkzettels rendert als einzigen Ausweg einen Primaerknopf auf /public/marketplace_feed.html (Zeile 835); dieselbe URL noch einmal ueber der gefuellten Liste (Zeile 842). Die Datei existiert nirgends im Repo (vorhanden sind marketplace_demand_list.html und capacity_exchange_feed.html) — beide Knoepfe enden im nginx-404. Genau der Nutzer mit leerem Merkzettel, den die UI zum Marktplatz schicken will, kommt nicht dort an.

### Stundenzettel-Liste: Nachlade-Knopf ohne Funktion, Liste bei 100 Eintraegen still abgeschnitten

**Beleg:** `frontend/public/timesheets.html:121`  ·  **Aufwand:** mittel

Der Knopf ruft loadMore(), eine Funktion, die weder in timesheets.html noch in einem der acht eingebundenen Skripte (u.a. js/pages/timesheets.js) definiert ist. Zugleich ist sein Container #loadMoreWrap fest auf display:none (Zeile 120) und wird in frontend/public an keiner einzigen Stelle wieder eingeblendet. js/pages/timesheets.js:366 setzt hart limit=100 ohne Offset/Nachladen. Ergebnis: ab dem 101. Stundenzettel fehlen Eintraege komplett ohne Hinweis, und die dafuer vorgesehene Bedienung ist sowohl unsichtbar als auch tot.

### Die Benachrichtigungsglocke im Topbar aller Seiten ist hartkodiert deutsch

**Beleg:** `frontend/public/js/notifications.js:88`  ·  **Aufwand:** mittel

Ueberschrift "Benachrichtigungen", "Alle gelesen", "Alle anzeigen", der Leerzustand "Keine Benachrichtigungen" (Zeile 112) und die Zeitangaben "gerade eben/Min./Std./Tg." (Zeile 30-33) wechseln beim Sprachumschalter nicht mit.

### Die geteilte Seiten-Shell enthaelt hartkodierte deutsche Zustandstexte

**Beleg:** `frontend/public/js/pageShell.js:552`  ·  **Aufwand:** klein

Der Fehlerzustand des Nutzermenues ("Profil nicht verfuegbar") und der Abmelde-Ladezustand ("Wird abgemeldet…", Zeile 829) bleiben auf jeder Enterprise-Seite deutsch, obwohl die Seiten selbst als zweisprachig gelten.

### Sitzungs-/Nachweis-Block im Einsatzportal-Profil laeuft nicht ueber t()

**Beleg:** `frontend/public/einsatzportal-profil.html:1387`  ·  **Aufwand:** klein

Auf einer Seite, die das Testgate ausdruecklich als zweisprachig fuehrt, bleiben "aktive Sitzung(en)", "auf anderen Geraeten", "Keine aktiven Sitzungen gefunden." (1389), "Sitzungen konnten nicht geladen werden." (1391), der Leerzustand der Nachweise (1565) und zwei Validierungsmeldungen (1609, 1614) deutsch.

### Toter Zustand: die Severity-Stufen der Portal-Benachrichtigungen werden nie gesetzt

**Beleg:** `frontend/public/einsatzportal.css:631`  ·  **Aufwand:** mittel

unread-warning, unread-success und unread-error (631-633) faerben den linken Rand je nach Dringlichkeit — die ganze .ep-notif-Komponente (621-643) kommt jedoch in keinem Markup vor; die Benachrichtigungsseite baut stattdessen eigene .notif-item-Elemente. Warnung und Fehler sind optisch nicht unterscheidbar.

### Toter Zustand: der Wochenkalender des Einsatzportals ist nur CSS

**Beleg:** `frontend/public/einsatzportal.css:503`  ·  **Aufwand:** gross

Wochennavigation, Tageszeilen samt den Zustaenden .today und .has-shift (529-530) und die Schichtbloecke (540-547) sind vollstaendig gestylt, aber kein HTML und kein JS erzeugt sie je — der Arbeiter bekommt seine Woche nie in dieser Form zu sehen.

### Toter Zustand: der Wertreport auf der Enterprise-Flaeche ist dauerhaft unsichtbar

**Beleg:** `frontend/public/css/enterprise.css:220`  ·  **Aufwand:** mittel

.tc-value-report ist auf display:none gesetzt und wird von nichts wieder eingeblendet; der komplette KPI-Block (221-229) existiert in keinem Markup. Der versprochene Wertnachweis erreicht den Kunden nie.

### Owner Control Center: 18 React-Dateien ohne jede i18n-Anbindung

**Beleg:** `frontend/src/owner-control/modules/audit/index.tsx:271`  ·  **Aufwand:** gross

Leer- und Fehlerzustaende ("Keine Audit-Eintraege", "Netzwerkfehler beim Laden des Audit-Feeds." Zeile 244) sowie Tabellenkoepfe stehen fest im JSX; die React-Shell hat keinen Zugriff auf TCi18n und ist vom Testgate nicht erfasst.

### timesheet-templates.html: keine i18n, acht Emojis, von keiner Seite verlinkt

**Beleg:** `frontend/public/timesheet-templates.html:136`  ·  **Aufwand:** mittel

Die Seite fuehrt eine H1 mit Emoji, weitere Emojis in Karten und Buttons (232, 253, 258, 264) und deutsche Toasts (370). Der Emoji-Waechter api/test/uiNoEmoji.test.js:32 deckt ausdruecklich nur das Einsatzportal ab, und eine repo-weite Suche findet keinen einzigen Link auf die Datei.

---

## Niedrig — Kosmetik und Hygiene (14)

Nicht dringend, aber sie summieren sich zum Eindruck von Unfertigkeit.

### Angebots-Assets im Marktplatz-Detail scheitern nur in der Konsole

**Beleg:** `frontend/public/js/pages/capacityExchangeDetail.js:2039`  ·  **Aufwand:** klein

loadAssets fängt den Fehler mit console.warn ab und rendert nichts. Schlägt /offer-assets/:id fehl, bleiben Hero-Bild, Firmenlogo und der Sicherheits-/Dokumentenbereich in ihrem Ausgangszustand versteckt — das Angebot wirkt schlicht bildlos, statt dass ein Ladefehler erkennbar wäre. Alle Nachbarlader derselben Datei (loadMatches 2006, loadInteractions 2024) setzen dagegen einen sichtbaren Text.

### Die Plan-Sperre der Hub-Karten laeuft ins Leere — Upgrade-Pfad wird nie gerendert

**Beleg:** `frontend/public/js/pages/enterpriseHub.js:439`  ·  **Aufwand:** klein

applyStaticCardLocks selektiert [data-feature] und rendert daraus Schloss-Symbol, 'Verfuegbar ab <Plan>' und den Link 'Upgrade ansehen'. In enterprise.html — der einzigen Seite, die enterpriseHub.js laedt und die einzige mit #hub-grid — gibt es kein einziges data-feature-Attribut (die Karten tragen data-surface). Das einzige data-feature im ganzen Frontend steht auf sla_profil.html:152, wo kein Skript diesen Selektor abfragt. Die Funktion laeuft ueber eine leere Menge: auf dem Hub erscheint nie ein Upgrade-Hinweis, plan-gesperrte Flaechen verschwinden stattdessen kommentarlos ueber hubVisibility — ein verlorener Verkaufspfad.

### Lieferanten kategorisieren und mit Notiz versehen — Endpunkt ohne UI

**Beleg:** `api/routes/suppliers.js:119`  ·  **Aufwand:** klein

PATCH /suppliers/:id/categorize (:119) setzt Kategorie und Notiz mit Audit-Eintrag, hat aber keinen Aufrufer; die Scorecard-Seite nutzt nur /suppliers/enriched, /suppliers/:id/scorecard und /suppliers/:id/notes. Die Kategorie, nach der /preferred-vendors und der Vendor-Pool filtern, kann im Produkt nie gesetzt werden.

### Admin-Panel: Sichtbarkeits-Audit, Pilot-Policy und Aktionstyp-Filter nicht verdrahtet

**Beleg:** `api/routes/admin.js:96`  ·  **Aufwand:** klein

GET /admin/visibility-audit (:96, vollstaendiger RBAC-Sichtbarkeitsreport), PATCH /admin/organizations/:id/pilot-policy (:199) und GET /admin/activity-feed/action-types (:579) haben keinen Aufrufer, obwohl das Admin Panel /admin/activity-feed nutzt (frontend/public/js/pages/adminPanel.js:1880). Das Team kann den Aktivitaets-Feed also nicht nach Aktionstyp filtern und die Sichtbarkeitsmatrix nicht im Produkt pruefen.

### Onboarding-Schritt manuell abhaken nicht moeglich

**Beleg:** `api/routes/onboarding.js:38`  ·  **Aufwand:** klein

Das Frontend nutzt nur /onboarding/status und /onboarding/dismiss; POST /onboarding/complete-step (:38) hat keinen Aufrufer. Ein Schritt, den der Kunde ausserhalb der Plattform erledigt hat, bleibt in der Checkliste dauerhaft offen — die einzige Alternative ist, den ganzen Assistenten wegzuklicken.

### Emojis fest in den zweisprachigen Uebersetzungsschluesseln der Enterprise-Anfrage

**Beleg:** `frontend/public/js/pages/enterpriseAnfrage.js:69`  ·  **Aufwand:** klein

Die Emojis stecken in den i18n-Werten selbst, parallel in DE (Zeilen 69, 148, 157) und EN (Zeilen 202, 281, 290). Sie erscheinen damit in beiden Sprachen auf der Verkaufsseite fuer den individuellen Tarif — genau dort, wo der Auftritt am seriosesten sein muesste.

### Emoji im Detailtitel und in den Eintragskarten der Stundenzettel

**Beleg:** `frontend/public/js/pages/timesheets.js:433`  ·  **Aufwand:** klein

Der Detailtitel wird als 'U+1F550 ' + Mitarbeitername gesetzt, dieselbe Uhr steht in jeder Schichtzeile (Zeile 455). In der Stundenzettel-Freigabe — einem abrechnungsrelevanten Vorgang — steht damit ein Emoji vor jedem Namen.

### Emoji und komplett tokenfreie Farbgebung im Kontext-Hinweis-Banner

**Beleg:** `frontend/public/js/contextHints.js:174`  ·  **Aufwand:** klein

Das Banner zeigt eine Gluehbirne (U+1F4A1) und ein Kreuz (Zeile 179) und definiert seine gesamte Optik mit 105 festen Farbwerten ohne ein einziges Design-Token (ab Zeile 195: rgba(74,163,255,.3), rgba(10,15,30,.95)). Es ist die einzige Datei mit innerHTML-Interpolation, die ueberhaupt kein esc() kennt — hier unkritisch, weil die Texte aus einem statischen HINTS-Objekt stammen, aber es gibt keine Schranke, falls dort je dynamische Texte einziehen.

### Emojis als Rollen-Icons im Onboarding-Assistenten

**Beleg:** `frontend/public/js/onboardingWizard.js:47`  ·  **Aufwand:** klein

Die drei Rollenauswahl-Karten nutzen U+1F3E2, U+1F465 (Zeile 68) und U+1F477 (Zeile 89) als Icons. Der Onboarding-Assistent ist der allererste Eindruck eines Neukunden; zusaetzlich definiert die Datei ihre komplette Optik mit 105 festen Farbwerten ohne Design-Token (ab Zeile 115).

### Emoji in der Warnungs-Ueberschrift der Organisationsverwaltung

**Beleg:** `frontend/public/organization.html:617`  ·  **Aufwand:** klein

Die Karte fuer Warnungen traegt woertlich 'U+26A0 U+FE0F Warnungen' als Titel. Warnungen sind der Ort, an dem die Oberflaeche am meisten Ernsthaftigkeit braucht.

### Initialen aus Vor-/Nachname ohne esc() in innerHTML

**Beleg:** `frontend/public/js/pages/workerSubmissionsReview.js:3031`  ·  **Aufwand:** klein

Die in Zeile 3014 gebauten Initialen (jeweils erstes Zeichen von Vor- und Nachname) werden als ${ini} ohne esc() in den Avatar geschrieben, obwohl die Datei ein korrektes, quote-sicheres esc() besitzt (Zeile 5539). Kein Script-Ausfuehrungspfad, da nur zwei Zeichen ankommen — aber ein Name, der mit < beginnt, zerlegt das Markup der Zeile. Regelverstoss gegen die esc()-Pflicht, kein akutes Sicherheitsloch.

### Design-System-Bausteine, die nie ein Nutzer sieht

**Beleg:** `frontend/public/css/design-system.css:618`  ·  **Aufwand:** klein

Die KPI-Kachel samt Trendpfeilen (618-657), die Timeline mit ihren Zustaenden success/warning/danger (1186-1212) und die Compliance-Leiste mit vier Farbsegmenten (1101-1134) sind vollstaendig ausformuliert, kommen aber in keiner HTML-, JS- oder TSX-Datei vor.

### internal-control-center.css wird von keiner Seite geladen

**Beleg:** `frontend/public/css/pages/internal-control-center.css:1`  ·  **Aufwand:** klein

Alle 14 icc-Klassen sind tot: die zugehoerige internal_control_center.html ist seit dem Umbau nur noch ein Meta-Refresh auf admin_panel.html und bindet die Datei nicht mehr ein.

### Toter Meldungs-Platzhalter im Kapazitaets-Formular

**Beleg:** `frontend/public/capacity_exchange_form.html:331`  ·  **Aufwand:** klein

#form-msg ist als Meldungsflaeche angelegt, wird aber von keinem Skript befuellt oder eingeblendet — Fehler und Erfolg laufen ausschliesslich ueber den Toast (js/pages/capacityExchangeForm.js:348).

---

## Zusammenfassungen der sechs Blickwinkel

**1.** Geprüft wurden die 8 grössten Seiten-Skripte in frontend/public/js/pages/ (workerSubmissionsReview 308 KB, mitarbeiter 183 KB, executiveDashboard 121 KB, adminPanel 120 KB, capacityExchangeDetail 120 KB, enterpriseAnfrage 62 KB, slaAbo 62 KB, vendorPool 56 KB) plus marketplaceFeed, activity und enterpriseHub. Lade- und Leerzustände sind fast überall vorhanden und ordentlich zweisprachig; der Bruch liegt konsequent am FEHLERzustand. Drei wiederkehrende Muster: (1) Ein leeres catch lässt die Kette abbrechen, ohne dass irgendetwas im DOM davon erfährt — Ladeplatzhalter bleiben stehen oder Flächen bleiben leer (activity.js:757, marketplaceFeed.js:1059/1093, adminPanel.js:1999). (2) Ein fehlgeschlagener /me-Aufruf wird nicht als Fehler, sondern als Aussage über Plan und Berechtigung interpretiert — der Frontend-Fallback in surfaceAccess.js trifft dann selbst eine Berechtigungsentscheidung, entgegen der Projektregel, und begründet sie mit fest kodierten, nur deutschen Texten (executiveDashboard.js:893/1241, vendorPool.js:676/693, enterpriseHub.js:765). (3) Fehler werden als Leerzustand ausgegeben ("Keine DSGVO-Daten" statt "Abruf fehlgeschlagen"), so dass der Nutzer einen Ausfall nicht von echter Datenlosigkeit unterscheiden kann. Am schwersten wiegen zwei Fälle mit Datenverlust bzw. falscher Preisangabe: die Benachrichtigungs-Einstellungen überschreiben beim Speichern stillschweigend die echten Präferenzen mit Defaults, und die Kostenvorschau der Individuell-Anfrage zeigt einen fest kodierten Preis von 2499 EUR weiter, wenn der Katalog nicht geladen werden konnte.

**2.** Das Backend hat drei getrennte Wahrheiten ueber Berechtigungen — die RBAC-Matrix (rbacService.PERMISSIONS, entscheidet an der Route), den Entitlement-Snapshot (entitlementService, kennt Add-ons und Abo-Status) und surface_access (enterpriseSurfaceAccessService, nur Plan-Stufe plus grobe Rollengruppen). Das Frontend liest je nach Seite eine andere davon, und an mehreren Stellen gar keine, sondern eine eigene Kopie im Browser. Daraus entstehen beide Schadensrichtungen gleichzeitig: Rollen sehen Flaechen, die ihre Requests danach mit 403 quittieren (Spend & Kosten fuer hiring_manager), und Rollen verlieren Flaechen, die ihnen laut RBAC zustehen (Lieferantensteuerung fuer hiring_manager, Steuerung & Analytik fuer finance, Preisrahmen-Anlage fuer program_manager). Am teuersten ist, dass surface_access und PlanFeatures nur die Plan-Stufe kennen: ein Kunde, der ein Add-on gekauft hat, wird vom Frontend ausgesperrt, obwohl die API ihn bedienen wuerde. Der richtige Weg existiert bereits — entitlements.js liest den echten Snapshot inklusive Add-ons und Abo-Status — er ist nur auf wenigen Seiten verdrahtet. rate-cards.html hat den Fehler einmal erkannt und behoben (Kommentar "P9 C1"), die Korrektur wurde aber nicht auf die anderen vier Kopien uebertragen.

**3.** Von 932 Routen-Definitionen in api/routes/*.js haben nach Abzug von Cron (/internal/*), Health, OAuth/SCIM rund 90 Endpunkte keinen einzigen Aufrufer im Frontend (frontend/public/js, frontend/public/*.html, frontend/src/owner-control|staff|support). Das Muster ist nicht "einzelne vergessene Buttons", sondern ganze fertig gebaute Router ohne jede Oberflaeche: preferredVendors (8), capacityDiscovery (4), workforce (4), credits (4), mentoring (5), internalControlCenter (15) sowie die komplette Produkt-Analytics — sogar doppelt implementiert (analytics.js und internalControlCenter.js). Am teuersten: "supplier_management" ist in api/config/planCatalog.js:348 mit visible_in_pricing:true als "Preferred First, Coverage" verkauft, und genau die dafuer gebauten Endpunkte sind unerreichbar. Am schaedlichsten fuer den Kunden: die Marktplatz-Sichtbarkeit kann nur gelesen, nie beantragt werden — sla_profil.html:621 verlinkt bei Status "draft" auf die Seite zurueck, auf der der Nutzer schon steht. Wo Lesen und Schreiben zusammengehoeren, fehlt beides (Capacity-Exchange-Analytics: weder das Dashboard noch das Klick-Tracking ist verdrahtet, der Zaehler bliebe also auch nach Nachruesten des Dashboards auf 0). Reporting und Analytics liefern zusammen 17 fertige Auswertungen, von denen das Frontend genau 3 anzeigt.

**4.** Das Frontend ist beim Escaping insgesamt diszipliniert (fast jede Datei definiert und nutzt esc()), hat aber eine systematische Schwachstelle: mehrere esc()-Implementierungen sind ueber `textContent -> innerHTML` gebaut und escapen deshalb KEINE Anfuehrungszeichen — in Text-Position sicher, in Attribut-Position wirkungslos. Genau dort trifft es timesheet-templates.html, wo ein frei eingegebenes Feld-Label unescaped in ein value="..."-Attribut laeuft: verifizierter Stored-XSS-Pfad (Zod erlaubt beliebige Zeichen). Zweites Muster: Seiten, die zwar enterprise.css laden, ihr Farbsystem aber komplett selbst hardcodieren — timesheet-templates.html nutzt 73 Farbwerte und kein einziges Design-Token. Drittens sind Emojis trotz Projektverbot noch in produktiver UI, inklusive der globalen Page-Shell (Glocke/Profil auf jeder Seite). Bereich D ist ein ausdruecklich leeres Ergebnis: 0 console.log in frontend/public UND frontend/src — hier ist nichts zu melden. Auffaellig ist, dass die Maengel sich auf wenige, spaeter hinzugefuegte Seiten konzentrieren, waehrend die Kernflaechen (workerSubmissionsReview, Einsatzportal) sauber sind.

**5.** Es gibt im Frontend echte tote Enden, aber sie sind selten reine Tippfehler — das Muster ist durchgaengig \"Fehler wird geschluckt statt gezeigt\". Von 399 abgeglichenen API-Aufrufen zeigen nur zwei Pfade ins Nichts (/api/csrf-token, PUT /api/company-profile) plus einer in der React-Shell (/owner-control/auth/logout); das Backend-Routing ist also sauber getroffen. Gefaehrlicher ist die zweite Klasse: Aufrufe, die die richtige Route treffen, aber ohne CSRF-Token rausgehen und deshalb 403 bekommen — der komplette Onboarding-Wizard speichert dadurch nichts, und niemand merkt es, weil jeder Aufruf mit .catch(function(){}) endet. Drittens tote Knoepfe und Sackgassen-Links: drei onclick-Handler ohne Funktion (darunter die Hauptaktion der Kundenabrechnung) und drei Links auf .html-Dateien, die es nicht gibt. Anders als das mutationsgepruefte Backend fehlt dem Frontend jede automatisierte Gegenprobe, dass ein Knopf, ein Link oder ein Request auch wirklich ankommt — genau dort sitzen alle acht Befunde.

**6.** Die registrierte Zweisprachigkeit ist makellos: 7130 DE-Schluessel stehen exakt 7130 EN-Schluesseln gegenueber, ueber alle 64 Dateien mit Woerterbuch hinweg keine einzige einseitige Zeile. Der Bruch liegt nicht in den Woerterbuechern, sondern in dem, was gar nicht erst hineingeraten ist — und das Testgate zementiert es, weil es Seiten ohne i18n-Einbindung ausdruecklich ueberspringt (i18nFoundation.test.js:224). Dadurch bleiben eine registrierte Enterprise-Flaeche mit 933 Zeilen, der Cookie-Banner, die Benachrichtigungsglocke und die geteilte Shell einsprachig, ohne dass je ein Test rot wird. Das gleiche Muster wiederholt sich bei den Zustaenden: die Wahrheit steht im Backend (activityLinkFor baut korrekte Deep-Links mit ID), das Frontend haelt zwei schwaechere Kopien derselben Tabelle, die die ID verwerfen — und der Server schreibt zusaetzlich statische Uebersichtslinks in die Benachrichtigung. Sichtbar wird das als Sackgasse fuer den Nutzer, als toter Knopf bei den Stundenzetteln und als mehrere vollstaendig ausgestaltete Komponenten, die kein Markup je erzeugt. Kurz: das Backend ist auf Verhalten geprueft, das Frontend nur auf das, was es freiwillig zur Pruefung angemeldet hat.

---

## Was daraus folgt

Die einzelnen Punkte sind meist klein zu beheben. Die eigentliche Arbeit ist eine
andere: **das Frontend braucht dieselbe Art Gegenprobe wie das Backend.** Konkret
drei Wächter, die alle drei Befundklassen automatisch rot werden lassen:

1. **Jeder `onclick`-Handler zeigt auf eine Funktion, die es gibt.** Fängt tote Knöpfe.
2. **Jeder Frontend-Aufruf trifft eine registrierte Backend-Route** — und jeder
   schreibende Aufruf schickt ein CSRF-Token. Fängt stille 403 und tote Pfade.
3. **Jeder interne Link zeigt auf eine Datei, die existiert.** Fängt Sackgassen.

Diese drei Tests sind billig, laufen ohne Datenbank und hätten **alle acht Befunde
der Klasse „tote Enden" gefunden**, bevor sie einen Kunden erreichen.

*Vorgeschlagen als eigene Spur, weil die Punkte zwar einzeln klein sind, aber
Produktionscode berühren und teilweise Owner-Entscheidungen brauchen (etwa: welche
der rund 90 unbenutzten Endpunkte bekommen eine Oberfläche, welche werden entfernt?).*
