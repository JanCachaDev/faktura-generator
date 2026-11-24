// Regenerates docs/preview.png (used in the README) from the example configs.
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { generateInvoice } from "../src/generate.ts";

const root = resolve(import.meta.dir, "..");
const dir = mkdtempSync(join(tmpdir(), "faktura-preview-"));

try {
  copyFileSync(join(root, "supplier.example.json"), join(dir, "supplier.json"));
  copyFileSync(join(root, "invoice.example.json"), join(dir, "invoice.json"));
  await generateInvoice({ dir, screenshotPath: join(root, "docs", "preview.png"), quiet: true });
  console.log("Updated docs/preview.png");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
