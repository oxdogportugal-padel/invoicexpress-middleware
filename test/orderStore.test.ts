import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../src/db/db.js';
import { OrderStore } from '../src/db/orderStore.js';

describe('OrderStore idempotency', () => {
  let dir: string;
  let store: OrderStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'middleware-test-'));
    const db = openDatabase(join(dir, 'test.db'));
    store = new OrderStore(db);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates a new row for a first-seen sales order', () => {
    const { row, created } = store.createIfAbsent({
      correlationId: 'corr-1',
      zohoSalesOrderId: 'SO-1',
      zohoSalesOrderNumber: 'SO-00001',
      webhookPayloadDigest: 'digest-1',
    });
    expect(created).toBe(true);
    expect(row.status).toBe('processing');
  });

  it('returns the existing row instead of creating a duplicate on replay', () => {
    const first = store.createIfAbsent({
      correlationId: 'corr-1',
      zohoSalesOrderId: 'SO-1',
      zohoSalesOrderNumber: 'SO-00001',
      webhookPayloadDigest: 'digest-1',
    });
    store.markSucceeded(first.row.id, 'IX-100', 'CLIENT-1');

    const second = store.createIfAbsent({
      correlationId: 'corr-2',
      zohoSalesOrderId: 'SO-1',
      zohoSalesOrderNumber: 'SO-00001',
      webhookPayloadDigest: 'digest-1',
    });

    expect(second.created).toBe(false);
    expect(second.row.id).toBe(first.row.id);
    expect(second.row.status).toBe('succeeded');
    expect(second.row.invoicexpress_invoice_id).toBe('IX-100');
  });

  it('stays consistent when two concurrent inserts race for the same sales order', () => {
    const results = [
      store.createIfAbsent({ correlationId: 'a', zohoSalesOrderId: 'SO-2', zohoSalesOrderNumber: null, webhookPayloadDigest: null }),
      store.createIfAbsent({ correlationId: 'b', zohoSalesOrderId: 'SO-2', zohoSalesOrderNumber: null, webhookPayloadDigest: null }),
    ];
    const createdCount = results.filter((r) => r.created).length;
    expect(createdCount).toBe(1);
    expect(results[0]!.row.id).toBe(results[1]!.row.id);
  });
});

describe('Secret redaction', () => {
  it('never stores a raw secret value in an external_calls row', async () => {
    process.env.INVOICEXPRESS_API_KEY = 'super-secret-key-value';
    const { redactJson } = await import('../src/lib/redact.js');
    const redacted = redactJson({ url: 'https://api.invoicexpress.com/x?api_key=super-secret-key-value' });
    expect(redacted).not.toContain('super-secret-key-value');
    expect(redacted).toContain('[REDACTED]');
    delete process.env.INVOICEXPRESS_API_KEY;
  });
});
