/**
 * Attachments are persisted as the relative object key within our bucket
 * (e.g. "chat-attachments/<uuid>.png"), never the full URL — so storage
 * never depends on the current S3/MinIO endpoint, port, or bucket name,
 * and a future migration to a different host/CDN doesn't require rewriting
 * every historical `message_attachments` row. The full, publicly-fetchable
 * URL is only ever computed here, at the API-response boundary.
 */

function computePublicBaseUrl(): string {
  const endPoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  if (!endPoint || !bucket) return '';

  const port = Number(process.env.S3_PORT ?? 443);
  const useSSL = (process.env.S3_USE_SSL ?? 'true') !== 'false';
  const defaultPort = useSSL ? 443 : 80;
  const portSuffix = port === defaultPort ? '' : `:${port}`;

  return `${useSSL ? 'https' : 'http'}://${endPoint}${portSuffix}/${bucket}`;
}

const publicBaseUrl = computePublicBaseUrl();

/** Turns a stored object key into the full URL an API response returns.
 * A value that's already a full URL (an external image URL a client
 * supplied directly, not one of our own uploads) passes through unchanged. */
export function toAttachmentUrl(objectKeyOrUrl: string): string {
  if (/^https?:\/\//i.test(objectKeyOrUrl)) return objectKeyOrUrl;
  return publicBaseUrl ? `${publicBaseUrl}/${objectKeyOrUrl}` : objectKeyOrUrl;
}

/** The inverse, for the write path: turns whatever a client sends back as
 * `attachments[].file_url` (normally the exact URL `POST
 * /v1/attachments/upload` just handed them) into the relative key we
 * actually persist. A URL that isn't one of our own bucket's — an external
 * image URL — is stored as-is; `toAttachmentUrl` already passes any
 * `http(s)://` value through unchanged, so that round-trips correctly. */
export function toAttachmentKey(urlOrKey: string): string {
  if (publicBaseUrl && urlOrKey.startsWith(`${publicBaseUrl}/`))
    return urlOrKey.slice(publicBaseUrl.length + 1);

  return urlOrKey;
}
