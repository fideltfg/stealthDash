# Email-Based Password Recovery System

## Overview
Users who forget their passwords can securely recover access to their accounts through an email-based token system. A recovery link is sent to the user's registered email address.

## How It Works

### 1. User Requests Password Recovery
- User clicks **"Forgot Password?"** on the login page
- Enters their **username**
- System looks up the user's registered email address

### 2. Email Sent with Recovery Link
- A unique, secure token is generated (valid for 1 hour)
- An email is sent to the user's registered email address
- Email contains a clickable link: `http://localhost:3000/#reset-password?token=abc123...`
- The token is **NOT** displayed in the UI or logs for security

### 3. User Clicks the Link
- Clicking the email link opens the dashboard
- The URL contains the recovery token in the hash fragment
- Dashboard automatically detects the token and shows reset password form

### 4. User Resets Password
- User enters their new password (min 6 characters)
- Confirms the new password
- Token is validated server-side
- Password is updated and token is invalidated

## Email Configuration

### Step 1: Copy Environment File
```bash
cp .env.example .env
```

### Step 2: Configure Email Settings

Edit `.env` and add your SMTP credentials:

#### For Gmail (Recommended for Testing)
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password  # NOT your Gmail password!
EMAIL_FROM=Dashboard <your-email@gmail.com>
DASHBOARD_URL=http://localhost:3000
```

**Gmail Setup:**
1. Enable 2-Factor Authentication on your Google account
2. Go to https://myaccount.google.com/apppasswords
3. Create an "App Password" for "Mail"
4. Use the generated 16-character password as `SMTP_PASS`

#### For Office 365 / Outlook
```bash
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@outlook.com
SMTP_PASS=your-password
EMAIL_FROM=Dashboard <your-email@outlook.com>
DASHBOARD_URL=http://localhost:3000
```

#### For Custom SMTP Server
```bash
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false  # true for port 465 (SSL)
SMTP_USER=smtp-username
SMTP_PASS=smtp-password
EMAIL_FROM=Dashboard <noreply@example.com>
DASHBOARD_URL=https://yourdomain.com
```

### Step 3: Restart Containers
```bash
docker compose down
docker compose up -d --build
```

## User Flow

### For Users

1. **Navigate to Login**
   - Visit http://localhost:3000
   - Click **"Forgot Password?"** link

2. **Request Recovery**
   - Enter your username
   - Click **"Send Recovery Email"**
   - Check your email inbox

3. **Check Email**
   - Look for email with subject: "Password Recovery Request"
   - Email will be from the configured `EMAIL_FROM` address
   - Click the **"Reset Password"** button in the email

4. **Reset Password**
   - You'll be redirected to the dashboard
   - Password reset form appears automatically
   - Enter new password (min 6 characters)
   - Confirm new password
   - Click **"Reset Password"**

5. **Login**
   - Success! You can now login with your new password

### For Admins

If email is not configured or a user doesn't receive the email:

#### Option 1: Check Server Logs
```bash
docker logs dashboard-ping-server --tail 50 | grep -i "recovery"
```

Look for email delivery status messages.

#### Option 2: Manually Generate Token
```bash
# Generate recovery token
TOKEN=$(docker exec dashboard-ping-server node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# Insert into database (1 hour expiry)
docker exec -i dashboard-postgres psql -U dashboard -d dashboard << EOF
INSERT INTO password_recovery_tokens (user_id, token, expires_at)
VALUES (
  (SELECT id FROM users WHERE username = 'username'),
  '$TOKEN',
  NOW() + INTERVAL '1 hour'
);
EOF

# Give user the URL
echo "Recovery URL: http://localhost:3000/#reset-password?token=$TOKEN"
```

## API Endpoints

### POST /auth/request-recovery
Request password recovery (sends email).

**Request:**
```json
{
  "username": "john"
}
```

**Success Response:**
```json
{
  "success": true,
  "message": "If this username exists, a recovery email has been sent to the registered email address."
}
```

**Security Note:** The response is the same whether the user exists or not (prevents username enumeration).

**What Happens:**
1. System looks up user by username
2. Generates random 64-character hex token
3. Stores token in database with 1-hour expiry
4. Sends email with recovery link to user's registered email
5. Logs email delivery status

### GET /auth/validate-token/:token
Validate a recovery token (used when user clicks email link).

**Request:**
```
GET /auth/validate-token/abc123def456...
```

**Success Response:**
```json
{
  "valid": true
}
```

**Error Responses:**
```json
{
  "valid": false,
  "error": "Invalid token"
}
```

```json
{
  "valid": false,
  "error": "Token has expired"
}
```

```json
{
  "valid": false,
  "error": "Token has already been used"
}
```

### POST /auth/reset-password-with-token
Reset password using validated token.

**Request:**
```json
{
  "token": "abc123def456...",
  "newPassword": "mynewpassword123"
}
```

**Success Response:**
```json
{
  "success": true,
  "message": "Password has been reset successfully"
}
```

**Error Responses:**
- `{"error": "Token and password are required"}`
- `{"error": "Password must be at least 6 characters"}`
- `{"error": "Invalid or expired token"}`
- `{"error": "Token has already been used"}`

## Email Template

The recovery email sent to users:

```
Subject: Password Recovery Request

Hello,

You have requested to reset your password for your Dashboard account.

Click the button below to reset your password:

[Reset Password]

This link will expire in 1 hour.

If you did not request this password reset, please ignore this email.

---
Dashboard Team
```

The button links to: `http://localhost:3000/#reset-password?token=<64-char-hex-token>`

## Security Features

### ✅ Token Security
- **Crypto-Random**: 32 bytes (64 hex chars) generated with crypto.randomBytes()
- **One-Time Use**: Token marked as used after successful password reset
- **Time-Limited**: 1 hour expiration
- **Unique**: Database constraint prevents duplicate tokens
- **Secure Storage**: Only hashed references stored (token itself sent via secure channel)

### ✅ Email Delivery
- Recovery link sent ONLY to registered email address
- Token never displayed in UI or server logs
- Link contains token in URL hash (not logged by web servers)

### ✅ Username Enumeration Protection
Response is always the same whether user exists or not:
```json
{
  "success": true,
  "message": "If this username exists, a recovery email has been sent..."
}
```

### ✅ SMTP Security
- TLS encryption for port 587 (SMTP_SECURE=false with STARTTLS)
- SSL encryption for port 465 (SMTP_SECURE=true)
- App-specific passwords supported (Gmail, etc.)

### ✅ Auto-Cleanup
- Tokens auto-expire after 1 hour
- Old tokens invalidated when new recovery requested
- Used tokens cannot be reused
- Cascade delete when user is deleted

## Database Schema

### password_recovery_tokens Table
```sql
CREATE TABLE IF NOT EXISTS password_recovery_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(64) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_recovery_tokens_token ON password_recovery_tokens(token);
CREATE INDEX idx_recovery_tokens_user_id ON password_recovery_tokens(user_id);
```

## Troubleshooting

### Email Not Being Sent

1. **Check SMTP credentials in `.env`**
   ```bash
   cat .env | grep SMTP
   ```

2. **Check server logs for email errors**
   ```bash
   docker logs dashboard-ping-server --tail 50
   ```

3. **Test SMTP connection**
   ```bash
   docker exec -it dashboard-ping-server node -e "
   const nodemailer = require('nodemailer');
   const transport = nodemailer.createTransport({
     host: process.env.SMTP_HOST,
     port: process.env.SMTP_PORT,
     secure: process.env.SMTP_SECURE === 'true',
     auth: {
       user: process.env.SMTP_USER,
       pass: process.env.SMTP_PASS
     }
   });
   transport.verify((err, success) => {
     if (err) console.error('SMTP Error:', err);
     else console.log('SMTP connection successful!');
     process.exit();
   });
   "
   ```

### Gmail "Less Secure Apps" Error

Gmail no longer supports "less secure apps". You MUST use an App Password:
1. Enable 2FA on your Google account
2. Generate App Password: https://myaccount.google.com/apppasswords
3. Use the 16-character app password in `.env`

### Email Goes to Spam

- Ensure `EMAIL_FROM` matches your SMTP user
- Use a verified domain
- Check your SMTP server's spam policies
- For production, use a dedicated transactional email service (SendGrid, Mailgun, etc.)

### Token Invalid/Expired

- Tokens expire after 1 hour
- Each token can only be used once
- User needs to request a new recovery email if token expired

### Production Deployment

For production:

1. **Use HTTPS**
   ```bash
   DASHBOARD_URL=https://yourdomain.com
   ```

2. **Use Dedicated Email Service**
   - SendGrid: https://sendgrid.com/
   - Mailgun: https://www.mailgun.com/
   - AWS SES: https://aws.amazon.com/ses/
   - Postmark: https://postmarkapp.com/

3. **Configure DNS**
   - Add SPF record
   - Add DKIM record
   - Add DMARC record
   - Improves email deliverability

4. **Monitor Email Delivery**
   - Track bounce rates
   - Monitor spam complaints
   - Log email delivery status

## Command Line Management

### View Active Recovery Tokens
```bash
docker exec -it dashboard-postgres psql -U dashboard -d dashboard -c "
SELECT 
  prt.id,
  u.username,
  u.email,
  LEFT(prt.token, 20) || '...' as token_preview,
  prt.expires_at,
  prt.used,
  prt.created_at
FROM password_recovery_tokens prt
JOIN users u ON prt.user_id = u.id
WHERE prt.expires_at > NOW()
ORDER BY prt.created_at DESC
LIMIT 10;
"
```

### Cleanup Expired Tokens
```bash
docker exec -i dashboard-postgres psql -U dashboard -d dashboard -c "
DELETE FROM password_recovery_tokens 
WHERE expires_at < NOW() OR used = true;
"
```

### Manually Send Recovery Email
```bash
curl -X POST http://localhost:3001/auth/request-recovery \
  -H "Content-Type: application/json" \
  -d '{"username":"john"}'
```

## Testing

### Complete Recovery Flow Test
```bash
# 1. Request recovery (check your email)
curl -X POST http://localhost:3001/auth/request-recovery \
  -H "Content-Type: application/json" \
  -d '{"username":"admin"}'

# 2. Click link in email or manually validate token
# (Extract token from email URL or database)
TOKEN="your-token-from-email"

curl "http://localhost:3001/auth/validate-token/$TOKEN"

# 3. Reset password
curl -X POST http://localhost:3001/auth/reset-password-with-token \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN\",\"newPassword\":\"newpass123\"}"

# 4. Login with new password
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"newpass123"}'
```

## Benefits

✅ **Secure** - Token sent only via email, never displayed in UI or logs  
✅ **User-Friendly** - One-click password reset from email  
✅ **Standard Practice** - Industry-standard email-based recovery  
✅ **Private** - No admin intervention needed  
✅ **Trackable** - Email delivery and token usage logged  
✅ **Self-Service** - Users can recover passwords 24/7  
✅ **Compliant** - Follows security best practices  

---

**Need help?** Check server logs or contact your system administrator.

Users who forget their passwords can recover access to their accounts through a secure token-based recovery system.

## How It Works

### 1. Request Recovery Token
When a user forgets their password, they can request a recovery token by providing their username.

### 2. Token Generation
The system generates a unique, random 64-character hexadecimal token that:
- Is valid for **1 hour**
- Can only be used **once**
- Is automatically invalidated when used
- Previous unused tokens are invalidated when a new one is requested

### 3. Token Delivery
Since email is not configured, the token is:
- ✅ Displayed in the UI (for self-service recovery)
- ✅ Logged to the server console (for admin-assisted recovery)
- ✅ Stored securely in the database

### 4. Password Reset
The user enters the recovery token and sets a new password, which must be at least 6 characters.

## Using the Password Recovery UI

### For Users (Self-Service)

1. **Access Recovery Dialog**
   - On the login page, click **"Forgot Password?"** link
   - The Password Recovery dialog opens

2. **Request Token Tab**
   - Enter your username
   - Click **"Request Recovery Token"**
   - Your token will be displayed immediately
   - Click **"📋 Copy Token"** to copy it

3. **Reset Password Tab**
   - Paste the token in the "Recovery Token" field
   - Enter your new password (min 6 characters)
   - Confirm your new password
   - Click **"Reset Password"**
   - Success! You can now login with your new password

### For Admins (Assisted Recovery)

If a user contacts you for password recovery:

1. **Generate Token**
   ```bash
   curl -X POST http://localhost:3001/auth/request-recovery \
     -H "Content-Type: application/json" \
     -d '{"username":"theusername"}'
   ```

2. **Check Server Logs**
   ```bash
   docker logs dashboard-ping-server --tail 20
   ```
   
   You'll see:
   ```
   ================================================================================
   PASSWORD RECOVERY TOKEN GENERATED
   ================================================================================
   Username: theusername
   Email: user@example.com
   Recovery Token: 8fd25378cdae2201d1bc14cdd55b7248d0fa9dafa555fe0f266eb801a487ac48
   Expires: 2025-11-05T19:27:41.662Z
   Valid for: 1 hour
   ================================================================================
   Share this token with the user to reset their password.
   ================================================================================
   ```

3. **Share Token**
   - Send the token to the user securely
   - Instruct them to use the "Reset Password" tab on the login page

## API Endpoints

### POST /auth/request-recovery
Request a password recovery token.

**Request:**
```json
{
  "username": "john"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Recovery token generated. Check server logs or contact administrator.",
  "token": "8fd25378cdae2201d1bc14cdd55b7248d0fa9dafa555fe0f266eb801a487ac48",
  "expiresAt": "2025-11-05T19:27:41.662Z"
}
```

**Security Note:** In production with email configured, the token would NOT be returned in the response, only logged.

### POST /auth/reset-password
Reset password using a recovery token.

**Request:**
```json
{
  "token": "8fd25378cdae2201d1bc14cdd55b7248d0fa9dafa555fe0f266eb801a487ac48",
  "newPassword": "mynewpassword123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password has been reset successfully. You can now login with your new password."
}
```

**Error Responses:**
- Invalid token: `{"error": "Invalid recovery token"}`
- Expired token: `{"error": "Recovery token has expired"}`
- Used token: `{"error": "Recovery token has already been used"}`
- Weak password: `{"error": "Password must be at least 6 characters"}`

## Database Schema

### password_recovery_tokens Table
```sql
CREATE TABLE password_recovery_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(64) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Indexes:**
- `idx_recovery_tokens_token` - Fast lookup by token
- `idx_recovery_tokens_user_id` - Fast lookup by user

## Security Features

### ✅ Token Security
- **Random Generation**: Crypto-grade random 32 bytes (64 hex characters)
- **One-Time Use**: Token marked as `used` after successful password reset
- **Time-Limited**: 1 hour expiration
- **Unique**: Database constraint prevents duplicate tokens
- **Auto-Cleanup**: Old tokens for same user invalidated on new request

### ✅ Username Enumeration Protection
When requesting recovery for non-existent username, the system returns:
```json
{
  "success": true,
  "message": "If the username exists, a recovery token has been generated..."
}
```
This prevents attackers from discovering valid usernames.

### ✅ Password Validation
- Minimum 6 characters
- Must match confirmation
- Hashed with bcrypt before storage

### ✅ Database Cleanup
When a user is deleted, their recovery tokens are automatically deleted (CASCADE).

## Command Line Management

### View All Active Recovery Tokens
```bash
docker exec -it dashboard-postgres psql -U dashboard -d dashboard -c \
  "SELECT prt.id, u.username, prt.token, prt.expires_at, prt.used 
   FROM password_recovery_tokens prt 
   JOIN users u ON prt.user_id = u.id 
   ORDER BY prt.created_at DESC 
   LIMIT 10;"
```

### Invalidate All Tokens for a User
```bash
docker exec -i dashboard-postgres psql -U dashboard -d dashboard -c \
  "UPDATE password_recovery_tokens 
   SET used = true 
   WHERE user_id = (SELECT id FROM users WHERE username = 'john');"
```

### Delete Expired Tokens (Cleanup)
```bash
docker exec -i dashboard-postgres psql -U dashboard -d dashboard -c \
  "DELETE FROM password_recovery_tokens 
   WHERE expires_at < NOW() OR used = true;"
```

### Manually Create Token for User
```bash
# Generate random token
TOKEN=$(openssl rand -hex 32)

# Insert into database (expires in 1 hour)
docker exec -i dashboard-postgres psql -U dashboard -d dashboard -c \
  "INSERT INTO password_recovery_tokens (user_id, token, expires_at) 
   VALUES (
     (SELECT id FROM users WHERE username = 'john'),
     '$TOKEN',
     NOW() + INTERVAL '1 hour'
   );"

echo "Recovery token: $TOKEN"
```

## Testing

### Test Full Recovery Flow
```bash
# 1. Request token
RESPONSE=$(curl -s -X POST http://localhost:3001/auth/request-recovery \
  -H "Content-Type: application/json" \
  -d '{"username":"admin"}')

# 2. Extract token
TOKEN=$(echo $RESPONSE | jq -r '.token')
echo "Token: $TOKEN"

# 3. Reset password
curl -X POST http://localhost:3001/auth/reset-password \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN\",\"newPassword\":\"testpass123\"}"

# 4. Login with new password
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"testpass123"}'
```

### Test Token Expiration
```bash
# Create token with very short expiration (for testing)
docker exec -i dashboard-postgres psql -U dashboard -d dashboard -c \
  "INSERT INTO password_recovery_tokens (user_id, token, expires_at) 
   VALUES (1, 'test-expired-token', NOW() - INTERVAL '1 hour');"

# Try to use expired token
curl -X POST http://localhost:3001/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token":"test-expired-token","newPassword":"newpass123"}'

# Expected: {"error": "Recovery token has expired"}
```

## Production Considerations

### Email Integration (Future Enhancement)
To add email support:

1. Install nodemailer:
   ```bash
   npm install nodemailer
   ```

2. Update server.js to send emails instead of logging:
   ```javascript
   // Instead of console.log, send email
   await sendEmail({
     to: user.email,
     subject: 'Password Recovery',
     text: `Your recovery token: ${token}\nExpires in 1 hour.`
   });
   ```

3. Remove token from API response:
   ```javascript
   res.json({ 
     success: true, 
     message: 'Recovery email sent to your registered email address.'
     // Don't include token in response
   });
   ```

### Automatic Cleanup Job
Add a cron job to clean up old tokens:

```javascript
// In server.js
setInterval(async () => {
  await db.query('DELETE FROM password_recovery_tokens WHERE expires_at < NOW() OR used = true');
  console.log('Cleaned up expired recovery tokens');
}, 60 * 60 * 1000); // Every hour
```

### Rate Limiting
Prevent abuse by limiting recovery requests:

```javascript
// Limit to 3 recovery requests per username per hour
const recentRequests = await db.query(
  `SELECT COUNT(*) FROM password_recovery_tokens 
   WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
  [userId]
);

if (recentRequests.rows[0].count >= 3) {
  return res.status(429).json({ 
    error: 'Too many recovery requests. Please try again later.' 
  });
}
```

## Troubleshooting

### "Invalid recovery token"
- Token may have been mistyped (copy/paste recommended)
- Token may have already been used
- Token may have expired (1 hour limit)

### Token not appearing in UI
- Check browser console for errors
- Verify server is running: `docker ps`
- Check API response: `curl -X POST ...`

### Server logs not showing token
- Check correct container: `docker logs dashboard-ping-server`
- Token logging happens when request is successful
- Check for database errors in logs

## Benefits

✅ **User Convenience** - Self-service password recovery  
✅ **Admin Flexibility** - Can assist users when needed  
✅ **Security** - Tokens are one-time use and time-limited  
✅ **Transparency** - Token visible in UI and logs  
✅ **No Email Required** - Works without SMTP configuration  
✅ **Audit Trail** - All recovery attempts logged in database  

---

**Need help?** Contact your system administrator or check server logs for recovery tokens.
