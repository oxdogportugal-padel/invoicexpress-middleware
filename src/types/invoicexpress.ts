// Shapes matching the real InvoiceXpress API responses observed live and in
// fixtures/golden/*/invoice.json.

export interface InvoiceXpressTaxRef {
  id: number;
  name: string;
  value: number; // percentage, e.g. 23.0
}

export interface InvoiceXpressLineItem {
  name: string; // for a create payload this is the item's `code` in IX's catalog sense; observed responses echo it as `name`
  description?: string;
  unit_price: number; // tax-exclusive
  unit?: string;
  quantity: number;
  tax_id?: number; // required on create; responses embed the full tax object instead
  discount?: number; // percentage, 0-100. InvoiceXpress line items only support a percentage discount, never absolute.
}

export interface InvoiceXpressClient {
  id: number;
  name: string; // observed pattern: "Display Name (phone_number)" or "Company Lda"
  email?: string;
  fiscal_id?: string; // NIF; absent for consumidor final
  country?: string;
  address?: {
    detail?: string;
    postal_code?: string;
    city?: string;
    address_country?: string;
  };
}

export interface InvoiceXpressCreateInvoicePayload {
  invoice: {
    date: string;
    due_date: string;
    reference?: string;
    client: { client_id: number } | InvoiceXpressClient;
    items: InvoiceXpressLineItem[];
  };
}

export interface InvoiceXpressCatalogItem {
  id: number;
  code: string; // matches Zoho's line_item.sku exactly when the item exists in both systems
  description: string;
  unit_price: number;
  tax: InvoiceXpressTaxRef;
}
