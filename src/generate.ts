import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import puppeteer from "puppeteer";
import QRCode from "qrcode";
import { buildSpayd, computeTotals, fileSlug, formatDate, resolveInvoice } from "./core.ts";
import { buildHtml } from "./template.ts";
import type { Invoice, InvoiceInput, InvoiceItem, Supplier } from "./types.ts";

export interface GenerateOptions {
  /** Folder with supplier.json / invoice.json; the PDF is written here too. Defaults to cwd. */
  dir?: string;
  /** Items to use instead of `invoice.json` → `items` (used by the timesheet command). */
  items?: InvoiceItem[];
  supplierFile?: string;
  invoiceFile?: string;
  /** Also save a PNG screenshot of the invoice next to the PDF path given here. */
  screenshotPath?: string;
  quiet?: boolean;
}

export function loadJson<T>(path: string): T {
  if (!existsSync(path)) {
    const name = basename(path);
    const example = name.replace(/\.json$/, ".example.json");
    throw new Error(`File not found: ${path}\nHint: copy ${example} to ${name} and fill in your details.`);
  }
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch (err) {
    throw new Error(`Cannot parse ${path}: ${(err as Error).message}`);
  }
}

function browserArgs(): string[] {
  // Chromium's sandbox is unavailable in most Linux containers / CI runners.
  return process.platform === "linux" ? ["--no-sandbox", "--disable-setuid-sandbox"] : [];
}

export async function renderHtml(supplier: Supplier, invoice: Invoice): Promise<string> {
  let qrSvg: string | undefined;
  if (supplier.iban) {
    const { total } = computeTotals(invoice.items, supplier);
    qrSvg = await QRCode.toString(buildSpayd(supplier, invoice, total), {
      type: "svg",
      margin: 0,
      width: 120,
      color: { dark: "#1a1a1a", light: "#ffffff" },
    });
  }
  return buildHtml(supplier, invoice, qrSvg);
}

/** Generates the invoice PDF and returns its absolute path. */
export async function generateInvoice(options: GenerateOptions = {}): Promise<string> {
  const dir = resolve(options.dir ?? process.cwd());
  const log = options.quiet ? () => {} : console.log;

  const supplier = loadJson<Supplier>(resolve(dir, options.supplierFile ?? "supplier.json"));
  const input = loadJson<InvoiceInput>(resolve(dir, options.invoiceFile ?? "invoice.json"));
  if (options.items) input.items = options.items;

  const invoice = resolveInvoice(input, { existingFiles: readdirSync(dir) });
  if (invoice.items.length === 0) log("Warning: the invoice has no items.");

  log(`Generating invoice no. ${invoice.number}`);
  log(`  Issue date:      ${formatDate(invoice.issueDate)}`);
  log(`  Due date:        ${formatDate(invoice.dueDate)}`);
  log(`  Variable symbol: ${invoice.variableSymbol}`);

  const html = await renderHtml(supplier, invoice);
  const outputPath = join(dir, `faktura-${fileSlug(supplier.name)}-${invoice.number}.pdf`);

  const browser = await puppeteer.launch({ headless: true, args: browserArgs() });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.pdf({ path: outputPath, format: "A4", printBackground: true });
    if (options.screenshotPath) {
      await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });
      await page.screenshot({ path: options.screenshotPath as `${string}.png`, fullPage: true });
    }
  } finally {
    await browser.close();
  }

  log(`Done: ${outputPath}`);
  return outputPath;
}
