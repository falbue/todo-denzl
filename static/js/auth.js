/**
 * Авторизация и регистрация - JavaScript
 */

// ========== ИНИЦИАЛИЗАЦИЯ ==========

document.addEventListener('DOMContentLoaded', () => {
    console.log('🔐 Модуль авторизации загружен');

    // Инициализация темы
    initTheme();

    // Привязка событий
    bindAuthEvents();
});

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
    document.querySelectorAll('.theme-btn-small, .theme-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-theme') === theme) {
            btn.classList.add('active');
        }
    });
}

// ========== ПРИВЯЗКА СОБЫТИЙ ==========

/**
 * Привязать события авторизации
 */
function bindAuthEvents() {
    // Переключатели тем
    document.querySelectorAll('.theme-btn-small, .theme-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const theme = e.currentTarget.getAttribute('data-theme');
            applyTheme(theme);
        });
    });

    // Форма регистрации
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }

    // Форма входа
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    // Переключение видимости пароля
    const togglePasswordBtn = document.getElementById('togglePassword');
    if (togglePasswordBtn) {
        togglePasswordBtn.addEventListener('click', togglePasswordVisibility);
    }
}

// ========== ОБРАБОТЧИКИ ==========

/**
 * Обработка регистрации
 */
async function handleRegister(e) {
    e.preventDefault();

    const username = document.getElementById('username').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    // Валидация на клиенте
    if (!username || !email || !password || !confirmPassword) {
        showNotification('Все поля обязательны', 'warning');
        return;
    }

    if (username.length < 3) {
        showNotification('Имя пользователя должно быть минимум 3 символа', 'warning');
        return;
    }

    if (password.length < 6) {
        showNotification('Пароль должен быть минимум 6 символов', 'warning');
        return;
    }

    if (password !== confirmPassword) {
        showNotification('Пароли не совпадают', 'warning');
        return;
    }

    if (!email.includes('@') || !email.includes('.')) {
        showNotification('Введите корректный email', 'warning');
        return;
    }

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Ошибка регистрации');
        }

        showNotification('Регистрация успешна! Перенаправление...', 'success');

        // Перенаправление на страницу TODO через 1 секунду
        setTimeout(() => {
            window.location.href = '/todo';
        }, 1000);

    } catch (error) {
        console.error('Ошибка:', error);
        showNotification(error.message, 'error');
    }
}

/**
 * Обработка входа
 */
async function handleLogin(e) {
    e.preventDefault();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    // Валидация на клиенте
    if (!username || !password) {
        showNotification('Введите имя пользователя и пароль', 'warning');
        return;
    }

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Ошибка входа');
        }

        showNotification('Вход выполнен! Перенаправление...', 'success');

        // Перенаправление на страницу TODO через 1 секунду
        setTimeout(() => {
            window.location.href = '/todo';
        }, 1000);

    } catch (error) {
        console.error('Ошибка:', error);
        showNotification(error.message, 'error');
    }
}

/**
 * Переключение видимости пароля
 */
function togglePasswordVisibility() {
    const passwordInput = document.getElementById('password');
    const icon = document.querySelector('#togglePassword i');

    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        passwordInput.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
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

/**
 * Экранирование HTML
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Дополнительные стили для компактных кнопок тем
 */
const style = document.createElement('style');
style.textContent = `
    .theme-btn-small {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        border: 2px solid var(--border);
        background: var(--bg-secondary);
        color: var(--text-primary);
        cursor: pointer;
        transition: all 0.3s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1rem;
    }
    
    .theme-btn-small:hover {
        transform: scale(1.1);
        border-color: var(--accent);
    }
    
    .theme-btn-small.active {
        background: var(--accent);
        color: white;
        border-color: var(--accent);
        transform: scale(1.15);
    }
`;
document.head.appendChild(style);
