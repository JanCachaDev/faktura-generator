import { computeTotals, escapeHtml as e, formatAmount, formatDate, formatQuantity, monthYear } from "./core.ts";
import type { Invoice, Party, Supplier } from "./types.ts";

const STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #1a1a1a; padding: 1.2cm 1.5cm; line-height: 1.4; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.2rem; padding-bottom: 1rem; border-bottom: 2px solid #1a1a1a; }
  .invoice-title { font-size: 24px; font-weight: 700; line-height: 1; margin-bottom: 4px; }
  .invoice-number { font-size: 13px; color: #666; }
  .header-right { text-align: right; }
  .supplier-name { font-size: 13px; font-weight: 700; margin-bottom: 4px; }
  .header-right p { color: #333; margin: 1px 0; }
  .parties { display: flex; gap: 1.2rem; margin-bottom: 1.2rem; }
  .party { flex: 1; background: #f7f7f7; border-radius: 6px; padding: 0.7rem; }
  .party-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #888; margin-bottom: 6px; }
  .party-name { font-size: 12px; font-weight: 700; margin-bottom: 3px; }
  .party p { color: #444; margin: 1px 0; }
  .payment-info { flex: 1; border: 1px solid #e0e0e0; border-radius: 6px; padding: 0.7rem; }
  .payment-info table { width: 100%; }
  .payment-info td { padding: 2px 0; }
  .payment-info td:first-child { color: #777; width: 50%; }
  .payment-info td:last-child { font-weight: 600; text-align: right; white-space: nowrap; }
  .items-table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; }
  .items-table thead tr { background: #1a1a1a; color: #fff; }
  .items-table thead th { padding: 6px 8px; font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; text-align: left; }
  .items-table tbody tr:nth-child(even) { background: #f9f9f9; }
  .items-table tbody td { padding: 5px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
  .items-table .right { text-align: right; }
  .totals-section { display: flex; justify-content: flex-end; margin-bottom: 1rem; }
  .totals-box { width: 260px; border: 1px solid #e0e0e0; border-radius: 6px; overflow: hidden; }
  .totals-box table { width: 100%; border-collapse: collapse; }
  .subtotal-row td { padding: 4px 10px; color: #555; border-bottom: 1px solid #eee; }
  .subtotal-row td:last-child, .total-row td:last-child { text-align: right; }
  .total-row td { padding: 8px 10px; font-size: 13px; font-weight: 700; background: #1a1a1a; color: #fff; }
  .qr-block { text-align: center; margin-top: 0.6rem; padding-top: 0.6rem; border-top: 0.5px solid #e0e0e0; }
  .qr-code svg { width: 80px; height: 80px; }
  .note-box { background: #fffbf0; border-left: 3px solid #f0a500; border-radius: 4px; padding: 0.5rem 0.75rem; margin-bottom: 0.75rem; }
  .non-vat-note { font-size: 10px; color: #888; margin-bottom: 0.4rem; }
  .footer-note { font-size: 10px; color: #aaa; border-top: 1px solid #eee; padding-top: 0.5rem; margin-top: 0.75rem; }
`;

const line = (text: string | undefined, prefix = "") => (text ? `<p>${prefix}${e(text)}</p>` : "");

function partyLines(p: Party): string {
  return [
    line(p.street),
    line(`${p.zip} ${p.city}`.trim()),
    line(p.country),
    line(p.ico, "IČO: "),
    line(p.dic, "DIČ: "),
  ].join("\n");
}

/**
 * Renders the invoice as a self-contained HTML document.
 * @param qrSvg SVG markup of the payment QR code (trusted — generated locally).
 */
export function buildHtml(supplier: Supplier, invoice: Invoice, qrSvg?: string): string {
  const { subtotal, vat, total } = computeTotals(invoice.items, supplier);
  const money = (n: number) => formatAmount(n, supplier.currency);

  const itemRows = invoice.items
    .map(
      (item) => `
      <tr>
        <td>${e(item.description)}</td>
        <td class="right">${formatQuantity(item.quantity)}${item.unit ? ` ${e(item.unit)}` : ""}</td>
        <td class="right">${money(item.pricePerUnit)}</td>
        <td class="right">${money(item.quantity * item.pricePerUnit)}</td>
      </tr>`,
    )
    .join("");

  const vatRows = supplier.vatPayer
    ? `<tr class="subtotal-row"><td>Základ DPH</td><td>${money(subtotal)}</td></tr>
       <tr class="subtotal-row"><td>DPH ${e(supplier.vatRate)} %</td><td>${money(vat)}</td></tr>`
    : "";

  const qrBlock = qrSvg
    ? `<div class="qr-block"><div class="party-label">QR platba</div><div class="qr-code">${qrSvg}</div></div>`
    : "";

  return `<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8" />
  <title>Faktura – ${e(supplier.name)} – ${monthYear(invoice.issueDate)}</title>
  <style>${STYLES}</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="invoice-title">FAKTURA</div>
      <div class="invoice-number">č.&nbsp;${e(invoice.number)}</div>
    </div>
    <div class="header-right">
      <p class="supplier-name">${e(supplier.name)}</p>
      ${partyLines(supplier)}
      ${line(supplier.email)}
      ${line(supplier.phone)}
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <div class="party-label">Odběratel</div>
      <div class="party-name">${e(invoice.client.name)}</div>
      ${partyLines(invoice.client)}
    </div>
    <div class="payment-info">
      <div class="party-label">Platební údaje</div>
      <table>
        <tr><td>Datum vystavení</td><td>${formatDate(invoice.issueDate)}</td></tr>
        <tr><td>Datum splatnosti</td><td>${formatDate(invoice.dueDate)}</td></tr>
        <tr><td>Způsob platby</td><td>${e(invoice.paymentMethod)}</td></tr>
        <tr><td>Variabilní symbol</td><td>${e(invoice.variableSymbol)}</td></tr>
        ${supplier.bankAccount ? `<tr><td>Číslo účtu</td><td>${e(supplier.bankAccount)}</td></tr>` : ""}
        ${supplier.iban ? `<tr><td>IBAN</td><td>${e(supplier.iban)}</td></tr>` : ""}
      </table>
      ${qrBlock}
    </div>
  </div>

  <table class="items-table">
    <thead>
      <tr>
        <th style="width:55%">Popis</th>
        <th class="right" style="width:12%">Množství</th>
        <th class="right" style="width:18%">Cena / j.</th>
        <th class="right" style="width:15%">Celkem</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <div class="totals-section">
    <div class="totals-box">
      <table>
        ${vatRows}
        <tr class="total-row"><td>Celkem k úhradě</td><td>${money(total)}</td></tr>
      </table>
    </div>
  </div>

  ${invoice.note ? `<div class="note-box">${e(invoice.note)}</div>` : ""}
  ${supplier.vatPayer ? "" : `<p class="non-vat-note">Fakturující osoba není plátcem DPH.</p>`}
  ${supplier.footer ? `<div class="footer-note">${e(supplier.footer)}</div>` : ""}
</body>
</html>`;
}
