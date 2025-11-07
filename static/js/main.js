/**
 * TODO-лист - Главный JavaScript файл
 * Чистый JavaScript (Vanilla JS), без jQuery
 */

// ========== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ==========

let tasks = [];
let editingTaskId = null;

// ========== ИНИЦИАЛИЗАЦИЯ ==========

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Приложение загружено');

    // Инициализация темы
    initTheme();

    // Загрузка задач
    loadTasks();

    // Загрузка календаря продуктивности
    loadCalendar();

    // Привязка событий
    bindEvents();
});
/**
 * Загрузить данные для календаря-heatmap и отрисовать
 */
async function loadCalendar(days = 365) {
    try {
        const response = await fetch(`/api/stats/calendar?days=${days}`);

        if (response.status === 401) {
            // Перенаправление на страницу входа если не авторизован
            return;
        }

        if (!response.ok) {
            throw new Error('Ошибка загрузки календаря');
        }

        const data = await response.json();
        const counts = data.counts || {};

        renderCalendar(counts, days);

    } catch (err) {
        console.error('Ошибка календаря:', err);
    }
}

/**
 * Отрисовать календарь heatmap на основе словаря { 'YYYY-MM-DD': count }
 */
function renderCalendar(counts, days = 365) {
    const container = document.getElementById('calendarHeatmap');
    if (!container) return;
    container.innerHTML = '';

    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));

    // Найти первую дату в начале недели (воскресенье) перед стартом
    const first = new Date(start);
    first.setDate(first.getDate() - first.getDay());

    // Соберём массив дат от first до end
    const dates = [];
    for (let d = new Date(first); d <= end; d.setDate(d.getDate() + 1)) {
        dates.push(new Date(d));
    }

    // Подготовим недели (колонками)
    const weeks = [];
    for (let i = 0; i < dates.length; i += 7) {
        weeks.push(dates.slice(i, i + 7));
    }

    // Найдём максимальное значение для нормализации
    let maxCount = 0;
    Object.values(counts).forEach(v => { if (v > maxCount) maxCount = v; });
    if (maxCount === 0) maxCount = 1;

    // Создаём DOM
    weeks.forEach(week => {
        const col = document.createElement('div');
        col.className = 'week';
        week.forEach(date => {
            const iso = date.toISOString().slice(0, 10);
            // Если дата раньше start, делаем прозрачный пустой блок
            const dayElem = document.createElement('div');
            dayElem.className = 'day';
            const count = counts[iso] || 0;

            // Присвоим класс heat-N по порогам
            const pct = count / maxCount;
            let cls = '';
            if (count === 0) cls = '';
            else if (pct <= 0.25) cls = 'heat-1';
            else if (pct <= 0.5) cls = 'heat-2';
            else if (pct <= 0.75) cls = 'heat-3';
            else cls = 'heat-4';

            if (cls) dayElem.classList.add(cls);

            // Тултип
            const labelDate = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
            dayElem.title = `${labelDate}: ${count} выполнено`;

            // Пустые ячейки до реального start
            if (date < start) {
                dayElem.style.visibility = 'hidden';
            }

            col.appendChild(dayElem);
        });
        container.appendChild(col);
    });
}

// ========== УПРАВЛЕНИЕ ТЕМАМИ ==========

/**
 * Инициализация темы из localStorage
 */
function initTheme() {
    const savedTheme = localStorage.getItem('todoTheme') || 'light';
    applyTheme(savedTheme);
}

/**
 * Применить тему
 */
function applyTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('todoTheme', theme);

    // Обновить активную кнопку
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-theme') === theme) {
            btn.classList.add('active');
        }
    });
}

// ========== ПРИВЯЗКА СОБЫТИЙ ==========

/**
 * Привязать все события к элементам
 */
function bindEvents() {
    // Форма добавления задачи
    const taskForm = document.getElementById('taskForm');
    taskForm.addEventListener('submit', handleTaskSubmit);

    // Очистка формы
    const clearFormBtn = document.getElementById('clearForm');
    clearFormBtn.addEventListener('click', clearTaskForm);

    // Кнопка выхода
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    // Переключатели тем
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const theme = e.currentTarget.getAttribute('data-theme');
            applyTheme(theme);
        });
    });

    // Сортировка
    const sortSelect = document.getElementById('sortBy');
    sortSelect.addEventListener('change', handleSortChange);

    // Модальное окно
    const closeModalBtn = document.getElementById('closeModal');
    const cancelEditBtn = document.getElementById('cancelEdit');
    closeModalBtn.addEventListener('click', closeEditModal);
    cancelEditBtn.addEventListener('click', closeEditModal);

    // Форма редактирования
    const editForm = document.getElementById('editTaskForm');
    editForm.addEventListener('submit', handleEditSubmit);

    // Закрытие модального окна по клику на фон
    const modal = document.getElementById('editModal');
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeEditModal();
        }
    });
}// ========== РАБОТА С ЗАДАЧАМИ ==========

/**
 * Загрузить все задачи с сервера
 */
async function loadTasks(sortBy = 'created_at', order = 'desc') {
    try {
        const response = await fetch(`/api/tasks?sort=${sortBy}&order=${order}`);

        if (response.status === 401) {
            // Перенаправление на страницу входа если не авторизован
            window.location.href = '/login';
            return;
        }

        if (!response.ok) {
            throw new Error('Ошибка загрузки задач');
        }

        tasks = await response.json();
        renderTasks();
        updateStatistics();

    } catch (error) {
        console.error('Ошибка:', error);
        showNotification('Ошибка загрузки задач', 'error');
    }
}/**
 * Отобразить задачи на странице
 */
function renderTasks() {
    const tasksList = document.getElementById('tasksList');
    const emptyState = document.getElementById('emptyState');

    // Если задач нет
    if (tasks.length === 0) {
        tasksList.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }

    // Скрыть пустое состояние
    emptyState.classList.add('hidden');

    // Отрисовать задачи
    tasksList.innerHTML = tasks.map(task => createTaskHTML(task)).join('');

    // Привязать события к кнопкам задач
    bindTaskEvents();
}

/**
 * Создать HTML для задачи
 */
function createTaskHTML(task) {
    const createdDate = new Date(task.created_at).toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    const statusClass = task.status === 'completed' ? 'completed' : 'pending';
    const statusText = task.status === 'completed' ? 'Выполнено' : 'В работе';
    const statusIcon = task.status === 'completed' ? 'fa-check-circle' : 'fa-clock';
    const toggleIcon = task.status === 'completed' ? 'fa-undo' : 'fa-check';
    const toggleText = task.status === 'completed' ? 'Вернуть в работу' : 'Завершить';

    return `
        <div class="task-item ${statusClass}" data-task-id="${task.id}">
            <div class="flex justify-between items-start gap-4">
                <!-- Содержимое задачи -->
                <div class="flex-1">
                    <h3 class="task-title">${escapeHtml(task.title)}</h3>
                    ${task.description ? `<p class="task-description">${escapeHtml(task.description)}</p>` : ''}
                    
                    <div class="flex flex-wrap gap-3 items-center mt-3">
                        <span class="status-badge ${statusClass}">
                            <i class="fas ${statusIcon} mr-1"></i>${statusText}
                        </span>
                        <span class="task-meta">
                            <i class="fas fa-calendar-alt mr-1"></i>${createdDate}
                        </span>
                    </div>
                </div>
                
                <!-- Кнопки действий -->
                <div class="flex flex-col gap-2">
                    <button class="btn btn-success btn-sm toggle-status-btn" data-task-id="${task.id}" title="${toggleText}">
                        <i class="fas ${toggleIcon}"></i>
                    </button>
                    <button class="btn btn-primary btn-sm edit-btn" data-task-id="${task.id}" title="Редактировать">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-danger btn-sm delete-btn" data-task-id="${task.id}" title="Удалить">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
}

/**
 * Привязать события к кнопкам задач
 */
function bindTaskEvents() {
    // Кнопки переключения статуса
    document.querySelectorAll('.toggle-status-btn').forEach(btn => {
        btn.addEventListener('click', handleToggleStatus);
    });

    // Кнопки редактирования
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', handleEditTask);
    });

    // Кнопки удаления
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', handleDeleteTask);
    });
}

/**
 * Обновить статистику
 */
function updateStatistics() {
    const total = tasks.length;
    const pending = tasks.filter(t => t.status === 'pending').length;
    const completed = tasks.filter(t => t.status === 'completed').length;

    document.getElementById('totalTasks').textContent = total;
    document.getElementById('pendingTasks').textContent = pending;
    document.getElementById('completedTasks').textContent = completed;
}

// ========== ОБРАБОТЧИКИ СОБЫТИЙ ==========

/**
 * Обработка выхода из системы
 */
async function handleLogout() {
    if (!confirm('Вы уверены, что хотите выйти?')) {
        return;
    }

    try {
        const response = await fetch('/api/logout', {
            method: 'POST'
        });

        if (!response.ok) {
            throw new Error('Ошибка выхода');
        }

        showNotification('Выход выполнен', 'success');

        // Перенаправление на страницу входа через 1 секунду
        setTimeout(() => {
            window.location.href = '/login';
        }, 1000);

    } catch (error) {
        console.error('Ошибка:', error);
        showNotification('Ошибка выхода', 'error');
    }
}

/**
 * Обработка отправки формы добавления задачи
 */
async function handleTaskSubmit(e) {
    e.preventDefault();

    const title = document.getElementById('taskTitle').value.trim();
    const description = document.getElementById('taskDescription').value.trim();

    // Валидация на клиенте
    if (!title) {
        showNotification('Введите название задачи', 'warning');
        return;
    }

    if (title.length > 200) {
        showNotification('Название слишком длинное (макс. 200 символов)', 'warning');
        return;
    }

    if (description.length > 1000) {
        showNotification('Описание слишком длинное (макс. 1000 символов)', 'warning');
        return;
    }

    try {
        const response = await fetch('/api/tasks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ title, description })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Ошибка создания задачи');
        }

        showNotification('Задача добавлена!', 'success');
        clearTaskForm();
        loadTasks();

    } catch (error) {
        console.error('Ошибка:', error);
        showNotification(error.message, 'error');
    }
}

/**
 * Очистка формы
 */
function clearTaskForm() {
    document.getElementById('taskTitle').value = '';
    document.getElementById('taskDescription').value = '';
}

/**
 * Обработка изменения сортировки
 */
function handleSortChange(e) {
    const value = e.target.value;
    const [sortBy, order] = value.split('_');
    loadTasks(sortBy, order);
}

/**
 * Переключение статуса задачи
 */
async function handleToggleStatus(e) {
    const taskId = parseInt(e.currentTarget.getAttribute('data-task-id'));

    try {
        const response = await fetch(`/api/tasks/${taskId}/status`, {
            method: 'PATCH'
        });

        if (!response.ok) {
            throw new Error('Ошибка изменения статуса');
        }

        showNotification('Статус изменен', 'success');
        loadTasks();

    } catch (error) {
        console.error('Ошибка:', error);
        showNotification('Ошибка изменения статуса', 'error');
    }
}

/**
 * Открыть модальное окно редактирования
 */
function handleEditTask(e) {
    const taskId = parseInt(e.currentTarget.getAttribute('data-task-id'));
    const task = tasks.find(t => t.id === taskId);

    if (!task) return;

    editingTaskId = taskId;

    // Заполнить форму
    document.getElementById('editTaskId').value = task.id;
    document.getElementById('editTaskTitle').value = task.title;
    document.getElementById('editTaskDescription').value = task.description || '';
    document.getElementById('editTaskStatus').value = task.status;

    // Показать модальное окно
    document.getElementById('editModal').classList.remove('hidden');
}

/**
 * Закрыть модальное окно
 */
function closeEditModal() {
    document.getElementById('editModal').classList.add('hidden');
    editingTaskId = null;
}

/**
 * Обработка отправки формы редактирования
 */
async function handleEditSubmit(e) {
    e.preventDefault();

    const taskId = editingTaskId;
    const title = document.getElementById('editTaskTitle').value.trim();
    const description = document.getElementById('editTaskDescription').value.trim();
    const status = document.getElementById('editTaskStatus').value;

    // Валидация
    if (!title) {
        showNotification('Введите название задачи', 'warning');
        return;
    }

    if (title.length > 200) {
        showNotification('Название слишком длинное', 'warning');
        return;
    }

    try {
        const response = await fetch(`/api/tasks/${taskId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ title, description, status })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Ошибка обновления задачи');
        }

        showNotification('Задача обновлена!', 'success');
        closeEditModal();
        loadTasks();

    } catch (error) {
        console.error('Ошибка:', error);
        showNotification(error.message, 'error');
    }
}

/**
 * Удаление задачи
 */
async function handleDeleteTask(e) {
    const taskId = parseInt(e.currentTarget.getAttribute('data-task-id'));
    const task = tasks.find(t => t.id === taskId);

    if (!task) return;

    if (!confirm(`Удалить задачу "${task.title}"?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/tasks/${taskId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error('Ошибка удаления задачи');
        }

        // Анимация удаления
        const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
        taskElement.classList.add('fade-out');

        setTimeout(() => {
            showNotification('Задача удалена', 'success');
            loadTasks();
        }, 300);

    } catch (error) {
        console.error('Ошибка:', error);
        showNotification('Ошибка удаления задачи', 'error');
    }
}

// ========== УВЕДОМЛЕНИЯ ==========

/**
 * Показать уведомление
 */
function showNotification(message, type = 'info') {
    const container = document.getElementById('notifications');

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;

    const icon = type === 'success' ? 'fa-check-circle' :
        type === 'error' ? 'fa-exclamation-circle' :
            type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle';

    notification.innerHTML = `
        <div class="flex items-center gap-3">
            <i class="fas ${icon} text-xl"></i>
            <span class="flex-1">${escapeHtml(message)}</span>
            <button class="text-xl opacity-70 hover:opacity-100" onclick="this.parentElement.parentElement.remove()">
                &times;
            </button>
        </div>
    `;

    container.appendChild(notification);

    // Автоматическое удаление через 5 секунд
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

// ========== УТИЛИТЫ ==========

/**
 * Экранирование HTML для защиты от XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Дополнительные стили для маленьких кнопок
 */
const style = document.createElement('style');
style.textContent = `
    .btn-sm {
        padding: 0.5rem;
        font-size: 0.875rem;
        min-width: 40px;
    }
`;
document.head.appendChild(style);
