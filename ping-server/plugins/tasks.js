/**
 * Tasks Plugin
 *
 * Provides task management API for the dashboard.
 * Supports CRUD operations and task statistics.
 */

const express = require('express');
const router = express.Router();
const { db, authMiddleware } = require('../src/plugin-helpers');

// ==================== TASKS ROUTES ====================

// Get all tasks for the authenticated user
router.get('/tasks', authMiddleware, async (req, res) => {
  try {
    const { completed, priority, category } = req.query;

    let query = 'SELECT * FROM tasks WHERE user_id = $1';
    const params = [req.user.userId];
    let paramCount = 1;

    // Optional filters
    if (completed !== undefined) {
      paramCount++;
      query += ` AND completed = $${paramCount}`;
      params.push(completed === 'true');
    }

    if (priority) {
      paramCount++;
      query += ` AND priority = $${paramCount}`;
      params.push(parseInt(priority));
    }

    if (category) {
      paramCount++;
      query += ` AND category = $${paramCount}`;
      params.push(category);
    }

    query += ' ORDER BY completed ASC, priority ASC, due_date ASC NULLS LAST, created_at DESC';

    const result = await db.query(query, params);

    res.json({
      success: true,
      tasks: result.rows,
    });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tasks',
    });
  }
});

// Create a new task
router.post('/tasks', authMiddleware, async (req, res) => {
  try {
    const { title, description, priority = 4, due_date, category } = req.body;

    if (!title || title.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Task title is required',
      });
    }

    // Validate priority (1-4)
    const validPriority = Math.max(1, Math.min(4, parseInt(priority) || 4));

    const result = await db.query(
      `INSERT INTO tasks (user_id, title, description, priority, due_date, category)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [req.user.userId, title.trim(), description, validPriority, due_date || null, category || null]
    );

    res.json({
      success: true,
      task: result.rows[0],
    });
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create task',
    });
  }
});

// Update a task
router.put('/tasks/:id', authMiddleware, async (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    const { title, description, completed, priority, due_date, category } = req.body;

    // Build dynamic update query
    const updates = [];
    const params = [taskId, req.user.userId];
    let paramCount = 2;

    if (title !== undefined) {
      paramCount++;
      updates.push(`title = $${paramCount}`);
      params.push(title.trim());
    }

    if (description !== undefined) {
      paramCount++;
      updates.push(`description = $${paramCount}`);
      params.push(description);
    }

    if (completed !== undefined) {
      paramCount++;
      updates.push(`completed = $${paramCount}`);
      params.push(completed);

      // Set completed_at timestamp
      if (completed) {
        updates.push(`completed_at = CURRENT_TIMESTAMP`);
      } else {
        updates.push(`completed_at = NULL`);
      }
    }

    if (priority !== undefined) {
      const validPriority = Math.max(1, Math.min(4, parseInt(priority) || 4));
      paramCount++;
      updates.push(`priority = $${paramCount}`);
      params.push(validPriority);
    }

    if (due_date !== undefined) {
      paramCount++;
      updates.push(`due_date = $${paramCount}`);
      params.push(due_date || null);
    }

    if (category !== undefined) {
      paramCount++;
      updates.push(`category = $${paramCount}`);
      params.push(category || null);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update',
      });
    }

    const query = `
      UPDATE tasks 
      SET ${updates.join(', ')}
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `;

    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Task not found or access denied',
      });
    }

    res.json({
      success: true,
      task: result.rows[0],
    });
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update task',
    });
  }
});

// Delete a task
router.delete('/tasks/:id', authMiddleware, async (req, res) => {
  try {
    const taskId = parseInt(req.params.id);

    const result = await db.query('DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING id', [
      taskId,
      req.user.userId,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Task not found or access denied',
      });
    }

    res.json({
      success: true,
      message: 'Task deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete task',
    });
  }
});

// Get task statistics
router.get('/tasks/stats', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN completed THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN NOT completed THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN NOT completed AND due_date < CURRENT_DATE THEN 1 ELSE 0 END) as overdue,
        SUM(CASE WHEN NOT completed AND due_date = CURRENT_DATE THEN 1 ELSE 0 END) as today
       FROM tasks 
       WHERE user_id = $1`,
      [req.user.userId]
    );

    res.json({
      success: true,
      stats: result.rows[0],
    });
  } catch (error) {
    console.error('Error fetching task stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch task statistics',
    });
  }
});

// ==================== PLUGIN EXPORT ====================

module.exports = {
  name: 'tasks',
  description: 'Task management API (CRUD operations and statistics)',
  version: '1.0.0',
  routes: router,
  mountPath: '/api',
};
