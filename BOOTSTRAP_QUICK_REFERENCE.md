# Bootstrap 5 Quick Reference for Dashboard

## Most Used Button Classes

```html
<!-- Button Variants -->
<button class="btn btn-primary">Primary</button>
<button class="btn btn-secondary">Secondary</button>
<button class="btn btn-success">Success</button>
<button class="btn btn-danger">Danger</button>
<button class="btn btn-warning">Warning</button>
<button class="btn btn-info">Info</button>
<button class="btn btn-light">Light</button>
<button class="btn btn-dark">Dark</button>
<button class="btn btn-link">Link</button>

<!-- Outline Buttons -->
<button class="btn btn-outline-primary">Outline</button>

<!-- Button Sizes -->
<button class="btn btn-primary btn-sm">Small</button>
<button class="btn btn-primary">Normal</button>
<button class="btn btn-primary btn-lg">Large</button>

<!-- Block Button -->
<button class="btn btn-primary w-100">Full Width</button>
```

## Form Components

```html
<!-- Text Input -->
<div class="mb-3">
  <label class="form-label">Email</label>
  <input type="email" class="form-control" placeholder="name@example.com">
  <div class="form-text">Helper text</div>
</div>

<!-- Textarea -->
<div class="mb-3">
  <label class="form-label">Description</label>
  <textarea class="form-control" rows="3"></textarea>
</div>

<!-- Select -->
<div class="mb-3">
  <label class="form-label">Choose</label>
  <select class="form-select">
    <option selected>Open this select menu</option>
    <option value="1">One</option>
    <option value="2">Two</option>
  </select>
</div>

<!-- Checkbox -->
<div class="form-check">
  <input class="form-check-input" type="checkbox" id="check1">
  <label class="form-check-label" for="check1">
    Check me out
  </label>
</div>

<!-- Radio -->
<div class="form-check">
  <input class="form-check-input" type="radio" name="radio1" id="radio1">
  <label class="form-check-label" for="radio1">
    Option 1
  </label>
</div>

<!-- Switch -->
<div class="form-check form-switch">
  <input class="form-check-input" type="checkbox" id="switch1">
  <label class="form-check-label" for="switch1">Toggle</label>
</div>

<!-- Input Group -->
<div class="input-group mb-3">
  <span class="input-group-text">@</span>
  <input type="text" class="form-control" placeholder="Username">
</div>

<div class="input-group">
  <input type="text" class="form-control" placeholder="Search">
  <button class="btn btn-primary" type="button">
    <i class="fas fa-search"></i>
  </button>
</div>
```

## Card Component

```html
<!-- Basic Card -->
<div class="card">
  <div class="card-body">
    <h5 class="card-title">Card Title</h5>
    <p class="card-text">Card content goes here.</p>
    <a href="#" class="btn btn-primary">Button</a>
  </div>
</div>

<!-- Card with Header -->
<div class="card">
  <div class="card-header">
    Featured
  </div>
  <div class="card-body">
    <h5 class="card-title">Title</h5>
    <p class="card-text">Content</p>
  </div>
</div>

<!-- Card with Image -->
<div class="card">
  <img src="..." class="card-img-top" alt="...">
  <div class="card-body">
    <h5 class="card-title">Title</h5>
    <p class="card-text">Content</p>
  </div>
</div>
```

## Spacing (Margin & Padding)

```
m  - margin
p  - padding

t  - top
b  - bottom
s  - start (left)
e  - end (right)
x  - horizontal (left & right)
y  - vertical (top & bottom)

0  - 0
1  - 0.25rem (4px)
2  - 0.5rem (8px)
3  - 1rem (16px)
4  - 1.5rem (24px)
5  - 3rem (48px)
auto - auto
```

**Examples:**
```html
<div class="m-3">Margin 1rem on all sides</div>
<div class="mt-2">Margin-top 0.5rem</div>
<div class="mb-4">Margin-bottom 1.5rem</div>
<div class="mx-auto">Horizontal center</div>
<div class="p-3">Padding 1rem on all sides</div>
<div class="px-4 py-2">Padding horizontal 1.5rem, vertical 0.5rem</div>
```

## Flexbox Layout

```html
<!-- Flex Container -->
<div class="d-flex">
  <div>Item 1</div>
  <div>Item 2</div>
</div>

<!-- Direction -->
<div class="d-flex flex-row">Horizontal</div>
<div class="d-flex flex-column">Vertical</div>
<div class="d-flex flex-row-reverse">Reverse horizontal</div>

<!-- Justify Content (horizontal alignment) -->
<div class="d-flex justify-content-start">Start</div>
<div class="d-flex justify-content-center">Center</div>
<div class="d-flex justify-content-end">End</div>
<div class="d-flex justify-content-between">Space between</div>
<div class="d-flex justify-content-around">Space around</div>
<div class="d-flex justify-content-evenly">Space evenly</div>

<!-- Align Items (vertical alignment) -->
<div class="d-flex align-items-start">Top</div>
<div class="d-flex align-items-center">Middle</div>
<div class="d-flex align-items-end">Bottom</div>
<div class="d-flex align-items-stretch">Stretch</div>

<!-- Gap -->
<div class="d-flex gap-1">Gap 0.25rem</div>
<div class="d-flex gap-2">Gap 0.5rem</div>
<div class="d-flex gap-3">Gap 1rem</div>

<!-- Wrap -->
<div class="d-flex flex-wrap">Wrap items</div>

<!-- Flex Item Properties -->
<div class="d-flex">
  <div class="flex-fill">Fills space</div>
  <div class="flex-grow-1">Grows</div>
  <div class="flex-shrink-1">Shrinks</div>
</div>
```

## Text Utilities

```html
<!-- Alignment -->
<p class="text-start">Left</p>
<p class="text-center">Center</p>
<p class="text-end">Right</p>

<!-- Wrap -->
<p class="text-wrap">Wraps text</p>
<p class="text-nowrap">No wrap</p>

<!-- Transform -->
<p class="text-lowercase">lowercase</p>
<p class="text-uppercase">UPPERCASE</p>
<p class="text-capitalize">Capitalize Each Word</p>

<!-- Weight -->
<p class="fw-light">Light</p>
<p class="fw-normal">Normal</p>
<p class="fw-bold">Bold</p>
<p class="fw-bolder">Bolder</p>

<!-- Style -->
<p class="fst-italic">Italic</p>
<p class="fst-normal">Normal</p>

<!-- Size -->
<p class="fs-1">Huge</p>
<p class="fs-6">Small</p>

<!-- Color -->
<p class="text-primary">Primary</p>
<p class="text-secondary">Secondary</p>
<p class="text-success">Success</p>
<p class="text-danger">Danger</p>
<p class="text-warning">Warning</p>
<p class="text-info">Info</p>
<p class="text-light">Light</p>
<p class="text-dark">Dark</p>
<p class="text-muted">Muted</p>
<p class="text-body">Body color</p>
```

## Background Colors

```html
<div class="bg-primary text-white">Primary</div>
<div class="bg-secondary text-white">Secondary</div>
<div class="bg-success text-white">Success</div>
<div class="bg-danger text-white">Danger</div>
<div class="bg-warning">Warning</div>
<div class="bg-info">Info</div>
<div class="bg-light">Light</div>
<div class="bg-dark text-white">Dark</div>
<div class="bg-body">Body</div>
<div class="bg-white">White</div>
<div class="bg-transparent">Transparent</div>

<!-- Subtle backgrounds -->
<div class="bg-primary-subtle">Subtle primary</div>
<div class="bg-success-subtle">Subtle success</div>
```

## Badges

```html
<span class="badge bg-primary">Primary</span>
<span class="badge bg-success">Success</span>
<span class="badge bg-danger">Danger</span>

<!-- Pill badges -->
<span class="badge rounded-pill bg-primary">Pill</span>

<!-- Badge in button -->
<button class="btn btn-primary">
  Notifications <span class="badge bg-light text-dark">4</span>
</button>
```

## Alerts

```html
<div class="alert alert-primary" role="alert">
  Primary alert
</div>

<div class="alert alert-success" role="alert">
  <i class="fas fa-check-circle me-2"></i> Success!
</div>

<div class="alert alert-danger" role="alert">
  <i class="fas fa-exclamation-circle me-2"></i> Error!
</div>

<!-- Dismissible -->
<div class="alert alert-warning alert-dismissible fade show" role="alert">
  Warning!
  <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
</div>
```

## Borders

```html
<!-- Add borders -->
<div class="border">All sides</div>
<div class="border-top">Top only</div>
<div class="border-end">Right only</div>
<div class="border-bottom">Bottom only</div>
<div class="border-start">Left only</div>

<!-- Remove borders -->
<div class="border-0">No border</div>

<!-- Border color -->
<div class="border border-primary">Primary</div>
<div class="border border-success">Success</div>

<!-- Border radius -->
<div class="rounded">Rounded</div>
<div class="rounded-0">No radius</div>
<div class="rounded-1">Small radius</div>
<div class="rounded-2">Normal radius</div>
<div class="rounded-3">Large radius</div>
<div class="rounded-circle">Circle</div>
<div class="rounded-pill">Pill</div>

<!-- Rounded specific corners -->
<div class="rounded-top">Top corners</div>
<div class="rounded-end">Right corners</div>
<div class="rounded-bottom">Bottom corners</div>
<div class="rounded-start">Left corners</div>
```

## Display & Visibility

```html
<!-- Display -->
<div class="d-none">Hidden</div>
<div class="d-inline">Inline</div>
<div class="d-inline-block">Inline block</div>
<div class="d-block">Block</div>
<div class="d-flex">Flex</div>
<div class="d-grid">Grid</div>

<!-- Responsive display -->
<div class="d-none d-sm-block">Hidden on xs, visible on sm+</div>
<div class="d-lg-none">Visible until lg, then hidden</div>
```

## Shadows

```html
<div class="shadow-none">No shadow</div>
<div class="shadow-sm">Small shadow</div>
<div class="shadow">Regular shadow</div>
<div class="shadow-lg">Large shadow</div>
```

## Width & Height

```html
<!-- Width -->
<div class="w-25">Width 25%</div>
<div class="w-50">Width 50%</div>
<div class="w-75">Width 75%</div>
<div class="w-100">Width 100%</div>
<div class="w-auto">Width auto</div>

<!-- Height -->
<div class="h-25">Height 25%</div>
<div class="h-50">Height 50%</div>
<div class="h-75">Height 75%</div>
<div class="h-100">Height 100%</div>
<div class="h-auto">Height auto</div>

<!-- Max width -->
<div class="mw-100">Max width 100%</div>

<!-- Viewport units -->
<div class="vw-100">Width 100vw</div>
<div class="vh-100">Height 100vh</div>
```

## Position

```html
<div class="position-static">Static</div>
<div class="position-relative">Relative</div>
<div class="position-absolute">Absolute</div>
<div class="position-fixed">Fixed</div>
<div class="position-sticky">Sticky</div>

<!-- Position values -->
<div class="position-absolute top-0 start-0">Top left</div>
<div class="position-absolute top-0 end-0">Top right</div>
<div class="position-absolute bottom-0 start-0">Bottom left</div>
<div class="position-absolute bottom-0 end-0">Bottom right</div>
<div class="position-absolute top-50 start-50">Centered positioning</div>
```

## List Group

```html
<ul class="list-group">
  <li class="list-group-item">Item 1</li>
  <li class="list-group-item">Item 2</li>
  <li class="list-group-item active">Active item</li>
  <li class="list-group-item disabled">Disabled item</li>
</ul>

<!-- With badges -->
<ul class="list-group">
  <li class="list-group-item d-flex justify-content-between align-items-center">
    Item
    <span class="badge bg-primary rounded-pill">14</span>
  </li>
</ul>

<!-- Clickable -->
<div class="list-group">
  <a href="#" class="list-group-item list-group-item-action">Link 1</a>
  <a href="#" class="list-group-item list-group-item-action active">Link 2</a>
</div>
```

## Spinner (Loading)

```html
<!-- Border spinner -->
<div class="spinner-border" role="status">
  <span class="visually-hidden">Loading...</span>
</div>

<!-- Colors -->
<div class="spinner-border text-primary" role="status"></div>
<div class="spinner-border text-success" role="status"></div>

<!-- Grow spinner -->
<div class="spinner-grow" role="status">
  <span class="visually-hidden">Loading...</span>
</div>

<!-- Small -->
<div class="spinner-border spinner-border-sm" role="status"></div>

<!-- In button -->
<button class="btn btn-primary" type="button" disabled>
  <span class="spinner-border spinner-border-sm me-2" role="status"></span>
  Loading...
</button>
```

## Common Combinations

### Centered Content Box
```html
<div class="d-flex justify-content-center align-items-center vh-100">
  <div class="text-center">
    <h1>Centered Content</h1>
    <button class="btn btn-primary">Click Me</button>
  </div>
</div>
```

### Card Grid
```html
<div class="row g-3">
  <div class="col-md-4">
    <div class="card">
      <div class="card-body">Card 1</div>
    </div>
  </div>
  <div class="col-md-4">
    <div class="card">
      <div class="card-body">Card 2</div>
    </div>
  </div>
  <div class="col-md-4">
    <div class="card">
      <div class="card-body">Card 3</div>
    </div>
  </div>
</div>
```

### Navigation Bar
```html
<nav class="navbar navbar-expand-lg navbar-light bg-light">
  <div class="container-fluid">
    <a class="navbar-brand" href="#">Logo</a>
    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
      <span class="navbar-toggler-icon"></span>
    </button>
    <div class="collapse navbar-collapse" id="navbarNav">
      <ul class="navbar-nav ms-auto">
        <li class="nav-item">
          <a class="nav-link active" href="#">Home</a>
        </li>
        <li class="nav-item">
          <a class="nav-link" href="#">Features</a>
        </li>
      </ul>
    </div>
  </div>
</nav>
```

---

**Full Bootstrap Documentation:** https://getbootstrap.com/docs/5.3/
