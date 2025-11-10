# Credential Management System

The ping-server now includes a secure credential management system that allows users to store encrypted credentials (passwords, API keys, tokens) in the database instead of passing them in plain text with every widget request.

## Benefits

- **Security**: Credentials are encrypted at rest using AES-256-CBC encryption
- **Convenience**: Store credentials once, reference by ID in widget configs
- **Centralized Management**: Update credentials in one place, affects all widgets using them
- **Access Control**: Users can only access their own credentials
- **No Exposure**: Credentials never appear in frontend code or dashboard configs

## Credential API Endpoints

All credential endpoints require authentication (Bearer token in Authorization header).

### List All Credentials
```
GET /user/credentials
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "success": true,
  "credentials": [
    {
      "id": 1,
      "name": "My Pi-hole",
      "description": "Main Pi-hole instance",
      "service_type": "pihole",
      "created_at": "2025-11-10T12:00:00Z",
      "updated_at": "2025-11-10T12:00:00Z"
    }
  ]
}
```

### Get Specific Credential (with decrypted data)
```
GET /user/credentials/:id
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "success": true,
  "credential": {
    "id": 1,
    "name": "My Pi-hole",
    "description": "Main Pi-hole instance",
    "service_type": "pihole",
    "data": {
      "password": "my-secret-password"
    },
    "created_at": "2025-11-10T12:00:00Z",
    "updated_at": "2025-11-10T12:00:00Z"
  }
}
```

### Create Credential
```
POST /user/credentials
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "name": "My Pi-hole",
  "description": "Main Pi-hole instance",
  "service_type": "pihole",
  "data": {
    "password": "my-secret-password"
  }
}
```

### Update Credential
```
PUT /user/credentials/:id
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "name": "Updated Name",
  "data": {
    "password": "new-password"
  }
}
```

### Delete Credential
```
DELETE /user/credentials/:id
Authorization: Bearer <jwt_token>
```

### Test Credential
```
POST /user/credentials/:id/test
Authorization: Bearer <jwt_token>
```

Validates that the credential contains the required fields for its service type.

## Service Types and Required Fields

### Pi-hole (`pihole`)
```json
{
  "data": {
    "password": "your-pihole-password"
  }
}
```

### UniFi Controller (`unifi`)
```json
{
  "data": {
    "username": "admin",
    "password": "your-password"
  }
}
```

### Home Assistant (`home_assistant`)
```json
{
  "data": {
    "token": "your-long-lived-access-token"
  }
}
```

### SNMP (`snmp`)
```json
{
  "data": {
    "community": "public"
  }
}
```

### Custom API (`api` or `custom`)
```json
{
  "data": {
    "key": "value",
    "any": "fields",
    "you": "need"
  }
}
```

## Using Credentials with Widgets

Instead of passing credentials directly, pass the credential ID:

### Pi-hole Widget
**Old way (insecure):**
```
GET /api/pihole?host=http://192.168.1.10&password=my-secret-password
```

**New way (secure):**
```
GET /api/pihole?host=http://192.168.1.10&credentialId=1
Authorization: Bearer <jwt_token>
```

### UniFi Widget
**Old way:**
```
GET /api/unifi/stats?host=https://192.168.1.1&username=admin&password=secret&site=default
```

**New way:**
```
GET /api/unifi/stats?host=https://192.168.1.1&credentialId=2&site=default
Authorization: Bearer <jwt_token>
```

### Home Assistant Widget
**Old way:**
```json
POST /home-assistant/states
{
  "url": "http://192.168.1.20:8123",
  "token": "long-lived-token-here"
}
```

**New way:**
```json
POST /home-assistant/states
Authorization: Bearer <jwt_token>
{
  "url": "http://192.168.1.20:8123",
  "credentialId": 3
}
```

### SNMP Widget
**Old way:**
```
GET /snmp/get?host=192.168.1.30&community=private&oids=1.3.6.1.2.1.1.1.0
```

**New way:**
```
GET /snmp/get?host=192.168.1.30&credentialId=4&oids=1.3.6.1.2.1.1.1.0
Authorization: Bearer <jwt_token>
```

## Encryption

- Credentials are encrypted using AES-256-CBC encryption
- Each credential has a unique initialization vector (IV)
- Encryption key is derived from `ENCRYPTION_KEY` environment variable
- **IMPORTANT**: Set a strong `ENCRYPTION_KEY` in production environment

### Setting Encryption Key

In your `.env` file or environment:
```bash
ENCRYPTION_KEY=your-very-secure-random-key-at-least-32-characters-long
```

Generate a secure key:
```bash
openssl rand -base64 32
```

## Security Notes

1. **Always use HTTPS** in production to protect JWT tokens in transit
2. **Set strong ENCRYPTION_KEY** - default key is for development only
3. **Rotate credentials** regularly, especially if JWT tokens are compromised
4. **Credential IDs require authentication** - widgets must pass JWT token when using credentialId
5. **Backward compatible** - old direct credential passing still works but is discouraged

## Migration Guide

To migrate existing widgets to use credential management:

1. **Create credentials** for each service via API or future UI
2. **Note the credential IDs** returned from creation
3. **Update widget configs** to use `credentialId` instead of direct credentials
4. **Ensure widgets pass JWT token** in Authorization header
5. **Remove hardcoded credentials** from dashboard configs

## Example: Complete Flow

### 1. Login and get JWT token
```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}'

# Response includes: {"token": "eyJhbGc..."}
```

### 2. Create credential
```bash
curl -X POST http://localhost:3001/user/credentials \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Pi-hole",
    "service_type": "pihole",
    "data": {"password": "my-secret"}
  }'

# Response includes: {"credential": {"id": 1, ...}}
```

### 3. Use credential in widget
```bash
curl "http://localhost:3001/api/pihole?host=http://192.168.1.10&credentialId=1" \
  -H "Authorization: Bearer eyJhbGc..."
```

## Database Schema

```sql
CREATE TABLE credentials (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    service_type VARCHAR(50) NOT NULL,
    credential_data TEXT NOT NULL,  -- Encrypted JSON
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Future Enhancements

- [ ] Credential sharing between users (admin feature)
- [ ] Credential expiration/rotation reminders
- [ ] Audit log for credential access
- [ ] Support for multiple encryption keys (key rotation)
- [ ] UI for credential management
- [ ] Credential templates for common services
