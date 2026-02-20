/**
 * Widget polling / interval manager.
 * Replaces per-widget Map<string, number> + clearInterval boilerplate.
 */

export class WidgetPoller {
  private intervals = new Map<string, number>();

  /** Start (or restart) polling for a widget. Calls fn immediately, then every intervalMs. */
  start(widgetId: string, fn: () => void | Promise<void>, intervalMs: number): void {
    this.stop(widgetId);
    // Fire immediately (swallow promise rejections — widgets handle their own errors)
    Promise.resolve(fn()).catch(() => {});
    const id = window.setInterval(() => {
      Promise.resolve(fn()).catch(() => {});
    }, intervalMs);
    this.intervals.set(widgetId, id);
  }

  /** Stop polling for a specific widget */
  stop(widgetId: string): void {
    const id = this.intervals.get(widgetId);
    if (id !== undefined) {
      clearInterval(id);
      this.intervals.delete(widgetId);
    }
  }

  /** Stop all active intervals */
  stopAll(): void {
    this.intervals.forEach(id => clearInterval(id));
    this.intervals.clear();
  }
}
