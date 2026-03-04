import type { Widget, TasksContent } from '../types/types';
import type { WidgetRenderer, WidgetPlugin } from '../types/base-widget';
import { stopAllDragPropagation, dispatchWidgetUpdate, escapeHtml, injectWidgetStyles } from '../utils/dom';
import { getPingServerUrl, getAuthHeaders } from '../utils/api';
import { WidgetPoller } from '../utils/polling';
import { renderConfigPrompt, renderError } from '../utils/widgetRendering';
import { populateCredentialSelect } from '../utils/credentials';

interface Task {
  id: number;
  user_id: number;
  title: string;
  description?: string;
  completed: boolean;
  priority: number;
  due_date?: string;
  category?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

type SortBy = NonNullable<TasksContent['sortBy']>;

const PRIORITY_COLORS: Record<number, string> = { 
  1: '#ef4444', // urgent/high priority - red
  2: '#f97316', // high - orange
  3: '#fbbf24', // medium - yellow
  4: '#6b7280'  // low - gray
};

const TASKS_STYLES = `
.tasks-root { display: flex; flex-direction: column; height: 100%; padding: 8px 12px; gap: 8px; }
.task-add { display: flex; gap: 6px; }
.task-add-quick { flex: 1; }
.task-add-btn { white-space: nowrap; }
.task-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
.task-item { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 6px 4px; border-radius: var(--radius); transition: background 0.15s; cursor: pointer; }
.task-item:hover { background: var(--hover); }
.task-check input { width: 16px; height: 16px; cursor: pointer; accent-color: var(--accent); }
.task-title { flex: 1; min-width: 0; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.task-done .task-title { text-decoration: line-through; opacity: 0.5; }
.task-pri { font-size: 12px; margin-right: 2px; }
.task-actions { display: flex; gap: 4px; opacity: 0; transition: opacity 0.15s; }
.task-item:hover .task-actions { opacity: 1; }
.task-action-btn { background: none; border: none; color: var(--muted); cursor: pointer; padding: 2px 4px; font-size: 12px; transition: color 0.15s; }
.task-action-btn:hover { color: var(--accent); }
.task-action-btn.delete:hover { color: #ef4444; }
.task-meta { width: 100%; padding-left: 28px; font-size: 11px; color: var(--muted); display: flex; gap: 8px; flex-wrap: wrap; }
.task-overdue { color: #ef4444; font-weight: 600; }
.task-today { color: #10b981; font-weight: 600; }
.tasks-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; flex: 1; color: var(--muted); }
.task-footer { display: flex; justify-content: space-between; align-items: center; }
.task-quick-add-btn { background: none; border: none; color: var(--accent); cursor: pointer; padding: 4px 8px; font-size: 12px; opacity: 0.8; }
.task-quick-add-btn:hover { opacity: 1; }
`;

function dueBucket(d?: string): { text: string; class: string } {
  if (!d) return { text: '', class: '' };
  
  // Extract just the date part (YYYY-MM-DD) from whatever format we receive
  const dateOnly = d.slice(0, 10);
  
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  
  if (dateOnly < today) return { text: 'Overdue', class: 'task-overdue' };
  if (dateOnly === today) return { text: 'Due Today', class: 'task-today' };
  if (dateOnly === tomorrow) return { text: 'Due Tomorrow', class: '' };
  
  // Parse the date correctly and format for display
  const dueDate = new Date(dateOnly + 'T00:00:00');
  return { text: `Due ${dueDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`, class: '' };
}

function renderTask(t: Task): string {
  const pri = PRIORITY_COLORS[t.priority] || PRIORITY_COLORS[4];
  const priDot = `<span class="task-pri" style="color:${pri}">●</span>`;
  const checked = t.completed ? 'checked' : '';
  const strike = t.completed ? ' task-done' : '';
  const due = dueBucket(t.due_date);
  
  return `<div class="task-item${strike}" data-id="${t.id}">
    <label class="task-check"><input type="checkbox" ${checked} data-action="toggle" data-id="${t.id}"/></label>
    ${priDot}<span class="task-title" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</span>
    <div class="task-actions">
      <button class="task-action-btn" data-action="edit" data-id="${t.id}" title="Edit"><i class="fas fa-pen"></i></button>
      <button class="task-action-btn delete" data-action="delete" data-id="${t.id}" title="Delete"><i class="fas fa-trash"></i></button>
    </div>
    ${due.text || t.category ? `<div class="task-meta">
      ${due.text ? `<span class="${due.class}">${due.text}</span>` : ''}
      ${t.category ? `<span>📁 ${escapeHtml(t.category)}</span>` : ''}
      ${t.description ? `<span title="${escapeHtml(t.description)}">💬</span>` : ''}
    </div>` : ''}
  </div>`;
}

class TasksRenderer implements WidgetRenderer {
  private poller = new WidgetPoller();
  private tasks: Task[] = [];

  destroy() { this.poller.stopAll(); }
  configure(widget: Widget) { this.showConfigDialog(widget); }

  render(container: HTMLElement, widget: Widget) {
    injectWidgetStyles('tasks', TASKS_STYLES);
    const c = widget.content as TasksContent;
    this.poller.stop(widget.id);

    if (c.mode === 'todoist') {
      if (!c.todoistCredentialId) {
        const btn = renderConfigPrompt(container, '<i class="fa-solid fa-list-check"></i>', 'Configure Todoist', 'Select a Todoist credential to get started.');
        btn.addEventListener('click', () => this.showConfigDialog(widget));
        return;
      }
      this.renderTodoist(container, widget);
      return;
    }

    // Local mode (API-backed)
    this.renderLocal(container, widget);
  }

  /* ======================== LOCAL MODE (API) ======================== */

  private async fetchTasks(): Promise<Task[]> {
    try {
      const url = new URL('/api/tasks', getPingServerUrl());
      const res = await fetch(url.toString(), { headers: getAuthHeaders(false) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.tasks || [];
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
      throw err;
    }
  }

  private async createTask(taskData: Partial<Task>): Promise<Task> {
    const url = new URL('/api/tasks', getPingServerUrl());
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { ...getAuthHeaders(false), 'Content-Type': 'application/json' },
      body: JSON.stringify(taskData)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.task;
  }

  private async updateTask(id: number, updates: Partial<Task>): Promise<Task> {
    const url = new URL(`/api/tasks/${id}`, getPingServerUrl());
    const res = await fetch(url.toString(), {
      method: 'PUT',
      headers: { ...getAuthHeaders(false), 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.task;
  }

  private async deleteTask(id: number): Promise<void> {
    const url = new URL(`/api/tasks/${id}`, getPingServerUrl());
    const res = await fetch(url.toString(), {
      method: 'DELETE',
      headers: getAuthHeaders(false)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  private sortTasks(tasks: Task[], sortBy: SortBy, showCompleted: boolean = true): Task[] {
    let filtered = tasks;
    if (!showCompleted) {
      filtered = tasks.filter(t => !t.completed);
    }
    
    return [...filtered].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (sortBy === 'priority') {
        if (a.priority !== b.priority) return a.priority - b.priority;
      } else if (sortBy === 'due') {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        const cmp = a.due_date.localeCompare(b.due_date);
        if (cmp !== 0) return cmp;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }

  private renderLocal(container: HTMLElement, widget: Widget) {
    const c = widget.content as TasksContent;
    
    container.innerHTML = '<div class="tasks-root widget-loading centered">Loading tasks…</div>';
    
    const loadAndRender = async () => {
      try {
        this.tasks = await this.fetchTasks();
        const sorted = this.sortTasks(this.tasks, c.sortBy || 'priority', c.showCompleted !== false);
        const remaining = this.tasks.filter(t => !t.completed).length;
        
        container.innerHTML = `
          <div class="tasks-root">
            <div class="task-add">
              <input type="text" class="widget-dialog-input task-add-quick" placeholder="Quick add task…"/>
              <button class="btn btn-small btn-primary task-add-btn" title="Add Detailed Task"><i class="fas fa-plus"></i></button>
            </div>
            <div class="task-list">
              ${sorted.length ? sorted.map(renderTask).join('') : '<div class="tasks-empty"><i class="fas fa-check-circle"></i><p>No tasks yet</p></div>'}
            </div>
            <div class="task-footer">
              <subtitle>${remaining} task${remaining !== 1 ? 's' : ''} remaining</subtitle>
              <button class="task-quick-add-btn" data-action="add-detailed"><i class="fas fa-plus-circle"></i> New Task</button>
            </div>
          </div>`;
        
        stopAllDragPropagation(container);
        
        // Quick add (just title, default priority)
        const input = container.querySelector('.task-add-quick') as HTMLInputElement;
        const quickAdd = async () => {
          const title = input.value.trim();
          if (!title) return;
          input.disabled = true;
          try {
            await this.createTask({ title, priority: 4 });
            input.value = '';
            await loadAndRender();
          } catch (err) {
            alert('Failed to create task');
          } finally {
            input.disabled = false;
          }
        };
        
        input.addEventListener('keydown', e => { if (e.key === 'Enter') quickAdd(); });
        
        // Add detailed task button (header)
        container.querySelector('.task-add-btn')!.addEventListener('click', () => {
          this.showTaskDialog(widget, null, loadAndRender);
        });
        
        // Add detailed task button (footer)
        container.querySelector('[data-action="add-detailed"]')!.addEventListener('click', () => {
          this.showTaskDialog(widget, null, loadAndRender);
        });
        
        // Event delegation for actions
        container.querySelector('.task-list')!.addEventListener('click', async (e) => {
          const el = (e.target as HTMLElement).closest('[data-action]') as HTMLElement;
          if (!el) return;
          
          const id = parseInt(el.dataset.id!);
          const action = el.dataset.action!;
          
          if (action === 'toggle') {
            const task = this.tasks.find(t => t.id === id);
            if (!task) return;
            try {
              await this.updateTask(id, { completed: !task.completed });
              await loadAndRender();
            } catch (err) {
              alert('Failed to update task');
            }
          } else if (action === 'delete') {
            if (!confirm('Delete this task?')) return;
            try {
              await this.deleteTask(id);
              await loadAndRender();
            } catch (err) {
              alert('Failed to delete task');
            }
          } else if (action === 'edit') {
            const task = this.tasks.find(t => t.id === id);
            if (!task) return;
            this.showTaskDialog(widget, task, loadAndRender);
          }
        });
        
        //Double click to edit
        container.querySelector('.task-list')!.addEventListener('dblclick', (e) => {
          const item = (e.target as HTMLElement).closest('.task-item') as HTMLElement;
          if (!item) return;
          const id = parseInt(item.dataset.id!);
          const task = this.tasks.find(t => t.id === id);
          if (task) this.showTaskDialog(widget, task, loadAndRender);
        });
        
      } catch (err) {
        renderError(container, 'Tasks Error', err, 'Failed to load tasks');
      }
    };
    
    loadAndRender();
    
    // Poll for updates every 30 seconds
    this.poller.start(widget.id, loadAndRender, 30000);
  }

  /* ======================== TODOIST MODE ======================== */

  private renderTodoist(container: HTMLElement, widget: Widget) {
    container.innerHTML = '<div class="tasks-root widget-loading centered">Loading…</div>';
    const root = container.querySelector('.tasks-root') as HTMLElement;
    const c = widget.content as TasksContent;

    const fetchTasks = async () => {
      try {
        const url = new URL('/api/todoist/tasks', getPingServerUrl());
        url.searchParams.set('credentialId', c.todoistCredentialId!.toString());
        if (c.todoistFilter) url.searchParams.set('filter', c.todoistFilter);

        const res = await fetch(url.toString(), { headers: getAuthHeaders(false) });
        if (!res.ok) { 
          const e = await res.json().catch(() => ({})); 
          throw new Error((e as any).error || `HTTP ${res.status}`); 
        }
        const data: any[] = await res.json();

        // Map Todoist tasks to our Task shape
        const tasks: Task[] = data.map(t => ({
          id: t.id,
          user_id: 0,
          title: t.content,
          completed: t.is_completed || false,
          priority: 5 - (t.priority || 1),  // Todoist: 4=urgent, we: 1=urgent
          due_date: t.due?.date,
          created_at: t.created_at,
          updated_at: t.updated_at || t.created_at
        }));

        const sorted = this.sortTasks(tasks, c.sortBy || 'priority', c.showCompleted !== false);
        const remaining = tasks.filter(t => !t.completed).length;

        root.innerHTML = `
          <div class="task-list">${sorted.length ? sorted.map(renderTask).join('') : '<div class="tasks-empty"><i class="fas fa-check-circle"></i><p>All caught up!</p></div>'}</div>
          <subtitle class="task-footer">${remaining} task${remaining !== 1 ? 's' : ''} remaining</subtitle>`;

        stopAllDragPropagation(root);

        // Event delegation for complete (todoist - read-only mode, can only complete)
        root.querySelector('.task-list')!.addEventListener('click', async e => {
          const el = (e.target as HTMLElement).closest('[data-action="toggle"]') as HTMLElement;
          if (!el) return;
          const id = el.dataset.id!;
          try {
            const closeUrl = new URL('/api/todoist/close', getPingServerUrl());
            closeUrl.searchParams.set('credentialId', c.todoistCredentialId!.toString());
            closeUrl.searchParams.set('taskId', id);
            await fetch(closeUrl.toString(), { method: 'POST', headers: getAuthHeaders(false) });
            fetchTasks(); // Refresh immediately
          } catch { /* will refresh on next poll */ }
        });
      } catch (err) {
        renderError(root, 'Todoist Error', err, 'Check your Todoist credential');
      }
    };

    this.poller.start(widget.id, fetchTasks, (c.refreshInterval || 60) * 1000);
  }

  /* ======================== TASK DIALOG ======================== */

  private showTaskDialog(_widget: Widget, task: Task | null, onSave: () => void) {
    const overlay = document.createElement('div');
    overlay.className = 'widget-overlay';
    const dialog = document.createElement('div');
    dialog.className = 'widget-dialog';
    
    const isEdit = task !== null;
    
    dialog.innerHTML = `
      <h3 class="widget-dialog-title">${isEdit ? 'Edit Task' : 'New Task'}</h3>
      <div class="widget-dialog-field">
        <label class="widget-dialog-label">Title *</label>
        <input type="text" id="task-title" class="widget-dialog-input" value="${escapeHtml(task?.title || '')}" placeholder="Enter task title" required autofocus />
      </div>
      
      <div class="widget-dialog-field">
        <label class="widget-dialog-label">Description</label>
        <textarea id="task-description" class="widget-dialog-input" style="min-height: 80px; resize: vertical;" placeholder="Add details about this task">${escapeHtml(task?.description || '')}</textarea>
      </div>
      
      <div class="widget-dialog-field">
        <label class="widget-dialog-label">Priority</label>
        <select id="task-priority" class="widget-dialog-input">
          <option value="1" ${task?.priority === 1 ? 'selected' : ''}>🔴 Urgent</option>
          <option value="2" ${task?.priority === 2 ? 'selected' : ''}>🟠 High</option>
          <option value="3" ${task?.priority === 3 ? 'selected' : ''}>🟡 Medium</option>
          <option value="4" ${!task || task.priority === 4 ? 'selected' : ''}>⚪ Low</option>
        </select>
      </div>
      
      <div class="widget-dialog-field">
        <label class="widget-dialog-label">Due Date</label>
        <input type="date" id="task-due" class="widget-dialog-input" value="${task?.due_date || ''}" />
      </div>
      
      <div class="widget-dialog-field large-margin">
        <label class="widget-dialog-label">Category</label>
        <input type="text" id="task-category" class="widget-dialog-input" value="${escapeHtml(task?.category || '')}" placeholder="e.g., Work, Personal, Shopping" />
      </div>
      
      <div class="widget-dialog-buttons">
        <div id="task-cancel" class="btn btn-small btn-secondary">Cancel</div>
        <div id="task-save" class="btn btn-small btn-primary">${isEdit ? 'Save' : 'Create Task'}</div>
      </div>
    `;
    
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    stopAllDragPropagation(dialog);
    
    const close = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    
    const cancelBtn = dialog.querySelector('#task-cancel') as HTMLElement;
    const saveBtn = dialog.querySelector('#task-save') as HTMLElement;
    
    cancelBtn.onclick = close;
    
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
    
    saveBtn.onclick = async () => {
      const title = (dialog.querySelector('#task-title') as HTMLInputElement).value.trim();
      const description = (dialog.querySelector('#task-description') as HTMLTextAreaElement).value.trim();
      const priority = parseInt((dialog.querySelector('#task-priority') as HTMLSelectElement).value);
      const due_date = (dialog.querySelector('#task-due') as HTMLInputElement).value || undefined;
      const category = (dialog.querySelector('#task-category') as HTMLInputElement).value.trim() || undefined;
      
      if (!title) {
        alert('Task title is required');
        return;
      }
      
      try {
        if (isEdit) {
          await this.updateTask(task.id, { title, description, priority, due_date, category });
        } else {
          await this.createTask({ title, description, priority, due_date, category });
        }
        close();
        document.removeEventListener('keydown', escHandler);
        onSave();
      } catch (err) {
        alert(`Failed to ${isEdit ? 'update' : 'create'} task`);
      }
    };
    
    // Focus title input
    setTimeout(() => {
      (dialog.querySelector('#task-title') as HTMLInputElement).focus();
    }, 100);
  }

  /* ======================== CONFIG ======================== */

  private showConfigDialog(widget: Widget) {
    const c = widget.content as TasksContent;
    const overlay = document.createElement('div');
    overlay.className = 'widget-overlay';
    const dialog = document.createElement('div');
    dialog.className = 'widget-dialog';
    const isTodoist = c.mode === 'todoist';
    dialog.innerHTML = `
      <h3 class="widget-dialog-title">Task List Configuration</h3>
      <div class="widget-dialog-field">
        <label class="widget-dialog-label">Mode</label>
        <select id="task-mode" class="widget-dialog-input">
          <option value="local" ${!isTodoist ? 'selected' : ''}>Local (Shared across all widgets)</option>
          <option value="todoist" ${isTodoist ? 'selected' : ''}>Todoist</option>
        </select>
      </div>
      <div id="todoist-fields" class="${isTodoist ? '' : 'hidden'}">
        <div class="widget-dialog-field">
          <label class="widget-dialog-label">Todoist Credential *</label>
          <select id="task-cred" class="widget-dialog-input"><option value="">Select credential…</option></select>
        </div>
        <div class="widget-dialog-field">
          <label class="widget-dialog-label">Filter</label>
          <input type="text" id="task-filter" value="${escapeHtml(c.todoistFilter || '')}" placeholder="e.g. today | overdue" class="widget-dialog-input"/>
          <small class="widget-dialog-hint">Todoist filter syntax</small>
        </div>
        <div class="widget-dialog-field">
          <label class="widget-dialog-label">Refresh Interval (seconds)</label>
          <input type="number" id="task-interval" value="${c.refreshInterval || 60}" min="10" max="600" class="widget-dialog-input"/>
        </div>
      </div>
      <div class="widget-dialog-field">
        <label class="widget-dialog-label">Sort By</label>
        <select id="task-sort" class="widget-dialog-input">
          <option value="priority" ${c.sortBy !== 'due' && c.sortBy !== 'created' ? 'selected' : ''}>Priority</option>
          <option value="due" ${c.sortBy === 'due' ? 'selected' : ''}>Due Date</option>
          <option value="created" ${c.sortBy === 'created' ? 'selected' : ''}>Created Date</option>
        </select>
      </div>
      <div class="widget-dialog-field large-margin">
        <label class="widget-dialog-label">
          <input type="checkbox" id="task-show-completed" ${c.showCompleted !== false ? 'checked' : ''} />
          Show completed tasks
        </label>
      </div>
      <div class="widget-dialog-buttons">
        <div id="task-config-cancel" class="btn btn-small btn-secondary">Cancel</div>
        <div id="task-config-save" class="btn btn-small btn-primary">Save</div>
      </div>
    `;
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const modeSelect = dialog.querySelector('#task-mode') as HTMLSelectElement;
    const todoistSection = dialog.querySelector('#todoist-fields') as HTMLElement;
    modeSelect.addEventListener('change', () => { 
      if (modeSelect.value === 'todoist') {
        todoistSection.classList.remove('hidden');
      } else {
        todoistSection.classList.add('hidden');
      }
    });

    populateCredentialSelect(dialog.querySelector('#task-cred')!, 'todoist', c.todoistCredentialId);
    stopAllDragPropagation(dialog);

    const close = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    
    const cancelBtn = dialog.querySelector('#task-config-cancel') as HTMLElement;
    const saveBtn = dialog.querySelector('#task-config-save') as HTMLElement;
    
    cancelBtn.onclick = close;
    
    document.addEventListener('keydown', function esc(e) { 
      if (e.key === 'Escape') { 
        close(); 
        document.removeEventListener('keydown', esc); 
      } 
    });

    saveBtn.onclick = () => {
      const mode = modeSelect.value as 'local' | 'todoist';
      const credVal = (dialog.querySelector('#task-cred') as HTMLSelectElement).value;
      const showCompleted = (dialog.querySelector('#task-show-completed') as HTMLInputElement).checked;
      
      dispatchWidgetUpdate(widget.id, {
        ...c,
        mode,
        todoistCredentialId: mode === 'todoist' && credVal ? parseInt(credVal) : undefined,
        todoistFilter: (dialog.querySelector('#task-filter') as HTMLInputElement).value.trim() || undefined,
        refreshInterval: parseInt((dialog.querySelector('#task-interval') as HTMLInputElement).value) || 60,
        sortBy: (dialog.querySelector('#task-sort') as HTMLSelectElement).value as SortBy,
        showCompleted
      } as TasksContent);
      close();
    };
  }
}

export const widget: WidgetPlugin = {
  type: 'tasks',
  name: 'Task List',
  icon: '<i class="fa-solid fa-list-check"></i>',
  description: 'Manage tasks with priorities, due dates, and categories',
  renderer: new TasksRenderer(),
  defaultSize: { w: 420, h: 550 },
  defaultContent: { mode: 'local', sortBy: 'priority', showCompleted: true } as TasksContent,
  hasSettings: true
};
