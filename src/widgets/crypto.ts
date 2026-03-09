import type { Widget } from '../types/types';
import type { WidgetRenderer } from '../types/base-widget';
import { stopAllDragPropagation, dispatchWidgetUpdate, injectWidgetStyles } from '../utils/dom';
import { renderConfigPrompt, renderError } from '../utils/widgetRendering';
import { WidgetPoller } from '../utils/polling';
import { getPingServerUrl, getAuthHeaders } from '../utils/api';

interface CryptoContent {
    coins: string[]; // Array of coin IDs like ['bitcoin', 'ethereum', 'cardano']
    currency: string; // Like 'usd', 'eur', 'gbp'
    refreshInterval: number;
    showChart: boolean;
    chartDays: number; // Number of days for historical chart (1, 7, 30, 90, 365)
}

interface CoinData {
    id: string;
    symbol: string;
    name: string;
    current_price: number;
    price_change_percentage_24h: number;
    market_cap: number;
    total_volume: number;
    high_24h: number;
    low_24h: number;
    image: string;
}

interface ChartData {
    prices: [number, number][];
}

const CRYPTO_STYLES = `
.crypto-widget { display: flex; flex-direction: column; gap: 8px; height: 100%; }
.card:hover { border-color: var(--accent); }
.crypto-coin-icon { width: 32px; height: 32px; border-radius: 50%; }
.crypto-coin-info { display: flex; flex-direction: column; gap: 2px; }
.crypto-coin-name { font-weight: 600; font-size: 14px; }
.crypto-coin-symbol { font-size: 11px; color: var(--muted); text-transform: uppercase; }
.crypto-coin-price-section { display: flex; flex-direction: column; gap: 2px; align-items: flex-end; }
.crypto-coin-price { font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; }
.crypto-coin-change {
  font-size: 12px;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: 4px;
  font-variant-numeric: tabular-nums;
}
.crypto-coin-change.positive { color: #10b981; background: rgba(16, 185, 129, 0.1); }
.crypto-coin-change.negative { color: #ef4444; background: rgba(239, 68, 68, 0.1); }
.crypto-chart { width: 100%; height: 120px; display: block; }
.crypto-chart-title { font-size: 12px; color: var(--muted); margin-bottom: 6px; }
.crypto-stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
  font-size: 11px;
  color: var(--muted);
}
.crypto-stat-label { opacity: 0.7; }
.crypto-stat-value { font-weight: 500; font-variant-numeric: tabular-nums; }
.crypto-last-update { font-size: 11px; color: var(--muted); text-align: center; margin-top: 4px; }
`;

// Popular coins list for the dropdown
const POPULAR_COINS = [
    { id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC' },
    { id: 'ethereum', name: 'Ethereum', symbol: 'ETH' },
    { id: 'tether', name: 'Tether', symbol: 'USDT' },
    { id: 'binancecoin', name: 'BNB', symbol: 'BNB' },
    { id: 'solana', name: 'Solana', symbol: 'SOL' },
    { id: 'usd-coin', name: 'USD Coin', symbol: 'USDC' },
    { id: 'ripple', name: 'XRP', symbol: 'XRP' },
    { id: 'cardano', name: 'Cardano', symbol: 'ADA' },
    { id: 'dogecoin', name: 'Dogecoin', symbol: 'DOGE' },
    { id: 'tron', name: 'TRON', symbol: 'TRX' },
    { id: 'avalanche-2', name: 'Avalanche', symbol: 'AVAX' },
    { id: 'shiba-inu', name: 'Shiba Inu', symbol: 'SHIB' },
    { id: 'polkadot', name: 'Polkadot', symbol: 'DOT' },
    { id: 'chainlink', name: 'Chainlink', symbol: 'LINK' },
    { id: 'bitcoin-cash', name: 'Bitcoin Cash', symbol: 'BCH' },
    { id: 'litecoin', name: 'Litecoin', symbol: 'LTC' },
    { id: 'polygon', name: 'Polygon', symbol: 'MATIC' },
    { id: 'stellar', name: 'Stellar', symbol: 'XLM' },
    { id: 'uniswap', name: 'Uniswap', symbol: 'UNI' },
    { id: 'monero', name: 'Monero', symbol: 'XMR' },
];

const CURRENCIES = [
    { code: 'usd', symbol: '$', name: 'US Dollar' },
    { code: 'eur', symbol: '€', name: 'Euro' },
    { code: 'gbp', symbol: '£', name: 'British Pound' },
    { code: 'jpy', symbol: '¥', name: 'Japanese Yen' },
    { code: 'cad', symbol: 'C$', name: 'Canadian Dollar' },
    { code: 'aud', symbol: 'A$', name: 'Australian Dollar' },
    { code: 'chf', symbol: 'CHF', name: 'Swiss Franc' },
    { code: 'cny', symbol: '¥', name: 'Chinese Yuan' },
    { code: 'btc', symbol: '₿', name: 'Bitcoin' },
];

function formatPrice(price: number, currency: string): string {
    const currencyData = CURRENCIES.find(c => c.code === currency);
    const symbol = currencyData?.symbol || currency.toUpperCase();

    if (price < 0.01) {
        return `${symbol}${price.toFixed(6)}`;
    } else if (price < 1) {
        return `${symbol}${price.toFixed(4)}`;
    } else if (price < 100) {
        return `${symbol}${price.toFixed(2)}`;
    } else {
        return `${symbol}${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
}

function formatLargeNumber(num: number): string {
    if (num >= 1e12) return `${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
    return num.toFixed(2);
}

function createSparkline(prices: [number, number][], width = 300, height = 60): string {
    if (prices.length < 2) return '';

    const values = prices.map(p => p[1]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;

    if (range === 0) return '';

    const points = values.map((val, i) => {
        const x = (i / (values.length - 1)) * width;
        const y = height - ((val - min) / range) * height;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    const firstPrice = values[0];
    const lastPrice = values[values.length - 1];
    const isPositive = lastPrice >= firstPrice;
    const color = isPositive ? '#10b981' : '#ef4444';

    return `<svg viewBox="0 0 ${width} ${height}" class="crypto-chart" preserveAspectRatio="none">
    <polyline points="${points}" fill="none" stroke="${color}" stroke-width=".75"/>
  </svg>`;
}

export class CryptoWidgetRenderer implements WidgetRenderer {
    private poller = new WidgetPoller();

    destroy(): void {
        this.poller.stopAll();
    }

    configure(widget: Widget): void {
        this.showConfigDialog(widget);
    }

    render(container: HTMLElement, widget: Widget): void {
        injectWidgetStyles('crypto', CRYPTO_STYLES);
        const content = widget.content as CryptoContent;

        this.poller.stop(widget.id);

        if (!content.coins || content.coins.length === 0) {
            const btn = renderConfigPrompt(
                container,
                '<i class="fa-brands fa-bitcoin"></i>',
                'Configure Crypto Ticker',
                'Select cryptocurrencies to track their prices and history.'
            );
            btn.addEventListener('click', () => this.showConfigDialog(widget));
            return;
        }

        container.innerHTML = '<div class="crypto-widget widget-loading centered">Loading crypto data...</div>';

        const fetchData = async () => {
            try {
                await this.fetchAndRenderCryptoData(container, content);
            } catch (error) {
                renderError(container, 'Failed to load crypto data', error);
            }
        };

        this.poller.start(widget.id, fetchData, (content.refreshInterval || 60) * 1000);
    }

    private async fetchAndRenderCryptoData(container: HTMLElement, content: CryptoContent): Promise<void> {
        const coinIds = content.coins.join(',');
        const currency = content.currency || 'usd';

        // Fetch current prices using proxy
        const pricesUrl = new URL('/api/crypto/markets', getPingServerUrl());
        pricesUrl.searchParams.set('vs_currency', currency);
        pricesUrl.searchParams.set('ids', coinIds);

        const pricesResponse = await fetch(pricesUrl.toString(), {
            headers: getAuthHeaders(false)
        });

        if (!pricesResponse.ok) {
            const errorData = await pricesResponse.json().catch(() => ({}));
            if (pricesResponse.status === 429) {
                throw new Error('CoinGecko rate limit reached. Increase refresh interval (Settings > 120+ seconds recommended).');
            }
            throw new Error(errorData.error || `API error: ${pricesResponse.status}`);
        }

        const coinsData: CoinData[] = await pricesResponse.json();

        // Fetch chart data if enabled
        let chartDataMap: Map<string, ChartData> = new Map();
        if (content.showChart !== false) {
            const days = content.chartDays || 7;
            const chartPromises = content.coins.map(async (coinId) => {
                try {
                    const chartUrl = new URL('/api/crypto/chart', getPingServerUrl());
                    chartUrl.searchParams.set('id', coinId);
                    chartUrl.searchParams.set('vs_currency', currency);
                    chartUrl.searchParams.set('days', days.toString());

                    const chartResponse = await fetch(chartUrl.toString(), {
                        headers: getAuthHeaders(false)
                    });

                    if (chartResponse.ok) {
                        const data: ChartData = await chartResponse.json();
                        chartDataMap.set(coinId, data);
                    }
                } catch (error) {
                    console.warn(`Failed to fetch chart for ${coinId}:`, error);
                }
            });

            await Promise.all(chartPromises);
        }

        this.renderCryptoUI(container, coinsData, chartDataMap, content);
    }

    private renderCryptoUI(
        container: HTMLElement,
        coinsData: CoinData[],
        chartDataMap: Map<string, ChartData>,
        content: CryptoContent
    ): void {
        const currency = content.currency || 'usd';
        const showChart = content.showChart !== false;

        let html = '<div class="card-list">';

        for (const coin of coinsData) {
            const changeClass = coin.price_change_percentage_24h >= 0 ? 'positive' : 'negative';
            const changeIcon = coin.price_change_percentage_24h >= 0 ? '↑' : '↓';

            html += `
        <div class="card">
        <div class="card-header">
          <img src="${coin.image}" alt="${coin.name}" class="crypto-coin-icon" />
          <div class="crypto-coin-info">
            <div class="crypto-coin-name">${coin.name}</div>
            <div class="crypto-coin-symbol">${coin.symbol}</div>
          </div>
          <div class="crypto-coin-price-section">
            <div class="crypto-coin-price">${formatPrice(coin.current_price, currency)}</div>
            <div class="crypto-coin-change ${changeClass}">
              ${changeIcon} ${Math.abs(coin.price_change_percentage_24h).toFixed(2)}%
            </div>
          </div>
          </div>
        
      `;

            // Add chart if enabled and data available
            if (showChart && chartDataMap.has(coin.id)) {
                const chartData = chartDataMap.get(coin.id)!;
                if (chartData.prices && chartData.prices.length > 0) {
                    html += `
              <div class="crypto-chart-title">${coin.name} Price History (${content.chartDays || 7} days)</div>
              ${createSparkline(chartData.prices)}
              <div class="crypto-stats">
                <div><span class="crypto-stat-label">24h High:</span> <span class="crypto-stat-value">${formatPrice(coin.high_24h, currency)}</span></div>
                <div><span class="crypto-stat-label">24h Low:</span> <span class="crypto-stat-value">${formatPrice(coin.low_24h, currency)}</span></div>
                <div><span class="crypto-stat-label">Market Cap:</span> <span class="crypto-stat-value">${formatLargeNumber(coin.market_cap)}</span></div>
                <div><span class="crypto-stat-label">Volume:</span> <span class="crypto-stat-value">${formatLargeNumber(coin.total_volume)}</span></div>
              </div>
          `;
                }
            }
            html += '</div>';
        }

        // html += `<div class="crypto-last-update">Last updated: ${new Date().toLocaleTimeString()}</div>`;
        html += '</div>';

        container.innerHTML = html;
    }

    private showConfigDialog(widget: Widget): void {
        const content = (widget.content as CryptoContent) || {};
        const currentCoins = content.coins || ['bitcoin', 'ethereum'];
        const currentCurrency = content.currency || 'usd';
        const currentInterval = content.refreshInterval || 60;
        const currentShowChart = content.showChart !== false;
        const currentChartDays = content.chartDays || 7;

        const overlay = document.createElement('div');
        overlay.className = 'widget-overlay';

        const dialog = document.createElement('div');
        dialog.className = 'widget-dialog scrollable';

        dialog.innerHTML = `
      <h3>Configure Crypto Ticker</h3>
      
      <div class="form-group">
        <label>Select Cryptocurrencies</label>
        <div id="crypto-coin-checkboxes" style="max-height: 200px; overflow-y: auto; border: 1px solid var(--border); border-radius: 4px; padding: 8px;">
          ${POPULAR_COINS.map(coin => `
            <div class="widget-dialog-field">
              <label class="widget-checkbox-label">
                <input type="checkbox" value="${coin.id}" ${currentCoins.includes(coin.id) ? 'checked' : ''} />
                <span>${coin.name} (${coin.symbol})</span>
              </label>
            </div>
          `).join('')}
        </div>
        <small style="color: var(--muted); display: block; margin-top: 4px;">Select one or more cryptocurrencies to track</small>
      </div>

      <div class="form-group">
        <label>Currency</label>
        <select id="crypto-currency" class="widget-dialog-input">
          ${CURRENCIES.map(curr => `
            <option value="${curr.code}" ${currentCurrency === curr.code ? 'selected' : ''}>
              ${curr.name} (${curr.symbol})
            </option>
          `).join('')}
        </select>
      </div>

      <div class="widget-dialog-field">
        <label class="widget-checkbox-label">
          <input type="checkbox" id="crypto-show-chart" ${currentShowChart ? 'checked' : ''} />
          <span>Show Price History Charts</span>
        </label>
      </div>

      <div class="form-group" id="chart-days-group" style="${currentShowChart ? '' : 'display: none;'}">
        <label>Chart History Period</label>
        <select id="crypto-chart-days" class="widget-dialog-input">
          <option value="1" ${currentChartDays === 1 ? 'selected' : ''}>1 Day</option>
          <option value="7" ${currentChartDays === 7 ? 'selected' : ''}>7 Days</option>
          <option value="30" ${currentChartDays === 30 ? 'selected' : ''}>30 Days</option>
          <option value="90" ${currentChartDays === 90 ? 'selected' : ''}>90 Days</option>
          <option value="365" ${currentChartDays === 365 ? 'selected' : ''}>1 Year</option>
        </select>
      </div>

      <div class="form-group">
        <label>Refresh Interval (seconds)</label>
        <input type="number" id="crypto-refresh" value="${currentInterval}" min="60" step="30" class="widget-dialog-input" />
        <small style="color: var(--muted); display: block; margin-top: 4px;">Minimum 60s recommended due to API rate limits (120s or more preferred)</small>
      </div>

      <div class="widget-dialog-buttons">
        <button id="cancel-btn" class="btn btn-small btn-secondary">Cancel</button>
        <button id="save-btn" class="btn btn-small btn-primary">Save</button>
      </div>
    `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const currencySelect = dialog.querySelector('#crypto-currency') as HTMLSelectElement;
        const showChartCheckbox = dialog.querySelector('#crypto-show-chart') as HTMLInputElement;
        const chartDaysSelect = dialog.querySelector('#crypto-chart-days') as HTMLSelectElement;
        const refreshInput = dialog.querySelector('#crypto-refresh') as HTMLInputElement;
        const saveBtn = dialog.querySelector('#save-btn') as HTMLButtonElement;
        const cancelBtn = dialog.querySelector('#cancel-btn') as HTMLButtonElement;
        const chartDaysGroup = dialog.querySelector('#chart-days-group') as HTMLElement;
        const checkboxes = dialog.querySelectorAll('#crypto-coin-checkboxes input[type="checkbox"]') as NodeListOf<HTMLInputElement>;

        stopAllDragPropagation(dialog);

        const close = () => overlay.remove();

        // Toggle chart days visibility
        showChartCheckbox.addEventListener('change', () => {
            chartDaysGroup.style.display = showChartCheckbox.checked ? '' : 'none';
        });

        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
        cancelBtn.addEventListener('click', close);

        saveBtn.addEventListener('click', () => {
            const selectedCoins: string[] = [];
            checkboxes.forEach(cb => {
                if (cb.checked) {
                    selectedCoins.push(cb.value);
                }
            });

            if (selectedCoins.length === 0) {
                alert('Please select at least one cryptocurrency');
                return;
            }

            const newContent: CryptoContent = {
                coins: selectedCoins,
                currency: currencySelect.value,
                refreshInterval: parseInt(refreshInput.value, 10),
                showChart: showChartCheckbox.checked,
                chartDays: parseInt(chartDaysSelect.value, 10),
            };

            dispatchWidgetUpdate(widget.id, newContent);
            close();
        });
    }
}

export const widget = {
    type: 'crypto',
    name: 'Crypto Ticker',
    icon: '<i class="fa-brands fa-bitcoin"></i>',
    description: 'Track cryptocurrency prices with live updates and historical charts',
    renderer: new CryptoWidgetRenderer(),
    defaultSize: { w: 450, h: 600 },
    defaultContent: {
        coins: ['bitcoin', 'ethereum'],
        currency: 'usd',
        refreshInterval: 120,
        showChart: true,
        chartDays: 7
    },
    hasSettings: true,
    allowedFields: ['coins', 'currency', 'refreshInterval', 'showChart', 'chartDays'],
};
