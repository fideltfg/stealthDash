# Proxy Plugin

CORS bypass and embed proxy for loading external content into the dashboard.

## Routes

### `GET /embed-proxy`

Proxy a webpage with frame-blocking headers stripped — used by the Embed widget. 

| Parameter | Type | In | Required | Description |
|-----------|------|-----|----------|-------------|
| `url` | string | query | Yes | Target URL to proxy (http/https only) |

**Response:** Proxied HTML content with `X-Frame-Options` and `Content-Security-Policy` headers removed, and `Access-Control-Allow-Origin: *` added.

### `GET /proxy`

Generic HTTP/HTTPS proxy with CORS headers — used for XML feeds, APIs, and other external data.

| Parameter | Type | In | Required | Description |
|-----------|------|-----|----------|-------------|
| `url` | string | query | Yes | Target URL to proxy (http/https only) |

**Response:** Proxied content with original `Content-Type` forwarded.

## Authentication

None required — all endpoints are public.

## Notes

- Only `http://` and `https://` URLs are accepted (validated on both endpoints)
- `embed-proxy` intentionally strips `X-Frame-Options` and CSP headers so embedded sites render in iframes
- `proxy` forwards the upstream `Content-Type` header — useful for XML feeds (RSS, Environment Canada, MTNXML)
- User-Agent is set to `Mozilla/5.0` for upstream requests
