/* ── StudyFlow · Supabase Edition ── */

// ╔══════════════════════════════════════════╗
// ║  CONFIGURATION — fill these in!          ║
// ║  Get from: Supabase → Settings → API     ║
// ╚══════════════════════════════════════════╝
const SUPABASE_URL = 'https://wwwqzfxglbrdesmmxtwz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3d3F6ZnhnbGJyZGVzbW14dHd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NTYwMTEsImV4cCI6MjA4OTEzMjAxMX0.1OtfgtIajvMGu8kJujuYMlsEt-RsR5NB5yHm1nthj8I';

// ── SUPABASE CLIENT ──
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── STATE ──
let tasks = [];
let currentUser = null;
let editingId = null;
let selectedPriority = 'medium';
let filters = { priority: 'all', status: 'all', tag: '' };
let realtimeChannel = null;
let isSyncing = false;

// ─────────────────────────────────────────
// STORAGE — smart layer: Supabase if logged
// in, localStorage as fallback
// ─────────────────────────────────────────

function saveLocal(t) {
  try { localStorage.setItem('sf_tasks', JSON.stringify(t)); } catch(e) {}
}

function loadLocal() {
  try {
    const raw = localStorage.getItem('sf_tasks');
    return raw ? JSON.parse(raw) : [];
  } catch(e) { return []; }
}

async function saveTasks() {
  saveLocal(tasks); // always save locally too (offline cache)

  if (!currentUser) return;

  setSyncStatus('syncing');
  try {
    const rows = tasks.map(t => ({
      id: t.id,
      user_id: currentUser.id,
      title: t.title,
      url: t.url || null,
      deadline: t.deadline || null,
      priority: t.priority,
      tags: t.tags || [],
      checklist: t.checklist || [],
      notes: t.notes || null,
      done: t.done,
      created_at: t.createdAt,
      updated_at: t.updatedAt,
    }));

    const { error } = await sb.from('tasks').upsert(rows, { onConflict: 'id' });
    if (error) throw error;
    setSyncStatus('ok');
  } catch(e) {
    console.error('Supabase save error:', e);
    setSyncStatus('error');
  }
}

async function loadTasks() {
  if (!currentUser) {
    tasks = loadLocal();
    renderTasks();
    return;
  }

  setSyncStatus('syncing');
  try {
    const { data, error } = await sb
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    tasks = (data || []).map(row => ({
      id: row.id,
      title: row.title,
      url: row.url,
      deadline: row.deadline,
      priority: row.priority,
      tags: row.tags || [],
      checklist: row.checklist || [],
      notes: row.notes,
      done: row.done,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    saveLocal(tasks); // keep local cache fresh
    setSyncStatus('ok');
  } catch(e) {
    console.error('Supabase load error:', e);
    // fall back to local cache
    tasks = loadLocal();
    setSyncStatus('error');
    showToast('Offline — showing cached tasks');
  }

  renderTasks();
}

async function deleteFromDB(id) {
  if (!currentUser) return;
  try {
    await sb.from('tasks').delete().eq('id', id).eq('user_id', currentUser.id);
  } catch(e) {
    console.error('Delete error:', e);
  }
}

// ── REAL-TIME SUBSCRIPTION ──
function subscribeRealtime() {
  if (!currentUser) return;

  // clean up previous channel
  if (realtimeChannel) {
    sb.removeChannel(realtimeChannel);
  }

  realtimeChannel = sb
    .channel('tasks-changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'tasks',
        filter: `user_id=eq.${currentUser.id}`,
      },
      (payload) => {
        // Another device made a change — reload
        loadTasks();
      }
    )
    .subscribe();
}

function unsubscribeRealtime() {
  if (realtimeChannel) {
    sb.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
}

// ─────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────

async function signIn(email, password) {
  const btn = document.getElementById('signinBtn');
  const err = document.getElementById('signinError');
  btn.textContent = 'Signing in...';
  btn.disabled = true;
  err.textContent = '';

  const { data, error } = await sb.auth.signInWithPassword({ email, password });

  btn.textContent = 'Sign In';
  btn.disabled = false;

  if (error) {
    err.textContent = error.message;
    return;
  }

  currentUser = data.user;
  closeAuthModal();
  onSignedIn();
}

async function signUp(email, password) {
  const btn = document.getElementById('signupBtn');
  const err = document.getElementById('signupError');
  btn.textContent = 'Creating account...';
  btn.disabled = true;
  err.textContent = '';

  const { data, error } = await sb.auth.signUp({ email, password });

  btn.textContent = 'Create Account';
  btn.disabled = false;

  if (error) {
    err.textContent = error.message;
    return;
  }

  // Supabase may require email confirmation depending on your settings
  if (data.user && data.session) {
    currentUser = data.user;
    closeAuthModal();
    onSignedIn();
  } else {
    // Email confirmation required
    document.getElementById('signupError').style.color = 'var(--low)';
    err.textContent = '✅ Check your email to confirm your account, then sign in.';
  }
}

async function signOut() {
  unsubscribeRealtime();
  await sb.auth.signOut();
  currentUser = null;
  tasks = loadLocal();
  renderTasks();
  updateAccountUI();
  setSyncStatus('local');
  document.getElementById('accountModal').style.display = 'none';
  showToast('Signed out — using local storage');
}

async function onSignedIn() {
  subscribeRealtime();
  await loadTasks();
  updateAccountUI();
  setSyncStatus('ok');
  showToast('Signed in — tasks synced ☁️');
}

// Migrate localStorage tasks → Supabase
async function migrateLocalToCloud() {
  const local = loadLocal();
  if (!local.length) {
    showToast('No local tasks to migrate');
    return;
  }

  const btn = document.getElementById('migrateLocalBtn');
  btn.textContent = 'Migrating...';
  btn.disabled = true;

  try {
    const rows = local.map(t => ({
      id: t.id,
      user_id: currentUser.id,
      title: t.title,
      url: t.url || null,
      deadline: t.deadline || null,
      priority: t.priority,
      tags: t.tags || [],
      checklist: t.checklist || [],
      notes: t.notes || null,
      done: t.done,
      created_at: t.createdAt,
      updated_at: t.updatedAt,
    }));

    const { error } = await sb.from('tasks').upsert(rows, { onConflict: 'id' });
    if (error) throw error;

    await loadTasks();
    showToast(`✅ Migrated ${local.length} tasks to cloud`);
  } catch(e) {
    showToast('Migration failed — check console');
    console.error(e);
  }

  btn.textContent = 'Import Local Tasks → Cloud';
  btn.disabled = false;
}

// ─────────────────────────────────────────
// SYNC STATUS DOT
// ─────────────────────────────────────────

function setSyncStatus(state) {
  const dot = document.getElementById('syncStatus');
  dot.className = 'sync-status';
  if (state === 'ok') { dot.classList.add('sync-ok'); dot.title = 'Cloud synced'; }
  else if (state === 'syncing') { dot.classList.add('sync-syncing'); dot.title = 'Syncing...'; }
  else if (state === 'error') { dot.classList.add('sync-error'); dot.title = 'Sync error (offline?)'; }
  else { dot.title = 'Local only'; }
}

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/"/g,'&quot;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}

function showToast(msg, duration = 2800) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), duration);
}

function formatDeadline(dt) {
  if (!dt) return null;
  const d = new Date(dt);
  const now = new Date();
  const diff = d - now;
  const pad = n => String(n).padStart(2, '0');
  const dateStr = `${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (diff < 0) return { text: `Overdue · ${dateStr}`, cls: 'overdue' };
  if (diff < 3600000) return { text: `${Math.ceil(diff/60000)}m left · ${dateStr}`, cls: 'soon' };
  if (diff < 86400000) return { text: `${Math.ceil(diff/3600000)}h left · ${dateStr}`, cls: 'soon' };
  return { text: dateStr, cls: '' };
}

// ─────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────

function getFilteredTasks() {
  return tasks.filter(t => {
    if (filters.priority !== 'all' && t.priority !== filters.priority) return false;
    if (filters.status === 'pending' && t.done) return false;
    if (filters.status === 'done' && !t.done) return false;
    if (filters.tag) {
      const q = filters.tag.toLowerCase();
      if (!t.tags || !t.tags.some(tag => tag.toLowerCase().includes(q))) return false;
    }
    return true;
  });
}

function renderTasks() {
  const list = document.getElementById('taskList');
  const empty = document.getElementById('emptyState');
  const filtered = getFilteredTasks();

  list.querySelectorAll('.task-card').forEach(el => el.remove());

  if (filtered.length === 0) {
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';

  const pOrder = { high: 0, medium: 1, low: 2 };
  const sorted = [...filtered].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.priority !== b.priority) return (pOrder[a.priority]||1) - (pOrder[b.priority]||1);
    if (a.deadline && b.deadline) return new Date(a.deadline) - new Date(b.deadline);
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return 0;
  });

  sorted.forEach(task => list.appendChild(buildTaskCard(task)));
}

function buildTaskCard(task) {
  const card = document.createElement('div');
  card.className = `task-card priority-${task.priority} ${task.done ? 'done' : ''}`;
  card.dataset.id = task.id;

  const accent = document.createElement('div');
  accent.className = 'task-card-accent';
  card.appendChild(accent);

  const top = document.createElement('div');
  top.className = 'task-card-top';

  const check = document.createElement('button');
  check.className = `task-check ${task.done ? 'checked' : ''}`;
  check.addEventListener('click', e => { e.stopPropagation(); toggleTaskDone(task.id); });
  top.appendChild(check);

  const titleWrap = document.createElement('div');
  titleWrap.className = 'task-title-wrap';
  const title = document.createElement('div');
  title.className = 'task-title';

  if (task.url) {
    const a = document.createElement('a');
    a.href = task.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = task.title || 'Untitled';
    a.addEventListener('click', e => e.stopPropagation());
    title.appendChild(a);
  } else {
    title.textContent = task.title || 'Untitled';
  }
  titleWrap.appendChild(title);
  top.appendChild(titleWrap);
  card.appendChild(top);

  const meta = document.createElement('div');
  meta.className = 'task-meta';

  if (task.deadline) {
    const dl = formatDeadline(task.deadline);
    if (dl) {
      const dlEl = document.createElement('span');
      dlEl.className = `task-deadline ${dl.cls}`;
      dlEl.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${dl.text}`;
      meta.appendChild(dlEl);
    }
  }

  (task.tags || []).slice(0, 4).forEach(tag => {
    const t = document.createElement('span');
    t.className = 'tag';
    t.textContent = tag;
    meta.appendChild(t);
  });

  if (meta.children.length) card.appendChild(meta);

  if (task.checklist && task.checklist.length > 0) {
    const done = task.checklist.filter(i => i.done).length;
    const total = task.checklist.length;
    const pct = Math.round((done / total) * 100);
    const prog = document.createElement('div');
    prog.className = 'task-progress';
    prog.innerHTML = `
      <div class="progress-label">${done}/${total} subtasks</div>
      <div class="progress-bar-wrap">
        <div class="progress-bar-fill" style="width:${pct}%"></div>
      </div>`;
    card.appendChild(prog);
  }

  card.addEventListener('click', () => openEditModal(task.id));
  return card;
}

// ─────────────────────────────────────────
// TASK CRUD
// ─────────────────────────────────────────

async function toggleTaskDone(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  task.done = !task.done;
  task.updatedAt = new Date().toISOString();
  renderTasks();
  await saveTasks();
}

async function saveTask() {
  const title = document.getElementById('taskTitle').value.trim();
  if (!title) {
    const inp = document.getElementById('taskTitle');
    inp.focus();
    inp.style.borderColor = 'var(--high)';
    setTimeout(() => inp.style.borderColor = '', 800);
    return;
  }

  const url = document.getElementById('taskUrl').value.trim();
  const deadline = document.getElementById('taskDeadline').value;
  const notes = document.getElementById('taskNotes').value.trim();
  const tags = document.getElementById('taskTags').value
    .split(',').map(t => t.trim()).filter(Boolean);

  const checklist = [];
  document.querySelectorAll('#checklistItems .checklist-item').forEach(row => {
    const text = row.querySelector('.item-text').value.trim();
    const done = row.querySelector('input[type="checkbox"]').checked;
    if (text) checklist.push({ text, done });
  });

  const now = new Date().toISOString();

  if (editingId) {
    const task = tasks.find(t => t.id === editingId);
    if (task) {
      Object.assign(task, {
        title, url,
        deadline: deadline ? new Date(deadline).toISOString() : null,
        priority: selectedPriority, tags, checklist, notes,
        updatedAt: now,
      });
    }
  } else {
    tasks.unshift({
      id: uid(), title, url,
      deadline: deadline ? new Date(deadline).toISOString() : null,
      priority: selectedPriority, tags, checklist, notes,
      done: false, createdAt: now, updatedAt: now,
    });
  }

  closeTaskModal();
  renderTasks();
  await saveTasks();
}

async function deleteTask() {
  if (!editingId) return;
  if (!confirm('Delete this task?')) return;
  const id = editingId;
  tasks = tasks.filter(t => t.id !== id);
  closeTaskModal();
  renderTasks();
  saveLocal(tasks);
  await deleteFromDB(id);
}

// ─────────────────────────────────────────
// MODAL UI
// ─────────────────────────────────────────

const taskModal = document.getElementById('taskModal');
const checklistItems = document.getElementById('checklistItems');

function openAddModal() {
  editingId = null;
  document.getElementById('modalTitle').textContent = 'New Task';
  document.getElementById('taskTitle').value = '';
  document.getElementById('taskUrl').value = '';
  document.getElementById('taskDeadline').value = '';
  document.getElementById('taskTags').value = '';
  document.getElementById('taskNotes').value = '';
  document.getElementById('deleteTaskBtn').style.display = 'none';
  checklistItems.innerHTML = '';
  setSelectedPriority('medium');
  taskModal.style.display = 'flex';
  setTimeout(() => document.getElementById('taskTitle').focus(), 100);
}

function openEditModal(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  editingId = id;
  document.getElementById('modalTitle').textContent = 'Edit Task';
  document.getElementById('taskTitle').value = task.title || '';
  document.getElementById('taskUrl').value = task.url || '';
  document.getElementById('taskNotes').value = task.notes || '';
  document.getElementById('taskTags').value = (task.tags || []).join(', ');
  document.getElementById('deleteTaskBtn').style.display = 'block';

  if (task.deadline) {
    const d = new Date(task.deadline);
    const pad = n => String(n).padStart(2, '0');
    document.getElementById('taskDeadline').value =
      `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } else {
    document.getElementById('taskDeadline').value = '';
  }

  setSelectedPriority(task.priority || 'medium');
  checklistItems.innerHTML = '';
  (task.checklist || []).forEach(item => addChecklistRow(item.text, item.done));
  taskModal.style.display = 'flex';
}

function closeTaskModal() { taskModal.style.display = 'none'; }

function setSelectedPriority(p) {
  selectedPriority = p;
  document.querySelectorAll('.priority-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.p === p);
  });
}

function addChecklistRow(text = '', done = false) {
  const row = document.createElement('div');
  row.className = 'checklist-item';
  row.innerHTML = `
    <input type="checkbox" ${done ? 'checked' : ''} />
    <input type="text" class="item-text" placeholder="Subtask..." value="${escHtml(text)}" />
    <button class="remove-item" title="Remove">×</button>`;
  row.querySelector('.remove-item').addEventListener('click', () => row.remove());
  checklistItems.appendChild(row);
  if (!text) setTimeout(() => row.querySelector('.item-text').focus(), 50);
}

// ─────────────────────────────────────────
// AUTH MODAL UI
// ─────────────────────────────────────────

function openAuthModal() {
  document.getElementById('authModal').style.display = 'flex';
  document.getElementById('accountModal').style.display = 'none';
}

function closeAuthModal() {
  document.getElementById('authModal').style.display = 'none';
}

// Auth tabs
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('signinTab').style.display = tab.dataset.tab === 'signin' ? 'block' : 'none';
    document.getElementById('signupTab').style.display = tab.dataset.tab === 'signup' ? 'block' : 'none';
  });
});

document.getElementById('signinBtn').addEventListener('click', () => {
  signIn(
    document.getElementById('signinEmail').value.trim(),
    document.getElementById('signinPassword').value
  );
});
document.getElementById('signupBtn').addEventListener('click', () => {
  signUp(
    document.getElementById('signupEmail').value.trim(),
    document.getElementById('signupPassword').value
  );
});
document.getElementById('skipAuthBtn').addEventListener('click', closeAuthModal);
document.getElementById('skipAuthBtn2').addEventListener('click', closeAuthModal);

// Enter key in auth inputs
['signinEmail','signinPassword'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('signinBtn').click();
  });
});
['signupEmail','signupPassword'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('signupBtn').click();
  });
});

// ─────────────────────────────────────────
// ACCOUNT MODAL UI
// ─────────────────────────────────────────

function updateAccountUI() {
  const loggedIn = document.getElementById('accountLoggedIn');
  const loggedOut = document.getElementById('accountLoggedOut');

  if (currentUser) {
    loggedIn.style.display = 'block';
    loggedOut.style.display = 'none';
    document.getElementById('accountEmail').textContent = currentUser.email;

    // Avatar initials
    const initial = (currentUser.email || '?')[0].toUpperCase();
    document.getElementById('accountAvatar').textContent = initial;

    // Stats
    const total = tasks.length;
    const done = tasks.filter(t => t.done).length;
    document.getElementById('accountStats').innerHTML = `
      <div class="stat"><span class="stat-num">${total}</span><span class="stat-label">Total</span></div>
      <div class="stat"><span class="stat-num">${total - done}</span><span class="stat-label">Pending</span></div>
      <div class="stat"><span class="stat-num">${done}</span><span class="stat-label">Done</span></div>`;
  } else {
    loggedIn.style.display = 'none';
    loggedOut.style.display = 'block';
  }
}

document.getElementById('accountBtn').addEventListener('click', () => {
  updateAccountUI();
  document.getElementById('accountModal').style.display = 'flex';
});
document.getElementById('closeAccountModal').addEventListener('click', () => {
  document.getElementById('accountModal').style.display = 'none';
});
document.getElementById('openAuthFromAccount').addEventListener('click', openAuthModal);
document.getElementById('signOutBtn').addEventListener('click', signOut);
document.getElementById('migrateLocalBtn').addEventListener('click', migrateLocalToCloud);

document.getElementById('accountModal').addEventListener('click', e => {
  if (e.target === document.getElementById('accountModal'))
    document.getElementById('accountModal').style.display = 'none';
});

// ─────────────────────────────────────────
// FILTER
// ─────────────────────────────────────────

let filterVisible = false;
document.getElementById('filterBtn').addEventListener('click', () => {
  filterVisible = !filterVisible;
  document.getElementById('filterBar').style.display = filterVisible ? 'block' : 'none';
});

document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const ft = chip.dataset.filter;
    document.querySelectorAll(`.chip[data-filter="${ft}"]`).forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    filters[ft] = chip.dataset.val;
    renderTasks();
  });
});

document.getElementById('tagSearch').addEventListener('input', e => {
  filters.tag = e.target.value.trim();
  renderTasks();
});

// ─────────────────────────────────────────
// EVENT BINDINGS
// ─────────────────────────────────────────

document.getElementById('addBtn').addEventListener('click', openAddModal);
document.getElementById('closeModal').addEventListener('click', closeTaskModal);
document.getElementById('cancelModal').addEventListener('click', closeTaskModal);
document.getElementById('saveTask').addEventListener('click', saveTask);
document.getElementById('deleteTaskBtn').addEventListener('click', deleteTask);
document.getElementById('addSubtask').addEventListener('click', () => addChecklistRow());

document.querySelectorAll('.priority-btn').forEach(btn => {
  btn.addEventListener('click', () => setSelectedPriority(btn.dataset.p));
});

taskModal.addEventListener('click', e => { if (e.target === taskModal) closeTaskModal(); });

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeTaskModal();
    closeAuthModal();
    document.getElementById('accountModal').style.display = 'none';
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && taskModal.style.display !== 'none') {
    saveTask();
  }
});

// ─────────────────────────────────────────
// SERVICE WORKER
// ─────────────────────────────────────────

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// ─────────────────────────────────────────
// INIT
// ─────────────────────────────────────────

async function init() {
  // Check if Supabase is configured
  const isConfigured = SUPABASE_URL !== 'https://YOUR_PROJECT.supabase.co';

  if (!isConfigured) {
    // No config — run in pure local mode, no auth prompt
    tasks = loadLocal();
    renderTasks();
    setSyncStatus('local');
    console.warn('Supabase not configured. Running in local-only mode.\nUpdate SUPABASE_URL and SUPABASE_ANON_KEY in app.js to enable cloud sync.');
    return;
  }

  // Check for existing session
  const { data: { session } } = await sb.auth.getSession();

  if (session) {
    currentUser = session.user;
    await onSignedIn();
  } else {
    // Load local tasks immediately so the app isn't blank
    tasks = loadLocal();
    renderTasks();
    setSyncStatus('local');
    // Show auth modal after a short delay so the app renders first
    setTimeout(() => {
      document.getElementById('authModal').style.display = 'flex';
    }, 400);
  }

  // Listen for auth state changes (e.g. sign in from another tab)
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && !currentUser) {
      currentUser = session.user;
      onSignedIn();
    }
    if (event === 'SIGNED_OUT') {
      currentUser = null;
      setSyncStatus('local');
    }
  });
}

init();

// Refresh deadline countdowns every minute
setInterval(renderTasks, 60000);
