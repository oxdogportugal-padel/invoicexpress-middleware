const SECRET_ENV_KEYS = [
  'ZOHO_CLIENT_SECRET',
  'ZOHO_REFRESH_TOKEN',
  'ZOHO_WEBHOOK_SHARED_SECRET',
  'INVOICEXPRESS_API_KEY',
] as const;

const SECRET_HEADER_NAMES = new Set(['authorization', 'api-key', 'x-api-key', 'cookie', 'set-cookie']);

function secretValues(): string[] {
  return SECRET_ENV_KEYS.map((key) => process.env[key]).filter((v): v is string => !!v && v.length > 0);
}

/** Redacts known secret env-var values (by literal occurrence) out of arbitrary text. */
export function redactText(input: string): string {
  let out = input;
  for (const secret of secretValues()) {
    if (secret.length < 4) continue; // avoid redacting trivially short values that could collide with normal text
    out = out.split(secret).join('[REDACTED]');
  }
  return out;
}

/** Redacts secret values inside a JSON-serializable value, returning a JSON string safe to store/display. */
export function redactJson(value: unknown): string {
  const json = JSON.stringify(value ?? null);
  return redactText(json);
}

/** Redacts sensitive HTTP headers, returning a JSON string safe to store/display. */
export function redactHeaders(headers: Record<string, string | undefined>): string {
  const redacted: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    redacted[key] = SECRET_HEADER_NAMES.has(key.toLowerCase()) ? '[REDACTED]' : redactText(value);
  }
  return JSON.stringify(redacted);
}
