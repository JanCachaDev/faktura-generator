import { describe, expect, test } from "bun:test";
import { resolveInvoice } from "../src/core.ts";
import { buildHtml } from "../src/template.ts";
import type { Supplier } from "../src/types.ts";

const supplier: Supplier = {
  name: "Jana Nováková",
  ico: "12345678",
  street: "Ukázková 1",
  city: "Praha",
  zip: "110 00",
  country: "Česká republika",
  bankAccount: "123456789/0800",
  vatPayer: false,
  vatRate: 21,
  currency: "CZK",
};

const invoice = resolveInvoice(
  {
    issueDate: "2025-06-30",
    pricePerUnit: 650,
    client: { name: "Klient <script>", street: "Ulice 1", city: "Brno", zip: "602 00", country: "CZ" },
    items: [{ description: "Vývoj & testy", quantity: 10, unit: "hod" }],
  },
  { existingFiles: [] },
);

describe("buildHtml", () => {
  test("contains the key invoice data", () => {
    const html = buildHtml(supplier, invoice);
    expect(html).toContain("č.&nbsp;202506001");
    expect(html).toContain("30.06.2025");
    expect(html).toContain("14.07.2025");
    expect(html).toContain("6 500,00 Kč");
    expect(html).toContain("Fakturující osoba není plátcem DPH.");
    expect(html).not.toContain("Základ DPH");
  });

  test("escapes user-provided text", () => {
    const html = buildHtml(supplier, invoice);
    expect(html).toContain("Klient &lt;script&gt;");
    expect(html).toContain("Vývoj &amp; testy");
    expect(html).not.toContain("<script>");
  });

  test("shows VAT rows for VAT payers", () => {
    const html = buildHtml({ ...supplier, vatPayer: true }, invoice);
    expect(html).toContain("Základ DPH");
    expect(html).toContain("DPH 21 %");
    expect(html).toContain("7 865,00 Kč");
    expect(html).not.toContain("není plátcem DPH");
  });

  test("embeds the QR code only when provided", () => {
    expect(buildHtml(supplier, invoice)).not.toContain("QR platba");
    expect(buildHtml(supplier, invoice, "<svg></svg>")).toContain("QR platba");
  });
});
