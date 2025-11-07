"""
Flask TODO-лист приложение с SQLite3 и системой авторизации
Запуск: python app.py
"""

from flask import Flask, render_template, request, jsonify, redirect, url_for, session
import sqlite3
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
import os


def load_dotenv(path='.env'):
    """Простой загрузчик .env без зависимостей.
    Устанавливает переменные в os.environ только если они ещё не установлены.
    Формат строки: KEY=VALUE, строки, начинающиеся с # — комментарии.
    """
    try:
        if not os.path.exists(path):
            return
        with open(path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                if '=' not in line:
                    continue
                key, val = line.split('=', 1)
                key = key.strip()
                val = val.strip().strip('"').strip("'")
                # Если переменная уже задана в окружении — не перезаписываем
                os.environ.setdefault(key, val)
    except Exception:
        # Ничего не делаем при ошибке чтения .env
        pass


# Загружаем .env (если есть) до определения путей
load_dotenv()
app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-here-change-in-production'
app.config['PERMANENT_SESSION_LIFETIME'] = 86400  # 24 часа

# Путь к базе данных (можно переопределить в .env, переменная DB_PATH)
DATABASE = os.environ.get('DB_PATH', 'database.db')

# Убедимся, что папка для базы существует
db_dir = os.path.dirname(DATABASE)
if db_dir:
    try:
        os.makedirs(db_dir, exist_ok=True)
    except Exception:
        pass

def get_db_connection():
    """Создает соединение с базой данных"""
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row  # Позволяет обращаться к столбцам по имени
    return conn

def init_db():
    """Инициализирует базу данных, создает таблицы если их нет"""
    conn = get_db_connection()
    
    # Таблица пользователей
    conn.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Таблица задач с привязкой к пользователю
    conn.execute('''
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    ''')
    
    conn.commit()
    conn.close()

def login_required(f):
    """Декоратор для защиты маршрутов, требующих авторизации"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            # Если запрос адресуется к API — вернуть JSON-ответ с кодом 401.
            # Для обычных браузерных запросов — перенаправить на страницу входа.
            if request.path.startswith('/api') or request.is_json or 'application/json' in request.headers.get('Accept', ''):
                return jsonify({'error': 'Требуется авторизация', 'redirect': '/login'}), 401
            return redirect(url_for('login_page'))
        return f(*args, **kwargs)
    return decorated_function

@app.route('/')
def index():
    """Главная страница - перенаправляет на login или todo"""
    if 'user_id' in session:
        return redirect(url_for('todo'))
    # Перенаправляем на страницу входа (GET /login), а не на API-эндпоинт
    return redirect(url_for('login_page'))

@app.route('/register', methods=['GET'])
def register_page():
    """Страница регистрации"""
    if 'user_id' in session:
        return redirect(url_for('todo'))
    return render_template('register.html')

@app.route('/login', methods=['GET'])
def login_page():
    """Страница входа"""
    if 'user_id' in session:
        return redirect(url_for('todo'))
    return render_template('login.html')

@app.route('/todo')
@login_required
def todo():
    """Страница TODO-листа для авторизованных пользователей"""
    conn = get_db_connection()
    user = conn.execute('SELECT username, email FROM users WHERE id = ?', (session['user_id'],)).fetchone()
    conn.close()
    return render_template('index.html', user=user)

@app.route('/api/register', methods=['POST'])
def register():
    """API: Регистрация нового пользователя"""
    data = request.get_json()
    
    username = data.get('username', '').strip()
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    
    # Валидация
    if not username or not email or not password:
        return jsonify({'error': 'Все поля обязательны'}), 400
    
    if len(username) < 3:
        return jsonify({'error': 'Имя пользователя должно быть минимум 3 символа'}), 400
    
    if len(username) > 50:
        return jsonify({'error': 'Имя пользователя слишком длинное (макс. 50 символов)'}), 400
    
    if len(password) < 6:
        return jsonify({'error': 'Пароль должен быть минимум 6 символов'}), 400
    
    if '@' not in email or '.' not in email:
        return jsonify({'error': 'Некорректный email'}), 400
    
    conn = get_db_connection()
    
    # Проверяем существование пользователя
    existing_user = conn.execute('SELECT id FROM users WHERE username = ? OR email = ?', 
                                 (username, email)).fetchone()
    
    if existing_user:
        conn.close()
        return jsonify({'error': 'Пользователь с таким именем или email уже существует'}), 400
    
    # Создаем пользователя
    password_hash = generate_password_hash(password)
    cursor = conn.execute(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
        (username, email, password_hash)
    )
    user_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    # Авторизуем пользователя
    session['user_id'] = user_id
    session['username'] = username
    session.permanent = True
    
    return jsonify({'message': 'Регистрация успешна', 'username': username}), 201

@app.route('/api/login', methods=['POST'])
def login():
    """API: Вход пользователя"""
    data = request.get_json()
    
    username = data.get('username', '').strip()
    password = data.get('password', '')
    
    if not username or not password:
        return jsonify({'error': 'Введите имя пользователя и пароль'}), 400
    
    conn = get_db_connection()
    user = conn.execute('SELECT * FROM users WHERE username = ? OR email = ?', 
                       (username, username.lower())).fetchone()
    conn.close()
    
    if not user or not check_password_hash(user['password_hash'], password):
        return jsonify({'error': 'Неверное имя пользователя или пароль'}), 401
    
    # Авторизуем пользователя
    session['user_id'] = user['id']
    session['username'] = user['username']
    session.permanent = True
    
    return jsonify({'message': 'Вход выполнен', 'username': user['username']}), 200

@app.route('/api/logout', methods=['POST'])
def logout():
    """API: Выход пользователя"""
    session.clear()
    return jsonify({'message': 'Выход выполнен'}), 200

@app.route('/api/tasks', methods=['GET'])
@login_required
def get_tasks():
    """API: Получить все задачи текущего пользователя с сортировкой"""
    user_id = session['user_id']
    sort_by = request.args.get('sort', 'created_at')
    order = request.args.get('order', 'desc')
    
    # Защита от SQL-инъекций
    allowed_sorts = ['created_at', 'status', 'title']
    allowed_orders = ['asc', 'desc']
    
    if sort_by not in allowed_sorts:
        sort_by = 'created_at'
    if order not in allowed_orders:
        order = 'desc'
    
    conn = get_db_connection()
    query = f'SELECT * FROM tasks WHERE user_id = ? ORDER BY {sort_by} {order}'
    tasks = conn.execute(query, (user_id,)).fetchall()
    conn.close()
    
    # Преобразуем Row объекты в словари
    tasks_list = []
    for task in tasks:
        tasks_list.append({
            'id': task['id'],
            'title': task['title'],
            'description': task['description'],
            'status': task['status'],
            'created_at': task['created_at'],
            'updated_at': task['updated_at']
        })
    
    return jsonify(tasks_list)

@app.route('/api/tasks', methods=['POST'])
@login_required
def create_task():
    """API: Создать новую задачу для текущего пользователя"""
    user_id = session['user_id']
    data = request.get_json()
    
    # Валидация на сервере
    title = data.get('title', '').strip()
    description = data.get('description', '').strip()
    
    if not title:
        return jsonify({'error': 'Название задачи обязательно'}), 400
    
    if len(title) > 200:
        return jsonify({'error': 'Название слишком длинное (макс. 200 символов)'}), 400
    
    if len(description) > 1000:
        return jsonify({'error': 'Описание слишком длинное (макс. 1000 символов)'}), 400
    
    conn = get_db_connection()
    cursor = conn.execute(
        'INSERT INTO tasks (user_id, title, description, status) VALUES (?, ?, ?, ?)',
        (user_id, title, description, 'pending')
    )
    task_id = cursor.lastrowid
    conn.commit()
    
    # Получаем созданную задачу
    task = conn.execute('SELECT * FROM tasks WHERE id = ?', (task_id,)).fetchone()
    conn.close()
    
    return jsonify({
        'id': task['id'],
        'title': task['title'],
        'description': task['description'],
        'status': task['status'],
        'created_at': task['created_at'],
        'updated_at': task['updated_at']
    }), 201

@app.route('/api/tasks/<int:task_id>', methods=['PUT'])
@login_required
def update_task(task_id):
    """API: Обновить задачу текущего пользователя"""
    user_id = session['user_id']
    data = request.get_json()
    
    # Валидация на сервере
    title = data.get('title', '').strip()
    description = data.get('description', '').strip()
    status = data.get('status', 'pending')
    
    if not title:
        return jsonify({'error': 'Название задачи обязательно'}), 400
    
    if len(title) > 200:
        return jsonify({'error': 'Название слишком длинное (макс. 200 символов)'}), 400
    
    if len(description) > 1000:
        return jsonify({'error': 'Описание слишком длинное (макс. 1000 символов)'}), 400
    
    if status not in ['pending', 'completed']:
        status = 'pending'
    
    conn = get_db_connection()
    # Проверяем существование задачи и принадлежность пользователю
    task = conn.execute('SELECT * FROM tasks WHERE id = ? AND user_id = ?', 
                       (task_id, user_id)).fetchone()
    if not task:
        conn.close()
        return jsonify({'error': 'Задача не найдена'}), 404
    
    # Обновляем задачу
    conn.execute(
        '''UPDATE tasks 
           SET title = ?, description = ?, status = ?, updated_at = CURRENT_TIMESTAMP 
           WHERE id = ? AND user_id = ?''',
        (title, description, status, task_id, user_id)
    )
    conn.commit()
    
    # Получаем обновленную задачу
    task = conn.execute('SELECT * FROM tasks WHERE id = ?', (task_id,)).fetchone()
    conn.close()
    
    return jsonify({
        'id': task['id'],
        'title': task['title'],
        'description': task['description'],
        'status': task['status'],
        'created_at': task['created_at'],
        'updated_at': task['updated_at']
    })

@app.route('/api/tasks/<int:task_id>/status', methods=['PATCH'])
@login_required
def toggle_task_status(task_id):
    """API: Переключить статус задачи текущего пользователя"""
    user_id = session['user_id']
    conn = get_db_connection()
    task = conn.execute('SELECT * FROM tasks WHERE id = ? AND user_id = ?', 
                       (task_id, user_id)).fetchone()
    
    if not task:
        conn.close()
        return jsonify({'error': 'Задача не найдена'}), 404
    
    # Переключаем статус
    new_status = 'completed' if task['status'] == 'pending' else 'pending'
    
    conn.execute(
        'UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
        (new_status, task_id, user_id)
    )
    conn.commit()
    
    # Получаем обновленную задачу
    task = conn.execute('SELECT * FROM tasks WHERE id = ?', (task_id,)).fetchone()
    conn.close()
    
    return jsonify({
        'id': task['id'],
        'title': task['title'],
        'description': task['description'],
        'status': task['status'],
        'created_at': task['created_at'],
        'updated_at': task['updated_at']
    })

@app.route('/api/tasks/<int:task_id>', methods=['DELETE'])
@login_required
def delete_task(task_id):
    """API: Удалить задачу текущего пользователя"""
    user_id = session['user_id']
    conn = get_db_connection()
    task = conn.execute('SELECT * FROM tasks WHERE id = ? AND user_id = ?', 
                       (task_id, user_id)).fetchone()
    
    if not task:
        conn.close()
        return jsonify({'error': 'Задача не найдена'}), 404
    
    conn.execute('DELETE FROM tasks WHERE id = ? AND user_id = ?', (task_id, user_id))
    conn.commit()
    conn.close()
    
    return jsonify({'message': 'Задача удалена'}), 200

@app.errorhandler(404)
def not_found(error):
    """Обработка ошибки 404"""
    return jsonify({'error': 'Не найдено'}), 404

@app.errorhandler(500)
def internal_error(error):
    """Обработка ошибки 500"""
    return jsonify({'error': 'Внутренняя ошибка сервера'}), 500

init_db()
if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)
