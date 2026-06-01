#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function parseArgs(argv) {
  const args = {
    dryRun: false,
    file: "monitoring/posthog/insights-templates.json"
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (token === "--file") {
      args.file = argv[i + 1] || args.file;
      i += 1;
      continue;
    }
  }
  return args;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

async function fetchInsights(apiBase, projectId, headers) {
  const url = `${apiBase}/api/projects/${projectId}/insights/?limit=200`;
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Failed to load existing insights (${response.status})`);
  }
  const data = await response.json();
  return Array.isArray(data?.results) ? data.results : [];
}

function toPostHogPayload(template) {
  const events = Array.isArray(template.events) ? template.events : [];
  const funnelSteps = events.map((eventName) => ({
    event: eventName,
    type: "events",
    order: 0
  }));

  const filters = template.filters || {};
  const intervalDays = Number(filters.date_range_days || 30);
  const dateFrom = `-${Number.isFinite(intervalDays) ? intervalDays : 30}d`;

  const properties = [];
  if (filters.customer_segment && filters.customer_segment !== "all") {
    properties.push({
      key: "customer_segment",
      operator: "exact",
      type: "event",
      value: [filters.customer_segment]
    });
  }

  const breakdownProp = template.breakdown
    ? { breakdown: template.breakdown, breakdown_type: "event" }
    : {};

  const commonFilters = {
    events: events.map((eventName) => ({ id: eventName, name: eventName, type: "events", order: 0 })),
    properties,
    date_from: dateFrom,
    insight: template.type === "funnel" ? "FUNNELS" : "TRENDS",
    ...breakdownProp
  };

  if (template.type === "funnel") {
    return {
      name: template.name,
      description: `TempConnect template key: ${template.key}`,
      filters: {
        ...commonFilters,
        funnel_window_interval: 14,
        funnel_window_interval_unit: "day",
        layout: "horizontal",
        events: funnelSteps
      }
    };
  }

  return {
    name: template.name,
    description: `TempConnect template key: ${template.key}`,
    filters: commonFilters
  };
}

async function createInsight(apiBase, projectId, headers, payload) {
  const url = `${apiBase}/api/projects/${projectId}/insights/`;
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Create failed (${response.status}): ${body.slice(0, 400)}`);
  }
  return response.json();
}

async function main() {
  const { dryRun, file } = parseArgs(process.argv.slice(2));
  const apiBase = requiredEnv("POSTHOG_API_HOST").replace(/\/$/, "");
  const projectId = requiredEnv("POSTHOG_PROJECT_ID");
  const token = requiredEnv("POSTHOG_PERSONAL_API_KEY");

  const absoluteFile = path.resolve(process.cwd(), file);
  const raw = await readFile(absoluteFile, "utf8");
  const templateFile = JSON.parse(raw);
  const templates = Array.isArray(templateFile?.insights) ? templateFile.insights : [];
  if (!templates.length) {
    throw new Error("No insight templates found in file.");
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };

  const existing = await fetchInsights(apiBase, projectId, headers);
  const existingByDescription = new Map(
    existing
      .map((insight) => [String(insight?.description || "").trim(), insight])
      .filter(([description]) => description.startsWith("TempConnect template key: "))
  );

  let created = 0;
  let skipped = 0;
  console.log(`Loaded ${templates.length} templates from ${absoluteFile}`);
  console.log(`Existing managed insights: ${existingByDescription.size}`);

  for (const template of templates) {
    const marker = `TempConnect template key: ${template.key}`;
    if (existingByDescription.has(marker)) {
      skipped += 1;
      console.log(`SKIP  ${template.key} (${template.name})`);
      continue;
    }

    if (dryRun) {
      created += 1;
      console.log(`DRY   ${template.key} (${template.name})`);
      continue;
    }

    const payload = toPostHogPayload(template);
    await createInsight(apiBase, projectId, headers, payload);
    created += 1;
    console.log(`CREATE ${template.key} (${template.name})`);
  }

  console.log("");
  console.log(`Done. created=${created} skipped=${skipped} dryRun=${dryRun}`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
