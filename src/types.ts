export type Currency = "CZK" | "EUR" | "USD";

export interface Party {
  name: string;
  ico?: string;
  dic?: string;
  street: string;
  city: string;
  zip: string;
  country: string;
}

export interface Supplier extends Party {
  ico: string;
  email?: string;
  phone?: string;
  bankAccount: string;
  /** Required for the QR payment code. */
  iban?: string;
  vatPayer: boolean;
  vatRate: number;
  currency: Currency;
  footer?: string;
}

export interface InvoiceItem {
  description: string;
  quantity: number;
  unit?: string;
  /** Falls back to `InvoiceInput.pricePerUnit` when omitted. */
  pricePerUnit?: number;
}

export interface PricedItem extends InvoiceItem {
  pricePerUnit: number;
}

/** Contents of `invoice.json`. */
export interface InvoiceInput {
  number?: string;
  issueDate?: string;
  dueDate?: string;
  dueDays?: number;
  paymentMethod?: string;
  variableSymbol?: string;
  pricePerUnit?: number;
  note?: string;
  client: Party;
  items?: InvoiceItem[];
}

/** Invoice with every auto-generated field filled in. */
export interface Invoice {
  number: string;
  issueDate: string;
  dueDate: string;
  paymentMethod: string;
  variableSymbol: string;
  note?: string;
  client: Party;
  items: PricedItem[];
}

export interface Totals {
  subtotal: number;
  vat: number;
  total: number;
}

export interface TimesheetRow {
  issue: string;
  totalHours: number;
}
