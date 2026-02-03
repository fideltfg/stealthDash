const express = require('express');
const router = express.Router();
const db = require('../src/db');
const { authMiddleware } = require('../src/auth');

// Save entire multi-dashboard state
router.post('/save', authMiddleware, async (req, res) => {
  const { dashboardData } = req.body;
  
  if (!dashboardData || !dashboardData.dashboards || !dashboardData.activeDashboardId) {
    return res.status(400).json({ error: 'Invalid dashboard data format' });
  }
  
  try {
    // Log incoming data for debugging
    console.log('📥 Received save request with', dashboardData.dashboards.length, 'dashboards');
    const dashboardIds = dashboardData.dashboards.map(d => d.id);
    console.log('Dashboard IDs:', dashboardIds);
    if (new Set(dashboardIds).size !== dashboardIds.length) {
      console.warn('⚠️  DUPLICATES DETECTED in incoming data!');
    }
    
    // Begin transaction
    await db.query('BEGIN');
    
    // Deduplicate dashboards by ID (keep the last occurrence)
    const dashboardMap = new Map();
    for (const dashboard of dashboardData.dashboards) {
      dashboardMap.set(dashboard.id, dashboard);
    }
    const uniqueDashboards = Array.from(dashboardMap.values());
    console.log('After deduplication:', uniqueDashboards.length, 'dashboards');
    
    // Get existing dashboards for this user
    const existing = await db.query(
      'SELECT dashboard_id FROM dashboards WHERE user_id = $1',
      [req.user.userId]
    );
    
    const existingIds = new Set(existing.rows.map(row => row.dashboard_id));
    const newDashboardIds = new Set(uniqueDashboards.map(d => d.id));
    
    // Delete dashboards that no longer exist in the new data
    const toDelete = [...existingIds].filter(id => !newDashboardIds.has(id));
    if (toDelete.length > 0) {
      await db.query(
        'DELETE FROM dashboards WHERE user_id = $1 AND dashboard_id = ANY($2)',
        [req.user.userId, toDelete]
      );
    }
    
    // Upsert each dashboard
    for (const dashboard of uniqueDashboards) {
      const isActive = dashboard.id === dashboardData.activeDashboardId;
      
      // Insert/Update dashboard data WITHOUT setting is_active yet
      await db.query(`
        INSERT INTO dashboards (user_id, dashboard_id, name, dashboard_data, is_active)
        VALUES ($1, $2, $3, $4, false)
        ON CONFLICT (user_id, dashboard_id) 
        DO UPDATE SET 
          name = EXCLUDED.name,
          dashboard_data = EXCLUDED.dashboard_data,
          updated_at = CURRENT_TIMESTAMP
      `, [
        req.user.userId,
        dashboard.id,
        dashboard.name,
        JSON.stringify(dashboard.state)
      ]);
    }
    
    // Now set the active dashboard separately (avoiding trigger conflicts)
    await db.query(`
      UPDATE dashboards 
      SET is_active = true 
      WHERE user_id = $1 AND dashboard_id = $2
    `, [req.user.userId, dashboardData.activeDashboardId]);
    
    await db.query('COMMIT');
    console.log('✅ Successfully saved', uniqueDashboards.length, 'dashboards for user', req.user.userId);
    res.json({ success: true, message: 'Dashboards saved successfully' });
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('❌ Save dashboard error:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail
    });
    res.status(500).json({ error: 'Failed to save dashboards', details: error.message });
  }
});

// Load all dashboards for the user
router.get('/load', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT dashboard_id, name, dashboard_data, is_active, is_public, updated_at, created_at 
       FROM dashboards 
       WHERE user_id = $1 
       ORDER BY created_at ASC`,
      [req.user.userId]
    );
    
    if (result.rows.length === 0) {
      return res.json({ success: true, dashboards: [] });
    }
    
    // Reconstruct the multi-dashboard state
    const dashboards = result.rows.map(row => ({
      id: row.dashboard_id,
      name: row.name,
      state: row.dashboard_data,
      isPublic: row.is_public || false,
      createdAt: new Date(row.created_at).getTime(),
      updatedAt: new Date(row.updated_at).getTime()
    }));
    
    const activeDashboard = result.rows.find(row => row.is_active);
    const activeDashboardId = activeDashboard ? activeDashboard.dashboard_id : dashboards[0].id;
    
    res.json({
      success: true,
      data: {
        dashboards,
        activeDashboardId,
        version: 1
      }
    });
  } catch (error) {
    console.error('Load dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboards' });
  }
});

// Save a single dashboard (for incremental updates)
router.post('/save-single', authMiddleware, async (req, res) => {
  const { dashboardId, name, state, isActive } = req.body;
  
  if (!dashboardId || !state) {
    return res.status(400).json({ error: 'Dashboard ID and state are required' });
  }
  
  try {
    await db.query(`
      INSERT INTO dashboards (user_id, dashboard_id, name, dashboard_data, is_active)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id, dashboard_id) 
      DO UPDATE SET 
        name = EXCLUDED.name,
        dashboard_data = EXCLUDED.dashboard_data,
        is_active = EXCLUDED.is_active,
        updated_at = CURRENT_TIMESTAMP
    `, [
      req.user.userId,
      dashboardId,
      name || 'Dashboard',
      JSON.stringify(state),
      isActive || false
    ]);
    
    res.json({ success: true, message: 'Dashboard saved successfully' });
  } catch (error) {
    console.error('Save single dashboard error:', error);
    res.status(500).json({ error: 'Failed to save dashboard' });
  }
});

// Delete a dashboard
router.delete('/:dashboardId', authMiddleware, async (req, res) => {
  const { dashboardId } = req.params;
  
  try {
    // Check if this is the last dashboard
    const count = await db.query(
      'SELECT COUNT(*) FROM dashboards WHERE user_id = $1',
      [req.user.userId]
    );
    
    if (parseInt(count.rows[0].count) <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last dashboard' });
    }
    
    // Delete the dashboard
    const result = await db.query(
      'DELETE FROM dashboards WHERE user_id = $1 AND dashboard_id = $2 RETURNING is_active',
      [req.user.userId, dashboardId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Dashboard not found' });
    }
    
    // If we deleted the active dashboard, activate the first remaining one
    if (result.rows[0].is_active) {
      await db.query(`
        UPDATE dashboards 
        SET is_active = true 
        WHERE user_id = $1 
        AND id = (SELECT MIN(id) FROM dashboards WHERE user_id = $1)
      `, [req.user.userId]);
    }
    
    res.json({ success: true, message: 'Dashboard deleted successfully' });
  } catch (error) {
    console.error('Delete dashboard error:', error);
    res.status(500).json({ error: 'Failed to delete dashboard' });
  }
});

// Toggle public status of a dashboard
router.post('/toggle-public/:dashboardId', authMiddleware, async (req, res) => {
  const { dashboardId } = req.params;
  const { isPublic } = req.body;
  
  try {
    // Verify ownership
    const result = await db.query(
      'UPDATE dashboards SET is_public = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2 AND dashboard_id = $3 RETURNING is_public',
      [isPublic, req.user.userId, dashboardId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Dashboard not found or access denied' });
    }
    
    res.json({ success: true, isPublic: result.rows[0].is_public });
  } catch (error) {
    console.error('Toggle public error:', error);
    res.status(500).json({ error: 'Failed to update dashboard visibility' });
  }
});

// Get public dashboard (no auth required)
router.get('/public/:dashboardId', async (req, res) => {
  const { dashboardId } = req.params;
  
  try {
    const result = await db.query(
      `SELECT d.dashboard_id, d.name, d.dashboard_data, d.updated_at, d.created_at, u.username as owner_username
       FROM dashboards d
       JOIN users u ON d.user_id = u.id
       WHERE d.dashboard_id = $1 AND d.is_public = true`,
      [dashboardId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Public dashboard not found' });
    }
    
    const dashboard = result.rows[0];
    res.json({
      success: true,
      dashboard: {
        id: dashboard.dashboard_id,
        name: dashboard.name,
        state: dashboard.dashboard_data,
        owner: dashboard.owner_username,
        updatedAt: dashboard.updated_at,
        createdAt: dashboard.created_at,
        isPublic: true,
        isReadOnly: true
      }
    });
  } catch (error) {
    console.error('Get public dashboard error:', error);
    res.status(500).json({ error: 'Failed to load public dashboard' });
  }
});

module.exports = router;
