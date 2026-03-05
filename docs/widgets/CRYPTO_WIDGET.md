# Crypto Ticker Widget

Track cryptocurrency prices with live updates and historical charts using the CoinGecko API.

## Features

- **Real-time Price Tracking**: Monitor current prices for multiple cryptocurrencies
- **24h Price Changes**: See percentage changes with color-coded indicators (green for gains, red for losses)
- **Historical Charts**: View price history over various time periods (1 day to 1 year)
- **Multiple Currencies**: Display prices in USD, EUR, GBP, JPY, CAD, AUD, CHF, CNY, or even BTC
- **Market Statistics**: Track market cap, 24h volume, and daily high/low prices
- **Auto-refresh**: Configurable refresh intervals to keep data current
- **20+ Popular Coins**: Easy selection from Bitcoin, Ethereum, Solana, and many more

## Configuration

### Basic Setup

1. Add the Crypto Ticker widget to your dashboard
2. Click the settings icon to configure
3. Select one or more cryptocurrencies to track
4. Choose your preferred display currency
5. Enable/disable price history charts
6. Set your refresh interval
7. Click Save

### Configuration Options

#### Cryptocurrencies
Select from popular cryptocurrencies including:
- Bitcoin (BTC)
- Ethereum (ETH)
- Tether (USDT)
- BNB
- Solana (SOL)
- USD Coin (USDC)
- XRP
- Cardano (ADA)
- Dogecoin (DOGE)
- And 11+ more popular coins

You can track multiple cryptocurrencies simultaneously.

#### Currency
Choose the display currency:
- **USD** - US Dollar ($)
- **EUR** - Euro (€)
- **GBP** - British Pound (£)
- **JPY** - Japanese Yen (¥)
- **CAD** - Canadian Dollar (C$)
- **AUD** - Australian Dollar (A$)
- **CHF** - Swiss Franc
- **CNY** - Chinese Yuan (¥)
- **BTC** - Bitcoin (₿)

#### Show Price History Charts
Toggle to display or hide historical price charts for each cryptocurrency.

#### Chart History Period
When charts are enabled, select the time period:
- **1 Day** - Last 24 hours
- **7 Days** - Last week (default)
- **30 Days** - Last month
- **90 Days** - Last quarter
- **1 Year** - Last 365 days

#### Refresh Interval
Set how often the widget updates (in seconds):
- Minimum: 60 seconds
- Default: 120 seconds  
- **Recommended: 120-300 seconds to avoid rate limits**

⚠️ **Important**: CoinGecko's free API has strict rate limits. Using refresh intervals below 120 seconds or tracking many coins may cause rate limit errors. The backend includes a 60-second cache to help reduce API calls.

## Display Information

For each cryptocurrency, the widget displays:

### Main Card
- **Icon**: Cryptocurrency logo
- **Name**: Full name (e.g., "Bitcoin")
- **Symbol**: Ticker symbol (e.g., "BTC")
- **Current Price**: Live price in your selected currency
- **24h Change**: Percentage change with directional indicator (↑/↓)

### Chart Section (when enabled)
- **Price History**: Visual sparkline chart showing price movement
- **24h High**: Highest price in the last 24 hours
- **24h Low**: Lowest price in the last 24 hours
- **Market Cap**: Total market capitalization
- **Volume**: 24-hour trading volume

### Last Update
Bottom of widget shows when data was last refreshed.

## Data Source

This widget uses the [CoinGecko API](https://www.coingecko.com/en/api), a free cryptocurrency data API that provides:
- Real-time price data
- Historical price charts
- Market statistics
- No API key required

**API Access**: All CoinGecko API calls are proxied through the dashboard's backend server, which:
- Avoids CORS (Cross-Origin Resource Sharing) issues
- Provides 60-second response caching to reduce API calls
- Delivers better error messages for rate limits
- Simplifies the widget implementation

**Rate Limits**: CoinGecko's free API tier has the following limits:
- Approximately 10-50 calls per minute depending on endpoint
- These limits are shared across all users of your dashboard instance
- The backend caching helps mitigate this by serving cached responses for 60 seconds

**Best Practices**:
- Use refresh intervals of 120 seconds or more
- Limit the number of coins tracked simultaneously (5-10 max recommended)
- If you see "Rate limit exceeded" errors, increase the refresh interval
- Multiple widgets sharing the same coins will benefit from the shared cache

## Widget Size Recommendations

- **Default**: 450px wide × 600px high
- **Single Coin**: 400px × 400px (compact)
- **Multiple Coins without Charts**: 400px × 300-500px
- **Multiple Coins with Charts**: 450-600px × 600-1000px

The widget is scrollable, so you can configure it to show multiple cryptocurrencies even in a fixed-size widget.

## Example Configurations

### Bitcoin Monitor
```json
{
  "coins": ["bitcoin", "ethereum"],
  "currency": "usd",
  "refreshInterval": 120,
  "showChart": true,
  "chartDays": 7
}
```

### Top 5 Crypto Dashboard
```json
{
  "coins": ["bitcoin", "ethereum", "binancecoin", "solana", "ripple"],
  "currency": "usd",
  "refreshInterval": 120,
  "showChart": true,
  "chartDays": 30
}
```

### Altcoin Tracker (No Charts)
```json
{
  "coins": ["cardano", "dogecoin", "shiba-inu", "polkadot", "chainlink"],
  "currency": "usd",
  "refreshInterval": 180,
  "showChart": false,
  "chartDays": 7
}
```

### Euro Price Tracker
```json
{
  "coins": ["bitcoin", "ethereum"],
  "currency": "eur",
  "refreshInterval": 60,
  "showChart": true,
  "chartDays": 90
}
```

## Styling

The widget automatically adapts to your dashboard theme with:
- Color-coded price changes (green for positive, red for negative)
- Responsive layout for different widget sizes
- Hover effects on coin cards
- Scrollable list for multiple cryptocurrencies

## Troubleshooting

### "Failed to load crypto data" or "Rate limit exceeded"
- **Most Common**: You've hit CoinGecko's rate limits
  - **Solution**: Increase refresh interval to 180-300 seconds
  - Wait 1-2 minutes before trying again
  - Reduce the number of coins being tracked
- Check your internet connection
- Verify CoinGecko API is accessible (not blocked by firewall)
- The backend includes caching, but aggressive refreshing can still hit limits

### No Chart Data Displayed
- Ensure "Show Price History Charts" is enabled in settings
- Some very new coins may have limited historical data
- Check browser console for specific API errors

### Widget Shows "Loading..." Indefinitely
- Check browser console for error messages
- Verify the coin IDs are correct
- Try with popular coins like Bitcoin or Ethereum first

### Prices Not Updating
- Check the refresh interval setting
- Verify the widget isn't paused (hover over widget to see if it's active)
- Check browser console for API errors

## Privacy & Security

- No API keys required
- No personal data collected
- All API calls made directly from your browser to CoinGecko
- No data stored on the server

## Future Enhancements

Potential features for future versions:
- Alerts for price thresholds
- Portfolio tracking with holdings
- Additional cryptocurrency exchanges
- More detailed statistics and indicators
- Comparison views
- Custom coin search beyond popular list

## Related Widgets

- **Weather Dashboard**: Similar chart visualization style
- **Speedtest**: Historical data tracking pattern
- **Glances**: System monitoring with real-time updates

## Support

For issues or feature requests related to the Crypto Ticker widget, please check:
- Widget configuration settings
- Browser console for errors
- CoinGecko API status at [CoinGecko Status](https://status.coingecko.com/)
