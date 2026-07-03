# Little Kicks Tracker

Little Kicks Tracker is a wellness-focused baby movement tracker built as a website for shared household use. It is designed to run in Docker, work well on phone and desktop browsers, and make day-to-day movement logging faster and less frustrating than the typical tracker apps.

## What it does

- Creates a single shared household account for both parents to use across devices.
- Supports quick movement logging for casual all-day tracking.
- Supports timed kick-count sessions with progress toward a target.
- Stores notes on quick logs and sessions.
- Shows recent activity and daily totals.
- Includes a dedicated Trends page with filters by day, hour of day, week, and day of week.
- Supports browser-based reminders.
- Generates a print-friendly summary for appointments or personal review.

## Product scope

This app is intentionally built as a wellness tracker, not a medical device.

- It does not diagnose fetal health.
- It does not provide medical decision-making.
- It does not replace advice from a doctor, midwife, or other care provider.

If there is any concern about movement changes, contact your healthcare provider directly.

## Tech stack

- Frontend: vanilla HTML, CSS, and JavaScript
- Backend: Node.js with Express
- Database: PostgreSQL
- Authentication: JWT-based shared household login
- Deployment: Docker Compose

## Project structure

- [src/server.js](src/server.js): Express API and static app host
- [src/auth.js](src/auth.js): token signing and auth middleware
- [src/db.js](src/db.js): PostgreSQL connection pool
- [public/index.html](public/index.html): app layout and screens
- [public/app.js](public/app.js): frontend behavior and API integration
- [public/styles.css](public/styles.css): styling
- [sql/init.sql](sql/init.sql): database schema bootstrap
- [docker-compose.yml](docker-compose.yml): Docker services
- [Dockerfile](Dockerfile): application image definition

## Features in this build

### Tracking

- Quick tap movement logging
- Timed session tracking
- Session progress display
- Notes on entries and sessions

### Trends

- Weekly snapshot on the main tracker screen
- Dedicated Trends page
- Grouping filters for:
  - day
  - hour of day
  - week
  - day of week
- Summary highlight cards for totals, busiest period, and averages

### Household use

- Shared login across devices
- Browser notifications for reminders
- Print summary for selected date range

## Running the app with Docker

### Prerequisites

- Docker Desktop installed
- Docker Desktop running

### Start the app

1. Open a terminal in the project root.
2. Run:

```bash
docker compose up --build
```

3. Open the app in your browser:

```text
http://localhost:3000
```

### Service ports

- App and API: `3000`
- PostgreSQL: `5432`

### First-time setup

1. Open the site.
2. Create the shared household account.
3. Set the due date and daily target.
4. Save reminder preferences on each device where notifications are needed.

## Local environment variables

See [.env.example](.env.example).

Available variables:

- `PORT`: app port
- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: token signing secret

## Database notes

The database is initialized from [sql/init.sql](sql/init.sql) and includes:

- `users`
- `profiles`
- `sessions`
- `movement_events`

Data is persisted through the Docker volume declared in [docker-compose.yml](docker-compose.yml).

## Current API surface

Main endpoints included in this build:

- `GET /api/health`
- `GET /api/auth/status`
- `POST /api/auth/setup`
- `POST /api/auth/login`
- `GET /api/profile`
- `PUT /api/profile`
- `POST /api/events`
- `GET /api/events`
- `POST /api/sessions/start`
- `POST /api/sessions/:id/end`
- `GET /api/sessions`
- `GET /api/trends`
- `GET /api/trends/weekly`
- `GET /api/summary/print`

## Known limitations

- Browser reminders are local to the browser and device where they are enabled.
- There is currently one shared household account model, not separate partner accounts.
- Docker startup will fail if Docker Desktop is installed but not running.
- There is no CSV export yet.

## Suggested next improvements

- CSV export for appointment sharing and backup
- Automated tests for the API and frontend flows
- Better trend comparisons between time windows
- More polished print summary formatting
- Optional stronger auth protections such as rate limiting

## Safety note

This app is for wellness tracking only and does not provide medical advice. Contact your healthcare provider for concerns about fetal movement.
