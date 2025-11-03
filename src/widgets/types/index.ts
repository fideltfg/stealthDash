import type { WidgetRenderer } from './base';
import { TextWidgetRenderer } from './text';
import { ImageWidgetRenderer } from './image';
import { DataWidgetRenderer } from './data';
import { EmbedWidgetRenderer } from './embed';
import { WeatherWidgetRenderer } from './weather';
import { ClockWidgetRenderer } from './clock';
import type { WidgetType } from '../../types';

// Widget registry - plugin-like architecture
const widgetRenderers: Record<WidgetType, WidgetRenderer> = {
  text: new TextWidgetRenderer(),
  image: new ImageWidgetRenderer(),
  data: new DataWidgetRenderer(),
  embed: new EmbedWidgetRenderer(),
  weather: new WeatherWidgetRenderer(),
  clock: new ClockWidgetRenderer(),
};

export function getWidgetRenderer(type: WidgetType): WidgetRenderer | undefined {
  return widgetRenderers[type];
}

export { WidgetRenderer };
