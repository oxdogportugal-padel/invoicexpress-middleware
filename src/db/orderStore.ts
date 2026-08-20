import type Database from 'better-sqlite3';
import { redactHeaders, redactJson, redactText } from '../lib/redact.js';

export type OrderStatus = 'processing' | 'succeeded' | 'failed' | 'parked' | 'skipped_duplicate' | 'retrying';

export interface OrderRow {
  id: number;
  correlation_id: string;
  zoho_salesorder_id: string;
  zoho_salesorder_number: string | null;
  status: OrderStatus;
  stage: string | null;
  invoicexpress_invoice_id: string | null;
  invoicexpress_client_id: string | null;
  failure_reason: string | null;
  attempt_count: number;
  webhook_payload_digest: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
}

export class OrderStore {
  constructor(private db: Database.Database) {}

  /** Returns the existing order row for this Zoho sales order, if any. Callers use this for idempotency. */
  findByZohoSalesOrderId(zohoSalesOrderId: string): OrderRow | undefined {
    return this.db
      .prepare('SELECT * FROM orders WHERE zoho_salesorder_id = ?')
      .get(zohoSalesOrderId) as OrderRow | undefined;
  }

  findByCorrelationId(correlationId: string): OrderRow | undefined {
    return this.db.prepare('SELECT * FROM orders WHERE correlation_id = ?').get(correlationId) as
      | OrderRow
      | undefined;
  }

  findById(id: number): OrderRow | undefined {
    return this.db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as OrderRow | undefined;
  }

  /**
   * Atomically creates the order row if absent, or returns the existing one.
   * Relies on the UNIQUE constraint on zoho_salesorder_id to make concurrent
   * duplicate webhook deliveries race-safe at the DB layer, not just in app logic.
   */
  createIfAbsent(params: {
    correlationId: string;
    zohoSalesOrderId: string;
    zohoSalesOrderNumber: string | null;
    webhookPayloadDigest: string | null;
  }): { row: OrderRow; created: boolean } {
    const now = new Date().toISOString();
    try {
      this.db
        .prepare(
          `INSERT INTO orders (correlation_id, zoho_salesorder_id, zoho_salesorder_number, status, attempt_count, webhook_payload_digest, created_at)
           VALUES (?, ?, ?, 'processing', 1, ?, ?)`
        )
        .run(params.correlationId, params.zohoSalesOrderId, params.zohoSalesOrderNumber, params.webhookPayloadDigest, now);
      const row = this.findByZohoSalesOrderId(params.zohoSalesOrderId)!;
      return { row, created: true };
    } catch (err: unknown) {
      if (err instanceof Error && /UNIQUE constraint failed/.test(err.message)) {
        const row = this.findByZohoSalesOrderId(params.zohoSalesOrderId)!;
        return { row, created: false };
      }
      throw err;
    }
  }

  markStage(id: number, stage: string): void {
    this.db.prepare('UPDATE orders SET stage = ? WHERE id = ?').run(stage, id);
  }

  markStarted(id: number): void {
    this.db.prepare("UPDATE orders SET started_at = ?, status = 'processing' WHERE id = ?").run(
      new Date().toISOString(),
      id
    );
  }

  markSucceeded(id: number, invoicexpressInvoiceId: string, invoicexpressClientId: string): void {
    this.finish(id, 'succeeded', { invoicexpressInvoiceId, invoicexpressClientId });
  }

  markFailed(id: number, reason: string): void {
    this.finish(id, 'failed', { failureReason: reason });
  }

  markParked(id: number, reason: string): void {
    this.finish(id, 'parked', { failureReason: reason });
  }

  markSkippedDuplicate(id: number): void {
    this.finish(id, 'skipped_duplicate', {});
  }

  markRetrying(id: number, reason: string): void {
    this.db
      .prepare("UPDATE orders SET status = 'retrying', failure_reason = ?, attempt_count = attempt_count + 1 WHERE id = ?")
      .run(reason, id);
  }

  private finish(
    id: number,
    status: OrderStatus,
    extra: { invoicexpressInvoiceId?: string; invoicexpressClientId?: string; failureReason?: string }
  ): void {
    const row = this.findById(id);
    const now = new Date().toISOString();
    const startedAt = row?.started_at ?? now;
    const durationMs = Date.now() - Date.parse(startedAt);
    this.db
      .prepare(
        `UPDATE orders SET status = ?, invoicexpress_invoice_id = COALESCE(?, invoicexpress_invoice_id),
         invoicexpress_client_id = COALESCE(?, invoicexpress_client_id), failure_reason = ?,
         finished_at = ?, duration_ms = ? WHERE id = ?`
      )
      .run(status, extra.invoicexpressInvoiceId ?? null, extra.invoicexpressClientId ?? null, extra.failureReason ?? null, now, durationMs, id);
  }

  listRecent(limit = 200): OrderRow[] {
    return this.db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT ?').all(limit) as OrderRow[];
  }

  counts(): Record<OrderStatus, number> {
    const rows = this.db.prepare('SELECT status, COUNT(*) as n FROM orders GROUP BY status').all() as {
      status: OrderStatus;
      n: number;
    }[];
    const out: Record<OrderStatus, number> = {
      processing: 0,
      succeeded: 0,
      failed: 0,
      parked: 0,
      skipped_duplicate: 0,
      retrying: 0,
    };
    for (const r of rows) out[r.status] = r.n;
    return out;
  }

  logExternalCall(params: {
    correlationId: string;
    orderId: number | null;
    service: 'zoho' | 'invoicexpress';
    purpose: string;
    method: string;
    url: string;
    requestHeaders?: Record<string, string | undefined>;
    requestBody?: unknown;
    responseStatus?: number;
    responseHeaders?: Record<string, string | undefined>;
    responseBody?: unknown;
    error?: string;
    startedAt: string;
    durationMs: number;
  }): void {
    this.db
      .prepare(
        `INSERT INTO external_calls (correlation_id, order_id, service, purpose, method, url, request_headers, request_body, response_status, response_headers, response_body, error, started_at, duration_ms)
         VALUES (@correlation_id, @order_id, @service, @purpose, @method, @url, @request_headers, @request_body, @response_status, @response_headers, @response_body, @error, @started_at, @duration_ms)`
      )
      .run({
        correlation_id: params.correlationId,
        order_id: params.orderId,
        service: params.service,
        purpose: params.purpose,
        method: params.method,
        url: redactText(params.url),
        request_headers: params.requestHeaders ? redactHeaders(params.requestHeaders) : null,
        request_body: params.requestBody !== undefined ? redactJson(params.requestBody) : null,
        response_status: params.responseStatus ?? null,
        response_headers: params.responseHeaders ? redactHeaders(params.responseHeaders) : null,
        response_body: params.responseBody !== undefined ? redactJson(params.responseBody) : null,
        error: params.error ? redactText(params.error) : null,
        started_at: params.startedAt,
        duration_ms: params.durationMs,
      });
  }

  listExternalCallsForOrder(orderId: number): unknown[] {
    return this.db
      .prepare('SELECT * FROM external_calls WHERE order_id = ? ORDER BY started_at ASC')
      .all(orderId);
  }

  log(params: { correlationId: string; orderId: number | null; level: 'debug' | 'info' | 'warn' | 'error'; stage?: string; message: string }): void {
    this.db
      .prepare('INSERT INTO log_lines (correlation_id, order_id, level, stage, message, ts) VALUES (?, ?, ?, ?, ?, ?)')
      .run(params.correlationId, params.orderId, params.level, params.stage ?? null, redactText(params.message), new Date().toISOString());
  }

  listLogsForOrder(orderId: number): unknown[] {
    return this.db.prepare('SELECT * FROM log_lines WHERE order_id = ? ORDER BY ts ASC').all(orderId);
  }
}
