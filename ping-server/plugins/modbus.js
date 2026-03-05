/**
 * Modbus Widget Plugin
 * 
 * Provides Modbus TCP read endpoint for industrial sensor widgets.
 */

const express = require('express');
const router = express.Router();
const ModbusRTU = require('modbus-serial');
const { respond } = require('../src/plugin-helpers');

// Modbus TCP Read Endpoint
router.get('/modbus/read', async (req, res) => {
  const { host, port = 502, address, count = 1, type = 'holding', unitId = 1 } = req.query;
  
  if (!host || address === undefined) {
    return respond.badRequest(res, 'host and address parameters are required');
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

module.exports = {
  name: 'modbus',
  description: 'Modbus TCP read endpoint for industrial sensors',
  version: '1.0.0',
  routes: router,
  mountPath: '/'
};
