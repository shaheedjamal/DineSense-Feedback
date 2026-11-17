# Windows 10 / 11 Installation & Execution Guide

This beginner-friendly guide covers running both the full-stack Node/React web application and the optional Python FastAPI + PostgreSQL + ML backend on Windows 10/11.

---

## 1. Prerequisites
1. **Node.js 20+ LTS**: Download from https://nodejs.org/ and verify in Command Prompt:
   ```cmd
   node -v
   npm -v
   ```
2. **Python 3.11** (for FastAPI & ML scripts): Download from https://www.python.org/downloads/ and check **"Add Python to PATH"** during installation.
3. **PostgreSQL 16** (optional for production; SQLite works out of the box locally): Download from https://www.postgresql.org/download/windows/.

---

## 2. Running the Full-Stack Web App (Port 3000)
Open Command Prompt or PowerShell in the project folder:
```cmd
copy .env.example .env
npm install
npm run dev
```
Open **http://localhost:3000** in your browser.

### Demonstration Staff Accounts
- **Super Admin**: `superadmin@dinesense.demo` / `DemoPass!2026`
- **Restaurant Admin**: `admin@bistromeridian.demo` / `DemoPass!2026`
- **Restaurant Manager**: `manager@bistromeridian.demo` / `DemoPass!2026`

---

## 3. Running the Python FastAPI Backend on Windows
Open Command Prompt inside the `backend` folder:
```cmd
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

### Database Setup (PostgreSQL)
Open `psql` or pgAdmin and create the database:
```sql
CREATE USER dinesense WITH PASSWORD 'dinesense_password';
CREATE DATABASE dinesense_db OWNER dinesense;
```
Update `DATABASE_URL` in `.env` and run Alembic migrations:
```cmd
alembic upgrade head
```

### Start FastAPI Server (Port 8000)
```cmd
uvicorn app.main:app --reload --port 8000
```
Interactive Swagger API docs will be available at **http://localhost:8000/docs**.

### Run Automated Python Tests
```cmd
pytest tests/test_dinesense.py -v
```

---

## 4. Docker Compose Deployment (PostgreSQL + FastAPI + Frontend)
From the `deployment/` folder:
```cmd
cd deployment
docker compose up --build -d
```
- Web UI: `http://localhost:3000`
- FastAPI API: `http://localhost:8000/docs`
