/**
 * Task Command Center - Dashboard Application
 *
 * Handles task display, filtering, drag & drop, and interactions.
 */

// ============================================================
// STATE
// ============================================================

const state = {
    tasks: [],
    skills: [],
    agents: [],
    healthLog: [],
    filters: {
        source: 'all',
        status: 'all',
        search: ''
    },
    recentFixes: [],
    viewMode: 'board', // 'board' or 'list'
    healthCheckRunning: false,
    dragData: null // For tracking skill/agent drags
};

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
    dataPath: 'data/tasks.json',
    refreshInterval: 60000, // 1 minute
    toastDuration: 3000,
    localServerUrl: 'http://127.0.0.1:3847',
    serverCheckInterval: 30000 // Check server status every 30 seconds
};

// Server connectivity state
let serverAvailable = false;

/**
 * Check if local server is running
 */
async function checkServerStatus() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);

        const response = await fetch(`${CONFIG.localServerUrl}/api/status`, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
            const data = await response.json();
            serverAvailable = data.success === true;
            updateServerStatusUI();
            return serverAvailable;
        }
    } catch (error) {
        serverAvailable = false;
        updateServerStatusUI();
    }
    return false;
}

/**
 * Update UI to show server status
 */
function updateServerStatusUI() {
    let indicator = document.getElementById('serverStatusIndicator');
    if (!indicator) {
        // Create server status indicator in header
        const headerActions = document.querySelector('.header-actions');
        if (headerActions) {
            indicator = document.createElement('span');
            indicator.id = 'serverStatusIndicator';
            indicator.className = 'server-status';
            indicator.title = 'Local server status';
            headerActions.insertBefore(indicator, headerActions.firstChild);
        }
    }

    if (indicator) {
        if (serverAvailable) {
            indicator.innerHTML = '🟢';
            indicator.title = 'Local server running - Tasks can execute directly';
            indicator.className = 'server-status online';
        } else {
            indicator.innerHTML = '🔴';
            indicator.title = 'Local server offline - Run start-server.bat to enable task execution';
            indicator.className = 'server-status offline';
        }
    }
}

// ============================================================
// UTILITIES
// ============================================================

/**
 * Format date for display
 */
function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('he-IL', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Format relative time
 */
function formatRelativeTime(dateStr) {
    if (!dateStr) return 'לא ידוע';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return 'עכשיו';
    if (diffMin < 60) return `לפני ${diffMin} דקות`;
    if (diffMin < 1440) return `לפני ${Math.floor(diffMin / 60)} שעות`;
    return `לפני ${Math.floor(diffMin / 1440)} ימים`;
}

/**
 * Get status display info
 */
function getStatusInfo(status) {
    const statuses = {
        pending: { text: 'ממתין', icon: '⏳', class: 'pending' },
        in_progress: { text: 'בביצוע', icon: '🔄', class: 'in_progress' },
        completed: { text: 'הושלם', icon: '✅', class: 'completed' },
        failed: { text: 'נכשל', icon: '❌', class: 'failed' }
    };
    return statuses[status] || statuses.pending;
}

/**
 * Get source display info
 */
function getSourceInfo(source) {
    const sources = {
        scheduled: { text: 'מתוזמן', icon: '📅' },
        session: { text: 'סשן', icon: '📋' },
        project: { text: 'פרויקט', icon: '📁' }
    };
    return sources[source] || { text: source, icon: '📄' };
}

// ============================================================
// DATA LOADING
// ============================================================

/**
 * Load tasks from JSON file
 */
async function loadTasks() {
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
        // Try loading from data folder first
        let response = await fetch(CONFIG.dataPath, { signal: controller.signal });

        if (!response.ok) {
            // Try loading from parent directory (for local testing)
            response = await fetch('../unified-tasks.json', { signal: controller.signal });
        }

        if (!response.ok) {
            throw new Error('Failed to load tasks');
        }

        const data = await response.json();
        state.tasks = data.tasks || [];

        // Load saved task assignments from localStorage
        loadTaskAssignments();

        // Merge pending local tasks (not yet synced to server)
        loadPendingLocalTasks();

        // Update statistics
        updateStatistics(data.statistics);

        // Update last sync time
        if (data.last_aggregated) {
            document.getElementById('lastCheck').textContent =
                formatRelativeTime(data.last_aggregated);
        }

        renderTasks();
        hideLoading();

    } catch (error) {
        console.error('Error loading tasks:', error);
        if (error.name === 'AbortError') {
            showToast('טעינת משימות לקחה יותר מדי זמן', 'warning');
        } else {
            showToast('שגיאה בטעינת משימות', 'error');
        }
        hideLoading();

        // Show sample data for demo
        loadSampleData();
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Load sample data for demo
 */
function loadSampleData() {
    state.tasks = [
        {
            id: 'sched_SkillsCheatSheet',
            source: 'scheduled',
            type: 'scheduled',
            subject: 'יצירת תמונת צ\'יט-שיט לכישורים',
            status: 'failed',
            last_result: 'claude not found in PATH',
            schedule: { type: 'once', time: '2026-01-29T23:16:04' }
        },
        {
            id: 'session_italy_1',
            source: 'session',
            type: 'task',
            subject: 'חיפוש טיסות TLV→Rome',
            status: 'pending',
            project: 'Italy 2026'
        },
        {
            id: 'session_italy_2',
            source: 'session',
            type: 'task',
            subject: 'הזמנת מלון בפירנצה',
            status: 'completed',
            project: 'Italy 2026'
        }
    ];

    updateStatistics({
        total: 3,
        by_status: { pending: 1, in_progress: 0, completed: 1, failed: 1 },
        by_source: { scheduled: 1, session: 2, project: 0 }
    });

    renderTasks();
}

/**
 * Update statistics display
 */
function updateStatistics(stats) {
    if (!stats) return;

    document.getElementById('totalTasks').textContent = stats.total || 0;
    document.getElementById('pendingTasks').textContent =
        (stats.by_status?.pending || 0) + (stats.by_status?.in_progress || 0);
    document.getElementById('failedTasks').textContent = stats.by_status?.failed || 0;
    document.getElementById('completedTasks').textContent = stats.by_status?.completed || 0;

    // Update health banner
    const healthBanner = document.getElementById('healthBanner');
    const healthStatus = document.getElementById('healthStatus');
    const failedCount = stats.by_status?.failed || 0;

    if (failedCount > 0) {
        healthBanner.classList.add('warning');
        healthBanner.classList.remove('error');
        healthStatus.textContent = `${failedCount} נכשלו`;
        document.querySelector('.health-icon').textContent = '⚠️';
    } else {
        healthBanner.classList.remove('warning', 'error');
        healthStatus.textContent = 'תקין';
        document.querySelector('.health-icon').textContent = '✅';
    }
}

/**
 * Hide loading spinner
 */
function hideLoading() {
    const loading = document.getElementById('tasksLoading');
    if (loading) loading.style.display = 'none';
}

// ============================================================
// RENDERING
// ============================================================

/**
 * Render tasks - Board or List view
 */
function renderTasks() {
    const container = document.getElementById('boardContainer');
    const filteredTasks = filterTasks(state.tasks);

    if (filteredTasks.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="width: 100%; text-align: center; padding: 40px;">
                <p>אין משימות להציג</p>
            </div>
        `;
        return;
    }

    if (state.viewMode === 'board') {
        renderBoardView(filteredTasks);
    } else {
        renderListView(filteredTasks);
    }

    // Setup drag and drop for tasks and skill/agent assignment
    setupDragAndDrop();
    setupSkillAgentDragAndDrop();
}

/**
 * Render Trello-style board view
 */
function renderBoardView(tasks) {
    const container = document.getElementById('boardContainer');

    // Group tasks by session/project
    const grouped = groupTasksBySession(tasks);

    let html = '';

    for (const [sessionId, sessionData] of Object.entries(grouped)) {
        const columnClass = sessionData.source || 'session';
        html += `
            <div class="board-column ${columnClass}" data-session="${sessionId}">
                <div class="column-header">
                    <span class="column-title">
                        ${sessionData.icon} ${sessionData.name}
                    </span>
                    <span class="column-count">${sessionData.tasks.length}</span>
                </div>
                <div class="column-cards" data-session="${sessionId}">
                    ${sessionData.tasks.map(task => renderTaskCard(task)).join('')}
                </div>
                <div class="column-footer">
                    <button class="add-task-btn" onclick="addTaskToSession('${sessionId}')">
                        + הוסף משימה
                    </button>
                </div>
            </div>
        `;
    }

    container.innerHTML = html;
}

/**
 * Render list view (fallback)
 */
function renderListView(tasks) {
    const container = document.getElementById('boardContainer');
    const grouped = groupTasksBySource(tasks);

    let html = '<div class="tasks-container" style="width: 100%;">';

    for (const [source, sourceTasks] of Object.entries(grouped)) {
        const sourceInfo = getSourceInfo(source);
        html += `
            <div class="task-group">
                <h4 class="task-group-title">${sourceInfo.icon} ${sourceInfo.text}</h4>
                ${sourceTasks.map(task => renderTaskCard(task)).join('')}
            </div>
        `;
    }

    html += '</div>';
    container.innerHTML = html;
}

/**
 * Group tasks by session/project for Trello view
 */
function groupTasksBySession(tasks) {
    const groups = {};

    // First, create scheduled column
    const scheduledTasks = tasks.filter(t => t.source === 'scheduled');
    if (scheduledTasks.length > 0) {
        groups['_scheduled'] = {
            name: 'מתוזמנות',
            icon: '📅',
            source: 'scheduled',
            tasks: scheduledTasks
        };
    }

    // Group by project/session
    tasks.filter(t => t.source !== 'scheduled').forEach(task => {
        const sessionId = task.session_id || task.project || task.source || 'general';

        if (!groups[sessionId]) {
            groups[sessionId] = {
                name: getSessionName(task),
                icon: getSessionIcon(task),
                source: task.source,
                tasks: []
            };
        }
        groups[sessionId].tasks.push(task);
    });

    return groups;
}

/**
 * Get display name for session
 */
function getSessionName(task) {
    if (task.project) return task.project;
    if (task.session_id) return task.session_id.replace(/-/g, ' ');
    if (task.source === 'session') return 'סשן נוכחי';
    if (task.source === 'project') return 'פרויקט';
    return 'כללי';
}

/**
 * Get icon for session type
 */
function getSessionIcon(task) {
    if (task.source === 'project') return '📁';
    if (task.source === 'session') return '📋';
    return '📄';
}

/**
 * Render single task card
 */
function renderTaskCard(task) {
    const statusInfo = getStatusInfo(task.status);
    const projectName = task.project_name || task.project || '';
    const lastUpdated = task.last_updated ? formatRelativeTime(task.last_updated) : '';
    const isLocal = task._local || task._pendingSync;

    // Build assignment badges
    let assignmentBadges = '';
    if (task.assigned_skill || task.assigned_agent) {
        assignmentBadges = '<div class="task-assignments">';
        if (task.assigned_skill) {
            assignmentBadges += `
                <span class="assignment-badge skill">
                    ⚡ ${escapeHtml(task.assigned_skill)}
                    <span class="remove-badge" onclick="event.stopPropagation(); removeAssignment('${task.id}', 'skill')">×</span>
                </span>
            `;
        }
        if (task.assigned_agent) {
            assignmentBadges += `
                <span class="assignment-badge agent">
                    🤖 ${escapeHtml(task.assigned_agent)}
                    <span class="remove-badge" onclick="event.stopPropagation(); removeAssignment('${task.id}', 'agent')">×</span>
                </span>
            `;
        }
        assignmentBadges += '</div>';
    }

    return `
        <div class="task-card status-${task.status} ${isLocal ? 'local-task' : ''}"
             draggable="true"
             data-task-id="${task.id}"
             onclick="openTaskDetails('${task.id}')"
             ondragover="handleTaskDragOver(event)"
             ondragleave="handleTaskDragLeave(event)"
             ondrop="handleTaskDrop(event)">
            <div class="task-header">
                <span class="task-status ${statusInfo.class}">${statusInfo.icon} ${statusInfo.text}</span>
                ${isLocal ? '<span class="task-local-badge">📱 Local</span>' : ''}
                ${lastUpdated ? `<span class="task-time">${lastUpdated}</span>` : ''}
            </div>
            <div class="task-title">${escapeHtml(task.subject)}</div>
            ${task.last_result && task.status === 'failed' ?
                `<div class="task-error">❌ ${escapeHtml(task.last_result.substring(0, 80))}...</div>` : ''}
            ${assignmentBadges}
            <div class="task-actions">
                ${task.status === 'failed' ?
                    `<button class="btn btn-small btn-primary" onclick="event.stopPropagation(); retryTask('${task.id}')">🔄</button>` : ''}
                <button class="btn btn-small btn-secondary" onclick="event.stopPropagation(); editTask('${task.id}')">✏️</button>
                ${task.status !== 'completed' ?
                    `<button class="btn btn-small btn-secondary" onclick="event.stopPropagation(); startTask('${task.id}')">▶️</button>` : ''}
            </div>
        </div>
    `;
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Filter tasks based on current filters
 */
function filterTasks(tasks) {
    return tasks.filter(task => {
        // Source filter
        if (state.filters.source !== 'all' && task.source !== state.filters.source) {
            return false;
        }

        // Status filter
        if (state.filters.status !== 'all' && task.status !== state.filters.status) {
            return false;
        }

        // Search filter
        if (state.filters.search) {
            const searchLower = state.filters.search.toLowerCase();
            const matchSubject = task.subject?.toLowerCase().includes(searchLower);
            const matchProject = task.project?.toLowerCase().includes(searchLower);
            const matchDesc = task.description?.toLowerCase().includes(searchLower);
            if (!matchSubject && !matchProject && !matchDesc) {
                return false;
            }
        }

        return true;
    });
}

/**
 * Group tasks by source
 */
function groupTasksBySource(tasks) {
    return tasks.reduce((groups, task) => {
        const source = task.source || 'other';
        if (!groups[source]) groups[source] = [];
        groups[source].push(task);
        return groups;
    }, {});
}

// ============================================================
// DRAG AND DROP (Tasks)
// ============================================================

function setupDragAndDrop() {
    const cards = document.querySelectorAll('.task-card');

    cards.forEach(card => {
        card.addEventListener('dragstart', handleTaskDragStart);
        card.addEventListener('dragend', handleTaskDragEnd);
    });

    // Setup column drop zones
    const columns = document.querySelectorAll('.column-cards');
    columns.forEach(column => {
        column.addEventListener('dragover', handleColumnDragOver);
        column.addEventListener('drop', handleColumnDrop);
    });
}

function handleTaskDragStart(e) {
    e.target.classList.add('dragging');
    state.dragData = {
        type: 'task',
        id: e.target.dataset.taskId
    };
    e.dataTransfer.setData('text/plain', JSON.stringify(state.dragData));
    e.dataTransfer.effectAllowed = 'move';
}

function handleTaskDragEnd(e) {
    e.target.classList.remove('dragging');
    state.dragData = null;
}

function handleColumnDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleColumnDrop(e) {
    e.preventDefault();
    let data = {};
    try {
        const str = (e.dataTransfer.getData('text/plain') || '').trim();
        data = str ? JSON.parse(str) : {};
    } catch (error) {
        console.error('Invalid drag data:', error);
        return;
    }

    if (data.type === 'task') {
        const taskId = data.id;
        const targetSession = e.currentTarget.dataset.session;
        showToast(`משימה הועברה ל-${targetSession}`, 'success');
    }
}

// ============================================================
// DRAG AND DROP (Skills & Agents to Tasks)
// ============================================================

function setupSkillAgentDragAndDrop() {
    // Make skills draggable - remove old listeners first to prevent duplicates (memory leak fix)
    const skillItems = document.querySelectorAll('.skills-list li');
    skillItems.forEach(item => {
        item.removeEventListener('dragstart', handleSkillDragStart);
        item.removeEventListener('dragend', handleSkillDragEnd);
        item.draggable = true;
        item.addEventListener('dragstart', handleSkillDragStart);
        item.addEventListener('dragend', handleSkillDragEnd);
    });

    // Make agents draggable - remove old listeners first to prevent duplicates (memory leak fix)
    const agentCards = document.querySelectorAll('.agent-card');
    agentCards.forEach(card => {
        card.removeEventListener('dragstart', handleAgentDragStart);
        card.removeEventListener('dragend', handleAgentDragEnd);
        card.draggable = true;
        card.addEventListener('dragstart', handleAgentDragStart);
        card.addEventListener('dragend', handleAgentDragEnd);
    });
}

function handleSkillDragStart(e) {
    // Use currentTarget to ensure we get the draggable element, not a child
    const target = e.currentTarget || e.target;
    const skillId = target.dataset.skillId || (target.querySelector('.skill-name')?.textContent?.replace('⚡ ', '') || '');

    if (!skillId) {
        console.warn('No skill ID found for drag');
        return;
    }

    state.dragData = {
        type: 'skill',
        id: skillId
    };
    target.classList.add('dragging');
    e.dataTransfer.setData('text/plain', JSON.stringify(state.dragData));
    e.dataTransfer.effectAllowed = 'copy';
}

function handleSkillDragEnd(e) {
    const target = e.currentTarget || e.target;
    target.classList.remove('dragging');
    state.dragData = null;
    // Remove all drop-target highlights
    document.querySelectorAll('.task-card.drop-target').forEach(card => {
        card.classList.remove('drop-target');
    });
}

function handleAgentDragStart(e) {
    // Use currentTarget to ensure we get the draggable element, not a child
    const target = e.currentTarget || e.target;
    const agentId = target.dataset.agentId || (target.querySelector('.agent-name')?.textContent || '');

    if (!agentId) {
        console.warn('No agent ID found for drag');
        return;
    }

    state.dragData = {
        type: 'agent',
        id: agentId
    };
    target.classList.add('dragging');
    e.dataTransfer.setData('text/plain', JSON.stringify(state.dragData));
    e.dataTransfer.effectAllowed = 'copy';
}

function handleAgentDragEnd(e) {
    const target = e.currentTarget || e.target;
    target.classList.remove('dragging');
    state.dragData = null;
    // Remove all drop-target highlights
    document.querySelectorAll('.task-card.drop-target').forEach(card => {
        card.classList.remove('drop-target');
    });
}

// Task drop handlers (for receiving skills/agents)
function handleTaskDragOver(e) {
    e.preventDefault();
    if (state.dragData && (state.dragData.type === 'skill' || state.dragData.type === 'agent')) {
        e.currentTarget.classList.add('drop-target');
        e.dataTransfer.dropEffect = 'copy';
    }
}

function handleTaskDragLeave(e) {
    e.currentTarget.classList.remove('drop-target');
}

function handleTaskDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drop-target');

    let data = {};
    try {
        const str = (e.dataTransfer.getData('text/plain') || '').trim();
        data = str ? JSON.parse(str) : {};
    } catch (error) {
        console.error('Invalid drag data:', error);
        return;
    }

    const taskId = e.currentTarget.dataset.taskId;
    if (!taskId) return;

    if (data.type === 'skill' && data.id) {
        assignSkillToTask(taskId, data.id);
    } else if (data.type === 'agent' && data.id) {
        assignAgentToTask(taskId, data.id);
    }
}

function assignSkillToTask(taskId, skillId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (task) {
        task.assigned_skill = skillId;
        saveTaskAssignment(taskId, 'skill', skillId);
        renderTasks();
        showToast(`כישור "${skillId}" הוקצה למשימה`, 'success');
    }
}

function assignAgentToTask(taskId, agentId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (task) {
        task.assigned_agent = agentId;
        saveTaskAssignment(taskId, 'agent', agentId);
        renderTasks();
        showToast(`סוכן "${agentId}" הוקצה למשימה`, 'success');
    }
}

function removeAssignment(taskId, type) {
    const task = state.tasks.find(t => t.id === taskId);
    if (task) {
        if (type === 'skill') {
            delete task.assigned_skill;
        } else if (type === 'agent') {
            delete task.assigned_agent;
        }
        saveTaskAssignment(taskId, type, null);
        renderTasks();
        showToast('הקצאה הוסרה', 'info');
    }
}

function saveTaskAssignment(taskId, type, value) {
    // Save to localStorage for persistence (with error handling)
    try {
        const assignments = JSON.parse(localStorage.getItem('task_assignments') || '{}');
        if (!assignments[taskId]) assignments[taskId] = {};

        if (value === null) {
            delete assignments[taskId][type];
        } else {
            assignments[taskId][type] = value;
        }

        localStorage.setItem('task_assignments', JSON.stringify(assignments));
    } catch (error) {
        console.error('Failed to save task assignment:', error);
        showToast('Failed to save assignment', 'error');
    }
}

function loadTaskAssignments() {
    try {
        const assignments = JSON.parse(localStorage.getItem('task_assignments') || '{}');

        state.tasks.forEach(task => {
            if (assignments[task.id]) {
                if (assignments[task.id].skill) {
                    task.assigned_skill = assignments[task.id].skill;
                }
                if (assignments[task.id].agent) {
                    task.assigned_agent = assignments[task.id].agent;
                }
            }
        });
    } catch (error) {
        console.error('Failed to load task assignments:', error);
    }
}

/**
 * Load pending local tasks that haven't been synced yet
 */
function loadPendingLocalTasks() {
    try {
        const pendingTasks = JSON.parse(localStorage.getItem('pending_new_tasks') || '[]');

        if (pendingTasks.length > 0) {
            console.log(`Loading ${pendingTasks.length} pending local tasks`);

            // Add pending tasks to the beginning of the list
            // Mark them as local so we know they need sync
            pendingTasks.forEach(task => {
                task._local = true;
                task._pendingSync = true;

                // Check if already exists (by id)
                const exists = state.tasks.some(t => t.id === task.id);
                if (!exists) {
                    state.tasks.unshift(task);
                }
            });
        }
    } catch (error) {
        console.error('Failed to load pending local tasks:', error);
    }
}

/**
 * Save a task locally (will be synced later)
 */
function saveTaskLocally(task) {
    try {
        const pendingTasks = JSON.parse(localStorage.getItem('pending_new_tasks') || '[]');

        // Remove if already exists (update)
        const index = pendingTasks.findIndex(t => t.id === task.id);
        if (index >= 0) {
            pendingTasks[index] = task;
        } else {
            pendingTasks.push(task);
        }

        localStorage.setItem('pending_new_tasks', JSON.stringify(pendingTasks));
    } catch (error) {
        console.error('Failed to save task locally:', error);
        showToast('Failed to save task locally', 'error');
    }
}

// ============================================================
// TASK ACTIONS
// ============================================================

function retryTask(taskId) {
    showToast(`מנסה שוב: ${taskId}`, 'info');
    // In real implementation, this would trigger the health check for this specific task
}

function editTask(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    // Open edit modal (simplified for now)
    showToast(`עריכת משימה: ${task.subject}`, 'info');
}

async function startTask(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    // Check if server is available
    if (serverAvailable) {
        // Execute via local server API
        try {
            showToast('Starting task...', 'info');

            const response = await fetch(`${CONFIG.localServerUrl}/api/run-task`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    taskId: task.id,
                    task: task.description || task.subject,
                    workingDir: task.working_dir || 'C:\\Users\\user\\Desktop',
                    skill: task.assigned_skill
                })
            });

            const result = await response.json();

            if (result.success) {
                showToast(`Task started! Run ID: ${result.runId}`, 'success');

                // Update task status locally
                task.status = 'in_progress';
                task.last_updated = new Date().toISOString();
                renderTasks();
            } else {
                showToast(`Failed: ${result.error}`, 'error');
            }
        } catch (error) {
            showToast(`Server error: ${error.message}`, 'error');
        }
    } else {
        // Fallback: Show command to run manually
        const workingDir = task.working_dir || 'C:\\Users\\user\\Desktop';
        const skill = task.assigned_skill ? `--skill ${task.assigned_skill}` : '';
        const taskDesc = (task.description || task.subject).replace(/"/g, '\\"');

        // Create command
        const command = `node ~/.claude/command-center/scripts/run-task.js "${taskDesc}" --dir "${workingDir}" ${skill}`.trim();

        // Show modal with command
        showRunTaskModal(task, command);
    }
}

function showRunTaskModal(task, command) {
    let modal = document.getElementById('runTaskModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'runTaskModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>▶️ הרץ משימה</h3>
                    <button class="modal-close" onclick="closeModal('runTaskModal')">&times;</button>
                </div>
                <div class="modal-body" id="runTaskModalBody"></div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeModal('runTaskModal')">סגור</button>
                    <button class="btn btn-primary" onclick="copyTaskCommand()">📋 העתק פקודה</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    document.getElementById('runTaskModalBody').innerHTML = `
        <p><strong>משימה:</strong> ${escapeHtml(task.subject)}</p>
        <p style="margin-top: 16px; color: var(--text-secondary);">
            הדאשבורד לא יכול להריץ משימות ישירות (אתר סטטי).<br>
            הרץ את הפקודה הבאה ב-Claude Code או Terminal:
        </p>
        <div style="background: #1E1E1E; color: #D4D4D4; padding: 12px; border-radius: 8px; margin-top: 12px; font-family: monospace; font-size: 12px; overflow-x: auto; direction: ltr; text-align: left;">
            <code id="taskCommandText">${escapeHtml(command)}</code>
        </div>
        <p style="margin-top: 16px; font-size: 12px; color: var(--text-muted);">
            <strong>או:</strong> הפעל בדיקת בריאות:<br>
            <code style="background: var(--bg-tertiary); padding: 4px 8px; border-radius: 4px;">
            %USERPROFILE%\\.claude\\command-center\\run-health-check.bat
            </code>
        </p>
    `;

    modal.classList.add('open');
}

function copyTaskCommand() {
    const commandText = document.getElementById('taskCommandText')?.textContent;
    if (commandText) {
        navigator.clipboard.writeText(commandText).then(() => {
            showToast('Command copied!', 'success');
        }).catch(() => {
            showToast('Failed to copy', 'error');
        });
    }
}

function addTaskToSession(sessionId) {
    // Open the new task modal with session pre-selected
    openModal('newTaskModal');
    // Could set a hidden field or state for the target session
    showToast(`Adding task to ${sessionId}`, 'info');
}

/**
 * Open task details modal
 */
function openTaskDetails(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    // Create or update the task details modal
    let modal = document.getElementById('taskDetailsModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'taskDetailsModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3 id="taskDetailsTitle">Task Details</h3>
                    <button class="modal-close" onclick="closeModal('taskDetailsModal')">&times;</button>
                </div>
                <div class="modal-body" id="taskDetailsBody">
                </div>
                <div class="modal-footer" id="taskDetailsFooter">
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // Populate skills dropdown options
    const skillOptions = state.skills.map(s =>
        `<option value="${escapeHtml(s.id)}" ${task.assigned_skill === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`
    ).join('');

    // Populate agent dropdown options
    const agentOptions = state.agents.map(a =>
        `<option value="${escapeHtml(a.id)}" ${task.assigned_agent === a.id ? 'selected' : ''}>${a.icon || '🤖'} ${escapeHtml(a.name)}</option>`
    ).join('');

    const statusInfo = getStatusInfo(task.status);
    const projectName = task.project_name || task.project || 'N/A';
    const lastUpdated = task.last_updated ? formatDate(task.last_updated) : 'N/A';
    const created = task.created ? formatDate(task.created) : 'N/A';

    document.getElementById('taskDetailsTitle').textContent = task.subject;
    document.getElementById('taskDetailsBody').innerHTML = `
        <div class="task-detail-row">
            <label>Status:</label>
            <span class="task-status ${statusInfo.class}">${statusInfo.icon} ${statusInfo.text}</span>
        </div>

        <div class="task-detail-row">
            <label>Project:</label>
            <span>${escapeHtml(projectName)}</span>
        </div>

        <div class="task-detail-row">
            <label>Description:</label>
            <p class="task-description">${escapeHtml(task.description || 'No description')}</p>
        </div>

        ${task.last_result ? `
        <div class="task-detail-row">
            <label>Last Result:</label>
            <p class="task-result ${task.status === 'failed' ? 'error' : ''}">${escapeHtml(task.last_result)}</p>
        </div>
        ` : ''}

        <div class="task-detail-row">
            <label>Assign Skill:</label>
            <select id="detailTaskSkill" class="filter-select" onchange="updateTaskAssignment('${task.id}', 'skill', this.value)">
                <option value="">None</option>
                ${skillOptions}
            </select>
        </div>

        <div class="task-detail-row">
            <label>Assign Agent:</label>
            <select id="detailTaskAgent" class="filter-select" onchange="updateTaskAssignment('${task.id}', 'agent', this.value)">
                <option value="">Auto</option>
                ${agentOptions}
            </select>
        </div>

        <div class="task-detail-meta">
            <span>Created: ${created}</span>
            <span>Updated: ${lastUpdated}</span>
        </div>
    `;

    document.getElementById('taskDetailsFooter').innerHTML = `
        <button class="btn btn-secondary" onclick="closeModal('taskDetailsModal')">Close</button>
        ${task.status === 'failed' ? `<button class="btn btn-primary" onclick="retryTask('${task.id}'); closeModal('taskDetailsModal');">🔄 Retry</button>` : ''}
        ${task.status !== 'completed' ? `<button class="btn btn-primary" onclick="startTask('${task.id}'); closeModal('taskDetailsModal');">▶️ Start</button>` : ''}
    `;

    modal.classList.add('open');
}

/**
 * Update task assignment from details modal
 */
function updateTaskAssignment(taskId, type, value) {
    if (value) {
        if (type === 'skill') {
            assignSkillToTask(taskId, value);
        } else if (type === 'agent') {
            assignAgentToTask(taskId, value);
        }
    } else {
        removeAssignment(taskId, type);
    }
}

// ============================================================
// HEALTH CHECK
// ============================================================

async function runHealthCheck() {
    if (state.healthCheckRunning) return;

    state.healthCheckRunning = true;
    const btn = document.getElementById('runHealthCheckBtn');
    const modal = document.getElementById('healthResultsModal');
    const resultsBody = document.getElementById('healthResultsBody');

    // Update button state
    btn.classList.add('loading');
    btn.innerHTML = '⏳ בודק...';

    // Show modal with loading
    modal.classList.add('open');
    resultsBody.innerHTML = `
        <div class="loading-spinner">
            <div class="spinner"></div>
            <span>${serverAvailable ? 'מריץ בדיקת בריאות אמיתית...' : 'מרענן נתונים...'}</span>
        </div>
    `;

    try {
        // If server is available, run actual health check
        if (serverAvailable) {
            showToast('Running full health check via local server...', 'info');

            const response = await fetch(`${CONFIG.localServerUrl}/api/health-check`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            const result = await response.json();

            if (result.success) {
                // Show server output
                resultsBody.innerHTML = `
                    <div class="health-result-item">
                        <span class="health-result-label">Status</span>
                        <span class="health-result-value success">Health check completed!</span>
                    </div>
                    <div class="health-fixes-list" style="margin-top: 16px;">
                        <h4>Server Output:</h4>
                        <pre style="background: #1E1E1E; color: #D4D4D4; padding: 12px; border-radius: 8px; font-size: 11px; overflow-x: auto; direction: ltr; text-align: left; max-height: 300px; overflow-y: auto;">${escapeHtml(result.output || 'No output')}</pre>
                    </div>
                `;

                // Reload tasks to get updated data
                await loadTasks();
                showToast('Health check completed!', 'success');
            } else {
                throw new Error(result.error || 'Health check failed');
            }
        } else {
            // Fallback: Just refresh data and analyze locally
            await loadTasks();
            const results = analyzeTaskHealth();
            resultsBody.innerHTML = renderHealthResults(results);
            updateHealthBanner(results);

            resultsBody.innerHTML += `
                <div class="health-fixes-list" style="margin-top: 16px; background: #FEF3C7;">
                    <h4>⚠️ Limited Mode</h4>
                    <p style="font-size: 12px; color: var(--text-secondary);">
                        Local server is not running. To enable full health checks with task retry:<br>
                        Run <code>%USERPROFILE%\\.claude\\command-center\\start-server.bat</code>
                    </p>
                </div>
            `;

            showToast('Data refreshed (server offline)', 'warning');
        }
    } catch (error) {
        resultsBody.innerHTML = `
            <div class="health-result-item">
                <span class="health-result-label">שגיאה</span>
                <span class="health-result-value error">${escapeHtml(error.message)}</span>
            </div>
            <div class="health-fixes-list" style="margin-top: 16px;">
                <p style="font-size: 12px; color: var(--text-secondary);">
                    💡 <strong>טיפ:</strong> Start the local server for full functionality:<br>
                    <code>%USERPROFILE%\\.claude\\command-center\\start-server.bat</code>
                </p>
            </div>
        `;
        showToast('Health check error', 'error');
    } finally {
        state.healthCheckRunning = false;
        btn.classList.remove('loading');
        btn.innerHTML = '🔄 רענן';
    }
}

function analyzeTaskHealth() {
    const tasks = state.tasks;
    const now = new Date();

    const results = {
        total: tasks.length,
        pending: tasks.filter(t => t.status === 'pending').length,
        in_progress: tasks.filter(t => t.status === 'in_progress').length,
        completed: tasks.filter(t => t.status === 'completed').length,
        failed: tasks.filter(t => t.status === 'failed').length,
        failedTasks: tasks.filter(t => t.status === 'failed'),
        timestamp: now.toISOString(),
        fixesAttempted: 0,
        fixesSuccessful: 0,
        issues: []
    };

    // Analyze failed tasks
    results.failedTasks.forEach(task => {
        if (task.last_result) {
            // Check for known patterns
            if (task.last_result.includes('claude') && task.last_result.includes('not')) {
                results.issues.push({
                    task: task.subject,
                    issue: 'Claude path not found',
                    suggestion: 'Use full path: C:\\Users\\user\\.local\\bin\\claude.exe'
                });
            } else if (task.last_result.includes('permission')) {
                results.issues.push({
                    task: task.subject,
                    issue: 'Permission denied',
                    suggestion: 'Run as administrator or check file permissions'
                });
            } else {
                results.issues.push({
                    task: task.subject,
                    issue: 'Unknown error',
                    suggestion: task.last_result.substring(0, 100)
                });
            }
        }
    });

    return results;
}

function renderHealthResults(results) {
    let html = `
        <div class="health-result-item">
            <span class="health-result-label">סה״כ משימות</span>
            <span class="health-result-value">${results.total}</span>
        </div>
        <div class="health-result-item">
            <span class="health-result-label">ממתינות</span>
            <span class="health-result-value">${results.pending}</span>
        </div>
        <div class="health-result-item">
            <span class="health-result-label">בביצוע</span>
            <span class="health-result-value warning">${results.in_progress}</span>
        </div>
        <div class="health-result-item">
            <span class="health-result-label">הושלמו</span>
            <span class="health-result-value success">${results.completed}</span>
        </div>
        <div class="health-result-item">
            <span class="health-result-label">נכשלו</span>
            <span class="health-result-value ${results.failed > 0 ? 'error' : ''}">${results.failed}</span>
        </div>
    `;

    if (results.issues.length > 0) {
        html += `
            <div class="health-fixes-list">
                <h4>⚠️ בעיות שזוהו:</h4>
                ${results.issues.map(issue => `
                    <div class="fix-item">
                        <span>📋</span>
                        <div>
                            <strong>${escapeHtml(issue.task)}</strong><br>
                            <small>${escapeHtml(issue.issue)}: ${escapeHtml(issue.suggestion)}</small>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    } else {
        html += `
            <div class="health-fixes-list" style="background: #D1FAE5;">
                <h4>✅ כל המשימות תקינות!</h4>
            </div>
        `;
    }

    html += `
        <div class="health-result-item" style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #E5E7EB;">
            <span class="health-result-label">זמן בדיקה</span>
            <span class="health-result-value">${formatDate(results.timestamp)}</span>
        </div>
    `;

    return html;
}

function updateHealthBanner(results) {
    const banner = document.getElementById('healthBanner');
    const status = document.getElementById('healthStatus');
    const icon = document.querySelector('.health-icon');
    const lastCheck = document.getElementById('lastCheck');

    lastCheck.textContent = 'עכשיו';

    if (results.failed > 0) {
        banner.classList.add('warning');
        banner.classList.remove('error');
        status.textContent = `${results.failed} נכשלו`;
        icon.textContent = '⚠️';
    } else {
        banner.classList.remove('warning', 'error');
        status.textContent = 'תקין';
        icon.textContent = '✅';
    }
}

// ============================================================
// QUICK FIX
// ============================================================

async function submitQuickFix() {
    const input = document.getElementById('quickFixInput');
    const agentEl = document.getElementById('quickFixAgent');

    if (!input || !agentEl) {
        showToast('Form elements not found', 'error');
        return;
    }

    const agent = agentEl.value;
    const prompt = input.value.trim();

    if (!prompt) {
        showToast('נא להזין תיאור משימה', 'warning');
        return;
    }

    // Add to recent fixes
    state.recentFixes.unshift({
        prompt: prompt.substring(0, 50),
        timestamp: new Date().toISOString()
    });

    // Keep only last 5
    state.recentFixes = state.recentFixes.slice(0, 5);
    renderRecentFixes();

    // If server is available, execute immediately
    if (serverAvailable) {
        try {
            showToast('Executing quick fix...', 'info');

            const response = await fetch(`${CONFIG.localServerUrl}/api/quick-fix`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    task: prompt,
                    workingDir: 'C:\\Users\\user\\Desktop',
                    skill: null,
                    agent: agent || null
                })
            });

            const result = await response.json();

            if (result.success) {
                showToast(`Quick fix started! ID: ${result.fixId}`, 'success');
                input.value = '';
            } else {
                throw new Error(result.error || 'Quick fix failed');
            }
        } catch (error) {
            showToast(`Error: ${error.message}`, 'error');
        }
    } else {
        // Save to localStorage for sync (with error handling)
        try {
            const pendingFixes = JSON.parse(localStorage.getItem('pending_quick_fixes') || '[]');
            pendingFixes.push({
                id: `qf_${Date.now()}`,
                prompt,
                agent,
                created: new Date().toISOString()
            });
            localStorage.setItem('pending_quick_fixes', JSON.stringify(pendingFixes));
        } catch (error) {
            console.error('Failed to save quick fix:', error);
        }

        showToast('Server offline - Task saved for next sync', 'warning');
        input.value = '';
    }
}

function renderRecentFixes() {
    const container = document.getElementById('recentFixes');
    if (!container) return;

    // Create local copy to prevent race conditions
    const fixes = [...state.recentFixes];

    container.innerHTML = fixes.map(fix => `
        <li title="${escapeHtml(fix.prompt || '')}">
            ${escapeHtml(fix.prompt || '')}...
        </li>
    `).join('');
}

// ============================================================
// SKILLS
// ============================================================

async function loadSkills() {
    try {
        const response = await fetch('data/skills.json');
        if (response.ok) {
            const data = await response.json();
            state.skills = data.skills.map(s => ({
                id: s.id,
                name: s.title || s.id,
                description: s.description,
                triggers: s.triggers || [],
                categories: s.categories || []
            }));
            console.log(`Loaded ${state.skills.length} skills`);
        } else {
            throw new Error('Skills data not found');
        }
    } catch (error) {
        console.log('Loading sample skills:', error.message);
        // Fallback to sample data
        state.skills = [
            { id: 'calendar', name: 'Calendar', description: 'תזמון אירועים' },
            { id: 'whatsapp', name: 'WhatsApp', description: 'שליחת הודעות' },
            { id: 'browser', name: 'Browser', description: 'אוטומציה בדפדפן' },
            { id: 'r-analysis', name: 'R Analysis', description: 'ניתוח סטטיסטי' },
            { id: 'schedule-task', name: 'Schedule Task', description: 'תזמון משימות' }
        ];
    }

    renderSkills();
}

function renderSkills() {
    const container = document.getElementById('skillsList');
    const countEl = document.getElementById('skillsCount');

    if (countEl) countEl.textContent = state.skills.length;

    if (!container) return;

    container.innerHTML = state.skills.slice(0, 20).map(skill => `
        <li draggable="true"
            data-skill-id="${escapeHtml(skill.id)}"
            onclick="selectSkill('${escapeHtml(skill.id)}')"
            title="גרור למשימה להקצאה&#10;${escapeHtml(skill.description || '')}">
            <span class="skill-name">⚡ ${escapeHtml(skill.name)}</span>
            <span class="skill-desc">${escapeHtml((skill.description || '').substring(0, 30))}</span>
        </li>
    `).join('');

    // Setup drag events after rendering
    setupSkillAgentDragAndDrop();
}

function selectSkill(skillId) {
    const skill = state.skills.find(s => s.id === skillId);
    if (skill) {
        showToast(`כישור נבחר: ${skill.name}`, 'info');
    }
}

// ============================================================
// AGENTS
// ============================================================

async function loadAgents() {
    try {
        const response = await fetch('data/agents.json');
        if (response.ok) {
            const data = await response.json();
            state.agents = data.available || [];
            console.log(`Loaded ${state.agents.length} agents`);
        } else {
            throw new Error('Agents data not found');
        }
    } catch (error) {
        console.log('Loading sample agents:', error.message);
        // Fallback to sample data
        state.agents = [
            { id: 'Explore', name: 'Explore', icon: '🔍', description: 'חיפוש בקוד' },
            { id: 'Plan', name: 'Plan', icon: '📋', description: 'תכנון פתרונות' },
            { id: 'Browser', name: 'Browser', icon: '🌐', description: 'אוטומציה בדפדפן' }
        ];
    }

    renderAgents();
}

function renderAgents() {
    const container = document.getElementById('agentsList');
    if (!container) return;

    container.innerHTML = state.agents.map(agent => `
        <div class="agent-card"
             draggable="true"
             data-agent-id="${escapeHtml(agent.id)}"
             onclick="launchAgent('${escapeHtml(agent.id)}')"
             title="גרור למשימה להקצאה">
            <span class="agent-icon">${agent.icon || '🤖'}</span>
            <div class="agent-info">
                <span class="agent-name">${escapeHtml(agent.name)}</span>
                <span class="agent-desc">${escapeHtml(agent.description_he || agent.description || '')}</span>
            </div>
            <span class="agent-status idle">פנוי</span>
        </div>
    `).join('');

    // Setup drag events after rendering
    setupSkillAgentDragAndDrop();
}

function launchAgent(agentId) {
    const agent = state.agents.find(a => a.id === agentId);
    if (agent) {
        showToast(`משיק ${agent.icon} ${agent.name}...`, 'info');
        // In a real implementation, this would trigger the agent
    }
}

function createSkill() {
    const desc = document.getElementById('skillDescription').value.trim();
    if (!desc) {
        showToast('נא להזין תיאור כישור', 'warning');
        return;
    }

    // Queue the skill request (with error handling)
    try {
        const pendingRequests = JSON.parse(localStorage.getItem('pending_skill_requests') || '[]');
        pendingRequests.push({
            id: `sr_${Date.now()}`,
            description: desc,
            created: new Date().toISOString(),
            status: 'pending'
        });
        localStorage.setItem('pending_skill_requests', JSON.stringify(pendingRequests));

        showToast(`כישור "${desc.substring(0, 30)}..." נשמר ליצירה`, 'success');
        document.getElementById('skillDescription').value = '';

        // Show the pending request in a toast
        setTimeout(() => {
            showToast('הכישור ייווצר בסנכרון הבא עם Claude', 'info');
        }, 1000);
    } catch (error) {
        console.error('Failed to save skill request:', error);
        showToast('Failed to save skill request', 'error');
    }
}

/**
 * View all health log entries
 */
function viewAllHealthLogs() {
    // Open health results modal and show all logs
    const modal = document.getElementById('healthResultsModal');
    const resultsBody = document.getElementById('healthResultsBody');

    modal.classList.add('open');
    resultsBody.innerHTML = `
        <div class="health-fixes-list">
            <h4>📊 היסטוריית בדיקות בריאות</h4>
            <p style="color: var(--text-secondary); font-size: 12px;">
                בדיקות בריאות מתבצעות אוטומטית כל 10 דקות.
                <br>לצפייה ביומן המלא, בדוק את health-log.jsonl במחשב.
            </p>
        </div>
    `;
}

// ============================================================
// MODAL
// ============================================================

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('open');

        // Populate skills dropdown when opening new task modal
        if (modalId === 'newTaskModal') {
            populateSkillsDropdown();
        }
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('open');
}

/**
 * Populate skills dropdown in the new task modal
 */
function populateSkillsDropdown() {
    const select = document.getElementById('newTaskSkill');
    if (!select) return;

    // Keep the first "none" option
    select.innerHTML = '<option value="">ללא</option>';

    // Add all skills
    state.skills.forEach(skill => {
        const option = document.createElement('option');
        option.value = skill.id;
        option.textContent = `${skill.name} - ${(skill.description || '').substring(0, 30)}`;
        select.appendChild(option);
    });
}

/**
 * Save new task
 */
function saveNewTask() {
    // Get form elements with null checks
    const titleEl = document.getElementById('newTaskTitle');
    const descEl = document.getElementById('newTaskDescription');
    const workingDirEl = document.getElementById('newTaskWorkingDir');
    const agentEl = document.getElementById('newTaskAgent');
    const skillEl = document.getElementById('newTaskSkill');
    const scheduleTimeEl = document.getElementById('scheduleTime');

    if (!titleEl) {
        showToast('Form not found', 'error');
        return;
    }

    const title = titleEl.value.trim();
    const description = descEl ? descEl.value.trim() : '';
    const workingDir = workingDirEl ? workingDirEl.value.trim() : '';
    const agent = agentEl ? agentEl.value : '';
    const skill = skillEl ? skillEl.value : '';
    const scheduleType = document.querySelector('input[name="schedule"]:checked')?.value || 'now';
    const scheduleTime = scheduleTimeEl ? scheduleTimeEl.value : '';

    if (!title) {
        showToast('Please enter a task title', 'warning');
        return;
    }

    if (!workingDir) {
        showToast('Working directory is required!', 'warning');
        if (workingDirEl) workingDirEl.focus();
        return;
    }

    // Create task object
    const newTask = {
        id: `local_${Date.now()}`,
        source: scheduleType === 'later' ? 'scheduled' : 'session',
        type: 'task',
        subject: title,
        description: description,
        working_dir: workingDir,
        status: 'pending',
        created: new Date().toISOString(),
        last_updated: new Date().toISOString(),
        assigned_skill: skill || null,
        assigned_agent: agent || null,
        project: 'Local Tasks',
        project_name: 'Local Tasks',
        _local: true,
        _pendingSync: true
    };

    // Handle scheduling
    if (scheduleType === 'later' && scheduleTime) {
        newTask.schedule = {
            type: 'once',
            time: scheduleTime
        };
    }

    // Save to localStorage
    saveTaskLocally(newTask);

    // Add to current state for immediate display
    state.tasks.unshift(newTask);

    // Update statistics
    const stats = {
        total: state.tasks.length,
        by_status: {
            pending: state.tasks.filter(t => t.status === 'pending').length,
            in_progress: state.tasks.filter(t => t.status === 'in_progress').length,
            completed: state.tasks.filter(t => t.status === 'completed').length,
            failed: state.tasks.filter(t => t.status === 'failed').length
        }
    };
    updateStatistics(stats);

    renderTasks();

    // Clear form and close modal (using previously validated elements)
    if (titleEl) titleEl.value = '';
    if (descEl) descEl.value = '';
    if (workingDirEl) workingDirEl.value = '';
    if (agentEl) agentEl.value = '';
    if (skillEl) skillEl.value = '';
    const nowRadio = document.querySelector('input[name="schedule"][value="now"]');
    if (nowRadio) nowRadio.checked = true;
    if (scheduleTimeEl) {
        scheduleTimeEl.value = '';
        scheduleTimeEl.classList.add('hidden');
    }

    closeModal('newTaskModal');
    showToast('Task created successfully!', 'success');
}

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, CONFIG.toastDuration);
}

// ============================================================
// SIDEBAR & NAVIGATION
// ============================================================

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('open');
}

/**
 * Handle view change from sidebar navigation
 */
function handleViewChange(view) {
    console.log('Switching to view:', view);

    switch (view) {
        case 'tasks':
            // Show all tasks
            state.filters.source = 'all';
            state.filters.status = 'all';
            document.getElementById('filterSource').value = 'all';
            document.getElementById('filterStatus').value = 'all';
            break;

        case 'scheduled':
            // Show only scheduled tasks
            state.filters.source = 'scheduled';
            document.getElementById('filterSource').value = 'scheduled';
            break;

        case 'agents':
            // Scroll to agents panel
            document.querySelector('.agents-panel')?.scrollIntoView({ behavior: 'smooth' });
            showToast('Agents panel', 'info');
            return; // Don't re-render tasks

        case 'skills':
            // Scroll to skills panel
            document.querySelector('.skills-panel')?.scrollIntoView({ behavior: 'smooth' });
            showToast('Skills panel', 'info');
            return; // Don't re-render tasks

        case 'health':
            // Run health check and scroll to health log
            runHealthCheck();
            document.querySelector('.health-log-section')?.scrollIntoView({ behavior: 'smooth' });
            return; // Health check will update UI
    }

    renderTasks();
}

// ============================================================
// EVENT LISTENERS
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    // Check server status first
    checkServerStatus();

    // Load data
    loadTasks();
    loadSkills();
    loadAgents();

    // Periodically check server status
    setInterval(checkServerStatus, CONFIG.serverCheckInterval);

    // Menu toggle
    document.getElementById('menuToggle').addEventListener('click', toggleSidebar);

    // Refresh button
    document.getElementById('refreshBtn').addEventListener('click', () => {
        showToast('מרענן...', 'info');
        loadTasks();
    });

    // Filters
    document.getElementById('filterSource').addEventListener('change', (e) => {
        state.filters.source = e.target.value;
        renderTasks();
    });

    document.getElementById('filterStatus').addEventListener('change', (e) => {
        state.filters.status = e.target.value;
        renderTasks();
    });

    document.getElementById('searchInput').addEventListener('input', (e) => {
        state.filters.search = e.target.value;
        renderTasks();
    });

    // Quick fix
    document.getElementById('quickFixBtn').addEventListener('click', submitQuickFix);

    // Toggle quick fix panel
    const toggleQuickFix = document.getElementById('toggleQuickFix');
    if (toggleQuickFix) {
        toggleQuickFix.addEventListener('click', () => {
            const panel = document.getElementById('quickFixPanel');
            panel.classList.toggle('collapsed');
            toggleQuickFix.textContent = panel.classList.contains('collapsed') ? '+' : '−';
        });
    }

    // New task modal
    document.getElementById('newTaskBtn').addEventListener('click', () => openModal('newTaskModal'));
    document.getElementById('closeNewTaskModal').addEventListener('click', () => closeModal('newTaskModal'));
    document.getElementById('cancelNewTask').addEventListener('click', () => closeModal('newTaskModal'));
    document.getElementById('saveNewTask').addEventListener('click', saveNewTask);

    // Schedule toggle
    document.querySelectorAll('input[name="schedule"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const timeInput = document.getElementById('scheduleTime');
            timeInput.classList.toggle('hidden', e.target.value !== 'later');
        });
    });

    // Create skill
    document.getElementById('createSkillBtn').addEventListener('click', createSkill);

    // Skill search
    document.getElementById('skillSearch')?.addEventListener('input', (e) => {
        const search = e.target.value.toLowerCase();
        const filtered = state.skills.filter(s =>
            s.name.toLowerCase().includes(search) ||
            (s.description || '').toLowerCase().includes(search)
        );
        const container = document.getElementById('skillsList');
        container.innerHTML = filtered.map(skill => `
            <li draggable="true"
                data-skill-id="${escapeHtml(skill.id)}"
                onclick="selectSkill('${escapeHtml(skill.id)}')"
                title="גרור למשימה להקצאה">
                <span class="skill-name">⚡ ${escapeHtml(skill.name)}</span>
                <span class="skill-desc">${escapeHtml((skill.description || '').substring(0, 30))}</span>
            </li>
        `).join('');
        setupSkillAgentDragAndDrop();
    });

    // Health check button
    const healthCheckBtn = document.getElementById('runHealthCheckBtn');
    if (healthCheckBtn) {
        healthCheckBtn.addEventListener('click', runHealthCheck);
    }

    // Close health results modal
    const closeHealthResults = document.getElementById('closeHealthResults');
    if (closeHealthResults) {
        closeHealthResults.addEventListener('click', () => {
            document.getElementById('healthResultsModal').classList.remove('open');
        });
    }

    // View all health logs button
    const viewAllHealthBtn = document.getElementById('viewAllHealthBtn');
    if (viewAllHealthBtn) {
        viewAllHealthBtn.addEventListener('click', viewAllHealthLogs);
    }

    // View toggle (board/list)
    const toggleViewBtn = document.getElementById('toggleViewBtn');
    if (toggleViewBtn) {
        toggleViewBtn.addEventListener('click', () => {
            state.viewMode = state.viewMode === 'board' ? 'list' : 'board';
            toggleViewBtn.textContent = state.viewMode === 'board' ? '⊞' : '☰';
            toggleViewBtn.title = state.viewMode === 'board' ? 'תצוגת רשימה' : 'תצוגת לוח';
            renderTasks();
            showToast(state.viewMode === 'board' ? 'תצוגת לוח' : 'תצוגת רשימה', 'info');
        });
    }

    // Sidebar navigation
    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const view = item.dataset.view;

            // Update active state
            document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // Handle view change
            handleViewChange(view);

            // Close sidebar on mobile
            const sidebar = document.getElementById('sidebar');
            if (window.innerWidth < 768) {
                sidebar.classList.remove('open');
            }
        });
    });

    // Settings button
    document.getElementById('settingsBtn')?.addEventListener('click', () => {
        showToast('Settings coming soon', 'info');
    });

    // Notifications button
    document.getElementById('notificationsBtn')?.addEventListener('click', () => {
        showToast('No new notifications', 'info');
    });

    // Close sidebar on outside click (mobile)
    document.addEventListener('click', (e) => {
        const sidebar = document.getElementById('sidebar');
        const menuToggle = document.getElementById('menuToggle');
        if (sidebar.classList.contains('open') &&
            !sidebar.contains(e.target) &&
            !menuToggle.contains(e.target)) {
            sidebar.classList.remove('open');
        }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Escape to close modals
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal.open, .health-results-modal.open').forEach(modal => {
                modal.classList.remove('open');
            });
        }
        // Ctrl+R to refresh
        if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
            e.preventDefault();
            loadTasks();
            showToast('מרענן...', 'info');
        }
        // Ctrl+H to run health check
        if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
            e.preventDefault();
            runHealthCheck();
        }
    });

    // Auto-refresh with cleanup
    let refreshInterval = setInterval(() => {
        loadTasks().catch(err => console.error('Auto-refresh failed:', err));
    }, CONFIG.refreshInterval);

    // Cleanup on page unload to prevent memory leaks
    window.addEventListener('beforeunload', () => {
        if (refreshInterval) {
            clearInterval(refreshInterval);
            refreshInterval = null;
        }
    });
});

// ============================================================
// GLOBAL EXPORTS (for inline handlers)
// ============================================================

window.retryTask = retryTask;
window.editTask = editTask;
window.startTask = startTask;
window.selectSkill = selectSkill;
window.openModal = openModal;
window.closeModal = closeModal;
window.removeAssignment = removeAssignment;
window.addTaskToSession = addTaskToSession;
window.handleTaskDragOver = handleTaskDragOver;
window.handleTaskDragLeave = handleTaskDragLeave;
window.handleTaskDrop = handleTaskDrop;
window.runHealthCheck = runHealthCheck;
window.launchAgent = launchAgent;
window.openTaskDetails = openTaskDetails;
window.updateTaskAssignment = updateTaskAssignment;
window.saveNewTask = saveNewTask;
window.viewAllHealthLogs = viewAllHealthLogs;
window.showRunTaskModal = showRunTaskModal;
window.copyTaskCommand = copyTaskCommand;
