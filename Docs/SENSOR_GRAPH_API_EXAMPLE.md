# Sensor Graph API Endpoint Example

## PHP API Endpoint for Custom SQL Queries

Create this file to accept custom SQL queries from the Sensor Graph widget:

### `/api/sensor-data.php`

```php
<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once '../Sensor Service/app/class.app.php';

// Initialize app with database connection
$app = new app('/../settings.php', true);

try {
    // Get request body
    $input = file_get_contents('php://input');
    $request = json_decode($input, true);
    
    if (!$request) {
        throw new Exception('Invalid JSON request');
    }
    
    // Check if custom SQL query is provided
    if (isset($request['query']) && !empty($request['query'])) {
        // Custom SQL mode
        $sql = $request['query'];
        
        // SECURITY: Validate/sanitize the query (basic example)
        // In production, you should use parameterized queries or a query builder
        $sql = trim($sql);
        
        // Prevent multiple statements
        if (strpos($sql, ';') !== false && substr_count($sql, ';') > 1) {
            throw new Exception('Multiple statements not allowed');
        }
        
        // Only allow SELECT statements
        if (!preg_match('/^\s*SELECT/i', $sql)) {
            throw new Exception('Only SELECT queries are allowed');
        }
        
        // Prevent dangerous keywords
        $dangerous = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'CREATE', 'EXEC', 'EXECUTE'];
        foreach ($dangerous as $keyword) {
            if (stripos($sql, $keyword) !== false) {
                throw new Exception("Keyword '$keyword' is not allowed");
            }
        }
        
        // Execute the query
        $statement = app::$DBO::$conn->prepare($sql);
        $statement->execute();
        $data = $statement->fetchAll(PDO::FETCH_ASSOC);
        
    } else {
        // Legacy mode - use unit ID and range
        $unitId = $request['unitId'] ?? '1';
        $range = intval($request['range'] ?? 24);
        
        // Use existing method
        $data = app::getWebSensorData($unitId, $range);
    }
    
    // Return the data
    echo json_encode($data);
    
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode([
        'error' => $e->getMessage()
    ]);
}
?>
```

## Enhanced Security Version (Recommended)

For production use, create a whitelist of allowed queries:

### `/api/sensor-data-secure.php`

```php
<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once '../Sensor Service/app/class.app.php';

// Whitelist of allowed query templates
$ALLOWED_QUERIES = [
    'sensor_24h' => "
        SELECT timestamp, ch1_value, ch2_value, ch3_value 
        FROM web_sensor_data 
        WHERE unit_id = :unit_id 
        AND timestamp >= DATE_SUB(NOW(), INTERVAL :hours HOUR)
        ORDER BY timestamp ASC
    ",
    'sensor_all_channels' => "
        SELECT timestamp, ch1_value, ch1_name, ch2_value, ch2_name, 
               ch3_value, ch3_name, ch4_value, ch4_name, ch5_value, ch5_name
        FROM web_sensor_data 
        WHERE unit_id = :unit_id 
        AND timestamp >= DATE_SUB(NOW(), INTERVAL :hours HOUR)
        ORDER BY timestamp ASC
    ",
    'temperature_only' => "
        SELECT timestamp, ch1_value as temperature
        FROM web_sensor_data 
        WHERE unit_id = :unit_id 
        AND timestamp >= DATE_SUB(NOW(), INTERVAL :hours HOUR)
        ORDER BY timestamp ASC
    ",
    'humidity_temp' => "
        SELECT timestamp, ch1_value as temperature, ch2_value as humidity
        FROM web_sensor_data 
        WHERE unit_id = :unit_id 
        AND timestamp >= DATE_SUB(NOW(), INTERVAL :hours HOUR)
        ORDER BY timestamp ASC
    "
];

$app = new app('/../settings.php', true);

try {
    $input = file_get_contents('php://input');
    $request = json_decode($input, true);
    
    if (!$request) {
        throw new Exception('Invalid JSON request');
    }
    
    // Check if query template is specified
    if (isset($request['queryTemplate'])) {
        $template = $request['queryTemplate'];
        
        if (!isset($ALLOWED_QUERIES[$template])) {
            throw new Exception('Invalid query template');
        }
        
        // Get parameters
        $params = $request['params'] ?? [];
        $unitId = $params['unit_id'] ?? '1';
        $hours = intval($params['hours'] ?? 24);
        
        // Prepare and execute the query
        $statement = app::$DBO::$conn->prepare($ALLOWED_QUERIES[$template]);
        $statement->bindParam(':unit_id', $unitId);
        $statement->bindParam(':hours', $hours, PDO::PARAM_INT);
        $statement->execute();
        
        $data = $statement->fetchAll(PDO::FETCH_ASSOC);
        
    } else {
        // Legacy mode
        $unitId = $request['unitId'] ?? '1';
        $range = intval($request['range'] ?? 24);
        $data = app::getWebSensorData($unitId, $range);
    }
    
    echo json_encode($data);
    
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode(['error' => $e->getMessage()]);
}
?>
```

## Widget Configuration Examples

### Custom SQL Query

```javascript
{
  apiUrl: 'http://your-server/api/sensor-data.php',
  sqlQuery: `
    SELECT 
      timestamp,
      ch1_value as temperature,
      ch2_value as humidity
    FROM web_sensor_data 
    WHERE unit_id = '1' 
    AND timestamp >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
    ORDER BY timestamp ASC
  `,
  title: 'Temperature & Humidity',
  yAxisLabel: 'Value',
  refreshInterval: 60
}
```

### Using Query Templates (Secure Version)

```javascript
{
  apiUrl: 'http://your-server/api/sensor-data-secure.php',
  queryTemplate: 'humidity_temp',
  params: {
    unit_id: '1',
    hours: 48
  },
  title: 'Climate Data (48h)',
  yAxisLabel: 'Value',
  refreshInterval: 120
}
```

### Complex Query with Aggregation

```javascript
{
  apiUrl: 'http://your-server/api/sensor-data.php',
  sqlQuery: `
    SELECT 
      DATE_FORMAT(timestamp, '%Y-%m-%d %H:00:00') as timestamp,
      AVG(ch1_value) as avg_temp,
      MAX(ch1_value) as max_temp,
      MIN(ch1_value) as min_temp
    FROM web_sensor_data 
    WHERE unit_id = '1' 
    AND timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    GROUP BY DATE_FORMAT(timestamp, '%Y-%m-%d %H:00:00')
    ORDER BY timestamp ASC
  `,
  title: 'Temperature Statistics (7 days, hourly avg)',
  yAxisLabel: 'Temperature (°C)',
  channels: ['avg_temp', 'max_temp', 'min_temp'],
  colors: ['#36a2eb', '#ff6384', '#4bc0c0'],
  refreshInterval: 300
}
```

## Security Considerations

1. **Always validate SQL queries** - Never execute user input directly
2. **Use parameterized queries** when possible
3. **Whitelist allowed queries** for production environments
4. **Limit query complexity** to prevent database overload
5. **Implement rate limiting** to prevent abuse
6. **Use read-only database user** for the API
7. **Log all queries** for security auditing
8. **Set query timeouts** to prevent long-running queries

## Testing

Test your API endpoint with curl:

```bash
# Custom SQL query
curl -X POST http://your-server/api/sensor-data.php \
  -H "Content-Type: application/json" \
  -d '{
    "query": "SELECT timestamp, ch1_value FROM web_sensor_data WHERE unit_id = \"1\" ORDER BY timestamp DESC LIMIT 10"
  }'

# Query template (secure version)
curl -X POST http://your-server/api/sensor-data-secure.php \
  -H "Content-Type: application/json" \
  -d '{
    "queryTemplate": "humidity_temp",
    "params": {"unit_id": "1", "hours": 24}
  }'

# Legacy mode
curl -X POST http://your-server/api/sensor-data.php \
  -H "Content-Type: application/json" \
  -d '{
    "unitId": "1",
    "range": 24
  }'
```
