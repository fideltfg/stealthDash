# Home Assistant Plugin

Proxy for Home Assistant entity states and service calls.

## Routes

### `POST /home-assistant/states`

Fetch all entity states from a Home Assistant instance.

**Body:**
```json
{
  "url": "http://homeassistant.local:8123",
  "credentialId": 1
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | Home Assistant URL |
| `token` | string | No | Long-lived access token (direct) |
| `credentialId` | number | No | Credential containing Bearer token |

One of `token` or `credentialId` is required.

**Response:** Array of all entity states.

### `POST /home-assistant/service`

Call a Home Assistant service (e.g., turn on a light).

**Body:**
```json
{
  "url": "http://homeassistant.local:8123",
  "credentialId": 1,
  "domain": "light",
  "service": "turn_on",
  "entity_id": "light.kitchen"
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | Home Assistant URL |
| `token` | string | No | Long-lived access token (direct) |
| `credentialId` | number | No | Credential containing Bearer token |
| `domain` | string | Yes | Service domain (e.g., `light`, `switch`, `climate`) |
| `service` | string | Yes | Service name (e.g., `turn_on`, `turn_off`, `toggle`) |
| `entity_id` | string | Yes | Target entity ID |

**Response:**
```json
{ "success": true, "data": {} }
```

## Authentication

Supports two modes:
1. **Direct token** — pass `token` in the request body
2. **Credential-based** — pass `credentialId` referencing a stored credential with the Bearer token

## Credential Setup

1. In Home Assistant: Profile → Security → Long-Lived Access Tokens → Create Token
2. Store in Credential Manager with the token as the credential value

## Notes

- No caching — states are fetched fresh on each request
- Both state retrieval and service calls use the same auth method
