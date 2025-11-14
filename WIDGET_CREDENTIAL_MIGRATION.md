# Widget Credential Migration

## Overview
All widgets should use the centralized credential management system instead of storing credentials directly in widget content. This ensures:
- Credentials are stored securely in one place
- Users can manage credentials globally
- Dashboards can be shared without exposing credentials
- Credentials are never saved in dashboard exports

## Current Status

### ✅ Already Using Credential System
These widgets correctly use `credentialId`:
- **google-calendar** - Uses credentialId to reference saved Google Calendar credentials
- **pihole** - Uses credentialId to reference saved Pi-hole credentials
- **unifi** - Uses credentialId to reference saved UniFi credentials

### ⚠️ Need Migration
These widgets still store credentials directly and need to be updated:

#### 1. **chatgpt**
- **Current**: Stores `apiKey` directly in widget content
- **Required**: Add `credentialId?: number` field, remove direct `apiKey` storage
- **Backend**: API endpoint needs to accept credentialId and lookup OpenAI API key

#### 2. **home-assistant**
- **Current**: Stores `token` directly in widget content
- **Required**: Add `credentialId?: number` field, remove direct `token` storage
- **Backend**: API endpoint needs to accept credentialId and lookup HA token

#### 3. **weather**
- **Current**: Stores `apiKey` directly in widget content (if used)
- **Required**: Add `credentialId?: number` field for API key
- **Note**: May not need credentials if using free weather APIs

## Migration Steps

### For Each Widget:

1. **Update Interface**
   ```typescript
   interface WidgetContent {
     // OLD: apiKey: string;
     credentialId?: number; // NEW
     // ... other fields
   }
   ```

2. **Update Configuration Dialog**
   - Replace direct credential input with credential selector
   - Load available credentials from auth service
   - Allow user to select from saved credentials
   - Provide link to credential management

3. **Update API Calls**
   - Instead of reading credential from widget content
   - Pass credentialId to backend API
   - Backend looks up actual credential securely
   - Backend makes API call with actual credential

4. **Update Default Content**
   ```typescript
   defaultContent: {
     // OLD: apiKey: '',
     credentialId: undefined, // NEW
     // ... other defaults
   }
   ```

## Implementation Example

See `google-calendar.ts` for a complete example of credential integration:
- Configuration dialog with credential selector
- Backend API endpoint that accepts credentialId
- Secure credential lookup on server side
- Error handling for missing credentials

## Security Benefits

- ✅ Credentials never saved in dashboard JSON
- ✅ Credentials not exposed in browser DevTools
- ✅ Single place to update credentials
- ✅ Ability to share dashboards safely
- ✅ Credential rotation without updating every widget
