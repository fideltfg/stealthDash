/**
 * Crypto Widget Plugin
 * 
 * Provides backend routes for the Crypto ticker widget,
 * proxying requests to CoinGecko API with caching.
 */

const express = require('express');
const router = express.Router();
const { createCache, respond } = require('../src/plugin-helpers');

// Create cache with 60-second TTL
const cache = createCache(60000);

// Proxy for CoinGecko market data (prices)
router.get('/api/crypto/markets', async (req, res) => {
    try {
        const { vs_currency, ids } = req.query;
        if (!vs_currency || !ids) {
            return respond.badRequest(res, 'Missing required parameters: vs_currency and ids');
        }

        // Check cache first
        const cacheKey = `markets:${vs_currency}:${ids}`;
        const cachedData = cache.get(cacheKey);
        if (cachedData) {
            return res.json(cachedData);
        }

        const fetch = (await import('node-fetch')).default;
        const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=${vs_currency}&ids=${ids}&order=market_cap_desc&sparkline=false&price_change_percentage=24h`;

        const response = await fetch(url, {
            headers: { 'Accept': 'application/json' },
            timeout: 10000
        });

        if (!response.ok) {
            if (response.status === 429) {
                throw new Error('Rate limit exceeded. Please increase refresh interval or try again later.');
            }
            throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        cache.set(cacheKey, data);
        res.json(data);
    } catch (error) {
        console.error('Crypto markets proxy error:', error);
        const status = error.message.includes('Rate limit') ? 429 : 500;
        res.status(status).json({
            error: error.message || 'Failed to fetch crypto market data'
        });
    }
});

// Proxy for CoinGecko historical chart data
router.get('/api/crypto/chart', async (req, res) => {
    try {
        const { id, vs_currency, days } = req.query;
        if (!id || !vs_currency || !days) {
            return respond.badRequest(res, 'Missing required parameters: id, vs_currency, and days');
        }

        // Check cache first
        const cacheKey = `chart:${id}:${vs_currency}:${days}`;
        const cachedData = cache.get(cacheKey);
        if (cachedData) {
            return res.json(cachedData);
        }

        const fetch = (await import('node-fetch')).default;
        const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=${vs_currency}&days=${days}`;

        const response = await fetch(url, {
            headers: { 'Accept': 'application/json' },
            timeout: 10000
        });

        if (!response.ok) {
            if (response.status === 429) {
                throw new Error('Rate limit exceeded. Please increase refresh interval or try again later.');
            }
            throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        cache.set(cacheKey, data);
        res.json(data);
    } catch (error) {
        console.error('Crypto chart proxy error:', error);
        const status = error.message.includes('Rate limit') ? 429 : 500;
        res.status(status).json({
            error: error.message || 'Failed to fetch crypto chart data'
        });
    }
});

module.exports = {
    name: 'crypto',
    description: 'Crypto ticker widget - CoinGecko API proxy with caching',
    version: '1.0.0',
    routes: router,
    mountPath: '/'
};
