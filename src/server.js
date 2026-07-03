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

app.post('/api/events/:id/context', requireAuth, async (req, res) => {
  const eventId = Number(req.params.id);
  const { position, activity, hydrationLevel, stressLevel, ateRecently, notes } = req.body;

  const event = await db.query('SELECT user_id FROM movement_events WHERE id = $1', [eventId]);
  if (!event.rows.length || event.rows[0].user_id !== req.user.id) {
    return res.status(404).json({ error: 'Event not found' });
  }

  const result = await db.query(
    `INSERT INTO movement_context (movement_event_id, position, activity, hydration_level, stress_level, ate_recently, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (movement_event_id) DO UPDATE SET
       position = $2, activity = $3, hydration_level = $4, stress_level = $5, ate_recently = $6, notes = $7
     RETURNING *`,
    [eventId, position || null, activity || null, hydrationLevel || null, stressLevel || null, ateRecently || null, notes || null]
  );

  return res.json(result.rows[0]);
});

app.get('/api/events/:id/context', requireAuth, async (req, res) => {
  const eventId = Number(req.params.id);

  const event = await db.query('SELECT user_id FROM movement_events WHERE id = $1', [eventId]);
  if (!event.rows.length || event.rows[0].user_id !== req.user.id) {
    return res.status(404).json({ error: 'Event not found' });
  }

  const result = await db.query('SELECT * FROM movement_context WHERE movement_event_id = $1', [eventId]);
  return res.json(result.rows[0] || null);
});

app.get('/api/journal', requireAuth, async (req, res) => {
  const { start, end } = req.query;

  const result = await db.query(
    `SELECT * FROM journal_entries
     WHERE user_id = $1
       AND ($2::date IS NULL OR entry_date >= $2)
       AND ($3::date IS NULL OR entry_date <= $3)
     ORDER BY entry_date DESC`,
    [req.user.id, start || null, end || null]
  );

  return res.json(result.rows);
});

app.post('/api/journal', requireAuth, async (req, res) => {
  const { entryDate, sleepQuality, mood, energyLevel, physicalNotes, concerns, notes } = req.body;

  if (!entryDate) {
    return res.status(400).json({ error: 'Entry date is required' });
  }

  const result = await db.query(
    `INSERT INTO journal_entries (user_id, entry_date, sleep_quality, mood, energy_level, physical_notes, concerns, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id, entry_date) DO UPDATE SET
       sleep_quality = $3, mood = $4, energy_level = $5, physical_notes = $6, concerns = $7, notes = $8, updated_at = NOW()
     RETURNING *`,
    [req.user.id, entryDate, sleepQuality || null, mood || null, energyLevel || null, physicalNotes || null, concerns || null, notes || null]
  );

  return res.json(result.rows[0]);
});

app.get('/api/reminder-presets', requireAuth, async (req, res) => {
  const result = await db.query(
    `SELECT * FROM reminder_presets WHERE user_id = $1 AND is_active = TRUE ORDER BY name ASC`,
    [req.user.id]
  );

  return res.json(result.rows);
});

app.post('/api/reminder-presets', requireAuth, async (req, res) => {
  const { name, targetCount, presetType } = req.body;

  if (!name || !targetCount) {
    return res.status(400).json({ error: 'Name and target count are required' });
  }

  const result = await db.query(
    `INSERT INTO reminder_presets (user_id, name, target_count, preset_type)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [req.user.id, name, targetCount, presetType || 'custom']
  );

  return res.json(result.rows[0]);
});

app.get('/api/patterns/today-vs-average', requireAuth, async (req, res) => {
  const profileResult = await db.query(
    'SELECT timezone FROM profiles WHERE user_id = $1',
    [req.user.id]
  );
  const timezone = profileResult.rows[0]?.timezone || 'UTC';

  const today = await db.query(
    `SELECT COUNT(*)::int AS today_count
     FROM movement_events
     WHERE user_id = $1
       AND date_trunc('day', occurred_at AT TIME ZONE $2) = date_trunc('day', NOW() AT TIME ZONE $2)`,
    [req.user.id, timezone]
  );

  const lastWeek = await db.query(
    `SELECT COUNT(*)::int AS count,
            date_trunc('day', occurred_at AT TIME ZONE $2)::date AS day
     FROM movement_events
     WHERE user_id = $1
       AND occurred_at >= NOW() - '7 days'::interval
     GROUP BY 2
     ORDER BY 2 ASC`,
    [req.user.id, timezone]
  );

  const avgPerDay = lastWeek.rows.length > 0
    ? Math.round(lastWeek.rows.reduce((sum, row) => sum + row.count, 0) / lastWeek.rows.length)
    : 0;

  return res.json({
    todayCount: today.rows[0]?.today_count || 0,
    sevenDayAverage: avgPerDay,
    trend: today.rows[0]?.today_count > avgPerDay ? 'above' : today.rows[0]?.today_count < avgPerDay ? 'below' : 'normal',
  });
});

app.get('/api/patterns/hour-vs-normal', requireAuth, async (req, res) => {
  const profileResult = await db.query(
    'SELECT timezone FROM profiles WHERE user_id = $1',
    [req.user.id]
  );
  const timezone = profileResult.rows[0]?.timezone || 'UTC';
  const currentHour = new Date().getHours();

  const thisHour = await db.query(
    `SELECT COUNT(*)::int AS count
     FROM movement_events
     WHERE user_id = $1
       AND date_trunc('day', occurred_at AT TIME ZONE $2) = date_trunc('day', NOW() AT TIME ZONE $2)
       AND EXTRACT(HOUR FROM occurred_at AT TIME ZONE $2)::int = $3`,
    [req.user.id, timezone, currentHour]
  );

  const normalHour = await db.query(
    `SELECT COUNT(*)::int AS avg_count
     FROM (
       SELECT EXTRACT(HOUR FROM occurred_at AT TIME ZONE $2)::int AS hour,
              COUNT(*)::int / (SELECT COUNT(DISTINCT date_trunc('day', occurred_at AT TIME ZONE $2)) FROM movement_events WHERE user_id = $1) AS daily_avg
       FROM movement_events
       WHERE user_id = $1 AND occurred_at >= NOW() - '30 days'::interval
       GROUP BY 1
     ) AS hourly
     WHERE hour = $3`,
    [req.user.id, timezone, currentHour]
  );

  return res.json({
    currentHour: currentHour,
    thisHourCount: thisHour.rows[0]?.count || 0,
    normalHourCount: normalHour.rows[0]?.avg_count || 0,
    status: thisHour.rows[0]?.count > (normalHour.rows[0]?.avg_count || 0) ? 'above_normal' : 'normal',
  });
});

app.get('/api/milestones', requireAuth, async (req, res) => {
  const profileResult = await db.query(
    'SELECT due_date FROM profiles WHERE user_id = $1',
    [req.user.id]
  );

  const dueDate = profileResult.rows[0]?.due_date;
  if (!dueDate) {
    return res.json({
      current_week: null,
      weeks_remaining: null,
      milestones: [],
    });
  }

  const today = new Date();
  const due = new Date(dueDate);
  const weeksSinceLMP = Math.floor((today - new Date(due.getFullYear(), due.getMonth(), due.getDate() - 280)) / (7 * 24 * 60 * 60 * 1000));
  const weeksRemaining = Math.max(0, 40 - weeksSinceLMP);

  const milestones = [
    { week: 16, text: 'Second trimester begins' },
    { week: 20, text: 'Anatomy scan typically done' },
    { week: 28, text: 'Third trimester begins' },
    { week: 32, text: 'Baby drops (engagement)' },
    { week: 37, text: 'Full term pregnancy' },
    { week: 40, text: 'Due date' },
  ];

  const relevantMilestones = milestones.filter(m => m.week >= Math.max(1, weeksSinceLMP - 2));

  return res.json({
    current_week: Math.max(1, weeksSinceLMP),
    weeks_remaining: weeksRemaining,
    milestones: relevantMilestones,
  });
});

app.get('/api/partner-access', requireAuth, async (req, res) => {
  const result = await db.query(
    `SELECT id, partner_email, access_level, accepted, created_at
     FROM partner_access
     WHERE primary_user_id = $1
     ORDER BY created_at DESC`,
    [req.user.id]
  );

  return res.json(result.rows);
});

app.post('/api/partner-access/invite', requireAuth, async (req, res) => {
  const { partnerEmail } = req.body;

  if (!partnerEmail) {
    return res.status(400).json({ error: 'Partner email is required' });
  }

  const result = await db.query(
    `INSERT INTO partner_access (primary_user_id, partner_email, access_level)
     VALUES ($1, $2, 'view')
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [req.user.id, partnerEmail.toLowerCase()]
  );

  return res.status(201).json(result.rows[0] || { message: 'Invite already sent' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`Baby tracker running on port ${port}`);
});
