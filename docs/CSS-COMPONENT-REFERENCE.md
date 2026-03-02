# Dashboard CSS Component Reference Guide

Quick reference for all available CSS components and patterns.

---

## Design Tokens (CSS Variables)

```css
/* Colors */
--bg          /* Background color */
--surface     /* Surface/container color */
--text        /* Primary text color */
--muted       /* Muted/secondary text */
--accent      /* Primary accent color */
--ring        /* Focus ring color */
--shadow      /* Shadow color */
--border      /* Border color */
--hover       /* Hover state color */

/* Layout */
--grid-size   /* Base grid unit (8px) */
--radius      /* Border radius (8px) */
--transition  /* Transition speed (150ms) */

/* Z-index layers */
--z-widget    /* Widget layer (1) */
--z-selected  /* Selected widget (100) */
--z-toolbar   /* Toolbar layer (200) */
--z-fab       /* FAB buttons (300) */
--z-modal     /* Modal/dialog (400) */
```

---

## Buttons

```html
<!-- Primary button -->
<button class="btn btn-primary">Save</button>

<!-- Semantic variants -->
<button class="btn btn-success">Confirm</button>
<button class="btn btn-warning">Warning</button>
<button class="btn btn-danger">Delete</button>
<button class="btn btn-secondary">Cancel</button>

<!-- Size variants -->
<button class="btn btn-small">Small</button>
<button class="btn btn-large">Large</button>
<button class="btn btn-full">Full Width</button>

<!-- Icon button -->
<button class="btn btn-icon">⚙️</button>

<!-- Config button -->
<button class="widget-config-button">Configure</button>
```

---

## Forms

```html
<div class="form-group">
  <label class="form-label">Label</label>
  <input type="text" class="form-input" placeholder="Text input">
  <span class="form-hint">Helper text</span>
</div>

<div class="form-group">
  <label class="form-label">Textarea</label>
  <textarea class="form-textarea"></textarea>
</div>

<div class="form-group">
  <label class="form-label">Select</label>
  <select class="form-select">
    <option>Option 1</option>
    <option>Option 2</option>
  </select>
</div>

<div class="form-group">
  <label>
    <input type="checkbox" class="form-checkbox">
    <span>Checkbox label</span>
  </label>
</div>

<!-- Widget config input -->
<input type="text" class="widget-config-input">
```

---

## Cards

```html
<!-- Basic card -->
<div class="card">
  <div class="card-header">
    <h3 class="card-title">Card Title</h3>
    <span class="badge badge-success">Active</span>
  </div>
  <div class="card-body">
    <p class="card-subtitle">Subtitle or description</p>
    <p>Card content goes here</p>
  </div>
  <div class="card-footer">
    Last updated: 2 minutes ago
  </div>
</div>

<!-- Hover effect is automatic -->
```

---

## Badges

```html
<span class="badge badge-success">Success</span>
<span class="badge badge-warning">Warning</span>
<span class="badge badge-danger">Danger</span>
<span class="badge badge-info">Info</span>
<span class="badge badge-secondary">Secondary</span>

<!-- Base badge (no color) -->
<span class="badge">Custom</span>
```

---

## Lists

```html
<div class="list">
  <div class="list-item">
    <div class="list-item-title">Item Title</div>
    <div class="list-item-subtitle">Item subtitle or description</div>
  </div>
  
  <div class="list-item">
    <div class="list-item-title">Another Item</div>
    <div class="list-item-subtitle">More details</div>
  </div>
</div>
```

---

## Grids

```html
<!-- Fixed columns -->
<div class="grid grid-2">
  <div>Column 1</div>
  <div>Column 2</div>
</div>

<div class="grid grid-3">
  <div>Column 1</div>
  <div>Column 2</div>
  <div>Column 3</div>
</div>

<!-- Responsive auto-flow grid (recommended for widgets) -->
<div class="grid grid-auto">
  <div class="card">Item 1</div>
  <div class="card">Item 2</div>
  <div class="card">Item 3</div>
  <div class="card">Item 4</div>
</div>

<!-- Breakpoints:
     Mobile: 1 column
     600px+: 2 columns
     900px+: 3 columns
     1200px+: 4 columns
-->
```

---

## Headers

```html
<div class="header">
  <div>
    <h2 class="header-title">Section Title</h2>
    <p class="header-subtitle">5 items</p>
  </div>
  <div class="header-actions">
    <button class="btn btn-small btn-icon">⚙️</button>
    <button class="btn btn-small">Refresh</button>
  </div>
</div>
```

---

## Stat Cards

```html
<div class="grid grid-4">
  <div class="stat-card">
    <div class="stat-icon">📊</div>
    <div class="stat-value">1,234</div>
    <div class="stat-label">Total</div>
  </div>
  
  <div class="stat-card">
    <div class="stat-value">99.5%</div>
    <div class="stat-label">Uptime</div>
  </div>
</div>
```

---

## Info Boxes

```html
<div class="info-box info-box-info">
  <strong>Info:</strong> This is informational
</div>

<div class="info-box info-box-warning">
  <strong>Warning:</strong> Be careful
</div>

<div class="info-box info-box-success">
  <strong>Success:</strong> Operation completed
</div>
```

---

## Messages

```html
<!-- Initially hidden, add .visible to show -->
<div class="message message-success visible">
  Successfully saved!
</div>

<div class="message message-error">
  An error occurred
</div>

<div class="message message-warning">
  Warning message
</div>
```

---

## Widget Wrapper

```html
<div class="widget-wrapper">
  <!-- Optional header -->
  <div class="header">
    <h2 class="header-title">Widget Title</h2>
    <div class="header-actions">
      <button class="btn btn-small btn-icon">⚙️</button>
    </div>
  </div>
  
  <!-- Scrollable body -->
  <div class="widget-body">
    <!-- Your content here -->
  </div>
</div>
```

---

## Widget States

```html
<!-- Configuration needed -->
<div class="widget-config-screen">
  <div class="widget-config-icon">⚙️</div>
  <h3>Configure Widget</h3>
  <p class="widget-config-description">
    Click configure to set up this widget
  </p>
  <input type="text" class="widget-config-input" placeholder="Enter URL">
  <button class="widget-config-button">Save Configuration</button>
</div>

<!-- Loading state -->
<div class="widget-loading">
  Loading...
</div>

<!-- Error state -->
<div class="widget-error">
  <div class="widget-error-icon">⚠️</div>
  <div>Error loading data</div>
</div>

<!-- Empty state -->
<div class="widget-empty">
  <div class="widget-empty-icon">📭</div>
  <div>No items found</div>
</div>
```

---

## Dialogs & Modals

```html
<!-- Full-screen dialog (auth, settings, admin) -->
<div class="dialog">
  <div class="dialog-container">
    <div class="dialog-header">
      <h1 class="dialog-title">Dialog Title</h1>
      <button class="dialog-close-button">×</button>
    </div>
    <!-- Content here -->
  </div>
</div>

<!-- Centered modal (widget config, alerts) -->
<div class="modal-overlay">
  <div class="widget-dialog">
    <h2 class="widget-dialog-title">Modal Title</h2>
    <!-- Content here -->
    <div class="widget-dialog-buttons">
      <button class="widget-dialog-button-cancel">Cancel</button>
      <button class="widget-dialog-button-save">Save</button>
    </div>
  </div>
</div>
```

---

## Utility Classes

### Flexbox
```html
<div class="flex">Flex container</div>
<div class="flex flex-column">Flex column</div>
<div class="flex align-center">Centered items</div>
<div class="flex justify-center">Center content</div>
<div class="flex space-between">Space between</div>
<div class="flex-1">Flex grow</div>
```

### Gaps
```html
<div class="flex gap-4">4px gap</div>
<div class="flex gap-8">8px gap</div>
<div class="flex gap-12">12px gap</div>
<div class="flex gap-16">16px gap</div>
```

### Spacing
```html
<div class="mb-4">Margin bottom 4px</div>
<div class="mb-8">Margin bottom 8px</div>
<div class="mb-12">Margin bottom 12px</div>
<div class="mb-16">Margin bottom 16px</div>
<div class="mb-20">Margin bottom 20px</div>
<div class="mt-8">Margin top 8px</div>
```

### Layout
```html
<div class="text-center">Centered text</div>
<div class="w-100">Full width</div>
<div class="h-100">Full height</div>
<div class="overflow-auto">Auto overflow</div>
```

### Visibility
```html
<div class="hidden">Hidden</div>
<div class="visible">Visible</div>
```

### Semantic Colors
```html
<span class="success">Success text</span>
<span class="error">Error text</span>
<span class="warning">Warning text</span>
```

---

## Complete Widget Example

```html
<div class="widget-wrapper">
  <!-- Header with actions -->
  <div class="header">
    <div>
      <h2 class="header-title">Docker Containers</h2>
      <p class="header-subtitle">5 running, 2 stopped</p>
    </div>
    <div class="header-actions">
      <button class="btn btn-small btn-icon">🔄</button>
      <button class="btn btn-small btn-icon">⚙️</button>
    </div>
  </div>
  
  <!-- Info box -->
  <div class="widget-body">
    <div class="info-box info-box-info">
      <strong>Tip:</strong> Click any container for details
    </div>
    
    <!-- Stat cards -->
    <div class="grid grid-4 mb-16">
      <div class="stat-card">
        <div class="stat-value">7</div>
        <div class="stat-label">Total</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">5</div>
        <div class="stat-label">Running</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">2</div>
        <div class="stat-label">Stopped</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">0</div>
        <div class="stat-label">Errors</div>
      </div>
    </div>
    
    <!-- Container cards -->
    <div class="grid grid-auto">
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">nginx</h3>
          <span class="badge badge-success">Running</span>
        </div>
        <div class="card-body">
          <p class="card-subtitle">nginx:latest</p>
          <div class="flex gap-8 mt-8">
            <button class="btn btn-small">Logs</button>
            <button class="btn btn-small btn-danger">Stop</button>
          </div>
        </div>
      </div>
      
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">postgres</h3>
          <span class="badge badge-success">Running</span>
        </div>
        <div class="card-body">
          <p class="card-subtitle">postgres:14</p>
          <div class="flex gap-8 mt-8">
            <button class="btn btn-small">Logs</button>
            <button class="btn btn-small btn-danger">Stop</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
```

---

## Theme Support

The CSS automatically supports light/dark themes:

```javascript
// Set theme
document.documentElement.classList.add('theme-dark');
document.documentElement.classList.add('theme-light');

// Remove to use system preference
document.documentElement.classList.remove('theme-dark', 'theme-light');
```

---

## Best Practices

1. **Use common components** - Don't create widget-specific CSS
2. **Combine classes** - Mix utilities with components
3. **Semantic badges** - Use success/warning/danger/info appropriately
4. **Responsive grids** - Prefer `.grid-auto` for responsive layouts
5. **Consistent spacing** - Use utility classes (gap-*, mb-*, mt-*)
6. **Headers for sections** - Use `.header` for all section headers
7. **Cards for containers** - Use `.card` for all content boxes
8. **Stat cards for metrics** - Use `.stat-card` for displaying numbers

---

## Quick Copy-Paste Templates

### Card with Badge
```html
<div class="card">
  <div class="card-header">
    <h3 class="card-title">Title</h3>
    <span class="badge badge-success">Active</span>
  </div>
  <div class="card-body">Content</div>
</div>
```

### Form Field
```html
<div class="form-group">
  <label class="form-label">Label</label>
  <input class="form-input" placeholder="Placeholder">
  <span class="form-hint">Helper text</span>
</div>
```

### Button Group
```html
<div class="flex gap-8">
  <button class="btn btn-secondary">Cancel</button>
  <button class="btn btn-primary">Save</button>
</div>
```

### Stat Grid
```html
<div class="grid grid-4">
  <div class="stat-card">
    <div class="stat-value">100</div>
    <div class="stat-label">Label</div>
  </div>
</div>
```

---

For more details, see:
- `/CSS-REFACTORING-REPORT.md` - Full refactoring documentation
- `/CSS-PHASE-2-SUMMARY.md` - Phase 2 deep dive
- `/src/css/app.css` - Source CSS file
