// Shapes are a deliberate subset of the real Zoho Inventory Sales Order API
// response, matching exactly what appears in fixtures/golden/*/sales_order.json
// (unwrapped from the {status, data: {salesorder}} envelope).

export interface ZohoLineItemTax {
  tax_id: string;
  tax_name: string;
  tax_amount: number;
  tax_percentage: number;
}

export interface ZohoLineItem {
  line_item_id: string;
  item_id: string;
  sku: string;
  name: string;
  description: string;
  rate: number; // tax-inclusive catalog price for this line's unit
  quantity: number;
  discount: number; // absolute euro amount, item_level, before tax (0 if none recorded)
  discount_amount: number;
  tax_id: string;
  tax_name: string;
  tax_percentage: number;
  line_item_taxes: ZohoLineItemTax[];
  item_total: number; // net-of-tax, AFTER whatever discount Zoho recorded (may be identical to rate/(1+tax) if discount is 0)
  item_sub_total: number;
}

export type ZohoSalesChannel = 'shopify' | 'direct_sales' | string;

export interface ZohoAddress {
  address: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  country_code: string;
}

export interface ZohoSalesOrder {
  salesorder_id: string;
  salesorder_number: string;
  reference_number: string;
  date: string;
  status: string;
  order_status: string;
  invoiced_status: string;
  has_discount: boolean;
  discount: number; // header-level absolute discount amount
  discount_percent: number;
  discount_type: 'item_level' | 'entity_level' | string;
  is_discount_before_tax: boolean;
  sales_channel: ZohoSalesChannel;
  customer_id: string;
  customer_name: string;
  contact_person_details: { email: string; mobile: string; phone: string }[];
  billing_address: ZohoAddress;
  shipping_address: ZohoAddress;
  line_items: ZohoLineItem[];
  sub_total: number;
  discount_total: number;
  tax_total: number;
  total: number;
  currency_code: string;
}
