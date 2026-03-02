import type { Widget, TasksContent } from '../types/types';
import type { WidgetRenderer, WidgetPlugin } from '../types/base-widget';
import { stopAllDragPropagation, dispatchWidgetUpdate, escapeHtml, injectWidgetStyles } from '../utils/dom';
import { getPingServerUrl, getAuthHeaders } from '../utils/api';
import { WidgetPoller } from '../utils/polling';
import { renderConfigPrompt, renderError } from '../utils/widgetRendering';
import { populateCredentialSelect } from '../utils/credentials';

type Task = NonNullable<TasksContent['localTasks']>[number];
type SortBy = NonNullable<TasksContent['sortBy']>;

const PRIORITY_COLORS: Record<number, string> = { 1: '#ef4444', 2: '#f97316', 3: '#fbbf24' };

const TASKS_STYLES = `
.tasks-root { display: flex; flex-direction: column; height: 100%; padding: 8px 12px; gap: 8px; }
.task-add { display: flex; gap: 6px; }
.task-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
.task-item { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 6px 4px; border-radius: var(--radius); transition: background 0.15s; }
.task-item:hover { background: var(--hover); }
.task-check input { width: 16px; height: 16px; cursor: pointer; accent-color: var(--accent); }
.task-title { flex: 1; min-width: 0; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.task-done .task-title { text-decoration: line-through; opacity: 0.5; }
.task-del { background: none; border: none; color: var(--muted); cursor: pointer; opacity: 0; padding: 2px 4px; font-size: 12px; transition: opacity 0.15s; }
.task-item:hover .task-del { opacity: 0.6; }
.task-del:hover { opacity: 1 !important; color: #ef4444; }
.task-meta { width: 100%; padding-left: 28px; font-size: 11px; color: var(--muted); }
.task-overdue { color: #ef4444; font-weight: 600; }
.tasks-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; flex: 1; color: var(--muted); }
`;

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function taskSorter(sortBy: SortBy) {
  return (a: Task, b: Task) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (sortBy === 'priority') return a.priority - b.priority || a.createdAt - b.createdAt;
    if (sortBy === 'due') {
      if (!a.dueDate && !b.dueDate) return a.createdAt - b.createdAt;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    }
    return a.createdAt - b.createdAt;
  };
}

function dueBucket(d?: string): string {
  if (!d) return '';
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  if (d < today) return 'Overdue';
  if (d === today) return 'Today';
  if (d === tomorrow) return 'Tomorrow';
  return new Date(d + 'T00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function renderTask(t: Task): string {
  const pri = PRIORITY_COLORS[t.priority] || '';
  const priDot = pri ? `<span class="task-pri" style="color:${pri}">●</span>` : '';
  const checked = t.completed ? 'checked' : '';
  const strike = t.completed ? ' task-done' : '';
  const due = dueBucket(t.dueDate);
  const dueClass = due === 'Overdue' ? ' task-overdue' : '';
  return `<div class="task-item${strike}" data-id="${t.id}">
    <label class="task-check"><input type="checkbox" ${checked} data-action="toggle" data-id="${t.id}"/></label>
    ${priDot}<span class="task-title">${escapeHtml(t.title)}</span>
    <button class="task-del" data-action="delete" data-id="${t.id}" title="Delete"><i class="fas fa-times"></i></button>
    ${due || t.category ? `<div class="task-meta">${due ? `<span class="${dueClass}">${due}</span>` : ''}${t.category ? ` · ${escapeHtml(t.category)}` : ''}</div>` : ''}
  </div>`;
}

class TasksRenderer implements WidgetRenderer {
  private poller = new WidgetPoller();

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

    // Local mode
    this.renderLocal(container, widget);
  }

  /* ======================== LOCAL MODE ======================== */

  private renderLocal(container: HTMLElement, widget: Widget) {
    const c = widget.content as TasksContent;
    const tasks = [...(c.localTasks || [])].sort(taskSorter(c.sortBy || 'priority'));
    const remaining = tasks.filter(t => !t.completed).length;

    container.innerHTML = `
      <div class="tasks-root">
        <div class="task-add"><input type="text" class="widget-dialog-input task-input" placeholder="Add a task…"/><button class="btn btn-small btn-primary task-add-btn">Add</button></div>
        <div class="task-list">${tasks.length ? tasks.map(renderTask).join('') : '<div class="tasks-empty"><i class="fas fa-check-circle"></i><p>All caught up!</p></div>'}</div>
        <subtitle class="task-footer">${remaining} task${remaining !== 1 ? 's' : ''} remaining</subtitle>
      </div>`;

    stopAllDragPropagation(container);

    // Quick-add
    const input = container.querySelector('.task-input') as HTMLInputElement;
    const addTask = () => {
      const title = input.value.trim();
      if (!title) return;
      const tasks = [...(c.localTasks || [])];
      tasks.push({ id: uid(), title, completed: false, priority: 4, createdAt: Date.now() });
      dispatchWidgetUpdate(widget.id, { ...c, localTasks: tasks });
    };
    container.querySelector('.task-add-btn')!.addEventListener('click', addTask);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') addTask(); });

    // Event delegation for toggle/delete
    container.querySelector('.task-list')!.addEventListener('click', e => {
      const el = (e.target as HTMLElement).closest('[data-action]') as HTMLElement;
      if (!el) return;
      const id = el.dataset.id!;
      const action = el.dataset.action!;
      let tasks = [...(c.localTasks || [])];
      if (action === 'toggle') {
        tasks = tasks.map(t => t.id === id ? { ...t, completed: !t.completed, completedAt: t.completed ? undefined : Date.now() } : t);
      } else if (action === 'delete') {
        tasks = tasks.filter(t => t.id !== id);
      }
      dispatchWidgetUpdate(widget.id, { ...c, localTasks: tasks });
    });
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
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || `HTTP ${res.status}`); }
        const data: any[] = await res.json();

        // Map Todoist tasks to our local Task shape for rendering reuse
        const tasks: Task[] = data.map(t => ({
          id: t.id, title: t.content, completed: t.is_completed || false,
          priority: 5 - (t.priority || 1),  // Todoist: 4=urgent, we: 1=urgent
          dueDate: t.due?.date, createdAt: new Date(t.created_at).getTime()
        })).sort(taskSorter(c.sortBy || 'priority'));

        const remaining = tasks.filter(t => !t.completed).length;
        root.innerHTML = `
          <div class="task-list">${tasks.length ? tasks.map(renderTask).join('') : '<div class="tasks-empty"><i class="fas fa-check-circle"></i><p>All caught up!</p></div>'}</div>
          <subtitle class="task-footer">${remaining} task${remaining !== 1 ? 's' : ''} remaining</subtitle>`;

        stopAllDragPropagation(root);

        // Event delegation for complete (todoist)
        root.querySelector('.task-list')!.addEventListener('click', async e => {
          const el = (e.target as HTMLElement).closest('[data-action="toggle"]') as HTMLElement;
          if (!el) return;
          const id = el.dataset.id!;
          try {
            const closeUrl = new URL('/api/todoist/close', getPingServerUrl());
            closeUrl.searchParams.set('credentialId', c.todoistCredentialId!.toString());
            closeUrl.searchParams.set('taskId', id);
            await fetch(closeUrl.toString(), { method: 'POST', headers: getAuthHeaders(false) });
          } catch { /* will refresh on next poll */ }
        });
      } catch (err) {
        renderError(root, 'Todoist Error', err, 'Check your Todoist credential');
      }
    };

    this.poller.start(widget.id, fetchTasks, (c.refreshInterval || 60) * 1000);
  }

  /* ======================== CONFIG ======================== */

  private showConfigDialog(widget: Widget) {
    const c = widget.content as TasksContent;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay widget-overlay';
    const modal = document.createElement('div');
    modal.className = 'modal widget-dialog';
    const isTodoist = c.mode === 'todoist';
    modal.innerHTML = `
      <h2 class="widget-dialog-title">Task List Configuration</h2>
      <form id="task-form" class="flex flex-column gap-16">
        <div>
          <label class="widget-dialog-label">Mode</label>
          <select id="task-mode" class="widget-dialog-input">
            <option value="local" ${!isTodoist ? 'selected' : ''}>Local (no account needed)</option>
            <option value="todoist" ${isTodoist ? 'selected' : ''}>Todoist</option>
          </select>
        </div>
        <div id="todoist-fields" class="flex flex-column gap-16 ${isTodoist ? '' : 'hidden'}">
          <div>
            <label class="widget-dialog-label">Todoist Credential *</label>
            <select id="task-cred" class="widget-dialog-input"><option value="">Select credential…</option></select>
          </div>
          <div>
            <label class="widget-dialog-label">Filter</label>
            <input type="text" id="task-filter" value="${escapeHtml(c.todoistFilter || '')}" placeholder="e.g. today | overdue" class="widget-dialog-input"/>
            <small class="widget-dialog-hint">Todoist filter syntax</small>
          </div>
          <div>
            <label class="widget-dialog-label">Refresh Interval (seconds)</label>
            <input type="number" id="task-interval" value="${c.refreshInterval || 60}" min="10" max="600" class="widget-dialog-input"/>
          </div>
        </div>
        <div>
          <label class="widget-dialog-label">Sort By</label>
          <select id="task-sort" class="widget-dialog-input">
            <option value="priority" ${c.sortBy !== 'due' && c.sortBy !== 'created' ? 'selected' : ''}>Priority</option>
            <option value="due" ${c.sortBy === 'due' ? 'selected' : ''}>Due Date</option>
            <option value="created" ${c.sortBy === 'created' ? 'selected' : ''}>Created</option>
          </select>
        </div>
        <div class="widget-dialog-buttons">
          <button type="submit" class="widget-dialog-button-save full-width">Save</button>
          <button type="button" id="task-cancel" class="widget-dialog-button-cancel full-width">Cancel</button>
        </div>
      </form>`;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const modeSelect = modal.querySelector('#task-mode') as HTMLSelectElement;
    const todoistSection = modal.querySelector('#todoist-fields') as HTMLElement;
    modeSelect.addEventListener('change', () => { 
      if (modeSelect.value === 'todoist') {
        todoistSection.classList.remove('hidden');
      } else {
        todoistSection.classList.add('hidden');
      }
    });

    populateCredentialSelect(modal.querySelector('#task-cred')!, 'todoist', c.todoistCredentialId);
    stopAllDragPropagation(modal);

    const close = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    modal.querySelector('#task-cancel')!.addEventListener('click', close);
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } });

    modal.querySelector('#task-form')!.addEventListener('submit', e => {
      e.preventDefault();
      const mode = modeSelect.value as 'local' | 'todoist';
      const credVal = (modal.querySelector('#task-cred') as HTMLSelectElement).value;
      dispatchWidgetUpdate(widget.id, {
        ...c,
        mode,
        todoistCredentialId: mode === 'todoist' && credVal ? parseInt(credVal) : undefined,
        todoistFilter: (modal.querySelector('#task-filter') as HTMLInputElement).value.trim() || undefined,
        refreshInterval: parseInt((modal.querySelector('#task-interval') as HTMLInputElement).value) || 60,
        sortBy: (modal.querySelector('#task-sort') as HTMLSelectElement).value as SortBy
      } as TasksContent);
      close();
    });
  }
}

export const widget: WidgetPlugin = {
  type: 'tasks',
  name: 'Task List',
  icon: '<i class="fa-solid fa-list-check"></i>',
  description: 'Manage tasks locally or via Todoist',
  renderer: new TasksRenderer(),
  defaultSize: { w: 380, h: 500 },
  defaultContent: { mode: 'local', localTasks: [], sortBy: 'priority' } as TasksContent,
  hasSettings: true
};
