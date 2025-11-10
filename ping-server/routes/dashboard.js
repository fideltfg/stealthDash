const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware } = require('../auth');

// Save dashboard
router.post('/save', authMiddleware, async (req, res) => {
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
router.get('/load', authMiddleware, async (req, res) => {
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

module.exports = router;
