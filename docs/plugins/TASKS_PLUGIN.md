# Tasks Plugin

Server-side task management with CRUD operations and statistics — used by the Tasks widget in local-server mode.

## Routes

All routes require authentication.

### `GET /api/tasks`

List the authenticated user's tasks.

| Parameter | Type | In | Required | Description |
|-----------|------|-----|----------|-------------|
| `completed` | string | query | No | Filter by completion: `true` or `false` |
| `priority` | number | query | No | Filter by priority (1–4) |
| `category` | string | query | No | Filter by category |

**Response:**
```json
{
  "success": true,
  "tasks": [
    {
      "id": 1,
      "title": "Review PR",
      "description": "Check the latest pull request",
      "completed": false,
      "priority": 2,
      "due_date": "2026-03-10",
      "category": "work",
      "created_at": "...",
      "updated_at": "...",
      "completed_at": null
    }
  ]
}
```

Tasks are ordered: uncompleted first, then by priority (ascending), then by due date.

### `POST /api/tasks`

Create a new task.

**Body:**
```json
{
  "title": "Review PR",
  "description": "Check the latest pull request",
  "priority": 2,
  "due_date": "2026-03-10",
  "category": "work"
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `title` | string | Yes | — | Task title (max 500 chars) |
| `description` | string | No | — | Detailed description |
| `priority` | number | No | 4 | Priority 1–4 (1=urgent, 2=high, 3=medium, 4=low) |
| `due_date` | string | No | — | Due date (ISO date format) |
| `category` | string | No | — | Category label (max 100 chars) |

### `PUT /api/tasks/:id`

Update an existing task.

**Body:** Any combination of `title`, `description`, `completed`, `priority`, `due_date`, `category`.

- When `completed` is set to `true`, `completed_at` is automatically timestamped
- Priority is clamped to 1–4

### `DELETE /api/tasks/:id`

Delete a task permanently.

### `GET /api/tasks/stats`

Get task statistics for the authenticated user.

**Response:**
```json
{
  "success": true,
  "stats": {
    "total": 15,
    "completed": 8,
    "active": 7,
    "overdue": 2,
    "today": 1
  }
}
```

## Authentication

All routes require a valid JWT token. Tasks are scoped per user — users can only see and manage their own tasks.

## Database

Uses the `tasks` table (created by migration `2026_03_04_000001_create_tasks_table.sql`):
- Indexed on `user_id`, `completed`, `due_date`, `priority`
- Automatic `updated_at` trigger on updates
- Cascade delete when user is removed
