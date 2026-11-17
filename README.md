# DineSense Feedback

**Automated Restaurant Feedback Platform with Direct Guest Surveys, Optional Consent-Based Expression-Cue Analysis, and Service Analytics**

DineSense Feedback prioritizes direct customer ratings (food quality, staff service, cleanliness, waiting time) and written comments, while offering an optional, affirmative-consent facial-expression cue module as a supplementary, uncertain aggregate signal.

## Core Privacy & Ethical Principles
- **Direct Feedback First**: Camera-free feedback works completely independently of the AI module.
- **No Face Recognition or Identity Tracking**: No biometric templates, no cross-visit tracking, no employee scoring, and no covert capture.
- **Zero Raw Image Persistence**: Single guest-initiated frames are evaluated and discarded immediately in memory.
- **Abstention Over Forced Predictions**: Insufficient lighting, blur, missing face framing, or low confidence returns `"Unable to assess – Please use another feedback method."`
- **Small-Group Privacy Suppression**: Expression-cue groups and aggregate report exports enforce a minimum threshold ($n \ge 5$).

## Project Architecture
- `/` (`server.ts`, `server/`, `src/`): Full-stack React + TypeScript + Vite + Tailwind + Express + SQLite (WAL) application running on port `3000`.
- `backend/`: Python FastAPI + SQLAlchemy + Alembic + PostgreSQL/SQLite REST API + OpenCV/ONNX Runtime inference provider + Pytest suite.
- `ml/`: MobileNetV2 transfer-learning training script, ONNX export, evaluation & Brier score suite, and `model_card.md`.
- `deployment/`: `Dockerfile.frontend`, `Dockerfile.backend`, and `docker-compose.yml`.
- `docs/`: Windows 10/11 installation guide, REST API reference, and security & privacy documentation.

## Quick Start (Windows 10/11 & macOS/Linux)
1. Install Node.js 20+ and copy `.env.example` to `.env`.
2. Run:
   ```bash
   npm install
   npm run dev
   ```
3. Open `http://localhost:3000`.

For full Windows Python/FastAPI/PostgreSQL/Docker setup instructions, see `docs/INSTALLATION.md`.
