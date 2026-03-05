/**
 * SNMP Widget Plugin
 * 
 * Provides SNMP read endpoint for network monitoring widgets.
 */

const express = require('express');
const router = express.Router();
const snmp = require('net-snmp');
const { getCredentials, verifyAuth, respond } = require('../src/plugin-helpers');

// SNMP Read Endpoint
router.get('/snmp/get', async (req, res) => {
  const { host, community = 'public', credentialId, oids } = req.query;
  
  if (!host || !oids) {
    return respond.badRequest(res, 'host and oids parameters are required');
  }
  
  let snmpCommunity = community;
  
  // If credentialId is provided, fetch credentials from database
  if (credentialId) {
    try {
      const decoded = verifyAuth(req);
      const credentials = await getCredentials(credentialId, decoded.userId);
      
      if (!credentials.community) {
        return respond.badRequest(res, 'Credential does not contain community field');
      }
      
      snmpCommunity = credentials.community;
    } catch (err) {
      return respond.unauthorized(res, 'Invalid authentication token or credential access denied');
    }
  }
  
  try {
    // Parse OIDs (can be comma-separated)
    const oidArray = oids.split(',').map(oid => oid.trim());
    
    console.log(`SNMP GET request: host=${host}, community=${snmpCommunity}, oids=${oidArray.join(',')}`);
    
    // Create SNMP session with default options
    const session = snmp.createSession(host, snmpCommunity);
    
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

module.exports = {
  name: 'snmp',
  description: 'SNMP read endpoint for network device monitoring',
  version: '1.0.0',
  routes: router,
  mountPath: '/'
};
