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
    healthLog: [],
    filters: {
        source: 'all',
        status: 'all',
        search: ''
    },
    recentFixes: []
};

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
    dataPath: 'data/tasks.json',
    refreshInterval: 60000, // 1 minute
    toastDuration: 3000
};

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
    try {
        // Try loading from data folder first
        let response = await fetch(CONFIG.dataPath);

        if (!response.ok) {
            // Try loading from parent directory (for local testing)
            response = await fetch('../unified-tasks.json');
        }

        if (!response.ok) {
            throw new Error('Failed to load tasks');
        }

        const data = await response.json();
        state.tasks = data.tasks || [];

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
        showToast('שגיאה בטעינת משימות', 'error');
        hideLoading();

        // Show sample data for demo
        loadSampleData();
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
 * Render tasks list
 */
function renderTasks() {
    const container = document.getElementById('tasksList');
    const filteredTasks = filterTasks(state.tasks);

    if (filteredTasks.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>אין משימות להציג</p>
            </div>
        `;
        return;
    }

    // Group tasks by source
    const grouped = groupTasksBySource(filteredTasks);

    let html = '';

    for (const [source, tasks] of Object.entries(grouped)) {
        const sourceInfo = getSourceInfo(source);
        html += `
            <div class="task-group">
                <h4 class="task-group-title">${sourceInfo.icon} ${sourceInfo.text}</h4>
                ${tasks.map(task => renderTaskCard(task)).join('')}
            </div>
        `;
    }

    container.innerHTML = html;

    // Setup drag and drop
    setupDragAndDrop();
}

/**
 * Render single task card
 */
function renderTaskCard(task) {
    const statusInfo = getStatusInfo(task.status);
    const sourceInfo = getSourceInfo(task.source);

    return `
        <div class="task-card status-${task.status}" draggable="true" data-task-id="${task.id}">
            <div class="task-header">
                <span class="task-source">${sourceInfo.icon} ${sourceInfo.text}</span>
                <span class="task-status ${statusInfo.class}">${statusInfo.icon} ${statusInfo.text}</span>
            </div>
            <div class="task-title">${escapeHtml(task.subject)}</div>
            ${task.project ? `<div class="task-meta"><span>📁 ${escapeHtml(task.project)}</span></div>` : ''}
            ${task.last_result && task.status === 'failed' ?
                `<div class="task-error">❌ ${escapeHtml(task.last_result.substring(0, 100))}</div>` : ''}
            <div class="task-actions">
                ${task.status === 'failed' ?
                    `<button class="btn btn-small btn-primary" onclick="retryTask('${task.id}')">🔄 נסה שוב</button>` : ''}
                <button class="btn btn-small btn-secondary" onclick="editTask('${task.id}')">✏️ ערוך</button>
                ${task.status !== 'completed' ?
                    `<button class="btn btn-small btn-secondary" onclick="startTask('${task.id}')">▶️ התחל</button>` : ''}
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
// DRAG AND DROP
// ============================================================

function setupDragAndDrop() {
    const cards = document.querySelectorAll('.task-card');

    cards.forEach(card => {
        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragend', handleDragEnd);
        card.addEventListener('dragover', handleDragOver);
        card.addEventListener('drop', handleDrop);
    });
}

function handleDragStart(e) {
    e.target.classList.add('dragging');
    e.dataTransfer.setData('text/plain', e.target.dataset.taskId);
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
}

function handleDragOver(e) {
    e.preventDefault();
}

function handleDrop(e) {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain');
    const dropTarget = e.target.closest('.task-card');

    if (dropTarget && draggedId !== dropTarget.dataset.taskId) {
        // Reorder tasks (visual only for now)
        showToast('משימה הוזזה', 'success');
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

function startTask(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    showToast(`מתחיל משימה: ${task.subject}`, 'success');
}

// ============================================================
// QUICK FIX
// ============================================================

function submitQuickFix() {
    const input = document.getElementById('quickFixInput');
    const agent = document.getElementById('quickFixAgent').value;
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

    // Save to localStorage for sync
    const pendingFixes = JSON.parse(localStorage.getItem('pending_quick_fixes') || '[]');
    pendingFixes.push({
        id: `qf_${Date.now()}`,
        prompt,
        agent,
        created: new Date().toISOString()
    });
    localStorage.setItem('pending_quick_fixes', JSON.stringify(pendingFixes));

    showToast('משימה נשלחה! תבוצע בסנכרון הבא.', 'success');
    input.value = '';
}

function renderRecentFixes() {
    const container = document.getElementById('recentFixes');
    if (!container) return;

    container.innerHTML = state.recentFixes.map(fix => `
        <li title="${escapeHtml(fix.prompt)}">
            ${escapeHtml(fix.prompt)}...
        </li>
    `).join('');
}

// ============================================================
// SKILLS
// ============================================================

function loadSkills() {
    // Sample skills for demo
    state.skills = [
        { name: 'calendar', description: 'תזמון אירועים' },
        { name: 'whatsapp', description: 'שליחת הודעות' },
        { name: 'browser', description: 'אוטומציה בדפדפן' },
        { name: 'r-analysis', description: 'ניתוח סטטיסטי' },
        { name: 'schedule-task', description: 'תזמון משימות' }
    ];

    renderSkills();
}

function renderSkills() {
    const container = document.getElementById('skillsList');
    const countEl = document.getElementById('skillsCount');

    if (countEl) countEl.textContent = state.skills.length;

    if (!container) return;

    container.innerHTML = state.skills.map(skill => `
        <li onclick="selectSkill('${skill.name}')">
            <span class="skill-name">${skill.name}</span>
            <span class="skill-desc">${skill.description}</span>
        </li>
    `).join('');
}

function selectSkill(skillName) {
    showToast(`כישור נבחר: ${skillName}`, 'info');
}

function createSkill() {
    const desc = document.getElementById('skillDescription').value.trim();
    if (!desc) {
        showToast('נא להזין תיאור כישור', 'warning');
        return;
    }

    showToast(`יוצר כישור: ${desc}`, 'success');
    document.getElementById('skillDescription').value = '';
}

// ============================================================
// MODAL
// ============================================================

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('open');
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('open');
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
// SIDEBAR
// ============================================================

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('open');
}

// ============================================================
// EVENT LISTENERS
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    // Load data
    loadTasks();
    loadSkills();

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

    // New task modal
    document.getElementById('newTaskBtn').addEventListener('click', () => openModal('newTaskModal'));
    document.getElementById('closeNewTaskModal').addEventListener('click', () => closeModal('newTaskModal'));
    document.getElementById('cancelNewTask').addEventListener('click', () => closeModal('newTaskModal'));

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
            s.description.toLowerCase().includes(search)
        );
        const container = document.getElementById('skillsList');
        container.innerHTML = filtered.map(skill => `
            <li onclick="selectSkill('${skill.name}')">
                <span class="skill-name">${skill.name}</span>
                <span class="skill-desc">${skill.description}</span>
            </li>
        `).join('');
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

    // Auto-refresh
    setInterval(() => {
        loadTasks();
    }, CONFIG.refreshInterval);
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
