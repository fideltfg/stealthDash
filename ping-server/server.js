const express = require('express');
const cors = require('cors');
const ping = require('ping');
const ModbusRTU = require('modbus-serial');
const snmp = require('net-snmp');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const db = require('./db');
const { authMiddleware, generateToken } = require('./auth');

const app = express();
const PORT = process.env.PING_SERVER_PORT || 3001;

// Email transporter configuration
let emailTransporter = null;
const SMTP_CONFIGURED = process.env.SMTP_USER && process.env.SMTP_PASS;

if (SMTP_CONFIGURED) {
  emailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
  
  // Verify SMTP connection
  emailTransporter.verify((error, success) => {
    if (error) {
      console.error('SMTP configuration error:', error);
      console.log('Password recovery will use fallback mode (token in logs only)');
    } else {
      console.log('✅ Email server is ready to send password recovery emails');
    }
  });
} else {
  console.log('⚠️  SMTP not configured - Password recovery will use fallback mode');
  console.log('   Configure SMTP in .env file for email-based recovery');
}

// Helper function to send recovery email
async function sendRecoveryEmail(email, username, token) {
  const dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:3000';
  const recoveryLink = `${dashboardUrl}/#/reset-password?token=${token}`;
  
  const mailOptions = {
    from: process.env.EMAIL_FROM || 'Dashboard <noreply@dashboard.local>',
    to: email,
    subject: 'Password Recovery - Dashboard',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Password Recovery Request</h2>
        <p>Hello <strong>${username}</strong>,</p>
        <p>We received a request to reset your password. Click the button below to reset your password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${recoveryLink}" 
             style="background: #4CAF50; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
            Reset Password
          </a>
        </div>
        <p>Or copy and paste this link into your browser:</p>
        <p style="background: #f5f5f5; padding: 10px; border-radius: 4px; word-break: break-all; font-family: monospace; font-size: 12px;">
          ${recoveryLink}
        </p>
        <p style="color: #666; font-size: 14px;">
          This link will expire in <strong>1 hour</strong> and can only be used once.
        </p>
        <p style="color: #666; font-size: 14px;">
          If you didn't request this password reset, you can safely ignore this email.
        </p>
        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
        <p style="color: #999; font-size: 12px;">
          This is an automated message from Dashboard. Please do not reply to this email.
        </p>
      </div>
    `,
    text: `
Password Recovery Request

Hello ${username},

We received a request to reset your password. Click the link below to reset your password:

${recoveryLink}

This link will expire in 1 hour and can only be used once.

If you didn't request this password reset, you can safely ignore this email.
    `
  };
  
  if (emailTransporter) {
    await emailTransporter.sendMail(mailOptions);
    return true;
  }
  return false;
}

// Enable CORS for all origins (adjust in production)
app.use(cors());
app.use(express.json());

// ==================== AUTH ROUTES ====================

// Register new user
app.post('/auth/register', async (req, res) => {
  const { username, email, password } = req.body;
  
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password are required' });
  }
  
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  
  try {
    // Check if user already exists
    const existingUser = await db.query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );
    
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Create user
    const result = await db.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email, created_at',
      [username, email, passwordHash]
    );
    
    const user = result.rows[0];
    const token = generateToken(user);
    
    res.status(201).json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        createdAt: user.created_at
      },
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  
  try {
    // Find user
    const result = await db.query(
      'SELECT id, username, email, password_hash, created_at FROM users WHERE username = $1',
      [username]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    
    const user = result.rows[0];
    
    // Verify password
    const valid = await bcrypt.compare(password, user.password_hash);
    
    if (!valid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    
    const token = generateToken(user);
    
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        createdAt: user.created_at
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Verify token (check if logged in)
app.get('/auth/verify', authMiddleware, (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user.userId,
      username: req.user.username,
      email: req.user.email
    }
  });
});

// ==================== PASSWORD RECOVERY ROUTES ====================

// Request password recovery token
app.post('/auth/request-recovery', async (req, res) => {
  const { usernameOrEmail } = req.body;
  
  if (!usernameOrEmail) {
    return res.status(400).json({ error: 'Username or email is required' });
  }
  
  try {
    // Check if user exists (by username or email)
    const result = await db.query(
      'SELECT id, username, email FROM users WHERE username = $1 OR email = $1',
      [usernameOrEmail]
    );
    
    // Always return success to prevent username/email enumeration
    if (result.rows.length === 0) {
      return res.json({ 
        success: true, 
        message: 'If an account with that username or email exists, a recovery email has been sent.'
      });
    }
    
    const user = result.rows[0];
    
    // Generate random token
    const token = crypto.randomBytes(32).toString('hex');
    
    // Token expires in 1 hour
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    
    // Invalidate any existing tokens for this user
    await db.query(
      'UPDATE password_recovery_tokens SET used = true WHERE user_id = $1 AND used = false',
      [user.id]
    );
    
    // Insert new token
    await db.query(
      'INSERT INTO password_recovery_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, token, expiresAt]
    );
    
    // Try to send email
    let emailSent = false;
    if (SMTP_CONFIGURED) {
      try {
        await sendRecoveryEmail(user.email, user.username, token);
        emailSent = true;
        console.log(`✅ Password recovery email sent to ${user.email}`);
      } catch (emailError) {
        console.error('Failed to send recovery email:', emailError);
        emailSent = false;
      }
    }
    
    // If email not sent, log token to console for admin assistance
    if (!emailSent) {
      console.log('='.repeat(80));
      console.log('PASSWORD RECOVERY TOKEN GENERATED');
      console.log('='.repeat(80));
      console.log(`Username: ${user.username}`);
      console.log(`Email: ${user.email}`);
      console.log(`Recovery Link: ${process.env.DASHBOARD_URL || 'http://localhost:3000'}/#/reset-password?token=${token}`);
      console.log(`Expires: ${expiresAt.toISOString()}`);
      console.log(`Valid for: 1 hour`);
      console.log('='.repeat(80));
      console.log('⚠️  Email not sent - SMTP not configured or failed');
      console.log('   Share this link with the user to reset their password.');
      console.log('='.repeat(80));
    }
    
    res.json({ 
      success: true, 
      message: emailSent 
        ? 'A password recovery email has been sent to your registered email address.'
        : 'Recovery request received. Please contact an administrator for the recovery link.'
    });
  } catch (err) {
    console.error('Password recovery request error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Validate recovery token (check if it's valid before showing reset form)
app.post('/auth/validate-token', async (req, res) => {
  const { token } = req.body;
  
  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }
  
  try {
    const result = await db.query(
      `SELECT prt.id, prt.expires_at, prt.used, u.username 
       FROM password_recovery_tokens prt
       JOIN users u ON prt.user_id = u.id
       WHERE prt.token = $1`,
      [token]
    );
    
    if (result.rows.length === 0) {
      return res.status(400).json({ 
        valid: false, 
        error: 'Invalid recovery token' 
      });
    }
    
    const recovery = result.rows[0];
    
    if (new Date() > new Date(recovery.expires_at)) {
      return res.status(400).json({ 
        valid: false, 
        error: 'Recovery token has expired' 
      });
    }
    
    if (recovery.used) {
      return res.status(400).json({ 
        valid: false, 
        error: 'Recovery token has already been used' 
      });
    }
    
    res.json({ 
      valid: true, 
      username: recovery.username 
    });
  } catch (err) {
    console.error('Token validation error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Reset password with validated token
app.post('/auth/reset-password-with-token', async (req, res) => {
  const { token, newPassword } = req.body;
  
  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token and password are required' });
  }
  
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  
  try {
    // Check if token exists and is valid
    const result = await db.query(
      `SELECT prt.id, prt.user_id, prt.expires_at, prt.used, u.username 
       FROM password_recovery_tokens prt
       JOIN users u ON prt.user_id = u.id
       WHERE prt.token = $1`,
      [token]
    );
    
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }
    
    const recovery = result.rows[0];
    
    // Check if token is expired
    if (new Date() > new Date(recovery.expires_at)) {
      return res.status(400).json({ error: 'Recovery token has expired' });
    }
    
    // Check if token has been used
    if (recovery.used) {
      return res.status(400).json({ error: 'Recovery token has already been used' });
    }
    
    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10);
    
    // Update password
    await db.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [passwordHash, recovery.user_id]
    );
    
    // Mark token as used
    await db.query(
      'UPDATE password_recovery_tokens SET used = true WHERE id = $1',
      [recovery.id]
    );
    
    console.log(`✅ Password reset successful for user: ${recovery.username}`);
    
    res.json({ 
      success: true, 
      message: 'Password has been reset successfully'
    });
  } catch (err) {
    console.error('Password reset error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Validate recovery token (check if it's valid before showing reset form)
app.get('/auth/validate-token/:token', async (req, res) => {
  const { token } = req.params;
  
  if (!token) {
    return res.status(400).json({ valid: false, error: 'Token is required' });
  }
  
  try {
    const result = await db.query(
      `SELECT prt.id, prt.expires_at, prt.used, u.username 
       FROM password_recovery_tokens prt
       JOIN users u ON prt.user_id = u.id
       WHERE prt.token = $1`,
      [token]
    );
    
    if (result.rows.length === 0) {
      return res.json({ 
        valid: false, 
        error: 'Invalid recovery token' 
      });
    }
    
    const recovery = result.rows[0];
    
    if (new Date() > new Date(recovery.expires_at)) {
      return res.json({ 
        valid: false, 
        error: 'Recovery token has expired' 
      });
    }
    
    if (recovery.used) {
      return res.json({ 
        valid: false, 
        error: 'Recovery token has already been used' 
      });
    }
    
    res.json({ 
      valid: true, 
      username: recovery.username 
    });
  } catch (err) {
    console.error('Token validation error:', err);
    res.status(500).json({ valid: false, error: 'Server error' });
  }
});

// ==================== DASHBOARD ROUTES ====================

// Save dashboard
app.post('/dashboard/save', authMiddleware, async (req, res) => {
  const { dashboardData } = req.body;
  
  if (!dashboardData) {
    return res.status(400).json({ error: 'Dashboard data is required' });
  }
  
  try {
    // Check if user already has a dashboard
    const existing = await db.query(
      'SELECT id FROM dashboards WHERE user_id = $1',
      [req.user.userId]
    );
    
    if (existing.rows.length > 0) {
      // Update existing dashboard
      await db.query(
        'UPDATE dashboards SET dashboard_data = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
        [JSON.stringify(dashboardData), req.user.userId]
      );
    } else {
      // Create new dashboard
      await db.query(
        'INSERT INTO dashboards (user_id, dashboard_data) VALUES ($1, $2)',
        [req.user.userId, JSON.stringify(dashboardData)]
      );
    }
    
    res.json({ success: true, message: 'Dashboard saved successfully' });
  } catch (error) {
    console.error('Save dashboard error:', error);
    res.status(500).json({ error: 'Failed to save dashboard' });
  }
});

// Load dashboard
app.get('/dashboard/load', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT dashboard_data, updated_at FROM dashboards WHERE user_id = $1',
      [req.user.userId]
    );
    
    if (result.rows.length === 0) {
      return res.json({ success: true, dashboard: null });
    }
    
    res.json({
      success: true,
      dashboard: result.rows[0].dashboard_data,
      updatedAt: result.rows[0].updated_at
    });
  } catch (error) {
    console.error('Load dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// ==================== USER PROFILE ROUTES ====================

// Change password
app.post('/user/change-password', authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }
  
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  
  try {
    // Get current user
    const result = await db.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Verify current password
    const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    
    // Update password
    await db.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newPasswordHash, req.user.userId]
    );
    
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Update profile (email only for now)
app.post('/user/update-profile', authMiddleware, async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  
  try {
    // Check if email is already taken by another user
    const existing = await db.query(
      'SELECT id FROM users WHERE email = $1 AND id != $2',
      [email, req.user.userId]
    );
    
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already in use' });
    }
    
    // Update email
    await db.query(
      'UPDATE users SET email = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [email, req.user.userId]
    );
    
    res.json({ success: true, message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Get user profile
app.get('/user/profile', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, username, email, created_at, is_admin FROM users WHERE id = $1',
      [req.user.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ success: true, user: result.rows[0] });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// ==================== ADMIN ROUTES ====================

// Middleware to check if user is admin
const adminMiddleware = async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT is_admin FROM users WHERE id = $1',
      [req.user.userId]
    );
    
    if (result.rows.length === 0 || !result.rows[0].is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    next();
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({ error: 'Authorization failed' });
  }
};

// Get all users (admin only)
app.get('/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, username, email, is_admin, created_at, updated_at FROM users ORDER BY created_at DESC'
    );
    
    res.json({ success: true, users: result.rows });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// Make user admin (admin only)
app.post('/admin/users/:userId/make-admin', authMiddleware, adminMiddleware, async (req, res) => {
  const { userId } = req.params;
  
  try {
    await db.query(
      'UPDATE users SET is_admin = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [userId]
    );
    
    res.json({ success: true, message: 'User promoted to admin' });
  } catch (error) {
    console.error('Make admin error:', error);
    res.status(500).json({ error: 'Failed to make user admin' });
  }
});

// Remove admin privileges (admin only)
app.post('/admin/users/:userId/remove-admin', authMiddleware, adminMiddleware, async (req, res) => {
  const { userId } = req.params;
  
  // Prevent removing admin from yourself
  if (parseInt(userId) === req.user.userId) {
    return res.status(400).json({ error: 'Cannot remove admin privileges from yourself' });
  }
  
  try {
    await db.query(
      'UPDATE users SET is_admin = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [userId]
    );
    
    res.json({ success: true, message: 'Admin privileges removed' });
  } catch (error) {
    console.error('Remove admin error:', error);
    res.status(500).json({ error: 'Failed to remove admin privileges' });
  }
});

// Reset user password (admin only)
app.post('/admin/users/:userId/reset-password', authMiddleware, adminMiddleware, async (req, res) => {
  const { userId } = req.params;
  const { newPassword } = req.body;
  
  if (!newPassword) {
    return res.status(400).json({ error: 'New password is required' });
  }
  
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  
  try {
    const passwordHash = await bcrypt.hash(newPassword, 10);
    
    await db.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [passwordHash, userId]
    );
    
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Delete user (admin only)
app.delete('/admin/users/:userId', authMiddleware, adminMiddleware, async (req, res) => {
  const { userId } = req.params;
  
  // Prevent deleting yourself
  if (parseInt(userId) === req.user.userId) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  
  try {
    await db.query('DELETE FROM users WHERE id = $1', [userId]);
    
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Get dashboard stats (admin only)
app.get('/admin/stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const userCount = await db.query('SELECT COUNT(*) FROM users');
    const dashboardCount = await db.query('SELECT COUNT(*) FROM dashboards');
    const adminCount = await db.query('SELECT COUNT(*) FROM users WHERE is_admin = true');
    
    res.json({
      success: true,
      stats: {
        totalUsers: parseInt(userCount.rows[0].count),
        totalDashboards: parseInt(dashboardCount.rows[0].count),
        totalAdmins: parseInt(adminCount.rows[0].count)
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// ==================== EXISTING ROUTES ====================

// Modbus TCP Read Endpoint
app.get('/modbus/read', async (req, res) => {
  const { host, port = 502, address, count = 1, type = 'holding', unitId = 1 } = req.query;
  
  if (!host || address === undefined) {
    return res.status(400).json({ 
      error: 'host and address parameters are required',
      success: false 
    });
  }
  
  const client = new ModbusRTU();
  
  try {
    // Set connection timeout
    await Promise.race([
      client.connectTCP(host, { port: parseInt(port) }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), 3000)
      )
    ]);
    
    client.setID(parseInt(unitId));
    client.setTimeout(5000);
    
    const addr = parseInt(address);
    const cnt = parseInt(count);
    let data;
    
    switch(type) {
      case 'coil':
        data = await client.readCoils(addr, cnt);
        break;
      case 'discrete':
        data = await client.readDiscreteInputs(addr, cnt);
        break;
      case 'input':
        data = await client.readInputRegisters(addr, cnt);
        break;
      case 'holding':
      default:
        data = await client.readHoldingRegisters(addr, cnt);
        break;
    }
    
    await client.close();
    
    res.json({
      success: true,
      host,
      port: parseInt(port),
      unitId: parseInt(unitId),
      address: addr,
      count: cnt,
      type,
      data: data.data,
      timestamp: Date.now()
    });
    
  } catch (error) {
    try { await client.close(); } catch (e) {}
    console.error('Modbus error:', error);
    res.status(500).json({
      error: error.message,
      success: false,
      timestamp: Date.now()
    });
  }
});

// SNMP Read Endpoint
app.get('/snmp/get', (req, res) => {
  const { host, community = 'public', oids } = req.query;
  
  if (!host || !oids) {
    return res.status(400).json({ 
      error: 'host and oids parameters are required',
      success: false 
    });
  }
  
  try {
    // Parse OIDs (can be comma-separated)
    const oidArray = oids.split(',').map(oid => oid.trim());
    
    console.log(`SNMP GET request: host=${host}, community=${community}, oids=${oidArray.join(',')}`);
    
    // Create SNMP session with default options (they work better!)
    const session = snmp.createSession(host, community);
    
    console.log('SNMP session created, sending request...');
    
    let sessionClosed = false;
    
    // Handle session errors
    session.on('error', (err) => {
      console.error('SNMP session error:', err.message);
    });
    
    // Set response timeout
    const timeoutHandle = setTimeout(() => {
      console.log('SNMP request timed out (10s timeout)');
      if (!sessionClosed) {
        sessionClosed = true;
        session.close();
      }
      if (!res.headersSent) {
        res.status(500).json({
          error: 'SNMP request timeout',
          success: false,
          timestamp: Date.now()
        });
      }
    }, 10000);
    
    // Perform SNMP GET
    session.get(oidArray, (error, varbinds) => {
      console.log('SNMP callback received:', error ? `error: ${error.message}` : `success, ${varbinds.length} varbinds`);
      clearTimeout(timeoutHandle);
      if (!sessionClosed) {
        sessionClosed = true;
        session.close();
      }
      
      if (res.headersSent) return;
      
      if (error) {
        console.error('SNMP error:', error);
        return res.status(500).json({
          error: error.message,
          success: false,
          timestamp: Date.now()
        });
      }
      
      // Check for errors in varbinds
      const hasError = varbinds.some(vb => snmp.isVarbindError(vb));
      if (hasError) {
        return res.status(500).json({
          error: 'SNMP varbind error',
          success: false,
          timestamp: Date.now()
        });
      }
      
      // Format response
      const data = varbinds.map(vb => {
        let value = vb.value;
        // Convert Buffer to string for SNMP OctetString types
        if (Buffer.isBuffer(value)) {
          value = value.toString('utf8');
        }
        return {
          oid: vb.oid,
          type: vb.type,
          value: value
        };
      });
      
      res.json({
        success: true,
        host,
        community,
        data,
        timestamp: Date.now()
      });
    });
    
  } catch (error) {
    console.error('SNMP error:', error);
    res.status(500).json({
      error: error.message,
      success: false,
      timestamp: Date.now()
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'ping-server' });
});

// Ping endpoint
app.get('/ping/:target', async (req, res) => {
  const { target } = req.params;
  const timeout = parseInt(req.query.timeout) || 5; // seconds
  
  try {
    // Validate target (basic validation)
    if (!target || target.length === 0) {
      return res.status(400).json({ 
        error: 'Target is required',
        success: false 
      });
    }
    
    // Perform ping
    const startTime = Date.now();
    const result = await ping.promise.probe(target, {
      timeout: timeout,
      min_reply: 1
    });
    const responseTime = Date.now() - startTime;
    
    res.json({
      target: target,
      success: result.alive,
      responseTime: result.alive ? parseFloat(result.time) : null,
      totalTime: responseTime,
      timestamp: Date.now()
    });
    
  } catch (error) {
    console.error('Ping error:', error);
    res.status(500).json({
      error: error.message,
      success: false,
      target: target,
      timestamp: Date.now()
    });
  }
});

// POST endpoint for batch pings (optional, for future use)
app.post('/ping-batch', async (req, res) => {
  const { targets, timeout = 5 } = req.body;
  
  if (!Array.isArray(targets) || targets.length === 0) {
    return res.status(400).json({ error: 'Targets array is required' });
  }
  
  try {
    const results = await Promise.all(
      targets.map(async (target) => {
        try {
          const result = await ping.promise.probe(target, {
            timeout: timeout,
            min_reply: 1
          });
          
          return {
            target: target,
            success: result.alive,
            responseTime: result.alive ? parseFloat(result.time) : null,
            timestamp: Date.now()
          };
        } catch (error) {
          return {
            target: target,
            success: false,
            error: error.message,
            timestamp: Date.now()
          };
        }
      })
    );
    
    res.json({ results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Home Assistant proxy endpoints
app.post('/home-assistant/states', async (req, res) => {
  const { url, token } = req.body;
  
  if (!url || !token) {
    return res.status(400).json({ 
      error: 'url and token are required',
      success: false 
    });
  }
  
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`${url}/api/states`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message, success: false });
  }
});

app.post('/home-assistant/service', async (req, res) => {
  const { url, token, domain, service, entity_id } = req.body;
  
  if (!url || !token || !domain || !service || !entity_id) {
    return res.status(400).json({ 
      error: 'url, token, domain, service, and entity_id are required',
      success: false 
    });
  }
  
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`${url}/api/services/${domain}/${service}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ entity_id })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ error: error.message, success: false });
  }
});

// CORS proxy endpoint for fetching external XML/data
app.get('/proxy', async (req, res) => {
  try {
    const targetUrl = req.query.url;
    
    if (!targetUrl) {
      return res.status(400).send('Missing url parameter');
    }

    console.log(`Proxying request to: ${targetUrl}`);
    
    const https = require('https');
    const http = require('http');
    const urlModule = require('url');
    
    const parsedUrl = urlModule.parse(targetUrl);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;
    
    protocol.get(targetUrl, (proxyRes) => {
      // Forward the content-type header
      res.set('Content-Type', proxyRes.headers['content-type'] || 'text/xml');
      res.set('Access-Control-Allow-Origin', '*');
      
      // Pipe the response
      proxyRes.pipe(res);
    }).on('error', (error) => {
      console.error('Proxy error:', error);
      res.status(500).send(`Proxy error: ${error.message}`);
    });
    
  } catch (error) {
    console.error('Proxy endpoint error:', error);
    res.status(500).send(`Error: ${error.message}`);
  }
});

// Pi-hole session cache to avoid rate limiting
// Key: host+password hash, Value: { sid, expires }
const piholeSessionCache = new Map();

// Pi-hole API proxy endpoint
app.get('/api/pihole', async (req, res) => {
  try {
    const { host, password } = req.query;
    
    if (!host) {
      return res.status(400).json({ error: 'Missing host parameter' });
    }
    
    if (!password) {
      return res.status(400).json({ error: 'Missing password parameter. Pi-hole v6+ requires authentication.' });
    }

    // Use node-fetch to make requests
    const fetch = (await import('node-fetch')).default;
    
    // Create cache key from host+password
    const cacheKey = `${host}:${password}`;
    
    let sid;
    const cachedSession = piholeSessionCache.get(cacheKey);
    
    // Check if we have a valid cached session
    if (cachedSession && cachedSession.expires > Date.now()) {
      console.log('Using cached Pi-hole session');
      sid = cachedSession.sid;
    } else {
      // Step 1: Authenticate and get session ID
      const authUrl = `${host}/api/auth`;
      console.log(`Authenticating with Pi-hole at: ${authUrl}`);
      
      const authResponse = await fetch(authUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ password }),
        timeout: 5000
      });
      
      if (!authResponse.ok) {
        console.error(`Pi-hole auth error: ${authResponse.status} ${authResponse.statusText}`);
        return res.status(authResponse.status).json({ 
          error: `Pi-hole authentication failed: ${authResponse.status}` 
        });
      }
      
      const authData = await authResponse.json();
      
      if (!authData.session || !authData.session.valid) {
        console.error('Pi-hole authentication failed:', authData.session?.message || 'Unknown error');
        return res.status(401).json({ 
          error: 'Authentication failed',
          details: authData.session?.message || 'Invalid credentials'
        });
      }
      
      sid = authData.session.sid;
      
      // Cache the session for 5 minutes (Pi-hole sessions typically last longer)
      piholeSessionCache.set(cacheKey, {
        sid: sid,
        expires: Date.now() + (5 * 60 * 1000) // 5 minutes
      });
      
      console.log('Authentication successful, session cached');
    }
    
    // Step 2: Fetch stats with the session ID
    const statsUrl = `${host}/api/stats/summary?sid=${encodeURIComponent(sid)}`;
    
    const statsResponse = await fetch(statsUrl, { 
      headers: {
        'Accept': 'application/json'
      },
      timeout: 5000 
    });
    
    if (!statsResponse.ok) {
      console.error(`Pi-hole API error: ${statsResponse.status} ${statsResponse.statusText}`);
      const errorText = await statsResponse.text();
      console.error(`Response body: ${errorText}`);
      return res.status(statsResponse.status).json({ 
        error: `Pi-hole API returned ${statsResponse.status}: ${statsResponse.statusText}`,
        details: errorText
      });
    }
    
    const data = await statsResponse.json();
    
    console.log('Pi-hole stats data:', JSON.stringify(data).substring(0, 500));
    
    // Set CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Content-Type', 'application/json');
    
    res.json(data);
    
  } catch (error) {
    console.error('Pi-hole proxy error:', error);
    res.status(500).json({ 
      error: error.message,
      details: 'Failed to fetch Pi-hole data. Check if Pi-hole is accessible and credentials are correct.'
    });
  }
});

// UniFi Controller session cache to avoid rate limiting
// Key: host+username+password hash, Value: { cookies, expires }
const unifiSessionCache = new Map();

// UniFi Controller API proxy endpoint
app.get('/api/unifi/stats', async (req, res) => {
  try {
    const { host, username, password, site = 'default' } = req.query;
    
    if (!host) {
      return res.status(400).json({ error: 'Missing host parameter' });
    }
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Missing username or password parameter' });
    }

    // Use node-fetch to make requests
    const fetch = (await import('node-fetch')).default;
    const https = require('https');
    
    // Create an HTTPS agent that ignores self-signed certificates
    const httpsAgent = new https.Agent({
      rejectUnauthorized: false
    });
    
    // Create cache key from host+username+password
    const cacheKey = `${host}:${username}:${password}`;
    
    let cookies;
    const cachedSession = unifiSessionCache.get(cacheKey);
    
    // Check if we have a valid cached session
    if (cachedSession && cachedSession.expires > Date.now()) {
      console.log('Using cached UniFi session');
      cookies = cachedSession.cookies;
    } else {
      // Step 1: Authenticate and get session cookies
      const loginUrl = `${host}/api/login`;
      console.log(`Authenticating with UniFi Controller at: ${loginUrl}`);
      
      const loginResponse = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ 
          username,
          password,
          remember: false
        }),
        agent: httpsAgent,
        timeout: 10000
      });
      
      if (!loginResponse.ok) {
        console.error(`UniFi login error: ${loginResponse.status} ${loginResponse.statusText}`);
        const errorText = await loginResponse.text();
        return res.status(loginResponse.status).json({ 
          error: `UniFi authentication failed: ${loginResponse.status}`,
          details: errorText
        });
      }
      
      // Extract cookies from response
      const setCookieHeaders = loginResponse.headers.raw()['set-cookie'];
      if (!setCookieHeaders || setCookieHeaders.length === 0) {
        return res.status(401).json({ 
          error: 'Authentication failed',
          details: 'No session cookies received from UniFi Controller'
        });
      }
      
      // Join all cookies
      cookies = setCookieHeaders.map(cookie => cookie.split(';')[0]).join('; ');
      
      // Cache the session for 30 minutes
      unifiSessionCache.set(cacheKey, {
        cookies: cookies,
        expires: Date.now() + (30 * 60 * 1000) // 30 minutes
      });
      
      console.log('UniFi authentication successful, session cached');
    }
    
    // Step 2: Fetch multiple endpoints in parallel for comprehensive data
    const [healthResponse, devicesResponse, clientsResponse, alarmsResponse] = await Promise.all([
      // Health/stats
      fetch(`${host}/api/s/${site}/stat/health`, { 
        headers: { 'Accept': 'application/json', 'Cookie': cookies },
        agent: httpsAgent,
        timeout: 10000 
      }),
      // Device list (APs, switches, gateways)
      fetch(`${host}/api/s/${site}/stat/device`, { 
        headers: { 'Accept': 'application/json', 'Cookie': cookies },
        agent: httpsAgent,
        timeout: 10000 
      }).catch(err => {
        console.log('Device fetch failed (non-critical):', err.message);
        return null;
      }),
      // Active clients
      fetch(`${host}/api/s/${site}/stat/sta`, { 
        headers: { 'Accept': 'application/json', 'Cookie': cookies },
        agent: httpsAgent,
        timeout: 10000 
      }).catch(err => {
        console.log('Clients fetch failed (non-critical):', err.message);
        return null;
      }),
      // Recent alarms
      fetch(`${host}/api/s/${site}/stat/alarm`, { 
        headers: { 'Accept': 'application/json', 'Cookie': cookies },
        agent: httpsAgent,
        timeout: 10000 
      }).catch(err => {
        console.log('Alarms fetch failed (non-critical):', err.message);
        return null;
      })
    ]);
    
    if (!healthResponse.ok) {
      console.error(`UniFi API error: ${healthResponse.status} ${healthResponse.statusText}`);
      const errorText = await healthResponse.text();
      console.error(`Response body: ${errorText}`);
      
      // Clear cache on auth errors
      if (healthResponse.status === 401) {
        unifiSessionCache.delete(cacheKey);
      }
      
      return res.status(healthResponse.status).json({ 
        error: `UniFi API returned ${healthResponse.status}: ${healthResponse.statusText}`,
        details: errorText
      });
    }
    
    const healthData = await healthResponse.json();
    const devicesData = devicesResponse && devicesResponse.ok ? await devicesResponse.json() : { data: [] };
    const clientsData = clientsResponse && clientsResponse.ok ? await clientsResponse.json() : { data: [] };
    const alarmsData = alarmsResponse && alarmsResponse.ok ? await alarmsResponse.json() : { data: [] };
    
    // Aggregate stats from all subsystems
    const stats = {
      site_name: site,
      num_user: 0,
      num_guest: 0,
      num_iot: 0,
      gateways: 0,
      switches: 0,
      access_points: 0,
      devices: [],
      clients: [],
      alarms: [],
      traffic: {
        tx_bytes: 0,
        rx_bytes: 0,
        tx_packets: 0,
        rx_packets: 0
      }
    };
    
    // Process health data
    if (healthData.data && Array.isArray(healthData.data)) {
      healthData.data.forEach(item => {
        if (item.subsystem === 'wlan') {
          stats.num_user = item.num_user || 0;
          stats.num_guest = item.num_guest || 0;
          stats.num_iot = item.num_iot || 0;
          stats.access_points = item.num_ap || 0;
          if (item.tx_bytes) stats.traffic.tx_bytes += item.tx_bytes;
          if (item.rx_bytes) stats.traffic.rx_bytes += item.rx_bytes;
        } else if (item.subsystem === 'wan') {
          stats.wan_ip = item.wan_ip;
          stats.uptime = item.uptime;
          stats.wan_uptime = item.uptime;
          stats.latency = item.latency;
          stats.speedtest_ping = item.speedtest_ping;
          stats.xput_up = item.xput_up;
          stats.xput_down = item.xput_down;
        } else if (item.subsystem === 'www') {
          stats.gateways = (item.num_gw || 0);
          stats.gateway_status = item.status;
        } else if (item.subsystem === 'sw') {
          stats.switches = (item.num_sw || 0);
        } else if (item.subsystem === 'lan') {
          stats.num_lan = item.num_user || 0;
        }
      });
    }
    
    // Process devices data (detailed device info)
    if (devicesData.data && Array.isArray(devicesData.data)) {
      devicesData.data.forEach(device => {
        stats.devices.push({
          name: device.name || device.hostname || 'Unknown',
          model: device.model,
          type: device.type,
          ip: device.ip,
          mac: device.mac,
          state: device.state,
          adopted: device.adopted,
          uptime: device.uptime,
          version: device.version,
          upgradable: device.upgradable,
          num_sta: device.num_sta || 0,
          user_num_sta: device['user-num_sta'] || 0,
          guest_num_sta: device['guest-num_sta'] || 0,
          bytes: device.bytes || 0,
          tx_bytes: device['tx_bytes'] || 0,
          rx_bytes: device['rx_bytes'] || 0,
          satisfaction: device.satisfaction,
          cpu: device['system-stats']?.cpu,
          mem: device['system-stats']?.mem,
          uplink: device.uplink
        });
      });
    }
    
    // Process clients data (active connections)
    if (clientsData.data && Array.isArray(clientsData.data)) {
      clientsData.data.forEach(client => {
        stats.clients.push({
          name: client.hostname || client.name || 'Unknown',
          mac: client.mac,
          ip: client.ip,
          network: client.network,
          essid: client.essid,
          is_guest: client.is_guest,
          is_wired: client.is_wired,
          signal: client.signal,
          rssi: client.rssi,
          tx_bytes: client.tx_bytes || 0,
          rx_bytes: client.rx_bytes || 0,
          tx_rate: client.tx_rate,
          rx_rate: client.rx_rate,
          uptime: client.uptime,
          last_seen: client.last_seen,
          ap_mac: client.ap_mac,
          channel: client.channel,
          radio: client.radio
        });
      });
    }
    
    // Process alarms/events
    if (alarmsData.data && Array.isArray(alarmsData.data)) {
      stats.alarms = alarmsData.data.slice(0, 10).map(alarm => ({
        datetime: alarm.datetime,
        msg: alarm.msg,
        key: alarm.key,
        subsystem: alarm.subsystem,
        archived: alarm.archived
      }));
    }
    
    console.log('UniFi comprehensive stats:', {
      clients: stats.clients.length,
      devices: stats.devices.length,
      alarms: stats.alarms.length
    });
    
    // Set CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Content-Type', 'application/json');
    
    res.json(stats);
    
  } catch (error) {
    console.error('UniFi proxy error:', error);
    res.status(500).json({ 
      error: error.message,
      details: 'Failed to fetch UniFi data. Check if controller is accessible and credentials are correct.'
    });
  }
});

app.listen(PORT, () => {
  console.log(`Ping server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Ping endpoint: http://localhost:${PORT}/ping/<target>`);
  console.log(`Proxy endpoint: http://localhost:${PORT}/proxy?url=<target_url>`);
});
