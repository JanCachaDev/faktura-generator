// Pure, side-effect-free logic. Everything here is unit tested.
import type {
  Currency,
  Invoice,
  InvoiceInput,
  PricedItem,
  Supplier,
  TimesheetRow,
  Totals,
} from "./types.ts";

// ---------------------------------------------------------------------------
// Dates — computed in UTC so the result never depends on the machine timezone
// ---------------------------------------------------------------------------

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseIso(iso: string): Date {
  const m = ISO_DATE.exec(iso);
  if (!m) throw new Error(`Invalid date "${iso}", expected YYYY-MM-DD`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Local calendar date of `d` as YYYY-MM-DD. */
export function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(iso: string, days: number): string {
  const d = parseIso(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** 2025-06-30 → 30.06.2025 */
export function formatDate(iso: string): string {
  parseIso(iso);
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

const MONTHS_CS = [
  "leden", "únor", "březen", "duben", "květen", "červen",
  "červenec", "srpen", "září", "říjen", "listopad", "prosinec",
];

/** 2025-06-30 → "červen 2025" */
export function monthYear(iso: string): string {
  const d = parseIso(iso);
  return `${MONTHS_CS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

const CURRENCY_SYMBOL: Record<Currency, string> = { CZK: "Kč", EUR: "€", USD: "$" };

/** 1234.5 → "1 234,50 Kč" (Czech formatting, non-breaking spaces). */
export function formatAmount(n: number, currency: Currency): string {
  const fixed = Math.abs(n).toFixed(2);
  const [int, dec] = fixed.split(".");
  const grouped = int!.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const sign = n < 0 ? "-" : "";
  return `${sign}${grouped},${dec} ${CURRENCY_SYMBOL[currency] ?? currency}`;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeTotals(items: PricedItem[], supplier: Pick<Supplier, "vatPayer" | "vatRate">): Totals {
  const subtotal = round2(items.reduce((sum, i) => sum + i.quantity * i.pricePerUnit, 0));
  const vat = supplier.vatPayer ? round2(subtotal * (supplier.vatRate / 100)) : 0;
  return { subtotal, vat, total: round2(subtotal + vat) };
}

// ---------------------------------------------------------------------------
// Invoice numbering
// ---------------------------------------------------------------------------

/**
 * Next sequence number for the given month, based on PDFs already in the
 * output folder. Matches both `faktura-<name>-YYYYMMNNN.pdf` and the legacy
 * `faktura-YYYYMMNNN.pdf`.
 */
export function nextInvoiceNumber(issueDate: string, existingFiles: string[]): string {
  const yyyymm = issueDate.slice(0, 7).replace("-", "");
  const pattern = new RegExp(`^faktura-(?:.*-)?${yyyymm}(\\d{3,})\\.pdf$`, "i");
  const used = existingFiles
    .map((f) => pattern.exec(f)?.[1])
    .filter((s): s is string => s !== undefined)
    .map(Number);
  const seq = used.length > 0 ? Math.max(...used) + 1 : 1;
  return `${yyyymm}${String(seq).padStart(3, "0")}`;
}

/** Fills in every auto-generated field of the invoice. */
export function resolveInvoice(
  input: InvoiceInput,
  options: { existingFiles?: string[]; today?: Date } = {},
): Invoice {
  if (!input.client) throw new Error('invoice.json is missing "client"');

  const issueDate = input.issueDate ?? toIso(options.today ?? new Date());
  parseIso(issueDate);
  const dueDate = input.dueDate ?? addDays(issueDate, input.dueDays ?? 14);
  const number = input.number ?? nextInvoiceNumber(issueDate, options.existingFiles ?? []);

  const items: PricedItem[] = (input.items ?? []).map((item, i) => {
    const pricePerUnit = item.pricePerUnit ?? input.pricePerUnit;
    if (pricePerUnit === undefined) {
      throw new Error(`Item #${i + 1} ("${item.description}") has no price — set "pricePerUnit"`);
    }
    return { ...item, pricePerUnit };
  });

  return {
    number,
    issueDate,
    dueDate,
    paymentMethod: input.paymentMethod ?? "Převodem",
    variableSymbol: input.variableSymbol ?? number,
    note: input.note,
    client: input.client,
    items,
  };
}

// ---------------------------------------------------------------------------
// QR payment (SPAYD — Czech "QR Platba" standard)
// ---------------------------------------------------------------------------

export function buildSpayd(supplier: Supplier, invoice: Invoice, total: number): string {
  const iban = (supplier.iban ?? "").replace(/\s/g, "").toUpperCase();
  // "*" is the field separator in SPAYD and must not appear inside values.
  const msg = `Faktura ${invoice.number}`.replace(/\*/g, "").slice(0, 60);
  const vs = invoice.variableSymbol.replace(/\D/g, "").slice(0, 10);
  const parts = [
    "SPD*1.0",
    `ACC:${iban}`,
    `AM:${total.toFixed(2)}`,
    `CC:${supplier.currency}`,
    vs ? `X-VS:${vs}` : "",
    `MSG:${msg}`,
  ];
  return parts.filter(Boolean).join("*");
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Name usable in a file name on Windows, macOS and Linux. */
export function fileSlug(name: string): string {
  return name
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/\.+$/, "") || "faktura";
}

// ---------------------------------------------------------------------------
// Jira timesheet CSV
// ---------------------------------------------------------------------------

/** "27h 30m" | "27h" | "1.5h" | "30m" | "1d 2h" (1d = 8h) → hours */
export function parseHours(value: string | undefined): number {
  const v = (value ?? "").trim().toLowerCase().replace(",", ".");
  if (v === "") return 0;
  if (/^\d+(\.\d+)?$/.test(v)) return Number(v);
  const re = /(\d+(?:\.\d+)?)\s*([dhm])/g;
  let total = 0;
  let matched = "";
  for (const m of v.matchAll(re)) {
    const n = Number(m[1]);
    total += m[2] === "d" ? n * 8 : m[2] === "h" ? n : n / 60;
    matched += m[0];
  }
  if (matched.replace(/\s/g, "") !== v.replace(/\s/g, "")) {
    throw new Error(`Unrecognised time value "${value}"`);
  }
  return Math.round(total * 100) / 100;
}

/** Splits one CSV line, honouring quotes and escaped quotes (""). */
export function parseCsvLine(line: string, delimiter = ","): string[] {
  const cells: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { cells.push(cur); cur = ""; }
    else cur += ch;
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

/**
 * Parses a Jira timesheet export: first column = issue key, second = total
 * time spent. Handles BOM, CRLF line endings and `;` delimiters (Excel CZ).
 */
export function parseTimesheet(content: string): TimesheetRow[] {
  const lines = content.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];
  const delimiter = (lines[0]!.match(/;/g)?.length ?? 0) > (lines[0]!.match(/,/g)?.length ?? 0) ? ";" : ",";

  return lines
    .slice(1)
    .map((line) => parseCsvLine(line, delimiter))
    .filter((cells) => cells[0] !== "" && !/^(total|celkem)$/i.test(cells[0]!))
    .map((cells) => ({ issue: cells[0]!, totalHours: parseHours(cells[1]) }))
    .filter((row) => row.totalHours > 0);
}

/** "WZ-27" → "WZ" */
export function issuePrefix(issue: string): string {
  return issue.replace(/-\d+$/, "");
}

/** 32.5 → "32,5" */
export function formatQuantity(n: number): string {
  return String(Math.round(n * 100) / 100).replace(".", ",");
}
