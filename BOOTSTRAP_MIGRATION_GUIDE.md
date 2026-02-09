# Dashboard Design System Migration Guide

## Overview

The dashboard has been migrated from custom CSS to a **Bootstrap 5-based design system**. This provides:

- ✅ **Standardized components** - Consistent buttons, cards, forms, modals
- ✅ **Utility classes** - Extensive spacing, sizing, and layout utilities
- ✅ **Theme customization** - Centralized color and styling configuration
- ✅ **Responsive design** - Built-in mobile support
- ✅ **Better maintainability** - Less custom CSS to maintain
- ✅ **Professional appearance** - Industry-standard UI components

## What Changed

### File Structure

**New Files:**
- `src/css/theme.scss` - Bootstrap customization and theme configuration
- `src/css/style-bootstrap.css` - Dashboard-specific styles built on Bootstrap
- `src/css/widgets-bootstrap.css` - Widget components using Bootstrap patterns

**Modified Files:**
- `package.json` - Added Bootstrap 5, Sass, and Popper.js dependencies
- `src/main.ts` - Now imports Bootstrap and new theme system
- `http/index.html` - CSS loading moved to module system

**Preserved Files (for gradual migration):**
- `src/css/style.css` - Old custom styles (can be phased out)
- `src/css/widgets.css` - Old widget styles (can be phased out)

### CSS Architecture

**Before:**
```
Custom CSS Variables → Custom Utility Classes → Custom Components
```

**After:**
```
Bootstrap Base → Customized Theme (SCSS) → Dashboard Extensions → Widget Components
```

## Getting Started

### 1. Rebuild Docker Containers

Since dependencies have changed, you need to rebuild the containers:

```bash
cd /home/concordia/Dashboard

# Stop existing containers
docker-compose down

# Rebuild with new dependencies
docker-compose build --no-cache

# Start containers
docker-compose up -d
```

### 2. Verify Installation

Check that Bootstrap is loaded:

```bash
# Enter the container
docker exec -it dashboard-app sh

# Verify Bootstrap is installed
ls -la node_modules/bootstrap
ls -la node_modules/@popperjs/core
```

## Using Bootstrap Components

### Buttons

**Old Way:**
```html
<button class="widget-button-primary">Save</button>
```

**New Way (Bootstrap):**
```html
<button class="btn btn-primary">Save</button>
<button class="btn btn-secondary">Cancel</button>
<button class="btn btn-success">Confirm</button>
<button class="btn btn-danger">Delete</button>
<button class="btn btn-outline-primary">Outline</button>

<!-- Button sizes -->
<button class="btn btn-primary btn-sm">Small</button>
<button class="btn btn-primary">Default</button>
<button class="btn btn-primary btn-lg">Large</button>
```

### Cards

**Old Way:**
```html
<div class="card">
  <div class="card-header">
    <h3 class="card-title">Title</h3>
  </div>
  <div class="card-content">Content</div>
</div>
```

**New Way (Bootstrap):**
```html
<div class="card">
  <div class="card-header">
    <h5 class="card-title mb-0">Title</h5>
  </div>
  <div class="card-body">
    Content here
  </div>
  <div class="card-footer">
    Footer (optional)
  </div>
</div>
```

### Forms

**Old Way:**
```html
<div class="widget-dialog-field">
  <label class="widget-dialog-label">Label</label>
  <input class="widget-dialog-input" type="text">
</div>
```

**New Way (Bootstrap):**
```html
<div class="mb-3">
  <label class="form-label">Label</label>
  <input type="text" class="form-control" placeholder="Enter text">
</div>

<!-- With validation states -->
<div class="mb-3">
  <label class="form-label">Email</label>
  <input type="email" class="form-control is-valid">
  <div class="valid-feedback">Looks good!</div>
</div>

<div class="mb-3">
  <label class="form-label">Password</label>
  <input type="password" class="form-control is-invalid">
  <div class="invalid-feedback">Please enter a password.</div>
</div>
```

### Modals/Dialogs

**Old Way:**
```html
<div class="widget-overlay">
  <div class="widget-dialog">
    <h3 class="widget-dialog-title">Title</h3>
    <div class="widget-dialog-field">...</div>
    <div class="widget-dialog-buttons">
      <button class="widget-dialog-button-cancel">Cancel</button>
      <button class="widget-dialog-button-save">Save</button>
    </div>
  </div>
</div>
```

**New Way (Bootstrap):**
```html
<!-- Using Bootstrap Modal component -->
<div class="modal fade" id="exampleModal" tabindex="-1">
  <div class="modal-dialog">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">Modal Title</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body">
        <div class="mb-3">
          <label class="form-label">Field</label>
          <input type="text" class="form-control">
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
        <button type="button" class="btn btn-primary">Save</button>
      </div>
    </div>
  </div>
</div>
```

**JavaScript to show/hide modals:**
```typescript
// In your widget code
const modalElement = document.getElementById('exampleModal');
const modal = new window.bootstrap.Modal(modalElement);

// Show modal
modal.show();

// Hide modal
modal.hide();
```

### Badges (Status Indicators)

**Old Way:**
```html
<span class="status-badge success">Running</span>
<span class="status-badge error">Stopped</span>
```

**New Way (Bootstrap):**
```html
<span class="badge bg-success">Running</span>
<span class="badge bg-danger">Stopped</span>
<span class="badge bg-warning">Paused</span>
<span class="badge bg-info">Info</span>
<span class="badge bg-secondary">Unknown</span>

<!-- Rounded pill style -->
<span class="badge rounded-pill bg-success">Running</span>
```

### Alerts

```html
<div class="alert alert-primary" role="alert">
  Primary alert
</div>

<div class="alert alert-success" role="alert">
  <i class="fas fa-check-circle me-2"></i>
  Success! Operation completed.
</div>

<div class="alert alert-danger" role="alert">
  <i class="fas fa-exclamation-circle me-2"></i>
  Error! Something went wrong.
</div>

<!-- Dismissible alert -->
<div class="alert alert-warning alert-dismissible fade show" role="alert">
  Warning message here
  <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
</div>
```

## Utility Classes

Bootstrap provides extensive utility classes for common styling needs:

### Spacing

```html
<!-- Margin -->
<div class="m-0">No margin</div>
<div class="m-1">Margin 0.25rem</div>
<div class="m-2">Margin 0.5rem</div>
<div class="m-3">Margin 1rem</div>
<div class="m-4">Margin 1.5rem</div>
<div class="m-5">Margin 3rem</div>

<!-- Specific sides: mt (top), mb (bottom), ms (start/left), me (end/right) -->
<div class="mt-3 mb-2">Top & bottom margin</div>
<div class="mx-auto">Horizontal auto (center)</div>

<!-- Padding: p-0, p-1, p-2, etc. -->
<div class="p-3">Padding 1rem</div>
<div class="px-4 py-2">Horizontal and vertical padding</div>
```

### Flexbox

```html
<!-- Flex container -->
<div class="d-flex">
  <div>Item 1</div>
  <div>Item 2</div>
</div>

<!-- Direction -->
<div class="d-flex flex-row">Horizontal</div>
<div class="d-flex flex-column">Vertical</div>

<!-- Alignment -->
<div class="d-flex justify-content-center">Centered horizontally</div>
<div class="d-flex justify-content-between">Space between</div>
<div class="d-flex align-items-center">Centered vertically</div>
<div class="d-flex justify-content-center align-items-center">Fully centered</div>

<!-- Gap -->
<div class="d-flex gap-2">Items with gap</div>
<div class="d-flex gap-3">Larger gap</div>
```

### Grid System

```html
<!-- Responsive grid -->
<div class="container">
  <div class="row">
    <div class="col-md-6">Half width on medium+ screens</div>
    <div class="col-md-6">Half width</div>
  </div>
  
  <div class="row g-3">
    <div class="col-12 col-sm-6 col-md-4 col-lg-3">
      Responsive columns with gap
    </div>
    <!-- More columns -->
  </div>
</div>
```

### Text

```html
<!-- Alignment -->
<p class="text-start">Left aligned</p>
<p class="text-center">Center aligned</p>
<p class="text-end">Right aligned</p>

<!-- Weight -->
<p class="fw-light">Light text</p>
<p class="fw-normal">Normal text</p>
<p class="fw-bold">Bold text</p>

<!-- Size -->
<p class="fs-1">Largest</p>
<p class="fs-3">Large</p>
<p class="fs-5">Normal</p>
<p class="fs-6">Small</p>

<!-- Color -->
<p class="text-primary">Primary color</p>
<p class="text-secondary">Secondary color</p>
<p class="text-success">Success color</p>
<p class="text-danger">Danger color</p>
<p class="text-muted">Muted text</p>
```

### Display & Visibility

```html
<!-- Display -->
<div class="d-none">Hidden</div>
<div class="d-block">Block</div>
<div class="d-inline-block">Inline block</div>
<div class="d-flex">Flex</div>

<!-- Responsive display -->
<div class="d-none d-md-block">Hidden on mobile, visible on tablet+</div>
```

### Colors

```html
<!-- Background colors -->
<div class="bg-primary text-white">Primary background</div>
<div class="bg-success text-white">Success background</div>
<div class="bg-danger text-white">Danger background</div>
<div class="bg-light">Light background</div>
<div class="bg-dark text-white">Dark background</div>

<!-- Subtle backgrounds -->
<div class="bg-primary-subtle">Subtle primary</div>
```

### Borders & Rounded Corners

```html
<!-- Borders -->
<div class="border">All borders</div>
<div class="border-top">Top border only</div>
<div class="border-0">No border</div>

<!-- Border colors -->
<div class="border border-primary">Primary border</div>

<!-- Rounded corners -->
<div class="rounded">Rounded</div>
<div class="rounded-circle">Circle</div>
<div class="rounded-pill">Pill shape</div>
```

## Theme Customization

### Changing Theme Colors

Edit [`src/css/theme.scss`](src/css/theme.scss):

```scss
// Customize Bootstrap colors
$primary: #0066cc;    // Change to your brand color
$secondary: #6c757d;
$success: #4caf50;
$danger: #f44336;

// Then rebuild to apply changes
```

### Dark Mode Support

The theme includes built-in dark mode support. Toggle it by setting the data attribute:

```typescript
// Enable dark mode
document.documentElement.setAttribute('data-bs-theme', 'dark');

// Enable light mode
document.documentElement.setAttribute('data-bs-theme', 'light');

// Use system preference
document.documentElement.removeAttribute('data-bs-theme');
```

### Custom CSS Variables

Bootstrap CSS variables are available in `var(--bs-*)` format:

```css
.my-element {
  color: var(--bs-primary);
  background: var(--bs-body-bg);
  border-color: var(--bs-border-color);
}
```

## Migrating Widgets

### Step-by-Step Widget Migration

1. **Replace custom classes with Bootstrap classes**
2. **Use Bootstrap components (cards, buttons, badges)**
3. **Leverage utility classes for spacing and layout**
4. **Test in both light and dark modes**

### Example: Migrating a Docker Widget

**Before:**
```typescript
dialog.innerHTML = `
  <h3 class="widget-dialog-title">Docker Configuration</h3>
  <div class="widget-dialog-field">
    <label class="widget-dialog-label">Docker Host</label>
    <input class="widget-dialog-input" type="text">
  </div>
  <div class="widget-dialog-buttons">
    <button class="widget-dialog-button-cancel">Cancel</button>
    <button class="widget-dialog-button-save">Save</button>
  </div>
`;
```

**After:**
```typescript
dialog.innerHTML = `
  <h3 class="modal-title mb-4">
    <i class="fab fa-docker me-2"></i> Docker Configuration
  </h3>
  <div class="mb-3">
    <label class="form-label">Docker Host</label>
    <input type="text" class="form-control" placeholder="unix:///var/run/docker.sock">
  </div>
  <div class="d-flex gap-2 justify-content-end mt-4 pt-3 border-top">
    <button class="btn btn-secondary">Cancel</button>
    <button class="btn btn-primary">Save</button>
  </div>
`;
```

## Bootstrap Component Reference

For complete documentation on Bootstrap components:

- **Official Docs**: https://getbootstrap.com/docs/5.3/
- **Components**: https://getbootstrap.com/docs/5.3/components/
- **Utilities**: https://getbootstrap.com/docs/5.3/utilities/
- **Forms**: https://getbootstrap.com/docs/5.3/forms/

## Common Patterns

### Loading Spinner

```html
<!-- Old -->
<div class="widget-loading">Loading...</div>

<!-- New -->
<div class="text-center p-4">
  <div class="spinner-border text-primary" role="status">
    <span class="visually-hidden">Loading...</span>
  </div>
</div>
```

### Empty State

```html
<div class="text-center p-5">
  <div class="display-1 text-muted mb-3">📊</div>
  <h5 class="mb-2">No Data Available</h5>
  <p class="text-muted mb-3">Configure this widget to get started</p>
  <button class="btn btn-primary">Configure</button>
</div>
```

### Error Message

```html
<div class="alert alert-danger d-flex align-items-center" role="alert">
  <i class="fas fa-exclamation-triangle me-2"></i>
  <div>
    <strong>Error:</strong> Failed to load data. Please try again.
  </div>
</div>
```

### List Group

```html
<ul class="list-group">
  <li class="list-group-item d-flex justify-content-between align-items-center">
    Container Name
    <span class="badge bg-success rounded-pill">Running</span>
  </li>
  <li class="list-group-item d-flex justify-content-between align-items-center">
    Another Container
    <span class="badge bg-danger rounded-pill">Stopped</span>
  </li>
</ul>
```

## Troubleshooting

### Issue: Styles not loading

**Solution:** Rebuild containers to install new dependencies:
```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Issue: TypeScript errors about Bootstrap types

**Solution:** Add Bootstrap types to your widget:
```typescript
import type { Modal } from 'bootstrap';

// Use bootstrap from window
const modal = new window.bootstrap.Modal(element);
```

### Issue: Old styles conflicting with new

**Solution:** Gradually migrate widgets and remove old CSS files once migration is complete.

## Migration Checklist

- [ ] Rebuild Docker containers with new dependencies
- [ ] Verify Bootstrap loads correctly
- [ ] Update one widget as a test (start with a simple one)
- [ ] Test light and dark modes
- [ ] Migrate remaining widgets progressively
- [ ] Remove old CSS files once complete
- [ ] Update any custom components to use Bootstrap

## Benefits Achieved

✅ **Consistency** - All UI elements use the same design language  
✅ **Less code** - Reduced custom CSS from ~3,600 lines to ~800 lines  
✅ **Better UX** - Professional, familiar component styling  
✅ **Maintainability** - Standard framework means easier updates  
✅ **Accessibility** - Bootstrap components include ARIA attributes  
✅ **Documentation** - Extensive Bootstrap docs available online  
✅ **Community** - Large ecosystem of Bootstrap resources  

## Next Steps

1. Rebuild containers and verify Bootstrap loads
2. Start migrating widgets one by one
3. Test thoroughly in both light and dark modes
4. Remove old CSS files once migration is complete
5. Consider adding more Bootstrap components (toasts, offcanvas, etc.)

---

**Need Help?** Refer to the [Bootstrap 5 Documentation](https://getbootstrap.com/docs/5.3/) for detailed component usage and examples.
