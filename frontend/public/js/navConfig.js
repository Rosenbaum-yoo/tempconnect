/**
 * Shared navigation definitions.
 * Source of truth for sidebar, dashboard cards, and any future nav component.
 * href values: SPA pages use /#page hash (index.html reads hash on load).
 * Enterprise pages use direct URLs.
 */
"use strict";

// eslint-disable-next-line no-unused-vars
var NAV_ITEMS = [
  { key: "enterprise",   label: "Kapazitätssuche",    href: "/public/enterprise.html", icon: "⚡", description: "Live-Kapazitäten, Pulse-Timer, Compliance" },
  { key: "dashboard",    label: "Suche",              href: "/#dashboard",    icon: "🔍", description: "Marketplace durchsuchen und Anfragen senden" },
  { key: "profile",      label: "Anbieten",           href: "/#profile",      icon: "📋", description: "Eigene Angebote anlegen und verwalten" },
  { key: "requests",     label: "Anfragen",           href: "/#requests",     icon: "📨", description: "Status und Verlauf aller Anfragen" },
  { key: "proofs",       label: "Nachweise",          href: "/#proofs",       icon: "✅", description: "Abgeschlossene Deals als Nachweis" },
  { key: "info",         label: "Mein Profil",        href: "/#info",         icon: "👤", description: "Kontodaten und Firmenprofil bearbeiten" },
  { key: "subscription", label: "Abo-Modelle",        href: "/#subscription", icon: "💎", description: "Tarif wählen und Nutzung einsehen" },
  { key: "help",         label: "Hilfe & Anleitung",  href: "/#help",         icon: "❓", description: "FAQ, Kontakt und Erste Schritte" }
];
