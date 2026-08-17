# TgActor — Программа для управления Telegram-аккаунтами и создания живых диалогов

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.11+-3776AB?style=flat&logo=python&logoColor=white" alt="Python" />
  <img src="https://img.shields.io/badge/FastAPI-0.100+-009688?style=flat&logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Telegram-Hydrogram-26A5E4?style=flat&logo=telegram&logoColor=white" alt="Telegram Engine" />
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=flat&logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat" alt="License" />
</p>

<p align="center">
  <a href="https://t.me/ivanchik_byte"><img src="https://img.shields.io/badge/Telegram-Канал_@ivanchik__byte-2CA5E0?style=flat&logo=telegram&logoColor=white" alt="Telegram Channel" /></a>
  <a href="https://t.me/ivanchikbyte"><img src="https://img.shields.io/badge/Telegram-Связь_@ivanchikbyte-0088cc?style=flat&logo=telegram&logoColor=white" alt="Telegram Direct" /></a>
</p>

TgActor — это программа с веб-интерфейсом для управления сеткой Telegram-аккаунтов. Она позволяет автоматически разыгрывать естественные диалоги под постами в каналах, ставить реакции-лайки, перехватывать новые публикации и отвечать на входящие сообщения со всех аккаунтов в одном окне.

- Telegram-канал разработчика: [https://t.me/ivanchik_byte](https://t.me/ivanchik_byte) (новости, шаблоны сценариев, полезные скрипты).
- Личные сообщения разработчика: [https://t.me/ivanchikbyte](https://t.me/ivanchikbyte) (вопросы, предложения, связь).

---

## Оглавление

1. [Что умеет программа](#что-умеет-программа)
2. [Скриншоты интерфейса](#скриншоты-интерфейса)
3. [Как это работает](#как-это-работает)
4. [Установка через Docker (Рекомендуемый способ)](#установка-через-docker-рекомендуемый-способ)
   - [Установка на Linux / VPS](#1-установка-на-linux--vps)
   - [Установка на Windows](#2-установка-на-windows)
5. [Установка без Docker (Локально)](#установка-без-docker-локально)
6. [Генерация секретного ключа (SECRET_KEY)](#генерация-секретного-ключа-secret_key)
7. [Настройка файла .env](#настройка-файла-env)
8. [Устранение частых ошибок](#устранение-частых-ошибок)
9. [Контакты и лицензия](#контакты-и-лицензия)

---

## Что умеет программа

- Конструктор диалогов: создание цепочек сообщений любой длины с ответами ботов друг на друга, паузами и прикреплением файлов.
- Генерация текста через нейросеть (ИИ):
  - Создание готового сценария по вашему описанию в 1 клик.
  - Динамический режим: нейросеть сама формулирует уникальный текст ответа прямо во время комментирования поста.
- Мониторинг каналов (Радар): программа следит за каналами и, как только выходит новый пост, автоматически отправляет ботов комментировать его.
- Плавный вход ботов: боты заходят в чаты по очереди с паузами (например, раз в 30-60 секунд), чтобы избежать спам-блокировок Telegram.
- Разделение аккаунтов на пулы: одни аккаунты пишут текст, другие ставят эмодзи-реакции.
- Единый чат (Инбокс): чтение и отправка личных сообщений со всех подключенных аккаунтов в одной вкладке.
- Удобный импорт: добавление аккаунтов через архивы TData (с поддержкой 2FA) или по SMS-коду.
- Поддержка прокси: к каждому аккаунту можно привязать отдельный SOCKS5 или HTTP прокси.

---

## Скриншоты интерфейса

### 1. Конструктор сценариев и предпросмотр чата
Удобный визуальный редактор диалогов с живой симуляцией порядка ответов.

![Конструктор диалогов](images/01_scenarios_constructor.png)

---

### 2. Централизованный инбокс (Входящие сообщения)
Чтение и отправка личных сообщений со всех подключенных аккаунтов в едином окне.

![Входящие сообщения](images/02_unified_inbox.png)

---

### 3. Управление аккаунтами и пулами
Импорт аккаунтов, привязка прокси и настройка ролей ботов.

![Управление аккаунтами](images/03_accounts_management.png)

---

### 4. Пример диалога в Telegram
Результат работы ботов: связная ветка комментариев с ответами участников друг другу.

![Пример диалога](images/04_telegram_discussion.png)

Полная галерея всех экранов программы доступна в файле [docs/SCREENSHOTS.md](docs/SCREENSHOTS.md).

---

## Как это работает

1. Вы загружаете свои Telegram-аккаунты через TData или SMS.
2. Создаете сценарий вручную или генерируете его через встроенный ИИ (поддерживаются NVIDIA NIM, DeepSeek, OpenAI).
3. Добавляете нужные каналы во вкладку «Мониторинг».
4. Программа автоматически находит группу обсуждений под каналом, безопасно добавляет туда ботов и запускает обсуждение по вашему сценарию.

---

## Установка через Docker (Рекомендуемый способ)

Установка через Docker является самой быстрой и надежной, так как автоматически настраивает базу данных PostgreSQL, брокер Redis, бэкенд и собранный веб-интерфейс.

### 1. Установка на Linux / VPS

1. Убедитесь, что на сервере установлены Git и Docker:
   ```bash
   sudo apt update && sudo apt install -y git docker.io docker-compose-v2
   ```

2. Склонируйте репозиторий:
   ```bash
   git clone https://github.com/ivanchik-byte/TgActor.git
   cd TgActor
   ```

3. Создайте файл конфигурации `.env`:
   ```bash
   cp .env.example .env
   ```

4. Сгенерируйте секретный ключ для шифрования данных:
   ```bash
   python3 -c "import secrets; print(secrets.token_urlsafe(32))"
   ```
   Откройте файл `.env` (`nano .env`) и вставьте сгенерированный ключ в строки:
   ```env
   SECRET_KEY=вставьте_сгенерированный_ключ
   ENCRYPTION_KEY=вставьте_сгенерированный_ключ
   ADMIN_PASSWORD=ваш_пароль_для_входа
   ```

5. Запустите проект:
   ```bash
   docker compose up -d --build
   ```

6. Откройте панель в браузере: `http://IP_ВАШЕГО_СЕРВЕРА:8000`.

---

### 2. Установка на Windows

1. Установите [Docker Desktop для Windows](https://www.docker.com/products/docker-desktop/) (при установке оставьте галочку WSL 2).
2. Запустите PowerShell или командную строку (CMD) и выполните:
   ```powershell
   git clone https://github.com/ivanchik-byte/TgActor.git
   cd TgActor
   Copy-Item .env.example .env
   ```
3. Сгенерируйте ключ шифрования:
   ```powershell
   python -c "import secrets; print(secrets.token_urlsafe(32))"
   ```
4. Откройте файл `.env` в Блокноте и заполните:
   - `SECRET_KEY` и `ENCRYPTION_KEY` — сгенерированным ключом.
   - `ADMIN_PASSWORD` — вашим паролем для входа.
5. Запустите программу:
   ```powershell
   docker compose up -d --build
   ```
6. Откройте в браузере: `http://localhost:8000`.

---

## Установка без Docker (Локально)

Если вы не хотите использовать Docker, вы можете запустить проект напрямую через Python и Node.js.

### Требования:
- Python 3.11 или выше
- Node.js 18+ и npm
- Запущенный Redis сервер (или локальный Redis)

### Шаги запуска:

1. Клонирование и настройка виртуального окружения:
   ```bash
   git clone https://github.com/ivanchik-byte/TgActor.git
   cd TgActor
   python3 -m venv venv
   source venv/bin/activate  # На Windows: .\venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. Сборка интерфейса:
   ```bash
   cd frontend
   npm install
   npm run build
   cd ..
   ```

3. Настройка файла `.env`:
   ```bash
   cp .env.example .env
   ```
   Укажите ваш `SECRET_KEY`, `ADMIN_PASSWORD` и параметры подключения к БД (по умолчанию для локального запуска без Docker можно использовать SQLite: `DATABASE_URL=sqlite+aiosqlite:///./data/tgactor.db`).

4. Применение миграций базы данных:
   ```bash
   alembic upgrade head
   ```

5. Запуск сервера:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8000
   ```
   Панель будет доступна по адресу: `http://localhost:8000`.

---

## Генерация секретного ключа (SECRET_KEY)

Ключ необходим для шифрования Telegram-сессий в базе данных. Выполните команду в терминале:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

Скопируйте полученную строку и вставьте в `.env` в поля `SECRET_KEY=` и `ENCRYPTION_KEY=`.

---

## Настройка файла .env

| Параметр | Описание | Значение по умолчанию |
| :--- | :--- | :--- |
| `ADMIN_PASSWORD` | Пароль для входа в веб-панель управления | `admin` |
| `SECRET_KEY` | Секретный ключ шифрования сессий и токенов | Сгенерированный ключ |
| `ENCRYPTION_KEY` | Ключ шифрования TData и сессий | Сгенерированный ключ |
| `DATABASE_URL` | Строка подключения к PostgreSQL или SQLite | `postgresql+asyncpg://tgactor:tgactor_password@db:5432/tgactor_db` |
| `REDIS_URL` | Строка подключения к брокеру Redis | `redis://redis:6379/0` |
| `PORT` | Порт для веб-интерфейса (если 8000 занят) | `8000` |
| `ENABLE_CHANNEL_MONITOR` | Фоновый опрос каналов и авто-запуск сценариев | `True` |
| `ENABLE_INBOX_LISTENER` | Фоновое слушание и стриминг входящих ЛС | `True` |

---

## Устранение частых ошибок

- Не заходит в панель (Unauthorized): проверьте правильность `ADMIN_PASSWORD` в файле `.env` и очистите куки сайта в браузере.
- Порт 8000 уже занят: укажите другой порт в файле `.env` (например, `PORT=8080`) и перезапустите через `docker compose up -d`.
- Боты не комментируют: проверьте, что в конструкторе сценариев есть хотя бы один активный сценарий с заполненными шагами, и что у целевого канала открыты комментарии.
- ИИ долго генерирует ответ: в окне «Настройки ИИ» выберите более легкую и быструю модель (например, `meta/llama-3.3-70b-instruct` или `deepseek-chat`).

Полезные команды для обслуживания:
```bash
# Просмотр логов бэкенда в реальном времени
docker compose logs -f backend

# Перезапуск бэкенда
docker compose restart backend

# Остановка всех контейнеров
docker compose down

# Обновление и пересборка контейнеров
docker compose up -d --build
```

---

## Контакты и лицензия

- Telegram-канал разработчика: [https://t.me/ivanchik_byte](https://t.me/ivanchik_byte) — обновления, готовые сценарии, скрипты и кейсы.
- Личные сообщения: [https://t.me/ivanchikbyte](https://t.me/ivanchikbyte) — вопросы по проекту, баг-репорты и предложения.
- Лицензия: [MIT License](LICENSE)

Отказ от ответственности: программа разработана для тестирования, исследований и демонстрационных целей. Проект не предназначен и не поддерживает массовую рассылку, спам, накрутку engagement или любые формы манипуляции платформой.
