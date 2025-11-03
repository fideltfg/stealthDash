# Dashboard Theming

This document describes the theming system and how to extend or customize it.

## Color Tokens

The dashboard uses CSS custom properties (variables) for theming. All colors are defined at the `:root` level and can be overridden.

### Light Theme (Default)

```css
--bg: #f5f5f5;          /* Background color */
--surface: #ffffff;      /* Widget/card surface */
--text: #1a1a1a;        /* Primary text */
--muted: #666666;       /* Secondary/muted text */
--accent: #0066cc;      /* Primary accent color */
--ring: #0066cc;        /* Focus ring color */
--shadow: rgba(0, 0, 0, 0.1);  /* Shadow color */
--border: #e0e0e0;      /* Border color */
--hover: #f0f0f0;       /* Hover background */
```

### Dark Theme

Applied via `.theme-dark` class on the root element:

```css
--bg: #1a1a1a;
--surface: #2a2a2a;
--text: #f5f5f5;
--muted: #999999;
--accent: #4da6ff;
--ring: #4da6ff;
--shadow: rgba(0, 0, 0, 0.3);
--border: #404040;
--hover: #333333;
```

## Theme Modes

The dashboard supports three theme modes:

1. **Light** - Always use light theme
2. **Dark** - Always use dark theme
3. **System** - Follow OS preference via `prefers-color-scheme`

Users can toggle between modes using the theme toggle button (bottom-left).

## Layout Tokens

```css
--grid-size: 8px;           /* Grid snap size */
--border-radius: 8px;       /* Widget corner radius */
--transition-speed: 150ms;  /* Animation duration */
```

## Z-Index Layers

```css
--z-widget: 1;      /* Base widget layer */
--z-selected: 100;  /* Selected widget */
--z-toolbar: 200;   /* Widget toolbar */
--z-fab: 300;       /* Floating action buttons */
--z-modal: 400;     /* Modal dialogs */
```

## Customizing Themes

### Option 1: Modify CSS Variables

Edit `src/style.css` and change the values in `:root` or `.theme-dark`:

```css
:root {
  --accent: #ff6b6b;  /* Change accent to red */
  --border-radius: 4px;  /* Sharper corners */
}
```

### Option 2: Runtime Override

Use JavaScript to override theme properties:

```javascript
document.documentElement.style.setProperty('--accent', '#ff6b6b');
```

### Option 3: Add Custom Theme Class

Define a new theme class in CSS:

```css
.theme-custom {
  --bg: #f0e6d2;
  --surface: #ffffff;
  --text: #2c1810;
  --accent: #d4860d;
  /* ... other properties */
}
```

Then apply it programmatically by modifying `setupTheme()` in `src/main.ts`.

## Accessibility

All theme combinations maintain **WCAG AA contrast ratios**:

- Text on surface: minimum 4.5:1
- Interactive elements: minimum 3:1
- Focus indicators: 2px solid `var(--ring)` with 2px offset

## Reduced Motion

Users with motion sensitivity are automatically accommodated:

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

## Adding New Widget Styles

When creating custom widget types, use theme tokens:

```css
.my-custom-widget {
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
}

.my-custom-widget:hover {
  background: var(--hover);
}
```

This ensures your widget respects the current theme automatically.
