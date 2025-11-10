const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authMiddleware } = require('../auth');

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
router.get('/users', authMiddleware, adminMiddleware, async (req, res) => {
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
router.post('/users/:userId/make-admin', authMiddleware, adminMiddleware, async (req, res) => {
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
router.post('/users/:userId/remove-admin', authMiddleware, adminMiddleware, async (req, res) => {
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
router.post('/users/:userId/reset-password', authMiddleware, adminMiddleware, async (req, res) => {
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
router.delete('/users/:userId', authMiddleware, adminMiddleware, async (req, res) => {
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
router.get('/stats', authMiddleware, adminMiddleware, async (req, res) => {
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

module.exports = router;
