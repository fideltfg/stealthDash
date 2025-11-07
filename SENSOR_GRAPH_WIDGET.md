# Sensor Graph Widget

A custom D3-based widget for displaying time-series sensor data from your database.

## Features

- **D3.js Powered**: Beautiful, interactive time-series graphs
- **Multi-Channel Support**: Display multiple sensor channels on the same graph
- **Auto-Refresh**: Configurable refresh interval
- **Customizable**: Colors, labels, grid, legend options
- **Responsive**: Automatically adapts to widget size

## Configuration

When adding the widget, you can configure:

```typescript
{
  apiUrl: string;           // API endpoint URL
  unitId: string;           // Sensor unit ID
  range: number;            // Hours of data to display (default: 24)
  refreshInterval?: number; // Refresh interval in seconds (default: 60)
  title?: string;           // Graph title
  yAxisLabel?: string;      // Y-axis label (e.g., "Temperature (°C)")
  channels?: string[];      // Array of channel field names to display
  colors?: string[];        // Custom colors for each channel
  showLegend?: boolean;     // Show legend (default: true)
  showGrid?: boolean;       // Show grid lines (default: true)
}
```

## API Endpoint Requirements

The widget expects your API to return JSON data in this format:

### Request
```
GET /api/sensor-data?unitId=1&range=24
```

### Response
```json
[
  {
    "timestamp": "2024-11-06 10:00:00",
    "ch1_value": 22.5,
    "ch1_name": "Temperature 1",
    "ch2_value": 45.2,
    "ch2_name": "Humidity",
    "ch3_value": 23.1,
    "ch3_name": "Temperature 2"
  },
  {
    "timestamp": "2024-11-06 11:00:00",
    "ch1_value": 23.0,
    "ch1_name": "Temperature 1",
    "ch2_value": 44.8,
    "ch2_name": "Humidity",
    "ch3_value": 23.5,
    "ch3_name": "Temperature 2"
  }
]
```

### Field Requirements

- `timestamp`: Required. Format: `YYYY-MM-DD HH:MM:SS` or ISO 8601
- Channel values: Any numeric fields will be auto-detected
- Channel names: Optional, used for legend labels

## PHP API Example

Based on your existing `getWebSensorData` function, here's an example API endpoint:

```php
<?php
// api/sensor-data.php

require_once '../app/class.app.php';

// Initialize app with database connection
$app = new app('/../settings.php', true);

// Get parameters
$unitId = $_GET['unitId'] ?? '1';
$range = intval($_GET['range'] ?? 24);

// Fetch data using existing method
$data = app::getWebSensorData($unitId, $range);

// Return JSON
header('Content-Type: application/json');
echo json_encode($data);
```

## Database Stored Procedure

Your existing `GetSensorRange` procedure should return data like:

```sql
DELIMITER $$

CREATE PROCEDURE GetSensorRange(
    IN p_unitId VARCHAR(50),
    IN p_hours INT
)
BEGIN
    SELECT 
        timestamp,
        ch1_value,
        ch1_name,
        ch2_value,
        ch2_name,
        ch3_value,
        ch3_name,
        ch4_value,
        ch4_name,
        ch5_value,
        ch5_name
    FROM web_sensor_data
    WHERE unit_id = p_unitId
        AND timestamp >= DATE_SUB(NOW(), INTERVAL p_hours HOUR)
    ORDER BY timestamp ASC;
END$$

DELIMITER ;
```

## Example Widget Configuration

### Single Channel (Temperature)
```javascript
{
  apiUrl: '/api/sensor-data',
  unitId: '1',
  range: 24,
  title: 'Room Temperature',
  yAxisLabel: 'Temperature (°C)',
  channels: ['ch1_value'],
  colors: ['#ff6384']
}
```

### Multiple Channels (Temp + Humidity)
```javascript
{
  apiUrl: '/api/sensor-data',
  unitId: '1',
  range: 48,
  title: 'Climate Monitor',
  yAxisLabel: 'Value',
  channels: ['ch1_value', 'ch2_value'],
  colors: ['#ff6384', '#36a2eb'],
  showLegend: true,
  showGrid: true
}
```

### All Channels (Auto-detect)
```javascript
{
  apiUrl: '/api/sensor-data',
  unitId: '1',
  range: 24,
  title: 'All Sensors',
  yAxisLabel: 'Values',
  // Leave channels undefined to auto-detect all numeric fields
}
```

## Installation

1. Install D3.js dependency (already added to package.json):
```bash
npm install
```

2. The widget will automatically register and appear in the widget picker

3. Create your API endpoint to serve the sensor data

4. Add the widget to your dashboard and configure the API URL and settings

## Troubleshooting

### "Error loading data"
- Check that your API endpoint is accessible
- Verify the API returns valid JSON
- Check browser console for detailed error messages
- Ensure CORS is configured if API is on a different domain

### "No data available"
- Verify the database has data for the specified unitId and time range
- Check that the stored procedure returns results
- Ensure timestamp format is correct

### Graph not displaying
- Check that container has non-zero width/height
- Verify data contains numeric values
- Check browser console for D3 errors

## Future Enhancements

- Zoom and pan functionality
- Export graph as image
- Custom tooltips
- Threshold lines/bands
- Real-time updates via WebSocket
- Multiple Y-axes for different value ranges
