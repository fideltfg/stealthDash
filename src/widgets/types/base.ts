import type { Widget } from '../../types';

export interface WidgetRenderer {
  render(container: HTMLElement, widget: Widget): void;
}
