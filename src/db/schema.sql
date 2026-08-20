-- One row per sales order ever seen. zoho_salesorder_id is UNIQUE: this is what
-- makes "exactly one invoice per sales order" and idempotent replay enforceable
-- at the storage layer, not just in application logic.
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  correlation_id TEXT NOT NULL UNIQUE,
  zoho_salesorder_id TEXT NOT NULL UNIQUE,
  zoho_salesorder_number TEXT,
  status TEXT NOT NULL CHECK (status IN ('processing', 'succeeded', 'failed', 'parked', 'skipped_duplicate', 'retrying')),
  stage TEXT,
  invoicexpress_invoice_id TEXT,
  invoicexpress_client_id TEXT,
  failure_reason TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  webhook_payload_digest TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at);

-- Exact outbound request / inbound response for every external call, secrets
-- redacted before they ever reach this table (see src/lib/redact.ts).
CREATE TABLE IF NOT EXISTS external_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  correlation_id TEXT NOT NULL,
  order_id INTEGER REFERENCES orders (id),
  service TEXT NOT NULL CHECK (service IN ('zoho', 'invoicexpress')),
  purpose TEXT NOT NULL,
  method TEXT NOT NULL,
  url TEXT NOT NULL,
  request_headers TEXT,
  request_body TEXT,
  response_status INTEGER,
  response_headers TEXT,
  response_body TEXT,
  error TEXT,
  started_at TEXT NOT NULL,
  duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_external_calls_correlation ON external_calls (correlation_id);
CREATE INDEX IF NOT EXISTS idx_external_calls_order ON external_calls (order_id);

-- Correlation-ID-threaded log lines, one per meaningful step in processing.
CREATE TABLE IF NOT EXISTS log_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  correlation_id TEXT NOT NULL,
  order_id INTEGER REFERENCES orders (id),
  level TEXT NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
  stage TEXT,
  message TEXT NOT NULL,
  ts TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_log_lines_correlation ON log_lines (correlation_id);
