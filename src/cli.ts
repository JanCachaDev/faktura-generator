#!/usr/bin/env bun
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import pkg from "../package.json" with { type: "json" };
import { issuePrefix, parseTimesheet } from "./core.ts";
import { generateInvoice, loadJson } from "./generate.ts";
import type { InvoiceInput, InvoiceItem } from "./types.ts";

const HELP = `faktura ${pkg.version} — PDF invoice generator for Czech freelancers

Usage:
  faktura [invoice]                 Generate a PDF from supplier.json + invoice.json
  faktura timesheet <file.csv>      Generate a PDF from a Jira timesheet export

Options:
  -d, --dir <path>                  Folder with the JSON configs (default: current folder)
  -s, --service <PREFIX=label>      Service label for an issue prefix, e.g. -s "WZ=Vývoj webu"
                                    (skips the interactive prompt; can be repeated)
  -h, --help                        Show this help
  -v, --version                     Show the version
`;

interface Args {
  command: "invoice" | "timesheet";
  csv?: string;
  dir: string;
  services: Record<string, string>;
}

function parseArgs(argv: string[]): Args | null {
  const args: Args = { command: "invoice", dir: process.cwd(), services: {} };
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`Missing value for ${a}`);
      return v;
    };
    if (a === "-h" || a === "--help") { console.log(HELP); return null; }
    if (a === "-v" || a === "--version") { console.log(pkg.version); return null; }
    if (a === "-d" || a === "--dir") args.dir = resolve(value());
    else if (a === "-s" || a === "--service") {
      const [prefix, ...label] = value().split("=");
      if (!prefix || label.length === 0) throw new Error(`--service expects PREFIX=label, got "${argv[i]}"`);
      args.services[prefix] = label.join("=");
    } else if (a.startsWith("-")) throw new Error(`Unknown option ${a}\n\n${HELP}`);
    else positional.push(a);
  }

  const [command, csv] = positional;
  if (command === "timesheet") {
    args.command = "timesheet";
    args.csv = resolve(csv ?? resolve(args.dir, "timesheet.csv"));
  } else if (command !== undefined && command !== "invoice") {
    throw new Error(`Unknown command "${command}"\n\n${HELP}`);
  }
  return args;
}

async function askServiceTypes(prefixes: string[], known: Record<string, string>) {
  const missing = prefixes.filter((p) => !(p in known));
  if (missing.length === 0) return known;

  // The async iterator buffers lines, so piped input (`printf 'a\nb\n' | faktura …`) works too.
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const lines = rl[Symbol.asyncIterator]();
  try {
    for (const prefix of missing) {
      process.stdout.write(`Service type for "${prefix}" issues: `);
      const { value, done } = await lines.next();
      if (done) throw new Error(`No answer for "${prefix}" — use --service ${prefix}=<label>`);
      known[prefix] = String(value).trim() || prefix;
    }
  } finally {
    rl.close();
  }
  return known;
}

async function runTimesheet(args: Args) {
  const csvPath = args.csv!;
  if (!existsSync(csvPath)) throw new Error(`Timesheet not found: ${csvPath}`);
  console.log(`Loading timesheet: ${csvPath}`);

  const rows = parseTimesheet(readFileSync(csvPath, "utf-8"));
  if (rows.length === 0) throw new Error("No items with logged time found in the CSV.");

  const { pricePerUnit = 0 } = loadJson<InvoiceInput>(resolve(args.dir, "invoice.json"));
  const fmt = (n: number) => n.toLocaleString("cs-CZ", { maximumFractionDigits: 2 });

  console.log("\nItems found:");
  for (const r of rows) {
    console.log(`  ${r.issue.padEnd(12)} ${fmt(r.totalHours).padStart(6)} h  →  ${fmt(r.totalHours * pricePerUnit)} Kč`);
  }
  const totalHours = rows.reduce((s, r) => s + r.totalHours, 0);
  console.log(`  ${"Total".padEnd(12)} ${fmt(totalHours).padStart(6)} h  →  ${fmt(totalHours * pricePerUnit)} Kč\n`);

  const prefixes = [...new Set(rows.map((r) => issuePrefix(r.issue)))];
  const labels = await askServiceTypes(prefixes, args.services);

  const items: InvoiceItem[] = rows.map((r) => ({
    description: `${labels[issuePrefix(r.issue)]} ${r.issue}`,
    quantity: r.totalHours,
    unit: "hod",
  }));

  await generateInvoice({ dir: args.dir, items });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args) return;
  if (args.command === "timesheet") await runTimesheet(args);
  else await generateInvoice({ dir: args.dir });
}

main().catch((err: Error) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
