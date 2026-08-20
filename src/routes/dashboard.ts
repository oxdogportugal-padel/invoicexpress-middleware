import { Router } from 'express';
import type { OrderStore } from '../db/orderStore.js';

const STATUS_LABEL: Record<string, string> = {
  succeeded: 'Succeeded',
  failed: 'Failed',
  parked: 'Parked for review',
  skipped_duplicate: 'Skipped (duplicate)',
  retrying: 'Retrying',
  processing: 'Processing',
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function layout(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
  <style>
    body { font-family: -apple-system, sans-serif; margin: 0; padding: 24px; background: #0b0d10; color: #e6e8eb; }
    a { color: #7fb3ff; }
    table { border-collapse: collapse; width: 100%; margin-top: 12px; }
    th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #23262b; font-size: 13px; }
    th { color: #9aa4af; text-transform: uppercase; font-size: 11px; }
    .badge { padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
    .b-succeeded { background: #123a1f; color: #4ade80; }
    .b-failed { background: #3a1212; color: #f87171; }
    .b-parked { background: #3a2f12; color: #fbbf24; }
    .b-skipped_duplicate { background: #1a1a3a; color: #a5b4fc; }
    .b-retrying { background: #1a2f3a; color: #67e8f9; }
    .b-processing { background: #23262b; color: #cbd5e1; }
    .counts { display: flex; gap: 16px; margin: 16px 0; flex-wrap: wrap; }
    .count-tile { background: #14171b; border: 1px solid #23262b; border-radius: 8px; padding: 12px 16px; min-width: 120px; }
    .count-tile .n { font-size: 24px; font-weight: 700; }
    .count-tile .label { font-size: 12px; color: #9aa4af; }
    pre { background: #14171b; border: 1px solid #23262b; padding: 12px; border-radius: 8px; overflow-x: auto; font-size: 12px; }
    section { margin-bottom: 28px; }
    h1, h2 { font-weight: 600; }
    code { background: #14171b; padding: 1px 5px; border-radius: 4px; }
  </style></head><body>${body}</body></html>`;
}

export function dashboardRouter(store: OrderStore): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const counts = store.counts();
    const orders = store.listRecent(200);
    const unprocessedAndParked = counts.processing + counts.retrying + counts.parked;
    const rows = orders
      .map(
        (o) => `<tr>
        <td><a href="/orders/${o.id}">${escapeHtml(o.zoho_salesorder_number ?? o.zoho_salesorder_id)}</a></td>
        <td><span class="badge b-${o.status}">${STATUS_LABEL[o.status] ?? o.status}</span></td>
        <td>${escapeHtml(o.stage ?? '')}</td>
        <td>${o.invoicexpress_invoice_id ? escapeHtml(o.invoicexpress_invoice_id) : ''}</td>
        <td>${escapeHtml(o.created_at)}</td>
        <td>${o.duration_ms !== null ? `${o.duration_ms} ms` : ''}</td>
        <td><code>${escapeHtml(o.correlation_id)}</code></td>
      </tr>`
      )
      .join('');

    res.send(
      layout(
        'Middleware dashboard',
        `<h1>Zoho &rarr; InvoiceXpress middleware</h1>
        <section>
          <div class="counts">
            <div class="count-tile"><div class="n">${unprocessedAndParked}</div><div class="label">Unprocessed + parked</div></div>
            <div class="count-tile"><div class="n">${counts.succeeded}</div><div class="label">Succeeded</div></div>
            <div class="count-tile"><div class="n">${counts.failed}</div><div class="label">Failed</div></div>
            <div class="count-tile"><div class="n">${counts.parked}</div><div class="label">Parked</div></div>
            <div class="count-tile"><div class="n">${counts.skipped_duplicate}</div><div class="label">Skipped (duplicate)</div></div>
            <div class="count-tile"><div class="n">${counts.retrying}</div><div class="label">Retrying</div></div>
          </div>
        </section>
        <section>
          <h2>Orders</h2>
          <table>
            <thead><tr><th>SO</th><th>Status</th><th>Stage</th><th>IX invoice</th><th>Created</th><th>Duration</th><th>Correlation ID</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="7">No orders processed yet.</td></tr>'}</tbody>
          </table>
        </section>`
      )
    );
  });

  router.get('/orders/:id', (req, res) => {
    const id = Number(req.params.id);
    const order = store.findById(id);
    if (!order) {
      res.status(404).send(layout('Not found', '<p>No such order.</p>'));
      return;
    }
    const calls = store.listExternalCallsForOrder(id) as Record<string, unknown>[];
    const logs = store.listLogsForOrder(id) as Record<string, unknown>[];

    const callsHtml = calls
      .map(
        (c) => `<div>
        <h3>${escapeHtml(String(c.service))} &middot; ${escapeHtml(String(c.purpose))} &middot; ${escapeHtml(String(c.method))} ${escapeHtml(String(c.url))} &middot; ${c.response_status ?? 'no response'} &middot; ${c.duration_ms}ms</h3>
        <p><strong>Request headers</strong></p><pre>${escapeHtml(String(c.request_headers ?? ''))}</pre>
        <p><strong>Request body</strong></p><pre>${escapeHtml(String(c.request_body ?? ''))}</pre>
        <p><strong>Response body</strong></p><pre>${escapeHtml(String(c.response_body ?? ''))}</pre>
        ${c.error ? `<p><strong>Error</strong></p><pre>${escapeHtml(String(c.error))}</pre>` : ''}
      </div>`
      )
      .join('<hr/>');

    const logsHtml = logs
      .map((l) => `<div>[${escapeHtml(String(l.ts))}] <strong>${escapeHtml(String(l.level))}</strong> ${escapeHtml(String(l.stage ?? ''))} — ${escapeHtml(String(l.message))}</div>`)
      .join('');

    res.send(
      layout(
        `Order ${order.zoho_salesorder_number ?? order.id}`,
        `<p><a href="/">&larr; back</a></p>
        <h1>${escapeHtml(order.zoho_salesorder_number ?? order.zoho_salesorder_id)}</h1>
        <section>
          <table>
            <tr><th>Status</th><td><span class="badge b-${order.status}">${STATUS_LABEL[order.status] ?? order.status}</span></td></tr>
            <tr><th>Stage</th><td>${escapeHtml(order.stage ?? '')}</td></tr>
            <tr><th>Failure reason</th><td>${escapeHtml(order.failure_reason ?? '')}</td></tr>
            <tr><th>Zoho SO id</th><td>${escapeHtml(order.zoho_salesorder_id)}</td></tr>
            <tr><th>InvoiceXpress invoice id</th><td>${escapeHtml(order.invoicexpress_invoice_id ?? '')}</td></tr>
            <tr><th>Correlation ID</th><td><code>${escapeHtml(order.correlation_id)}</code></td></tr>
            <tr><th>Attempt count</th><td>${order.attempt_count}</td></tr>
            <tr><th>Created</th><td>${escapeHtml(order.created_at)}</td></tr>
            <tr><th>Duration</th><td>${order.duration_ms !== null ? `${order.duration_ms} ms` : ''}</td></tr>
          </table>
        </section>
        <section>
          <h2>Replay</h2>
          <form method="post" action="/orders/${order.id}/replay">
            <button type="submit">Replay this order</button>
          </form>
        </section>
        <section>
          <h2>External calls</h2>
          ${callsHtml || '<p>None recorded.</p>'}
        </section>
        <section>
          <h2>Log</h2>
          ${logsHtml || '<p>No log lines.</p>'}
        </section>`
      )
    );
  });

  router.get('/api/orders', (_req, res) => {
    res.json({ counts: store.counts(), orders: store.listRecent(200) });
  });

  router.get('/api/orders/:id', (req, res) => {
    const id = Number(req.params.id);
    const order = store.findById(id);
    if (!order) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.json({
      order,
      external_calls: store.listExternalCallsForOrder(id),
      logs: store.listLogsForOrder(id),
    });
  });

  return router;
}
