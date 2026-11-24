import { describe, expect, test } from "bun:test";
import {
  addDays,
  buildSpayd,
  computeTotals,
  escapeHtml,
  fileSlug,
  formatQuantity,
  formatAmount,
  formatDate,
  monthYear,
  nextInvoiceNumber,
  parseCsvLine,
  parseHours,
  parseTimesheet,
  resolveInvoice,
} from "../src/core.ts";
import type { Supplier } from "../src/types.ts";

const NBSP = " ";

const supplier: Supplier = {
  name: "Jana Nováková",
  ico: "12345678",
  street: "Ukázková 1",
  city: "Praha",
  zip: "110 00",
  country: "Česká republika",
  bankAccount: "123456789/0800",
  iban: "CZ65 0800 0000 1920 0014 5399",
  vatPayer: false,
  vatRate: 21,
  currency: "CZK",
};

const client = { name: "Klient s.r.o.", street: "Ulice 1", city: "Brno", zip: "602 00", country: "CZ" };

describe("dates", () => {
  test("addDays crosses month and year boundaries", () => {
    expect(addDays("2025-06-30", 14)).toBe("2025-07-14");
    expect(addDays("2025-12-25", 14)).toBe("2026-01-08");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
  });

  test("formatDate and monthYear", () => {
    expect(formatDate("2025-06-03")).toBe("03.06.2025");
    expect(monthYear("2025-06-03")).toBe("červen 2025");
  });

  test("rejects malformed dates", () => {
    expect(() => formatDate("30.6.2025")).toThrow(/YYYY-MM-DD/);
  });
});

describe("formatAmount", () => {
  test("uses Czech formatting", () => {
    expect(formatAmount(1234.5, "CZK")).toBe(`1${NBSP}234,50${NBSP}Kč`);
    expect(formatAmount(1234567, "EUR")).toBe(`1${NBSP}234${NBSP}567,00${NBSP}€`);
    expect(formatAmount(0, "USD")).toBe(`0,00${NBSP}$`);
  });
});

describe("computeTotals", () => {
  const items = [
    { description: "a", quantity: 10.5, pricePerUnit: 650 },
    { description: "b", quantity: 1, pricePerUnit: 100 },
  ];

  test("non-VAT payer", () => {
    expect(computeTotals(items, supplier)).toEqual({ subtotal: 6925, vat: 0, total: 6925 });
  });

  test("VAT payer", () => {
    expect(computeTotals(items, { vatPayer: true, vatRate: 21 })).toEqual({
      subtotal: 6925,
      vat: 1454.25,
      total: 8379.25,
    });
  });
});

describe("nextInvoiceNumber", () => {
  test("starts at 001", () => {
    expect(nextInvoiceNumber("2025-06-30", [])).toBe("202506001");
  });

  test("continues after existing invoices of the same month", () => {
    const files = [
      "faktura-Jana_Novakova-202506001.pdf",
      "faktura-Jana_Novakova-202506002.pdf",
      "faktura-Jana_Novakova-202505009.pdf",
      "notes.txt",
    ];
    expect(nextInvoiceNumber("2025-06-30", files)).toBe("202506003");
  });

  test("understands the legacy file name", () => {
    expect(nextInvoiceNumber("2025-06-01", ["faktura-202506004.pdf"])).toBe("202506005");
  });
});

describe("resolveInvoice", () => {
  test("fills defaults", () => {
    const inv = resolveInvoice(
      { issueDate: "2025-06-30", pricePerUnit: 500, client, items: [{ description: "x", quantity: 2 }] },
      { existingFiles: [] },
    );
    expect(inv.number).toBe("202506001");
    expect(inv.variableSymbol).toBe("202506001");
    expect(inv.dueDate).toBe("2025-07-14");
    expect(inv.paymentMethod).toBe("Převodem");
    expect(inv.items[0]!.pricePerUnit).toBe(500);
  });

  test("uses today when issueDate is missing", () => {
    const inv = resolveInvoice({ client }, { today: new Date(2025, 0, 31) });
    expect(inv.issueDate).toBe("2025-01-31");
    expect(inv.dueDate).toBe("2025-02-14");
  });

  test("respects explicit overrides", () => {
    const inv = resolveInvoice({
      client,
      issueDate: "2025-06-30",
      dueDate: "2025-08-01",
      number: "X1",
      variableSymbol: "42",
    });
    expect(inv).toMatchObject({ number: "X1", variableSymbol: "42", dueDate: "2025-08-01" });
  });

  test("item price overrides the global one", () => {
    const inv = resolveInvoice({
      client,
      pricePerUnit: 500,
      items: [{ description: "x", quantity: 1, pricePerUnit: 900 }],
    });
    expect(inv.items[0]!.pricePerUnit).toBe(900);
  });

  test("throws on an item without any price", () => {
    expect(() => resolveInvoice({ client, items: [{ description: "x", quantity: 1 }] })).toThrow(/no price/);
  });
});

describe("buildSpayd", () => {
  const invoice = resolveInvoice({ client, issueDate: "2025-06-30" }, { existingFiles: [] });

  test("produces a valid QR Platba string", () => {
    expect(buildSpayd(supplier, invoice, 6925)).toBe(
      "SPD*1.0*ACC:CZ6508000000192000145399*AM:6925.00*CC:CZK*X-VS:202506001*MSG:Faktura 202506001",
    );
  });

  test("uses the supplier currency", () => {
    expect(buildSpayd({ ...supplier, currency: "EUR" }, invoice, 10)).toContain("*CC:EUR*");
  });
});

describe("helpers", () => {
  test("escapeHtml", () => {
    expect(escapeHtml(`<b>"Tom & Jerry's"</b>`)).toBe("&lt;b&gt;&quot;Tom &amp; Jerry&#39;s&quot;&lt;/b&gt;");
  });

  test("fileSlug is safe on every OS", () => {
    expect(fileSlug("Jana Nováková")).toBe("Jana_Nováková");
    expect(formatQuantity(32.5)).toBe("32,5");
    expect(formatQuantity(1 / 3)).toBe("0,33");
    expect(fileSlug('A/B:C*D?"E<F>|G.')).toBe("ABCDEFG");
  });
});

describe("timesheet parsing", () => {
  test.each([
    ["", 0],
    ["10h", 10],
    ["10h 30m", 10.5],
    ["10h30m", 10.5],
    ["45m", 0.75],
    ["1.5h", 1.5],
    ["1,5h", 1.5],
    ["1d 2h", 10],
    ["7", 7],
  ])("parseHours(%p) = %p", (input, expected) => {
    expect(parseHours(input)).toBe(expected);
  });

  test("parseHours rejects garbage", () => {
    expect(() => parseHours("ten hours")).toThrow();
  });

  test("parseCsvLine handles quotes and escaped quotes", () => {
    expect(parseCsvLine(`"a, b","say ""hi""",c`)).toEqual(["a, b", `say "hi"`, "c"]);
  });

  test("parseTimesheet handles BOM, CRLF and the total row", () => {
    const csv = `﻿"Issue","Time spent","01 Mon"\r\n"WZ-27","10h 30m","5h"\r\n"LL-3","45m",""\r\n"","11h 15m",""\r\n`;
    expect(parseTimesheet(csv)).toEqual([
      { issue: "WZ-27", totalHours: 10.5 },
      { issue: "LL-3", totalHours: 0.75 },
    ]);
  });

  test("parseTimesheet supports semicolon-separated files", () => {
    expect(parseTimesheet("Issue;Time spent\nWZ-1;2h\n")).toEqual([{ issue: "WZ-1", totalHours: 2 }]);
  });
});
