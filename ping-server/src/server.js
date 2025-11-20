const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');

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

// Import route modules
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const userRoutes = require('./routes/user');
const adminRoutes = require('./routes/admin');
const credentialsRoutes = require('./routes/credentials');
const widgetRoutes = require('./routes/widgets');
const dockerRoutes = require('./routes/docker');

// Initialize auth routes with email function
authRoutes.init(sendRecoveryEmail, SMTP_CONFIGURED);

// Mount routes
app.use('/auth', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/user', userRoutes);
app.use('/admin', adminRoutes);
app.use('/user', credentialsRoutes);  // Credentials are under /user/credentials

// Widget routes are mounted at root level to preserve existing API paths
app.use('/', widgetRoutes);

// Docker API routes
app.use('/', dockerRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`Ping server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Ping endpoint: http://localhost:${PORT}/ping/<target>`);
  console.log(`Proxy endpoint: http://localhost:${PORT}/proxy?url=<target_url>`);
});
