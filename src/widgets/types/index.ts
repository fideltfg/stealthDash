import { registerWidget } from './base';

// Automatic widget registration - just import the widget files!
// Each widget file exports a 'widget' object that gets auto-registered
// import * as text from './text';
import * as image from './image';
// import * as data from './data';
import * as embed from './embed';
import * as weather from './weather';
import * as clock from './clock';
import * as rss from './rss';
import * as uptime from './uptime';
import * as cometP8541 from './comet-p8541';
import * as homeAssistant from './home-assistant';
import * as chatgpt from './chatgpt';
import * as mtnxml from './mtnxml';
import * as envcanada from './envcanada';

// Auto-register all widgets
// const widgets = [text, image, data, embed, weather, clock, rss, uptime, cometP8541, homeAssistant, chatgpt, mtnxml, envcanada];
const widgets = [image, embed, weather, clock, rss, uptime, cometP8541, homeAssistant, chatgpt, mtnxml, envcanada];

widgets.forEach(mod => {
  if (mod.widget) {
    registerWidget(mod.widget);
  }
});

// Re-export for convenience
export { registerWidget, getWidgetPlugin, getWidgetRenderer, getAllWidgetPlugins, getRegisteredWidgetTypes } from './base';
export type { WidgetPlugin, WidgetRenderer } from './base';
