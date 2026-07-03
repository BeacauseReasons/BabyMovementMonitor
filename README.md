# Little Kicks Tracker

Little Kicks Tracker is a wellness-focused baby movement tracker built as a website for shared household use. It is designed to run in Docker, work well on phone and desktop browsers, and make day-to-day movement logging faster and less frustrating than the typical tracker apps.

## What it does

- Creates a single shared household account for both parents to use across devices.
- **Quick movement logging** for casual all-day tracking with optional context (position, activity, hydration, stress).
- **Timed kick-count sessions** with progress toward a customizable target.
- **Context logging** for each movement to track position, activity level, hydration, and stress.
- **Daily journal** for wellness tracking (mood, energy, sleep, physical notes, concerns).
- **Pattern insights** showing movement today vs 7-day average and this hour vs normal hour.
- **Pregnancy milestones** with week counter and upcoming milestone timeline.
- **Dedicated Trends page** with filters by day, hour of day, week, and day of week.
- **Calm mode** for low-stimulation, larger UI suitable for nighttime use.
- **Kick-count presets** to quickly select common counting targets.
- **Smart reminders** with browser notifications.
- **Partner access** system for inviting another household member to view or collaborate.
- **Print-friendly summary** for appointments or personal review.
- **Offline-first** architecture with local data persistence.

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

### Movement Tracking

- Quick tap movement logging with optional notes
- Timed session tracking with progress toward target
- Session progress display (actual / target count)
- Customizable kick-count presets (e.g., "Count to 10")
- Context logging for each movement:
  - Position (sitting, standing, lying down)
  - Activity (resting, walking, active)
  - Hydration level (1-5 scale)
  - Stress level (1-5 scale)
  - Ate recently (yes/no)

### Insights & Patterns

- Today vs 7-day average comparison
- Current hour vs historical normal hour comparison
- Weekly snapshot on main dashboard
- Dedicated Trends page with advanced filtering:
  - Grouping by day, hour of day, week, or day of week
  - Adjustable time windows (1-365 days)
  - Summary highlights (total, busiest period, averages)

### Wellness & Journal

- Daily journal entries with:
  - Sleep quality (1-5)
  - Mood tracking (great, good, okay, tired, anxious)
  - Energy level (1-5)
  - Physical notes (swelling, aches, cravings)
  - Concerns to discuss with provider
  - General notes
- Journal history view

### Pregnancy Timeline

- Automatic pregnancy week calculation from due date
- Countdown to due date
- Relevant pregnancy milestones (e.g., "Second trimester begins", "Full term pregnancy")

### Reminders & Notifications

- Daily browser notifications
- Customizable reminder time
- Preset targets for quick-start sessions

### Household & Partner Access

- Shared login across devices
- Partner invitation system (infrastructure ready)
- Shared movement history

### User Experience

- Calm mode for low-stimulation UI (larger buttons, reduced motion)
- Print-friendly summary for appointments (date range selection)
- Offline-first data persistence
- Responsive design for phone and desktop

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

**Core tables:**
- `users`: household account and authentication
- `profiles`: due date, targets, timezone, preferences
- `sessions`: timed kick-count sessions
- `movement_events`: individual movement taps

**New feature tables:**
- `movement_context`: position, activity, hydration, stress logged with each movement
- `journal_entries`: daily wellness tracking (mood, energy, sleep, notes, concerns)
- `reminder_presets`: customizable kick-count targets
- `partner_access`: partner invitations and access management
- `milestone_preferences`: pregnancy milestone display settings

Data is persisted through the Docker volume declared in [docker-compose.yml](docker-compose.yml).

## Current API surface

### Authentication
- `GET /api/health`
- `GET /api/auth/status`
- `POST /api/auth/setup`
- `POST /api/auth/login`

### Profile
- `GET /api/profile`
- `PUT /api/profile`

### Movement Events
- `POST /api/events`
- `GET /api/events`
- `POST /api/events/:id/context`
- `GET /api/events/:id/context`

### Sessions
- `POST /api/sessions/start`
- `POST /api/sessions/:id/end`
- `GET /api/sessions`

### Trends & Analytics
- `GET /api/trends` (with `groupBy` and `windowSize` query params)
- `GET /api/trends/weekly`
- `GET /api/patterns/today-vs-average`
- `GET /api/patterns/hour-vs-normal`

### Journal
- `GET /api/journal` (with optional `start` and `end` date filters)
- `POST /api/journal`

### Milestones
- `GET /api/milestones`

### Reminders & Presets
- `GET /api/reminder-presets`
- `POST /api/reminder-presets`

### Partner Access
- `GET /api/partner-access`
- `POST /api/partner-access/invite`

### Reporting
- `GET /api/summary/print`

## Known limitations

- Browser reminders are local to the browser and device where they are enabled.
- Partner access UI is in place for invitations but full partner collaboration features (live sharing, partner permissions) are infrastructure-ready and can be expanded.
- Docker startup will fail if Docker Desktop is installed but not running.
- CSV export is not yet implemented.
- Journal and context logging do not affect reminders or alerts (this is intentional to avoid medical claims).

## Suggested next improvements

- CSV export for appointment sharing and backup
- Automated unit and integration tests for API and frontend flows
- Partner accept/decline flow and permission management
- Push notifications in addition to browser notifications
- Mobile app (native iOS/Android) built from the same API
- More polished print summary with charts and graphs
- Rate limiting and optional stronger auth protections (2FA, lockout after failed attempts)
- Export data to PDF with professional formatting for sharing with providers
- Integration with health platforms (Apple Health, Google Fit) for resting heart rate context

## Safety note

This app is for wellness tracking only and does not provide medical advice. Contact your healthcare provider for concerns about fetal movement.
