import type { Widget } from '../../types';
import type { WidgetRenderer } from './base';
import * as d3 from 'd3';

interface SensorGraphContent {
  apiUrl: string;
  sqlQuery?: string; // Custom SQL query to execute
  unitId?: string; // Optional: for backward compatibility
  range?: number; // Optional: hours of data to display
  refreshInterval?: number; // in seconds
  title?: string;
  yAxisLabel?: string;
  xAxisField?: string; // Field name for X-axis (timestamp)
  channels?: string[]; // which channels to display (e.g., ['ch1_value', 'ch2_value'])
  colors?: string[]; // custom colors for each channel
  showLegend?: boolean;
  showGrid?: boolean;
}

interface SensorDataPoint {
  timestamp: string;
  [key: string]: any; // channel values
}

class SensorGraphRenderer implements WidgetRenderer {
  private updateIntervals: Map<string, number> = new Map();

  render(container: HTMLElement, widget: Widget): void {
    const content = widget.content as SensorGraphContent;
    
    // Clear any existing interval
    const existingInterval = this.updateIntervals.get(widget.id);
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    // Create widget structure
    container.innerHTML = `
      <div class="sensor-graph-widget" style="width: 100%; height: 100%; display: flex; flex-direction: column;">
        <div class="graph-header" style="padding: 8px; border-bottom: 1px solid var(--border);">
          <h3 style="margin: 0; font-size: 14px; font-weight: 600;">${content.title || 'Sensor Data'}</h3>
        </div>
        <div class="graph-container" style="flex: 1; position: relative; overflow: hidden;">
          <svg class="graph-svg" style="width: 100%; height: 100%;"></svg>
          <div class="graph-loading" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: var(--muted);">
            Loading data...
          </div>
          <div class="graph-error" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #f44336; display: none;">
            Error loading data
          </div>
        </div>
      </div>
    `;

    const svg = container.querySelector('.graph-svg') as SVGElement;
    const loadingEl = container.querySelector('.graph-loading') as HTMLElement;
    const errorEl = container.querySelector('.graph-error') as HTMLElement;

    const fetchAndRender = async () => {
      try {
        loadingEl.style.display = 'block';
        errorEl.style.display = 'none';

        // Build request payload
        const requestBody: any = {};
        
        if (content.sqlQuery) {
          // Custom SQL query mode
          requestBody.query = content.sqlQuery;
        } else {
          // Legacy mode - unit ID and range
          requestBody.unitId = content.unitId;
          requestBody.range = content.range || 24;
        }

        // Fetch data from API
        const response = await fetch(content.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data: SensorDataPoint[] = await response.json();
        
        loadingEl.style.display = 'none';

        if (!data || data.length === 0) {
          errorEl.textContent = 'No data available';
          errorEl.style.display = 'block';
          return;
        }

        // Render the graph
        this.renderGraph(svg, data, content);
      } catch (error) {
        console.error('Error fetching sensor data:', error);
        loadingEl.style.display = 'none';
        errorEl.textContent = error instanceof Error ? error.message : 'Error loading data';
        errorEl.style.display = 'block';
      }
    };

    // Initial render
    fetchAndRender();

    // Set up auto-refresh
    const refreshInterval = (content.refreshInterval || 60) * 1000;
    const intervalId = window.setInterval(fetchAndRender, refreshInterval);
    this.updateIntervals.set(widget.id, intervalId);
  }

  private renderGraph(svg: SVGElement, data: SensorDataPoint[], content: SensorGraphContent): void {
    // Clear existing content
    d3.select(svg).selectAll('*').remove();

    const container = svg.parentElement!;
    const width = container.clientWidth;
    const height = container.clientHeight;

    if (width === 0 || height === 0) {
      console.warn('Container has zero size, skipping graph render');
      return;
    }

    const margin = { top: 20, right: 80, bottom: 40, left: 60 };
    const graphWidth = width - margin.left - margin.right;
    const graphHeight = height - margin.top - margin.bottom;

    // Parse timestamps
    const parseTime = d3.timeParse('%Y-%m-%d %H:%M:%S');
    const timestampField = content.xAxisField || 'timestamp';
    
    data.forEach(d => {
      const timestampValue = d[timestampField];
      d.parsedTime = parseTime(timestampValue) || new Date(timestampValue);
    });

    // Get channels to display
    const channels = content.channels || this.detectChannels(data);
    const colors = content.colors || d3.schemeCategory10;

    // Create SVG group
    const g = d3.select(svg)
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Set up scales
    const x = d3.scaleTime()
      .domain(d3.extent(data, d => d.parsedTime) as [Date, Date])
      .range([0, graphWidth]);

    // Get all values for y-scale domain
    const allValues = channels.flatMap(channel => 
      data.map(d => parseFloat(d[channel])).filter(v => !isNaN(v))
    );

    const y = d3.scaleLinear()
      .domain([
        d3.min(allValues) as number * 0.95,
        d3.max(allValues) as number * 1.05
      ])
      .range([graphHeight, 0])
      .nice();

    // Add grid lines if enabled
    if (content.showGrid !== false) {
      g.append('g')
        .attr('class', 'grid')
        .attr('opacity', 0.1)
        .call(d3.axisLeft(y)
          .tickSize(-graphWidth)
          .tickFormat(() => '')
        );

      g.append('g')
        .attr('class', 'grid')
        .attr('opacity', 0.1)
        .attr('transform', `translate(0,${graphHeight})`)
        .call(d3.axisBottom(x)
          .tickSize(-graphHeight)
          .tickFormat(() => '')
        );
    }

    // Add X axis
    g.append('g')
      .attr('transform', `translate(0,${graphHeight})`)
      .call(d3.axisBottom(x)
        .ticks(5)
        .tickFormat(d3.timeFormat('%H:%M') as any)
      )
      .selectAll('text')
      .style('fill', 'var(--text)')
      .style('font-size', '10px');

    g.selectAll('.domain, .tick line')
      .style('stroke', 'var(--border)');

    // Add Y axis
    g.append('g')
      .call(d3.axisLeft(y).ticks(5))
      .selectAll('text')
      .style('fill', 'var(--text)')
      .style('font-size', '10px');

    g.selectAll('.domain, .tick line')
      .style('stroke', 'var(--border)');

    // Add Y axis label
    if (content.yAxisLabel) {
      g.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('y', 0 - margin.left)
        .attr('x', 0 - (graphHeight / 2))
        .attr('dy', '1em')
        .style('text-anchor', 'middle')
        .style('fill', 'var(--text)')
        .style('font-size', '12px')
        .text(content.yAxisLabel);
    }

    // Create line generator
    const line = d3.line<SensorDataPoint>()
      .defined(d => d.parsedTime !== null && !isNaN(parseFloat(d.value)))
      .x(d => x(d.parsedTime))
      .y(d => y(parseFloat(d.value)));

    // Draw lines for each channel
    channels.forEach((channel, i) => {
      const channelData = data.map(d => ({
        ...d,
        value: d[channel]
      })).filter(d => !isNaN(parseFloat(d.value)));

      if (channelData.length === 0) return;

      const color = colors[i % colors.length];

      // Add the line
      g.append('path')
        .datum(channelData)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 2)
        .attr('d', line);

      // Add dots
      g.selectAll(`.dot-${i}`)
        .data(channelData)
        .enter()
        .append('circle')
        .attr('class', `dot-${i}`)
        .attr('cx', d => x(d.parsedTime))
        .attr('cy', d => y(parseFloat(d.value)))
        .attr('r', 3)
        .attr('fill', color)
        .style('opacity', 0.7)
        .append('title')
        .text(d => `${channel}: ${d.value}\n${d.timestamp}`);
    });

    // Add legend if enabled
    if (content.showLegend !== false && channels.length > 1) {
      const legend = g.append('g')
        .attr('class', 'legend')
        .attr('transform', `translate(${graphWidth + 10}, 0)`);

      channels.forEach((channel, i) => {
        const legendRow = legend.append('g')
          .attr('transform', `translate(0, ${i * 20})`);

        legendRow.append('rect')
          .attr('width', 12)
          .attr('height', 12)
          .attr('fill', colors[i % colors.length]);

        legendRow.append('text')
          .attr('x', 18)
          .attr('y', 10)
          .style('fill', 'var(--text)')
          .style('font-size', '11px')
          .text(this.formatChannelName(channel));
      });
    }
  }

  private detectChannels(data: SensorDataPoint[]): string[] {
    if (data.length === 0) return [];
    
    // Get all keys except timestamp and common non-data fields
    const firstRow = data[0];
    const excludeFields = ['timestamp', 'parsedTime', 'id', 'unit_id', 'created_at', 'updated_at'];
    
    return Object.keys(firstRow).filter(key => {
      // Exclude known non-data fields
      if (excludeFields.includes(key)) return false;
      
      // Exclude fields ending with _name, _unit, _alarm, _id
      if (key.endsWith('_name') || key.endsWith('_unit') || 
          key.endsWith('_alarm') || key.endsWith('_id')) return false;
      
      // Include only numeric fields
      const value = firstRow[key];
      return !isNaN(parseFloat(value)) && isFinite(value);
    });
  }

  private formatChannelName(channel: string): string {
    // Convert 'ch1_value' to 'Channel 1' etc.
    return channel
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase())
      .replace(/Ch(\d+)/, 'Channel $1');
  }
}

// Register and export the widget
export const widget = {
  type: 'sensor-graph',
  name: 'Sensor Graph',
  icon: '📊',
  description: 'Display sensor data as a time-series graph using D3 with custom SQL queries',
  renderer: new SensorGraphRenderer(),
  defaultSize: { w: 600, h: 400 },
  defaultContent: {
    apiUrl: '/api/sensor-data',
    sqlQuery: 'SELECT timestamp, ch1_value, ch2_value FROM web_sensor_data WHERE unit_id = "1" ORDER BY timestamp DESC LIMIT 100',
    refreshInterval: 60,
    title: 'Sensor Data',
    yAxisLabel: 'Value',
    xAxisField: 'timestamp',
    showLegend: true,
    showGrid: true
  }
};
