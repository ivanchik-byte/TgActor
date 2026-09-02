# Contributing to TgActor

Thank you for your interest in improving TgActor. We welcome contributions, including bug fixes, documentation updates, frontend enhancements, and new backend features.

Please review this guide before getting started.

## Code of conduct

By participating in this project, you agree to follow our [Code of conduct](CODE_OF_CONDUCT.md). Please report unacceptable behavior directly to the maintainers.

## Getting started

### Prerequisites

Make sure you have the following tools installed:

* Python 3.11 or higher
* Docker and Docker Compose
* Node.js 20 or higher (only required if modifying the frontend)
* Git

### Local environment setup

1. Fork and clone the repository:

   ```bash
   git clone https://github.com/<your-username>/TgActor.git
   cd TgActor
   ```

2. Create and activate a Python virtual environment:

   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install backend dependencies:

   ```bash
   pip install -r requirements.txt
   ```

4. If you plan to work on the user interface, install frontend dependencies:

   ```bash
   cd frontend
   npm install
   cd ..
   ```

5. Configure environment variables:

   Copy the sample environment file:

   ```bash
   cp .env.example .env
   ```

   Generate a secure secret key:

   ```bash
   python3 -c "import secrets; print(secrets.token_urlsafe(32))"
   ```

   Open `.env` in your editor and set:
   * `DATABASE_URL` (defaults to PostgreSQL on localhost:5432 or docker-compose db)
   * `REDIS_URL` (defaults to redis://localhost:6379/0 or docker-compose redis)
   * `SECRET_KEY` and `ENCRYPTION_KEY` (use your generated secret)
   * `ADMIN_PASSWORD` (password used to log into the web dashboard)

6. Start PostgreSQL and Redis:

   ```bash
   docker compose up -d db redis
   ```

7. Run database migrations:

   ```bash
   alembic upgrade head
   ```

8. Start the development server:

   To run the backend with hot reload:

   ```bash
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

   To work on the React frontend with Vite hot module replacement:

   ```bash
   cd frontend
   npm run dev
   ```

   Alternatively, you can build and run the entire project containerized:

   ```bash
   docker compose up --build
   ```

## Development workflow

### Branch naming conventions

Create a feature branch from `main` using one of the following prefixes:

* `feat/your-feature-name` for new functionality
* `fix/bug-description` for bug fixes
* `docs/documentation-update` for documentation changes
* `refactor/component-name` for internal refactoring

```bash
git checkout -b feat/custom-prompt-filters
```

### Running tests

Run the test suite before submitting changes:

```bash
pytest
```

If you modify the web interface, verify that the frontend builds and tests pass:

```bash
cd frontend
npm run build
npm run test
cd ..
```

### Code style guidelines

* Follow PEP 8 standards for all Python code.
* Use explicit type annotations on function parameters and return values.
* Write clear, modular functions that handle one job.
* Avoid leaving debug prints or commented-out code blocks in pull requests.
* For the frontend, maintain TypeScript types and adhere to Tailwind CSS v4 styling rules.

### Commit message format

We follow the Conventional Commits specification:

```text
<type>(<scope>): <short description>
```

Common types:

* `feat`: New user-facing feature or API capability
* `fix`: Bug fix
* `refactor`: Code change that neither fixes a bug nor adds a feature
* `docs`: Documentation updates
* `test`: Adding or correcting tests
* `chore`: Build config, dependencies, or maintenance tasks

Examples:

* `feat(sniper): add channel whitelist filter for new posts`
* `fix(inbox): prevent duplicate websocket reconnect loops`
* `docs(setup): clarify proxy requirements in readme`

## Submitting a pull request

1. Push your branch to your GitHub fork:

   ```bash
   git push origin feat/your-feature-name
   ```

2. Open a pull request against the `main` branch of the upstream repository.
3. Fill out the pull request template with a description of your change, testing evidence, and related issue links.
4. Verify that all automated tests pass.
5. Address code review feedback promptly.

## Questions and support

If you have questions about the codebase, open an issue, start a GitHub discussion, or contact the maintainer directly on Telegram at [@ivanchikbyte](https://t.me/ivanchikbyte). You can also join our updates channel at [@ivanchik_byte](https://t.me/ivanchik_byte).
