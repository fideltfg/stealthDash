const express = require('express');
const router = express.Router();
const db = require('../src/db');
const { authMiddleware } = require('../src/auth');
const { encryptCredentials, decryptCredentials } = require('../src/crypto-utils');

// Get all credentials for the current user
router.get('/credentials', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, name, description, service_type, created_at, updated_at FROM credentials WHERE user_id = $1 ORDER BY name',
      [req.user.userId]
    );
    
    res.json({ success: true, credentials: result.rows });
  } catch (error) {
    console.error('Get credentials error:', error);
    res.status(500).json({ error: 'Failed to get credentials' });
  }
});

// Get a specific credential by ID (returns decrypted data)
router.get('/credentials/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await db.query(
      'SELECT id, name, description, service_type, credential_data, created_at, updated_at FROM credentials WHERE id = $1 AND user_id = $2',
      [id, req.user.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Credential not found' });
    }
    
    const credential = result.rows[0];
    
    // Decrypt the credential data
    try {
      credential.data = decryptCredentials(credential.credential_data);
      delete credential.credential_data; // Remove encrypted version from response
    } catch (decryptError) {
      console.error('Decryption error:', decryptError);
      return res.status(500).json({ error: 'Failed to decrypt credential data' });
    }
    
    res.json({ success: true, credential });
  } catch (error) {
    console.error('Get credential error:', error);
    res.status(500).json({ error: 'Failed to get credential' });
  }
});

// Create a new credential
router.post('/credentials', authMiddleware, async (req, res) => {
  const { name, description, service_type, data } = req.body;
  
  if (!name || !service_type || !data) {
    return res.status(400).json({ error: 'Name, service_type, and data are required' });
  }
  
  // Validate service_type
  const validServiceTypes = ['pihole', 'unifi', 'home_assistant', 'google_calendar', 'docker', 'snmp', 'modbus', 'api', 'custom'];
  if (!validServiceTypes.includes(service_type)) {
    return res.status(400).json({ 
      error: 'Invalid service_type', 
      validTypes: validServiceTypes 
    });
  }
  
  try {
    // Encrypt the credential data
    const encryptedData = encryptCredentials(data);
    
    const result = await db.query(
      'INSERT INTO credentials (user_id, name, description, service_type, credential_data) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, description, service_type, created_at, updated_at',
      [req.user.userId, name, description || null, service_type, encryptedData]
    );
    
    res.status(201).json({ success: true, credential: result.rows[0] });
  } catch (error) {
    console.error('Create credential error:', error);
    res.status(500).json({ error: 'Failed to create credential' });
  }
});

// Update a credential
router.put('/credentials/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { name, description, service_type, data } = req.body;
  
  try {
    // Check if credential exists and belongs to user
    const existing = await db.query(
      'SELECT id FROM credentials WHERE id = $1 AND user_id = $2',
      [id, req.user.userId]
    );
    
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Credential not found' });
    }
    
    // Build update query dynamically based on provided fields
    const updates = [];
    const values = [];
    let paramCount = 1;
    
    if (name !== undefined) {
      updates.push(`name = $${paramCount}`);
      values.push(name);
      paramCount++;
    }
    
    if (description !== undefined) {
      updates.push(`description = $${paramCount}`);
      values.push(description);
      paramCount++;
    }
    
    if (service_type !== undefined) {
      const validServiceTypes = ['pihole', 'unifi', 'home_assistant', 'google_calendar', 'docker', 'snmp', 'modbus', 'api', 'custom'];
      if (!validServiceTypes.includes(service_type)) {
        return res.status(400).json({ 
          error: 'Invalid service_type', 
          validTypes: validServiceTypes 
        });
      }
      updates.push(`service_type = $${paramCount}`);
      values.push(service_type);
      paramCount++;
    }
    
    if (data !== undefined) {
      const encryptedData = encryptCredentials(data);
      updates.push(`credential_data = $${paramCount}`);
      values.push(encryptedData);
      paramCount++;
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);
    values.push(req.user.userId);
    
    const query = `UPDATE credentials SET ${updates.join(', ')} WHERE id = $${paramCount} AND user_id = $${paramCount + 1} RETURNING id, name, description, service_type, created_at, updated_at`;
    
    const result = await db.query(query, values);
    
    res.json({ success: true, credential: result.rows[0] });
  } catch (error) {
    console.error('Update credential error:', error);
    res.status(500).json({ error: 'Failed to update credential' });
  }
});

// Delete a credential
router.delete('/credentials/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await db.query(
      'DELETE FROM credentials WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.user.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Credential not found' });
    }
    
    res.json({ success: true, message: 'Credential deleted successfully' });
  } catch (error) {
    console.error('Delete credential error:', error);
    res.status(500).json({ error: 'Failed to delete credential' });
  }
});

// Test a credential (validate it works with the service)
router.post('/credentials/:id/test', authMiddleware, async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await db.query(
      'SELECT service_type, credential_data FROM credentials WHERE id = $1 AND user_id = $2',
      [id, req.user.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Credential not found' });
    }
    
    const credential = result.rows[0];
    const data = decryptCredentials(credential.credential_data);
    
    // Perform basic validation based on service type
    let valid = false;
    let message = '';
    
    switch (credential.service_type) {
      case 'pihole':
        valid = !!data.password;
        message = valid ? 'Pi-hole credentials format is valid' : 'Missing password';
        break;
      case 'unifi':
        valid = !!data.username && !!data.password;
        message = valid ? 'UniFi credentials format is valid' : 'Missing username or password';
        break;
      case 'home_assistant':
        valid = !!data.token;
        message = valid ? 'Home Assistant token format is valid' : 'Missing token';
        break;
      case 'snmp':
        valid = !!data.community;
        message = valid ? 'SNMP community string is valid' : 'Missing community string';
        break;
      default:
        valid = true;
        message = 'Credential data exists';
    }
    
    res.json({ 
      success: true, 
      valid, 
      message,
      service_type: credential.service_type
    });
  } catch (error) {
    console.error('Test credential error:', error);
    res.status(500).json({ error: 'Failed to test credential' });
  }
});

module.exports = router;
