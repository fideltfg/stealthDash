# Backend API Updates Needed for Credential System

## Overview
The frontend widgets have been updated to use `credentialId` instead of storing credentials directly. Backend proxy endpoints need to be created to handle credential lookup and API calls.

## Required Backend Endpoints

### 1. OpenAI Chat Proxy
**Path**: `/api/openai/chat`
**Method**: POST
**Query Params**: `credentialId` (number)
**Headers**: `Authorization: Bearer <user-token>`
**Body**: OpenAI chat completion request payload
```json
{
  "model": "gpt-3.5-turbo",
  "messages": [...],
  "temperature": 0.7,
  "max_tokens": 1000
}
```

**Implementation**:
1. Verify user authentication
2. Lookup credential by ID from database
3. Verify credential belongs to authenticated user
4. Extract API key from credential
5. Forward request to `https://api.openai.com/v1/chat/completions` with API key
6. Return response to frontend

### 2. Home Assistant Proxy (Update Existing)
**Current Endpoints**:
- `/home-assistant/states` - Get entity states
- `/home-assistant/service` - Call service (turn on/off)

**Required Updates**: Accept `credentialId` query parameter

**Request Format with credentialId**:
```
POST /home-assistant/states?credentialId=123
Authorization: Bearer <user-token>
Content-Type: application/json

{
  "url": "http://homeassistant.local:8123"
}
```

**Request Format Legacy (backward compatible)**:
```
POST /home-assistant/states
Content-Type: application/json

{
  "url": "http://homeassistant.local:8123",
  "token": "eyJ0eXAi..."
}
```

**Service Call Example**:
```
POST /home-assistant/service?credentialId=123
Authorization: Bearer <user-token>
Content-Type: application/json

{
  "url": "http://homeassistant.local:8123",
  "domain": "light",
  "service": "turn_on",
  "entity_id": "light.living_room"
}
```

**Implementation Updates**:
1. Check if request includes `credentialId` query parameter
2. If yes: verify user auth, lookup credential, extract token, use for HA API call
3. If no: fall back to legacy token in body (backward compatibility)
4. Forward request to Home Assistant API with proper token
5. Return response to frontend

### 3. Weather API Proxy (If Needed)
Most weather widgets use free APIs that don't require credentials. May not need this endpoint unless using premium weather services.

## Database Schema
Credentials are stored in the `credentials` table with fields:
- `id` (serial primary key)
- `user_id` (references users table)
- `name` (varchar - display name)
- `description` (text - optional notes)
- `service_type` (varchar - 'pihole', 'unifi', 'google-calendar', etc.)
- `config` (jsonb - encrypted credentials object)

## Security Notes
- Always verify credential ownership before using
- Never return raw credentials to frontend
- All API calls must be server-side
- Use encrypted storage for credential config
- Rate limit proxy endpoints to prevent abuse

## Testing Checklist
- [ ] OpenAI chat endpoint with valid credentialId
- [ ] OpenAI chat endpoint with invalid credentialId (should return 403)
- [ ] OpenAI chat endpoint with wrong user's credentialId (should return 403)
- [ ] Home Assistant with credentialId (new behavior)
- [ ] Home Assistant with legacy token (backward compatibility)
- [ ] Error handling for missing/expired credentials
- [ ] Rate limiting works correctly

## Frontend Widget Status
- ✅ **ChatGPT**: Fully migrated to credentialId with legacy apiKey fallback
- ✅ **Home Assistant**: Fully migrated to credentialId with legacy token fallback
- ✅ **Pi-hole**: Already using credential system
- ✅ **UniFi**: Already using credential system
- ✅ **Google Calendar**: Already using credential system
- ✅ **Weather**: Does not use credentials (free API)

All widgets that require credentials now support the credential system!
