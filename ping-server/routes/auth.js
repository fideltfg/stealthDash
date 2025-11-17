const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../db');
const { authMiddleware, generateToken } = require('../auth');

// Helper function to send recovery email (will be passed from server.js)
let sendRecoveryEmail;
let SMTP_CONFIGURED;

// Initialize with email function and config
router.init = (emailFunc, smtpConfigured) => {
  sendRecoveryEmail = emailFunc;
  SMTP_CONFIGURED = smtpConfigured;
};

// Register new user
router.post('/register', async (req, res) => {
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
router.post('/login', async (req, res) => {
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
router.get('/verify', authMiddleware, (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user.userId,
      username: req.user.username,
      email: req.user.email
    }
  });
});

// Request password recovery token
router.post('/request-recovery', async (req, res) => {
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
        //console.log(`✅ Password recovery email sent to ${user.email}`);
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
router.post('/validate-token', async (req, res) => {
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
router.post('/reset-password-with-token', async (req, res) => {
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
    
    //console.log(`✅ Password reset successful for user: ${recovery.username}`);
    
    res.json({ 
      success: true, 
      message: 'Password has been reset successfully'
    });
  } catch (err) {
    console.error('Password reset error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Validate recovery token (check if it's valid before showing reset form) - GET version
router.get('/validate-token/:token', async (req, res) => {
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

module.exports = router;
