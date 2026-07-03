const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();

const db = require('./db');
const { signToken, requireAuth } = require('./auth');

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is required');
}

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ status: 'error', error: 'Database unavailable' });
  }
});

app.get('/api/auth/status', async (req, res) => {
  const result = await db.query('SELECT COUNT(*)::int AS total FROM users');
  res.json({ setupRequired: result.rows[0].total === 0 });
});

app.post('/api/auth/setup', async (req, res) => {
  const { email, password, dueDate, dailyTarget = 10, timezone = 'UTC' } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const existing = await db.query('SELECT COUNT(*)::int AS total FROM users');
  if (existing.rows[0].total > 0) {
    return res.status(409).json({ error: 'Setup already completed' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const userInsert = await client.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email.toLowerCase(), passwordHash]
    );

    const user = userInsert.rows[0];

    await client.query(
      `INSERT INTO profiles (user_id, due_date, daily_target, timezone, disclaimer_accepted)
       VALUES ($1, $2, $3, $4, TRUE)`,
      [user.id, dueDate || null, dailyTarget, timezone]
    );

    await client.query('COMMIT');

    const token = signToken(user);
    return res.status(201).json({ token, user });
  } catch (err) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: 'Unable to complete setup' });
  } finally {
    client.release();
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const result = await db.query('SELECT id, email, password_hash FROM users WHERE email = $1', [
    email.toLowerCase(),
  ]);

  if (!result.rows.length) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const user = result.rows[0];
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = signToken(user);
  return res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
    },
  });
});

app.get('/api/profile', requireAuth, async (req, res) => {
  const result = await db.query(
    `SELECT due_date, daily_target, timezone, reminder_enabled, reminder_time
     FROM profiles
     WHERE user_id = $1`,
    [req.user.id]
  );

  if (!result.rows.length) {
    return res.status(404).json({ error: 'Profile not found' });
  }

  return res.json(result.rows[0]);
});

app.put('/api/profile', requireAuth, async (req, res) => {
  const { dueDate, dailyTarget, timezone, reminderEnabled, reminderTime } = req.body;

  const result = await db.query(
    `UPDATE profiles
     SET due_date = COALESCE($2, due_date),
         daily_target = COALESCE($3, daily_target),
         timezone = COALESCE($4, timezone),
         reminder_enabled = COALESCE($5, reminder_enabled),
         reminder_time = $6,
         updated_at = NOW()
     WHERE user_id = $1
     RETURNING due_date, daily_target, timezone, reminder_enabled, reminder_time`,
    [
      req.user.id,
      dueDate || null,
      dailyTarget || null,
      timezone || null,
      typeof reminderEnabled === 'boolean' ? reminderEnabled : null,
      reminderTime || null,
    ]
  );

  return res.json(result.rows[0]);
});

app.post('/api/events', requireAuth, async (req, res) => {
  const { occurredAt, note = null, sessionId = null } = req.body;
  const mode = sessionId ? 'session' : 'quick';

  const result = await db.query(
    `INSERT INTO movement_events (user_id, occurred_at, mode, session_id, note)
     VALUES ($1, COALESCE($2, NOW()), $3, $4, $5)
     RETURNING id, occurred_at, mode, session_id, note`,
    [req.user.id, occurredAt || null, mode, sessionId, note]
  );

  if (sessionId) {
    await db.query(
      `UPDATE sessions
       SET actual_count = actual_count + 1,
           updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [sessionId, req.user.id]
    );
  }

  return res.status(201).json(result.rows[0]);
});

app.get('/api/events', requireAuth, async (req, res) => {
  const { start, end } = req.query;

  const result = await db.query(
    `SELECT id, occurred_at, mode, session_id, note
     FROM movement_events
     WHERE user_id = $1
       AND ($2::timestamptz IS NULL OR occurred_at >= $2)
       AND ($3::timestamptz IS NULL OR occurred_at <= $3)
     ORDER BY occurred_at DESC
     LIMIT 500`,
    [req.user.id, start || null, end || null]
  );

  return res.json(result.rows);
});

app.post('/api/sessions/start', requireAuth, async (req, res) => {
  const { targetCount = 10, startedAt = null } = req.body;

  const result = await db.query(
    `INSERT INTO sessions (user_id, started_at, target_count, status)
     VALUES ($1, COALESCE($2, NOW()), $3, 'active')
     RETURNING id, started_at, target_count, actual_count, status`,
    [req.user.id, startedAt, targetCount]
  );

  return res.status(201).json(result.rows[0]);
});

app.post('/api/sessions/:id/end', requireAuth, async (req, res) => {
  const sessionId = Number(req.params.id);
  const { endedAt = null, note = null } = req.body;

  const result = await db.query(
    `UPDATE sessions
     SET ended_at = COALESCE($3, NOW()),
         status = 'completed',
         note = COALESCE($4, note),
         updated_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING id, started_at, ended_at, target_count, actual_count, status, note`,
    [sessionId, req.user.id, endedAt, note]
  );

  if (!result.rows.length) {
    return res.status(404).json({ error: 'Session not found' });
  }

  return res.json(result.rows[0]);
});

app.get('/api/sessions', requireAuth, async (req, res) => {
  const { start, end } = req.query;

  const result = await db.query(
    `SELECT id, started_at, ended_at, target_count, actual_count, status, note
     FROM sessions
     WHERE user_id = $1
       AND ($2::timestamptz IS NULL OR started_at >= $2)
       AND ($3::timestamptz IS NULL OR started_at <= $3)
     ORDER BY started_at DESC
     LIMIT 200`,
    [req.user.id, start || null, end || null]
  );

  return res.json(result.rows);
});

app.get('/api/trends', requireAuth, async (req, res) => {
  const groupBy = String(req.query.groupBy || 'week').toLowerCase();
  const windowSize = Math.max(1, Math.min(365, Number(req.query.windowSize || 8)));

  const profileResult = await db.query('SELECT timezone FROM profiles WHERE user_id = $1', [req.user.id]);
  const timezone = profileResult.rows[0]?.timezone || 'UTC';

  const configs = {
    day: {
      intervalClause: "($2::int || ' days')::interval",
      bucketExpr: "date_trunc('day', occurred_at AT TIME ZONE $3)",
      labelExpr: "to_char(date_trunc('day', occurred_at AT TIME ZONE $3), 'Mon DD')",
      orderExpr: "date_trunc('day', occurred_at AT TIME ZONE $3)",
    },
    hour: {
      intervalClause: "($2::int || ' days')::interval",
      bucketExpr: "EXTRACT(HOUR FROM occurred_at AT TIME ZONE $3)",
      labelExpr: "to_char(make_time(EXTRACT(HOUR FROM occurred_at AT TIME ZONE $3)::int, 0, 0), 'HH24:MI')",
      orderExpr: "EXTRACT(HOUR FROM occurred_at AT TIME ZONE $3)",
    },
    week: {
      intervalClause: "($2::int || ' weeks')::interval",
      bucketExpr: "date_trunc('week', occurred_at AT TIME ZONE $3)",
      labelExpr: "to_char(date_trunc('week', occurred_at AT TIME ZONE $3), 'Mon DD')",
      orderExpr: "date_trunc('week', occurred_at AT TIME ZONE $3)",
    },
    weekday: {
      intervalClause: "($2::int || ' weeks')::interval",
      bucketExpr: "EXTRACT(DOW FROM occurred_at AT TIME ZONE $3)",
      labelExpr: "trim(to_char(date_trunc('day', TIMESTAMP '2024-01-07' + (EXTRACT(DOW FROM occurred_at AT TIME ZONE $3)::int || ' days')::interval), 'Day'))",
      orderExpr: "EXTRACT(DOW FROM occurred_at AT TIME ZONE $3)",
    },
  };

  const config = configs[groupBy];
  if (!config) {
    return res.status(400).json({ error: 'Unsupported trend grouping' });
  }

  const result = await db.query(
    `SELECT ${config.bucketExpr} AS period_value,
            ${config.labelExpr} AS label,
            COUNT(*)::int AS movement_count
     FROM movement_events
     WHERE user_id = $1
       AND occurred_at >= NOW() - ${config.intervalClause}
     GROUP BY 1, 2
     ORDER BY ${config.orderExpr} ASC`,
    [req.user.id, windowSize, timezone]
  );

  return res.json({
    groupBy,
    windowSize,
    timezone,
    points: result.rows,
  });
});

app.get('/api/trends/weekly', requireAuth, async (req, res) => {
  const weeks = Math.max(1, Math.min(26, Number(req.query.weeks || 8)));
  const trendResult = await db.query(
    `SELECT date_trunc('week', occurred_at) AS week_start,
            COUNT(*)::int AS movement_count
     FROM movement_events
     WHERE user_id = $1
       AND occurred_at >= NOW() - ($2::int || ' weeks')::interval
     GROUP BY 1
     ORDER BY 1 ASC`,
    [req.user.id, weeks]
  );

  return res.json(trendResult.rows);
});

app.get('/api/summary/print', requireAuth, async (req, res) => {
  const { start, end } = req.query;

  const [events, sessions, profile] = await Promise.all([
    db.query(
      `SELECT occurred_at, mode, note
       FROM movement_events
       WHERE user_id = $1
         AND ($2::timestamptz IS NULL OR occurred_at >= $2)
         AND ($3::timestamptz IS NULL OR occurred_at <= $3)
       ORDER BY occurred_at ASC`,
      [req.user.id, start || null, end || null]
    ),
    db.query(
      `SELECT started_at, ended_at, target_count, actual_count, status, note
       FROM sessions
       WHERE user_id = $1
         AND ($2::timestamptz IS NULL OR started_at >= $2)
         AND ($3::timestamptz IS NULL OR started_at <= $3)
       ORDER BY started_at ASC`,
      [req.user.id, start || null, end || null]
    ),
    db.query(
      `SELECT due_date, daily_target, timezone
       FROM profiles
       WHERE user_id = $1`,
      [req.user.id]
    ),
  ]);

  return res.json({
    profile: profile.rows[0] || null,
    eventCount: events.rows.length,
    events: events.rows,
    sessions: sessions.rows,
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`Baby tracker running on port ${port}`);
});
