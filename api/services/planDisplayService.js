export function getPlanDisplayLabel(plan) {
  const p = String(plan || "DEMO").toUpperCase();
  if (p === "FREE") return "DEMO";
  if (p === "INDIVIDUELL" || p === "ENTERPRISE" || p === "INDIVIDUAL") return "Individueller Tarif";
  return p;
}
