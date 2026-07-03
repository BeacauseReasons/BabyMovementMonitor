const state = {
  token: localStorage.getItem('trackerToken') || null,
  activeSession: null,
  profile: null,
  reminderInterval: null,
  currentPage: 'dashboard',
};

const el = {
  authCard: document.getElementById('authCard'),
  authForm: document.getElementById('authForm'),
  authTitle: document.getElementById('authTitle'),
  authSubtitle: document.getElementById('authSubtitle'),
  authSubmit: document.getElementById('authSubmit'),
  authError: document.getElementById('authError'),
  dueDateWrap: document.getElementById('dueDateWrap'),
  dailyTargetWrap: document.getElementById('dailyTargetWrap'),
  email: document.getElementById('email'),
  password: document.getElementById('password'),
  dueDate: document.getElementById('dueDate'),
  dailyTarget: document.getElementById('dailyTarget'),

  appNav: document.getElementById('appNav'),
  showDashboardBtn: document.getElementById('showDashboardBtn'),
  showTrendsBtn: document.getElementById('showTrendsBtn'),

  dashboard: document.getElementById('dashboard'),
  trendsPage: document.getElementById('trendsPage'),
  quickTapBtn: document.getElementById('quickTapBtn'),
  quickNote: document.getElementById('quickNote'),
  todayCount: document.getElementById('todayCount'),

  sessionTarget: document.getElementById('sessionTarget'),
  startSessionBtn: document.getElementById('startSessionBtn'),
  endSessionBtn: document.getElementById('endSessionBtn'),
  sessionTapBtn: document.getElementById('sessionTapBtn'),
  sessionProgress: document.getElementById('sessionProgress'),
  sessionNote: document.getElementById('sessionNote'),

  reminderEnabled: document.getElementById('reminderEnabled'),
  reminderTime: document.getElementById('reminderTime'),
  saveReminderBtn: document.getElementById('saveReminderBtn'),

  profileDueDate: document.getElementById('profileDueDate'),
  profileDailyTarget: document.getElementById('profileDailyTarget'),
  saveProfileBtn: document.getElementById('saveProfileBtn'),
  profileMessage: document.getElementById('profileMessage'),

  trendBars: document.getElementById('trendBars'),
  trendPageBars: document.getElementById('trendPageBars'),
  trendHighlights: document.getElementById('trendHighlights'),
  trendGroupBy: document.getElementById('trendGroupBy'),
  trendWindowSize: document.getElementById('trendWindowSize'),
  applyTrendFilterBtn: document.getElementById('applyTrendFilterBtn'),
  trendHint: document.getElementById('trendHint'),
  summaryStart: document.getElementById('summaryStart'),
  summaryEnd: document.getElementById('summaryEnd'),
  printSummaryBtn: document.getElementById('printSummaryBtn'),
  eventList: document.getElementById('eventList'),

  quickContextDetails: document.getElementById('quickContextDetails'),
  quickPosition: document.getElementById('quickPosition'),
  quickActivity: document.getElementById('quickActivity'),
  quickHydration: document.getElementById('quickHydration'),
  quickStress: document.getElementById('quickStress'),
  quickAteRecently: document.getElementById('quickAteRecently'),
  patternToday: document.getElementById('patternToday'),

  sessionPreset: document.getElementById('sessionPreset'),
  sessionActivity: document.getElementById('sessionActivity'),
  sessionStress: document.getElementById('sessionStress'),
  sessionContextDetails: document.getElementById('sessionContextDetails'),

  patternComparison: document.getElementById('patternComparison'),
  hourPattern: document.getElementById('hourPattern'),
  pregnancyWeek: document.getElementById('pregnancyWeek'),
  milestoneList: document.getElementById('milestoneList'),

  showJournalBtn: document.getElementById('showJournalBtn'),
  journalPage: document.getElementById('journalPage'),
  journalEntryDate: document.getElementById('journalEntryDate'),
  loadJournalEntryBtn: document.getElementById('loadJournalEntryBtn'),
  journalSleep: document.getElementById('journalSleep'),
  journalMood: document.getElementById('journalMood'),
  journalEnergy: document.getElementById('journalEnergy'),
  journalPhysical: document.getElementById('journalPhysical'),
  journalConcerns: document.getElementById('journalConcerns'),
  journalNotes: document.getElementById('journalNotes'),
  saveJournalBtn: document.getElementById('saveJournalBtn'),
  journalMessage: document.getElementById('journalMessage'),
  journalList: document.getElementById('journalList'),

  calmModeBtn: document.getElementById('calmModeBtn'),
};

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const res = await fetch(path, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Request failed');
  }

  if (res.status === 204) {
    return null;
  }

  return res.json();
}

function isoDate(value) {
  return new Date(value).toLocaleString();
}

function setAuthMode(setupRequired) {
  if (setupRequired) {
    el.authTitle.textContent = 'Create Household Account';
    el.authSubtitle.textContent = 'Set up once, then use the same login on all your devices.';
    el.authSubmit.textContent = 'Create Account';
    el.dueDateWrap.classList.remove('hidden');
    el.dailyTargetWrap.classList.remove('hidden');
  } else {
    el.authTitle.textContent = 'Sign In';
    el.authSubtitle.textContent = 'Use your shared household login.';
    el.authSubmit.textContent = 'Sign In';
    el.dueDateWrap.classList.add('hidden');
    el.dailyTargetWrap.classList.add('hidden');
  }
}

function showDashboard(show) {
  el.authCard.classList.toggle('hidden', show);
  el.appNav.classList.toggle('hidden', !show);
  renderPage(show ? state.currentPage : null);
}

function renderPage(pageName) {
  const showDashboardPage = pageName === 'dashboard';
  const showTrendsPage = pageName === 'trends';
  const showJournalPage = pageName === 'journal';
  el.dashboard.classList.toggle('hidden', !showDashboardPage);
  el.trendsPage.classList.toggle('hidden', !showTrendsPage);
  el.journalPage.classList.toggle('hidden', !showJournalPage);
  el.showDashboardBtn.classList.toggle('nav-button-active', showDashboardPage);
  el.showTrendsBtn.classList.toggle('nav-button-active', showTrendsPage);
  el.showJournalBtn.classList.toggle('nav-button-active', showJournalPage);
}

function switchPage(pageName) {
  state.currentPage = pageName;
  renderPage(pageName);
}

async function initializeAuthView() {
  const status = await api('/api/auth/status');
  setAuthMode(status.setupRequired);
  if (state.token) {
    await loadDashboard();
    showDashboard(true);
  }
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  el.authError.textContent = '';

  const payload = {
    email: el.email.value.trim(),
    password: el.password.value,
  };

  try {
    const isSetup = el.authSubmit.textContent === 'Create Account';
    if (isSetup) {
      payload.dueDate = el.dueDate.value || null;
      payload.dailyTarget = Number(el.dailyTarget.value || 10);
    }

    const endpoint = isSetup ? '/api/auth/setup' : '/api/auth/login';
    const result = await api(endpoint, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    state.token = result.token;
    localStorage.setItem('trackerToken', state.token);
    showDashboard(true);
    await loadDashboard();
  } catch (err) {
    el.authError.textContent = err.message;
  }
}

async function refreshTodayCount(events) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const count = events.filter((item) => new Date(item.occurred_at) >= start).length;
  el.todayCount.textContent = `Today: ${count}`;
}

function renderEvents(events) {
  el.eventList.innerHTML = '';
  if (!events.length) {
    const li = document.createElement('li');
    li.textContent = 'No movement entries yet.';
    el.eventList.appendChild(li);
    return;
  }

  events.slice(0, 25).forEach((item) => {
    const li = document.createElement('li');
    const mode = item.mode === 'session' ? 'Session' : 'Quick';
    const note = item.note ? ` - ${item.note}` : '';
    li.textContent = `${isoDate(item.occurred_at)} - ${mode}${note}`;
    el.eventList.appendChild(li);
  });
}

function renderTrendBars(targetElement, points, emptyMessage) {
  targetElement.innerHTML = '';
  if (!points.length) {
    targetElement.textContent = emptyMessage;
    return;
  }

  const max = Math.max(...points.map((row) => row.movement_count), 1);

  points.forEach((row) => {
    const wrap = document.createElement('div');
    wrap.className = 'trend-bar';

    const label = document.createElement('span');
    label.textContent = row.label;

    const rail = document.createElement('div');
    rail.style.background = '#f4e6dd';
    rail.style.borderRadius = '999px';

    const fill = document.createElement('div');
    fill.className = 'trend-fill';
    fill.style.width = `${Math.max(6, Math.round((row.movement_count / max) * 100))}%`;

    const value = document.createElement('strong');
    value.textContent = String(row.movement_count);

    rail.appendChild(fill);
    wrap.appendChild(label);
    wrap.appendChild(rail);
    wrap.appendChild(value);
    targetElement.appendChild(wrap);
  });
}

function describeTrendWindow(groupBy, windowSize) {
  if (groupBy === 'hour') {
    return `Aggregated by hour of day across the last ${windowSize} day${windowSize === 1 ? '' : 's'}.`;
  }

  if (groupBy === 'day') {
    return `Showing one bar per day across the last ${windowSize} day${windowSize === 1 ? '' : 's'}.`;
  }

  if (groupBy === 'weekday') {
    return `Aggregated by weekday across the last ${windowSize} week${windowSize === 1 ? '' : 's'}.`;
  }

  return `Showing one bar per week across the last ${windowSize} week${windowSize === 1 ? '' : 's'}.`;
}

function renderTrendHighlights(points, groupBy) {
  el.trendHighlights.innerHTML = '';

  if (!points.length) {
    el.trendHighlights.textContent = 'No movement data yet for this filter.';
    return;
  }

  const total = points.reduce((sum, item) => sum + item.movement_count, 0);
  const busiest = points.reduce((best, item) =>
    item.movement_count > best.movement_count ? item : best
  );
  const average = (total / points.length).toFixed(1);

  const cards = [
    { title: 'Total movements', value: String(total), detail: `Across ${points.length} ${groupBy} bucket${points.length === 1 ? '' : 's'}.` },
    { title: 'Busiest period', value: busiest.label, detail: `${busiest.movement_count} movement${busiest.movement_count === 1 ? '' : 's'}.` },
    { title: 'Average per bucket', value: average, detail: 'Useful for spotting quieter or more active patterns.' },
  ];

  cards.forEach((card) => {
    const block = document.createElement('div');
    block.className = 'highlight-card';
    block.innerHTML = `<span class="muted">${card.title}</span><strong>${card.value}</strong><span class="muted">${card.detail}</span>`;
    el.trendHighlights.appendChild(block);
  });
}

async function loadTrendExplorer() {
  const groupBy = el.trendGroupBy.value;
  const windowSize = Number(el.trendWindowSize.value || 8);
  const trendData = await api(`/api/trends?groupBy=${encodeURIComponent(groupBy)}&windowSize=${encodeURIComponent(windowSize)}`);
  el.trendHint.textContent = describeTrendWindow(groupBy, windowSize);
  renderTrendBars(el.trendPageBars, trendData.points, 'No trend data yet for this filter.');
  renderTrendHighlights(trendData.points, groupBy);
}

function updateSessionUi() {
  if (!state.activeSession) {
    el.startSessionBtn.disabled = false;
    el.endSessionBtn.disabled = true;
    el.sessionTapBtn.disabled = true;
    el.sessionProgress.textContent = 'No active session';
    return;
  }

  const { actual_count: actualCount, target_count: targetCount } = state.activeSession;
  el.startSessionBtn.disabled = true;
  el.endSessionBtn.disabled = false;
  el.sessionTapBtn.disabled = false;
  el.sessionProgress.textContent = `Active session: ${actualCount}/${targetCount}`;
}

async function loadDashboard() {
  const [profile, events, sessions, trendData] = await Promise.all([
    api('/api/profile'),
    api('/api/events'),
    api('/api/sessions'),
    api('/api/trends?groupBy=week&windowSize=8'),
  ]);

  state.profile = profile;
  const active = sessions.find((s) => s.status === 'active');
  state.activeSession = active || null;

  el.profileDueDate.value = profile.due_date ? String(profile.due_date).slice(0, 10) : '';
  el.profileDailyTarget.value = profile.daily_target || 10;
  el.reminderEnabled.checked = Boolean(profile.reminder_enabled);
  el.reminderTime.value = profile.reminder_time ? String(profile.reminder_time).slice(0, 5) : '20:00';

  const today = new Date();
  const startDefault = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
  el.summaryStart.value = startDefault.toISOString().slice(0, 10);
  el.summaryEnd.value = today.toISOString().slice(0, 10);

  await refreshTodayCount(events);
  renderEvents(events);
  renderTrendBars(el.trendBars, trendData.points, 'No trend data yet.');
  updateSessionUi();
  setupReminderLoop();
  await loadTrendExplorer();
  await loadPatternComparison();
  await loadMilestones();
  await loadJournalEntries();

  const todayDate = new Date().toISOString().split('T')[0];
  el.journalEntryDate.value = todayDate;
  await loadJournalEntry(todayDate);
}

async function logMovement(sessionMode = false) {
  const payload = {
    note: sessionMode ? null : el.quickNote.value.trim() || null,
  };

  if (sessionMode) {
    if (!state.activeSession) {
      return;
    }
    payload.sessionId = state.activeSession.id;
  }

  const eventResponse = await api('/api/events', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (!sessionMode && (el.quickPosition.value || el.quickActivity.value)) {
    await saveContextForEvent(eventResponse.id);
  }

  if (sessionMode && state.activeSession) {
    state.activeSession.actual_count += 1;
    updateSessionUi();
  }

  el.quickNote.value = '';
  el.quickPosition.value = '';
  el.quickActivity.value = '';
  el.quickHydration.value = '3';
  el.quickStress.value = '3';
  el.quickAteRecently.checked = false;
  await loadDashboard();
}

async function startSession() {
  const targetCount = Number(el.sessionTarget.value || 10);
  const session = await api('/api/sessions/start', {
    method: 'POST',
    body: JSON.stringify({ targetCount }),
  });

  state.activeSession = session;
  updateSessionUi();
}

async function endSession() {
  if (!state.activeSession) {
    return;
  }

  const note = el.sessionNote.value.trim() || null;
  await api(`/api/sessions/${state.activeSession.id}/end`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  });

  el.sessionNote.value = '';
  state.activeSession = null;
  await loadDashboard();
}

async function saveProfile() {
  const payload = {
    dueDate: el.profileDueDate.value || null,
    dailyTarget: Number(el.profileDailyTarget.value || 10),
    reminderEnabled: el.reminderEnabled.checked,
    reminderTime: el.reminderTime.value,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  };

  await api('/api/profile', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });

  el.profileMessage.textContent = 'Profile updated.';
  await loadDashboard();
}

function setupReminderLoop() {
  if (state.reminderInterval) {
    clearInterval(state.reminderInterval);
    state.reminderInterval = null;
  }

  if (!el.reminderEnabled.checked) {
    return;
  }

  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }

  const checkReminder = () => {
    if (!el.reminderEnabled.checked || Notification.permission !== 'granted') {
      return;
    }

    const now = new Date();
    const [hour, minute] = (el.reminderTime.value || '20:00').split(':').map(Number);

    const key = `reminder-${now.toISOString().slice(0, 10)}`;
    const alreadySent = localStorage.getItem(key) === '1';

    if (!alreadySent && now.getHours() === hour && now.getMinutes() === minute) {
      new Notification('Little Kicks Reminder', {
        body: 'Time to check in and log baby movements.',
      });
      localStorage.setItem(key, '1');
    }
  };

  checkReminder();
  state.reminderInterval = setInterval(checkReminder, 60000);
}

async function openPrintSummary() {
  const start = el.summaryStart.value;
  const end = el.summaryEnd.value;

  const data = await api(`/api/summary/print?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end + 'T23:59:59Z')}`);

  const summaryHtml = `
    <html>
      <head>
        <title>Little Kicks Summary</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #2a211d; }
          h1 { margin: 0 0 12px; }
          h2 { margin-top: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        </style>
      </head>
      <body>
        <h1>Little Kicks Summary</h1>
        <p>Wellness tracking only. Not medical advice.</p>
        <p>Range: ${start} to ${end}</p>
        <p>Total movements: ${data.eventCount}</p>
        <h2>Sessions</h2>
        <table>
          <tr><th>Start</th><th>End</th><th>Target</th><th>Actual</th><th>Note</th></tr>
          ${data.sessions
            .map(
              (s) =>
                `<tr><td>${new Date(s.started_at).toLocaleString()}</td><td>${
                  s.ended_at ? new Date(s.ended_at).toLocaleString() : '-'
                }</td><td>${s.target_count}</td><td>${s.actual_count}</td><td>${s.note || '-'}</td></tr>`
            )
            .join('')}
        </table>
        <h2>Events</h2>
        <table>
          <tr><th>Time</th><th>Mode</th><th>Note</th></tr>
          ${data.events
            .map(
              (e) =>
                `<tr><td>${new Date(e.occurred_at).toLocaleString()}</td><td>${e.mode}</td><td>${
                  e.note || '-'
                }</td></tr>`
            )
            .join('')}
        </table>
      </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Pop-up blocked. Please allow pop-ups for print view.');
    return;
  }

  printWindow.document.write(summaryHtml);
  printWindow.document.close();
  printWindow.focus();
}

async function loadPatternComparison() {
  const todayData = await api('/api/patterns/today-vs-average');
  el.patternComparison.textContent = `Today: ${todayData.todayCount} | Average: ${todayData.sevenDayAverage}`;
  el.patternComparison.style.color = todayData.trend === 'above' ? 'var(--ok)' : todayData.trend === 'below' ? '#a53220' : 'inherit';

  const hourData = await api('/api/patterns/hour-vs-normal');
  el.hourPattern.textContent = `This hour: ${hourData.thisHourCount} | Normal for this time: ${hourData.normalHourCount}`;
}

async function loadMilestones() {
  const data = await api('/api/milestones');
  el.pregnancyWeek.textContent = data.current_week ? `Week ${data.current_week}` : 'Set due date';
  
  el.milestoneList.innerHTML = '';
  if (!data.milestones.length) {
    el.milestoneList.innerHTML = '<li>No upcoming milestones</li>';
    return;
  }

  data.milestones.forEach((m) => {
    const li = document.createElement('li');
    li.textContent = `Week ${m.week}: ${m.text}`;
    el.milestoneList.appendChild(li);
  });
}

async function saveContextForEvent(eventId) {
  const context = {
    position: el.quickPosition.value || null,
    activity: el.quickActivity.value || null,
    hydrationLevel: Number(el.quickHydration.value || 3),
    stressLevel: Number(el.quickStress.value || 3),
    ateRecently: el.quickAteRecently.checked || false,
  };

  await api(`/api/events/${eventId}/context`, {
    method: 'POST',
    body: JSON.stringify(context),
  });
}

async function loadJournalEntries() {
  const entries = await api('/api/journal');
  el.journalList.innerHTML = '';
  
  if (!entries.length) {
    el.journalList.innerHTML = '<li>No journal entries yet.</li>';
    return;
  }

  entries.forEach((entry) => {
    const li = document.createElement('li');
    const mood = entry.mood ? ` (${entry.mood})` : '';
    li.textContent = `${entry.entry_date}${mood}: ${entry.notes || 'No notes'}`;
    el.journalList.appendChild(li);
  });
}

async function loadJournalEntry(date) {
  const entries = await api(`/api/journal?start=${encodeURIComponent(date)}&end=${encodeURIComponent(date + 'T23:59:59Z')}`);
  const entry = entries[0] || {};

  el.journalSleep.value = entry.sleep_quality || 3;
  el.journalMood.value = entry.mood || '';
  el.journalEnergy.value = entry.energy_level || 3;
  el.journalPhysical.value = entry.physical_notes || '';
  el.journalConcerns.value = entry.concerns || '';
  el.journalNotes.value = entry.notes || '';
}

async function saveJournalEntry() {
  const date = el.journalEntryDate.value || new Date().toISOString().split('T')[0];
  const payload = {
    entryDate: date,
    sleepQuality: Number(el.journalSleep.value),
    mood: el.journalMood.value || null,
    energyLevel: Number(el.journalEnergy.value),
    physicalNotes: el.journalPhysical.value.trim() || null,
    concerns: el.journalConcerns.value.trim() || null,
    notes: el.journalNotes.value.trim() || null,
  };

  await api('/api/journal', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  el.journalMessage.textContent = 'Entry saved!';
  setTimeout(() => { el.journalMessage.textContent = ''; }, 3000);
  await loadJournalEntries();
}

function toggleCalmMode() {
  const isCalm = document.body.classList.toggle('calm-mode');
  localStorage.setItem('calmMode', isCalm ? '1' : '0');
}

function initializeCalmMode() {
  if (localStorage.getItem('calmMode') === '1') {
    document.body.classList.add('calm-mode');
  }
}

el.authForm.addEventListener('submit', handleAuthSubmit);
el.showDashboardBtn.addEventListener('click', () => switchPage('dashboard'));
el.showTrendsBtn.addEventListener('click', () => switchPage('trends'));
el.showJournalBtn.addEventListener('click', () => switchPage('journal'));
el.calmModeBtn.addEventListener('click', toggleCalmMode);
el.quickTapBtn.addEventListener('click', () => logMovement(false));
el.startSessionBtn.addEventListener('click', startSession);
el.sessionTapBtn.addEventListener('click', () => logMovement(true));
el.endSessionBtn.addEventListener('click', endSession);
el.saveReminderBtn.addEventListener('click', saveProfile);
el.saveProfileBtn.addEventListener('click', saveProfile);
el.applyTrendFilterBtn.addEventListener('click', loadTrendExplorer);
el.printSummaryBtn.addEventListener('click', openPrintSummary);
el.loadJournalEntryBtn.addEventListener('click', () => loadJournalEntry(el.journalEntryDate.value || new Date().toISOString().split('T')[0]));
el.saveJournalBtn.addEventListener('click', saveJournalEntry);

initializeCalmMode();
initializeAuthView().catch((err) => {
  el.authError.textContent = err.message;
});
