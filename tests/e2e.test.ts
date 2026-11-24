// End-to-end: runs the real CLI (Bun + Puppeteer + Chromium) in a temp folder.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const cli = join(root, "src", "cli.ts");
let dir: string;

function run(...args: string[]) {
  const proc = Bun.spawnSync([process.execPath, cli, ...args, "--dir", dir], { stdin: "ignore" });
  return { code: proc.exitCode, out: proc.stdout.toString() + proc.stderr.toString() };
}

const pdfs = () => readdirSync(dir).filter((f) => f.endsWith(".pdf")).sort();

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "faktura-e2e-"));
  copyFileSync(join(root, "supplier.example.json"), join(dir, "supplier.json"));
  copyFileSync(join(root, "invoice.example.json"), join(dir, "invoice.json"));
  copyFileSync(join(root, "timesheet.example.csv"), join(dir, "timesheet.csv"));
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("cli", () => {
  test("--version and --help", () => {
    expect(run("--version").out.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    expect(run("--help").out).toContain("Usage:");
  });

  test("generates a PDF from invoice.json", () => {
    const { code, out } = run();
    expect(out).toContain("Done:");
    expect(code).toBe(0);
    expect(pdfs()).toEqual(["faktura-Jana_Nováková-202506001.pdf"]);
    expect(readFileSync(join(dir, pdfs()[0]!)).subarray(0, 5).toString()).toBe("%PDF-");
  }, 120_000);

  test("next invoice in the same month gets the next number", () => {
    expect(run().code).toBe(0);
    expect(pdfs()).toContain("faktura-Jana_Nováková-202506002.pdf");
  }, 120_000);

  test("generates a PDF from a timesheet without prompting", () => {
    const { code, out } = run("timesheet", join(dir, "timesheet.csv"), "-s", "WZ=Vývoj webu", "-s", "LL=Konzultace");
    expect(out).toContain("WZ-27");
    expect(code).toBe(0);
    expect(pdfs()).toContain("faktura-Jana_Nováková-202506003.pdf");
  }, 120_000);

  test("fails clearly when config is missing", () => {
    rmSync(join(dir, "supplier.json"));
    const { code, out } = run();
    expect(code).toBe(1);
    expect(out).toContain("supplier.example.json");
  });
});
