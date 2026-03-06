# Crypto Plugin

CoinGecko API proxy with built-in caching for cryptocurrency price data.

## Routes

### `GET /api/crypto/markets`

Fetch current market data for one or more cryptocurrencies.

| Parameter | Type | In | Required | Description |
|-----------|------|-----|----------|-------------|
| `vs_currency` | string | query | Yes | Target currency (e.g., `usd`, `eur`, `gbp`, `cad`) |
| `ids` | string | query | Yes | Comma-separated coin IDs (e.g., `bitcoin,ethereum`) |

**Response:** CoinGecko market data array including price, market cap, 24h volume, 24h change.

### `GET /api/crypto/chart`

Fetch historical price chart data.

| Parameter | Type | In | Required | Description |
|-----------|------|-----|----------|-------------|
| `id` | string | query | Yes | Coin ID (e.g., `bitcoin`) |
| `vs_currency` | string | query | Yes | Target currency |
| `days` | string | query | Yes | Number of days of history (e.g., `1`, `7`, `30`, `365`) |

**Response:** CoinGecko market chart data with price points over time.

## Authentication

None required — all endpoints are public.

## Caching

- **TTL:** 60 seconds per unique query
- Cache keys: `markets:{currency}:{ids}` and `chart:{id}:{currency}:{days}`

## Notes

- Proxies to the free CoinGecko API (no API key required)
- Returns a helpful message on 429 (rate limit) errors — increase your widget refresh interval to 120+ seconds
- Supports all CoinGecko coin IDs and fiat currencies
