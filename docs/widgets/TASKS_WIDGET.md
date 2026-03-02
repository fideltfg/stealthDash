# Tasks Widget

Manage tasks and to-do lists with priorities and due dates.

## Overview

A full-featured task management widget with support for priorities, due dates, completion tracking, and multiple sorting options. Supports both local storage and Todoist integration.

## Features

### Two Modes
- **Local Mode**: Tasks stored in browser, no account needed
- **Todoist Mode**: Sync with Todoist account for cloud storage

### Task Management
- Create and edit tasks
- Mark tasks as complete/incomplete
- Set task priorities (1-3)
- Assign due dates
- Delete tasks

### Organization
- Sort by priority, due date, or creation date
- Overdue task highlighting
- Completed task tracking
- Task counters

### Display
- Clean, list-based interface
- Color-coded priorities
- Due date indicators (Today, Tomorrow, Overdue)
- Checkbox completion toggle
- Inline task editing

## Configuration

### Local Mode
1. Add Tasks widget to dashboard
2. Select "Local" mode in settings
3. Tasks stored locally in widget
4. No external service required

### Todoist Mode
1. Create Todoist API token at https://todoist.com/app/settings/integrations
2. Store in Credential Manager:
   - Service Type: Todoist
   - API Token: Your Todoist API token
3. Add Tasks widget
4. Configure widget:
   - Mode: Todoist
   - Credential: Select saved credential
   - Filter: Optional Todoist filter query
5. Tasks sync from Todoist account

## Usage

### Local Mode
**Creating Tasks**
1. Click "Add Task" button
2. Enter task description
3. Optionally set:
   - Priority (1 = High, 2 = Medium, 3 = Low)
   - Due date

### Todoist Mode
- Tasks are read from your Todoist account
- Click checkbox to mark tasks complete in Todoist
- Create/edit tasks in Todoist app or website
- Use filter query to show specific projects or labels

### Managing Tasks (Local Mode)
- **Complete**: Click checkbox to mark done
- **Edit**: Click task text to modify
- **Delete**: Click delete icon
- **Priority**: Color-coded dots indicate priority

### Sorting Options
- **By Priority**: High priority tasks first
- **By Due Date**: Soonest due date first
- **By Creation**: Newest tasks first

## Task Attributes

### Priority Levels
- **Priority 1** (Red): Critical/urgent tasks
- **Priority 2** (Orange): Important tasks  
- **Priority 3** (Yellow): Normal tasks
- **No Priority**: Standard tasks

### Due Date Indicators
- **Overdue**: Past due date (highlighted red)
- **Today**: Due today
- **Tomorrow**: Due tomorrow
- **Future**: Shows specific date

## Features

- Local storage (persists in browser)
- No account required
- Fast and responsive
- Keyboard shortcuts support
- Drag to reorder (coming soon)

## Tips

**Organization**
- Use priorities for importance, due dates for urgency
- Review overdue tasks regularly
- Archive completed tasks periodically

**Workflow**
- Start each day by reviewing Today tasks
- Set realistic due dates
- Break large tasks into smaller ones
- Use priorities to focus on what matters

## Mode Comparison

### Local Mode
- ✅ No account required
- ✅ Fast and responsive
- ✅ Full task management (create/edit/delete)
- ❌ Tasks tied to browser/device
- ❌ No cloud sync
- ❌ Limited to single widget

### Todoist Mode
- ✅ Cloud sync across all devices
- ✅ Use Todoist app/website alongside widget
- ✅ Advanced Todoist features (projects, labels, filters)
- ✅ Multiple widgets can show different filters
- ❌ Requires Todoist account
- ❌ Task editing done in Todoist (widget shows read-only list)

## Limitations

### Local Mode
- Tasks stored locally per widget instance
- No cloud sync (tasks tied to browser/device)
- No recurring tasks
- No subtasks or nested lists
- No task sharing/collaboration

### Todoist Mode
- Cannot create/edit tasks from widget (read-only display)
- Requires active Todoist subscription for some features
- Task editing must be done in Todoist app/website
