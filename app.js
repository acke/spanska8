// Single-page app for learning Spanish words and sentences.
// Routing via hash. Progress persisted in localStorage.

const STORAGE_KEY = "spanska_progress_v1";

// ---------- State ----------
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const s = JSON.parse(raw);
    return Object.assign(defaultState(), s);
  } catch (e) {
    return defaultState();
  }
}

function defaultState() {
  return {
    startDate: new Date().toISOString().slice(0, 10),
    itemStats: {},          // key -> { correct, wrong, lastAnswered }
    stageCompletion: {},    // key -> { lastCompleted, runs }
    xp: 0,
    soundEnabled: true,
    lastSaved: 0
  };
}

// ---------- XP / levels ----------
const LEVELS = [
  { xp: 0,    name: "Hola" },
  { xp: 100,  name: "Tiempo presente" },
  { xp: 250,  name: "Tiempo pasado" },
  { xp: 500,  name: "Tiempo futuro" },
  { xp: 850,  name: "Conversador" },
  { xp: 1300, name: "Viajero" },
  { xp: 1900, name: "Estudiante" },
  { xp: 2700, name: "Experto" },
  { xp: 3700, name: "Maestro" },
  { xp: 5000, name: "¡Olé!" }
];

function getLevel(xp) {
  let i = 0;
  for (let k = LEVELS.length - 1; k >= 0; k--) {
    if (xp >= LEVELS[k].xp) { i = k; break; }
  }
  return {
    level: i + 1,
    name: LEVELS[i].name,
    minXp: LEVELS[i].xp,
    nextXp: LEVELS[i + 1] ? LEVELS[i + 1].xp : null,
    nextName: LEVELS[i + 1] ? LEVELS[i + 1].name : null
  };
}

function awardXp(amount, anchorEl) {
  const before = getLevel(state.xp);
  state.xp = (state.xp || 0) + amount;
  const after = getLevel(state.xp);
  saveState();
  showXpFloat(amount, anchorEl);
  renderXpDisplay();
  bumpXpDisplay();
  if (after.level > before.level) {
    setTimeout(() => showLevelUp(after), 400);
  }
}

// ---------- Sound (Web Audio API, no files) ----------
let _audio = null;
function audioCtx() {
  if (!_audio) {
    try { _audio = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { _audio = false; }
  }
  return _audio || null;
}
function playTone(freq, duration, type = "sine", vol = 0.08) {
  if (!state.soundEnabled) return;
  const ctx = audioCtx();
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") ctx.resume();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) { /* ignore */ }
}
function playCorrect() {
  playTone(523.25, 0.10);
  setTimeout(() => playTone(659.25, 0.14), 80);
}
function playWrong() {
  playTone(196, 0.18, "sawtooth", 0.05);
}
function playFanfare() {
  const notes = [523, 659, 784, 1047];
  notes.forEach((n, i) => setTimeout(() => playTone(n, 0.18), i * 110));
}
function playLevelUp() {
  const notes = [523, 659, 784, 1047, 1319];
  notes.forEach((n, i) => setTimeout(() => playTone(n, 0.16), i * 90));
}

// ---------- Spaced repetition (SRS) ----------
// Per-card scheduling. Stored on state.itemStats[key]:
//   srsInterval (minutes), srsDueAt (ms timestamp), srsReviews, srsLastRating

const SRS_FIRST = {
  hard: 5,        // 5 minutes
  ok: 1440,       // 1 day
  easy: 4320      // 3 days
};

function applySrsRating(key, rating) {
  const st = state.itemStats[key] || { correct: 0, wrong: 0 };
  const reviews = st.srsReviews || 0;
  const prevInterval = st.srsInterval || 0;
  let next;
  if (reviews === 0 || !prevInterval) {
    next = SRS_FIRST[rating];
  } else {
    if (rating === "hard") next = Math.max(5, Math.floor(prevInterval / 2));
    else if (rating === "ok") next = prevInterval * 2;
    else next = prevInterval * 3;
  }
  st.srsInterval = next;
  st.srsDueAt = Date.now() + next * 60 * 1000;
  st.srsReviews = reviews + 1;
  st.srsLastRating = rating;
  state.itemStats[key] = st;
  saveState();
}

function applySrsWrong(key) {
  const st = state.itemStats[key] || { correct: 0, wrong: 0 };
  st.srsInterval = 5;
  st.srsDueAt = Date.now() + 5 * 60 * 1000;
  st.srsLastRating = null;
  state.itemStats[key] = st;
  saveState();
}

function difficultyScore(key) {
  // Higher score = harder. Used for picking review cards and stats.
  const st = state.itemStats[key];
  if (!st) return 0;
  const wrong = st.wrong || 0;
  const correct = st.correct || 0;
  if (wrong + correct === 0) return 0;
  return wrong / (wrong + correct + 1);
}

function getDueCards() {
  const now = Date.now();
  const due = [];
  for (const area of DATA.areas) {
    for (const t of ["words", "sentences"]) {
      const items = area[t] || [];
      for (let i = 0; i < items.length; i++) {
        const key = itemKey(area.id, t, i);
        const st = state.itemStats[key];
        if (st && st.srsDueAt && st.srsDueAt <= now) {
          due.push({ areaId: area.id, type: t, index: i, item: items[i], stats: st, key });
        }
      }
    }
  }
  return due;
}

function formatNextReview(dueAt) {
  const ms = dueAt - Date.now();
  if (ms <= 0) return "nu";
  const minutes = Math.round(ms / (60 * 1000));
  if (minutes < 60) return `om ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `om ${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return "imorgon";
  return `om ${days} dagar`;
}

// ---------- Confetti ----------
function confetti(count = 60) {
  const colors = ["#ff6b9d", "#fbc531", "#4cd137", "#00a8ff", "#9c88ff", "#fc4a1a", "#f7b733"];
  for (let i = 0; i < count; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti-piece";
    piece.style.left = Math.random() * 100 + "vw";
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = (Math.random() * 0.4) + "s";
    piece.style.animationDuration = (1.4 + Math.random() * 1.2) + "s";
    piece.style.transform = `rotate(${Math.random() * 360}deg)`;
    document.body.appendChild(piece);
    setTimeout(() => piece.remove(), 3500);
  }
}

// ---------- XP feedback ----------
function showXpFloat(amount, anchorEl) {
  const f = document.createElement("div");
  f.className = "xp-float";
  f.textContent = `+${amount} XP`;
  let x = window.innerWidth / 2;
  let y = 120;
  if (anchorEl && anchorEl.getBoundingClientRect) {
    const r = anchorEl.getBoundingClientRect();
    x = r.left + r.width / 2;
    y = r.top;
  }
  f.style.left = (x - 30) + "px";
  f.style.top = y + "px";
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 1500);
}

function bumpXpDisplay() {
  const d = document.getElementById("xp-display");
  if (!d) return;
  d.classList.remove("bump");
  void d.offsetWidth; // force reflow
  d.classList.add("bump");
}

function showLevelUp(lvl) {
  const toast = document.createElement("div");
  toast.className = "level-up-toast";
  toast.innerHTML = `
    <div class="level-up-emoji">🎊</div>
    <div class="level-up-text">Ny nivå!</div>
    <div class="level-up-name">Nivå ${lvl.level}: ${lvl.name}</div>
  `;
  document.body.appendChild(toast);
  playLevelUp();
  confetti(80);
  setTimeout(() => toast.remove(), 3500);
}

function renderXpDisplay() {
  const root = document.getElementById("xp-display");
  if (!root) return;
  const lvl = getLevel(state.xp);
  const total = lvl.nextXp != null ? (lvl.nextXp - lvl.minXp) : 1;
  const into = state.xp - lvl.minXp;
  const pct = lvl.nextXp != null ? Math.min(100, Math.round((into / total) * 100)) : 100;
  root.innerHTML = "";
  root.appendChild(el("span", { class: "xp-level-num" }, String(lvl.level)));
  root.appendChild(el("span", { class: "xp-name" }, lvl.name));
  const bar = el("div", { class: "xp-bar" }, [
    el("div", { class: "xp-bar-fill", style: `width: ${pct}%` })
  ]);
  root.appendChild(bar);
  root.appendChild(el("span", { class: "xp-amount" },
    lvl.nextXp != null ? `${state.xp} / ${lvl.nextXp}` : `${state.xp} XP`));
  root.title = lvl.nextXp != null
    ? `${lvl.nextXp - state.xp} XP till nivå ${lvl.level + 1}: ${lvl.nextName}`
    : `Du har nått högsta nivån!`;
  root.onclick = () => navigate("progress");
}

function saveState() {
  state.lastSaved = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  scheduleSyncToDrive();
}

let state = loadState();

// ---------- Helpers ----------
function itemKey(areaId, type, index) { return `${areaId}|${type}|${index}`; }
function stageKey(areaId, type, dir, mode) {
  if (!mode || mode === "mc") return `${areaId}|${type}|${dir}`;
  return `${areaId}|${type}|${dir}|${mode}`;
}
function stageRoute(areaId, stage) {
  if (stage.mode === "build") return `build/${areaId}`;
  return `quiz/${areaId}/${stage.type}/${stage.dir}`;
}

function areaById(id) { return DATA.areas.find(a => a.id === id); }

function getStages(area) {
  const stages = [];
  if (area.words && area.words.length) {
    stages.push({ type: "words", dir: "es-sv", mode: "mc", label: "Ord: spanska → svenska", icon: "🔤" });
    stages.push({ type: "words", dir: "sv-es", mode: "mc", label: "Ord: svenska → spanska", icon: "🔤" });
  }
  if (area.sentences && area.sentences.length) {
    stages.push({ type: "sentences", dir: "es-sv", mode: "mc", label: "Meningar: spanska → svenska", icon: "💬" });
    stages.push({ type: "sentences", dir: "sv-es", mode: "mc", label: "Meningar: svenska → spanska", icon: "💬" });
    stages.push({ type: "sentences", dir: "sv-es", mode: "build", label: "Bygg meningen", icon: "🧩" });
  }
  return stages;
}

function areaProgress(area) {
  // Returns { mastered, total, accuracy, completedStages, totalStages }
  let mastered = 0;
  let total = 0;
  let totalCorrect = 0;
  let totalAttempts = 0;
  const types = ["words", "sentences"];
  for (const t of types) {
    const items = area[t] || [];
    for (let i = 0; i < items.length; i++) {
      total++;
      const st = state.itemStats[itemKey(area.id, t, i)];
      if (st) {
        totalCorrect += st.correct || 0;
        totalAttempts += (st.correct || 0) + (st.wrong || 0);
        if ((st.correct || 0) >= 1) mastered++;
      }
    }
  }
  const stages = getStages(area);
  const completedStages = stages.filter(s => state.stageCompletion[stageKey(area.id, s.type, s.dir, s.mode)]).length;
  return {
    mastered,
    total,
    accuracy: totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : null,
    completedStages,
    totalStages: stages.length
  };
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "data") {
      for (const [dk, dv] of Object.entries(v)) e.dataset[dk] = dv;
    }
    else e.setAttribute(k, v);
  }
  for (const c of (Array.isArray(children) ? children : [children])) {
    if (c == null) continue;
    if (typeof c === "string") e.appendChild(document.createTextNode(c));
    else e.appendChild(c);
  }
  return e;
}

// ---------- Speech ----------
function speakSpanish(text) {
  if (!("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "es-ES";
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  } catch (e) { /* ignore */ }
}

// ---------- Google Drive Sync ----------
const DRIVE_FILE_NAME = "spanska_progress.json";
const DRIVE_CONFIG_KEY = "spanska_drive_v1";

let driveSync = loadDriveConfig();
let _tokenClient = null;
let _driveToken = null;
let _driveFileId = null;
let _syncTimeout = null;

function loadDriveConfig() {
  try {
    const raw = localStorage.getItem(DRIVE_CONFIG_KEY);
    if (raw) return Object.assign({ clientId: "", connected: false, lastSync: null, status: "idle" }, JSON.parse(raw));
  } catch (e) {}
  return { clientId: "", connected: false, lastSync: null, status: "idle" };
}

function saveDriveConfig() {
  const { clientId, connected, lastSync } = driveSync;
  localStorage.setItem(DRIVE_CONFIG_KEY, JSON.stringify({ clientId, connected, lastSync }));
}

function initDriveSync() {
  if (!driveSync.clientId) return;
  if (typeof google === "undefined") return;
  _tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: driveSync.clientId,
    scope: "https://www.googleapis.com/auth/drive.appdata",
    callback: onDriveToken
  });
  if (driveSync.connected) {
    _tokenClient.requestAccessToken({ prompt: "" });
  }
}

function onDriveToken(response) {
  if (response.error) {
    driveSync.status = "error";
    driveSync.connected = false;
    saveDriveConfig();
    renderSyncStatus();
    return;
  }
  _driveToken = response.access_token;
  driveSync.connected = true;
  driveSync.status = "syncing";
  saveDriveConfig();
  renderSyncStatus();
  performInitialSync();
}

function signInDrive() {
  if (!_tokenClient) initDriveSync();
  if (!_tokenClient) return;
  _tokenClient.requestAccessToken({ prompt: "consent" });
}

function signOutDrive() {
  if (_driveToken) { try { google.accounts.oauth2.revoke(_driveToken); } catch (e) {} }
  _driveToken = null;
  _driveFileId = null;
  driveSync.connected = false;
  driveSync.status = "idle";
  saveDriveConfig();
  renderSyncStatus();
}

async function driveGet(url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${_driveToken}` } });
  if (!res.ok) throw new Error(res.status);
  return res.json();
}

async function performInitialSync() {
  try {
    const data = await driveGet(
      `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%3D'${DRIVE_FILE_NAME}'&fields=files(id%2CmodifiedTime)`
    );
    const file = data.files?.[0];
    if (!file) {
      await uploadToDrive();
    } else {
      _driveFileId = file.id;
      const driveMs = new Date(file.modifiedTime).getTime();
      const localMs = state.lastSaved || 0;
      const localIsEmpty = (state.xp || 0) === 0 && Object.keys(state.itemStats || {}).length === 0;
      const driveIsNewer = driveMs > localMs + 5000;
      if (driveIsNewer || localIsEmpty) {
        const remote = await driveGet(
          `https://www.googleapis.com/drive/v3/files/${_driveFileId}?alt=media`
        );
        const remoteHasData = (remote.xp || 0) > 0 || Object.keys(remote.itemStats || {}).length > 0;
        if (remoteHasData || driveIsNewer) {
          Object.assign(state, remote);
          state.lastSaved = driveMs;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
          render();
        } else {
          await uploadToDrive();
        }
      } else {
        await uploadToDrive();
      }
    }
    driveSync.status = "synced";
    driveSync.lastSync = Date.now();
  } catch (e) {
    driveSync.status = "error";
  }
  saveDriveConfig();
  renderSyncStatus();
}

async function uploadToDrive() {
  const body = JSON.stringify(state);
  if (!_driveFileId) {
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify({ name: DRIVE_FILE_NAME, parents: ["appDataFolder"] })], { type: "application/json" }));
    form.append("file", new Blob([body], { type: "application/json" }));
    const res = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
      { method: "POST", headers: { Authorization: `Bearer ${_driveToken}` }, body: form }
    );
    const data = await res.json();
    _driveFileId = data.id;
  } else {
    await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${_driveFileId}?uploadType=media`,
      { method: "PATCH", headers: { Authorization: `Bearer ${_driveToken}`, "Content-Type": "application/json" }, body }
    );
  }
}

function scheduleSyncToDrive() {
  if (!_driveToken) return;
  clearTimeout(_syncTimeout);
  _syncTimeout = setTimeout(async () => {
    driveSync.status = "syncing";
    renderSyncStatus();
    try {
      await uploadToDrive();
      driveSync.status = "synced";
      driveSync.lastSync = Date.now();
    } catch (e) {
      driveSync.status = "error";
    }
    saveDriveConfig();
    renderSyncStatus();
  }, 2000);
}

function renderSyncStatus() {
  const btn = document.getElementById("sync-status");
  if (!btn) return;
  const { status, lastSync } = driveSync;
  const timeStr = lastSync ? new Date(lastSync).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" }) : "";
  const map = {
    syncing: { icon: "🔄", tip: "Synkar...", cls: "sync-syncing" },
    synced:  { icon: "☁️", tip: `Synkad ${timeStr}`, cls: "sync-ok" },
    error:   { icon: "⚠️", tip: "Synkfel — klicka för att försöka igen", cls: "sync-error" },
    idle:    { icon: "☁️", tip: "Inte ansluten", cls: "sync-idle" }
  };
  const m = map[status] || map.idle;
  btn.textContent = m.icon;
  btn.title = m.tip;
  btn.className = `sync-status-btn ${m.cls}`;
  btn.onclick = status === "error" ? signInDrive : () => navigate("settings");
}

window.onGoogleLibraryLoad = () => initDriveSync();

// ---------- Routing ----------
function parseRoute() {
  const h = location.hash.slice(1) || "dashboard";
  const parts = h.split("/").filter(Boolean);
  return { name: parts[0] || "dashboard", params: parts.slice(1) };
}

function navigate(route) {
  location.hash = "#" + route;
}

function setActiveNav(name) {
  document.querySelectorAll(".nav-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.route === name);
  });
}

function render() {
  const route = parseRoute();
  setActiveNav(route.name);
  document.onkeydown = null;
  const view = document.getElementById("view");
  view.innerHTML = "";
  switch (route.name) {
    case "dashboard": renderDashboard(view); break;
    case "plan": renderPlan(view); break;
    case "progress": renderProgress(view); break;
    case "area": renderArea(view, route.params[0]); break;
    case "quiz": renderQuiz(view, route.params[0], route.params[1], route.params[2]); break;
    case "build": renderBuilder(view, route.params[0]); break;
    case "settings": renderSettings(view); break;
    case "review": renderReview(view); break;
    default: renderDashboard(view);
  }
  renderXpDisplay();
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", render);

document.querySelectorAll(".nav-btn").forEach(b => {
  b.addEventListener("click", () => navigate(b.dataset.route));
});

// ---------- Plan ----------
function todaysAreaIndex() {
  const start = new Date(state.startDate);
  const today = new Date();
  start.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const days = Math.floor((today - start) / (1000 * 60 * 60 * 24));
  return ((days % DATA.areas.length) + DATA.areas.length) % DATA.areas.length;
}

function dayLabel(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  if (offset === 0) return "Idag";
  if (offset === 1) return "Imorgon";
  const days = ["sön", "mån", "tis", "ons", "tor", "fre", "lör"];
  return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

// ---------- Views ----------

function renderDashboard(root) {
  const todayIdx = todaysAreaIndex();
  const todayArea = DATA.areas[todayIdx];

  root.appendChild(el("h1", {}, "Hej! Vad ska vi öva idag?"));
  root.appendChild(el("p", { class: "muted" }, "Välj ett område nedan eller börja med dagens rekommendation."));

  // Repetition widget
  const due = getDueCards();
  if (due.length > 0) {
    const repCard = el("div", { class: "card review-card" }, [
      el("div", { class: "card-header" }, [
        el("span", { class: "icon-large" }, "🔁"),
        el("div", {}, [
          el("div", { class: "muted" }, "Repetera"),
          el("h2", {}, `${due.length} kort att repetera`)
        ])
      ]),
      el("p", {}, "Det finns kort som behöver repeteras nu — det är så du minns dem på lång sikt."),
      el("div", { class: "btn-row" }, [
        el("button", {
          class: "btn",
          onclick: () => navigate("review")
        }, "Starta repetition →")
      ])
    ]);
    root.appendChild(repCard);
  }

  // Today highlight
  const todayCard = el("div", { class: "card highlight" }, [
    el("div", { class: "card-header" }, [
      el("span", { class: "icon-large" }, todayArea.icon),
      el("div", {}, [
        el("div", { class: "muted" }, "📅 Dagens område"),
        el("h2", {}, todayArea.name)
      ])
    ]),
    el("p", {}, todayArea.description),
    el("div", { class: "btn-row" }, [
      el("button", {
        class: "btn",
        onclick: () => navigate(`area/${todayArea.id}`)
      }, "Börja träna →")
    ])
  ]);
  root.appendChild(todayCard);

  // All areas grid
  root.appendChild(el("h2", { style: "margin-top: 32px" }, "Alla områden"));
  const grid = el("div", { class: "area-grid" });
  for (const area of DATA.areas) {
    const p = areaProgress(area);
    const pct = p.total > 0 ? Math.round((p.mastered / p.total) * 100) : 0;
    const card = el("button", {
      class: "area-card",
      onclick: () => navigate(`area/${area.id}`)
    }, [
      el("div", { class: "area-card-title" }, [
        el("span", { class: "icon" }, area.icon),
        el("span", {}, area.name),
        area.isNew ? el("span", { class: "new-badge" }, "Ny!") : null
      ]),
      el("div", { class: "muted" }, area.description),
      el("div", { class: "progress" }, [
        el("div", { class: "progress-bar", style: `width: ${pct}%` })
      ]),
      el("div", { class: "area-card-meta" }, [
        el("span", {}, `${p.mastered} / ${p.total} ord`),
        el("span", {}, `${p.completedStages} / ${p.totalStages} klara`)
      ])
    ]);
    grid.appendChild(card);
  }
  root.appendChild(grid);
}

function renderPlan(root) {
  root.appendChild(el("h1", {}, "📅 Studieplan"));
  root.appendChild(el("p", { class: "muted" }, "Ett område per dag. Du kan alltid göra fler eller hoppa till andra områden."));

  const todayIdx = todaysAreaIndex();
  const list = el("div", {});
  for (let offset = 0; offset < 14; offset++) {
    const areaIdx = (todayIdx + offset) % DATA.areas.length;
    const area = DATA.areas[areaIdx];
    const p = areaProgress(area);
    const isToday = offset === 0;
    const isDone = p.completedStages === p.totalStages && p.totalStages > 0;
    const row = el("div", { class: `plan-day${isToday ? " today" : ""}${isDone ? " done" : ""}` }, [
      el("div", { class: "plan-day-num" }, String(offset + 1)),
      el("div", { class: "plan-day-area" }, [
        el("div", { style: "font-size: 13px;", class: "muted" }, dayLabel(offset)),
        el("div", {}, `${area.icon} ${area.name}`)
      ]),
      isDone ? el("span", { class: "pill good" }, "✓ Klar") : null,
      el("button", {
        class: "btn secondary",
        onclick: () => navigate(`area/${area.id}`)
      }, "Öppna")
    ]);
    list.appendChild(row);
  }
  root.appendChild(list);

  // Reset start date option
  root.appendChild(el("div", { class: "card", style: "margin-top: 32px" }, [
    el("h3", {}, "Inställningar"),
    el("p", { class: "muted" }, `Du började öva ${state.startDate}.`),
    el("div", { class: "btn-row" }, [
      el("button", {
        class: "btn ghost",
        onclick: () => {
          if (confirm("Starta om planen från idag?")) {
            state.startDate = new Date().toISOString().slice(0, 10);
            saveState();
            render();
          }
        }
      }, "Starta om planen från idag")
    ])
  ]));
}

function renderProgress(root) {
  root.appendChild(el("h1", {}, "📊 Min status"));
  root.appendChild(el("p", { class: "muted" }, "Här ser du hur långt du har kommit i varje område."));

  // Summary
  let totalItems = 0, totalMastered = 0, totalAttempts = 0, totalCorrect = 0;
  for (const area of DATA.areas) {
    for (const t of ["words", "sentences"]) {
      const items = area[t] || [];
      for (let i = 0; i < items.length; i++) {
        totalItems++;
        const st = state.itemStats[itemKey(area.id, t, i)];
        if (st) {
          if ((st.correct || 0) >= 1) totalMastered++;
          totalCorrect += st.correct || 0;
          totalAttempts += (st.correct || 0) + (st.wrong || 0);
        }
      }
    }
  }
  const overallPct = totalItems > 0 ? Math.round((totalMastered / totalItems) * 100) : 0;
  const accuracyPct = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0;

  const due = getDueCards();
  root.appendChild(el("div", { class: "card" }, [
    el("h2", {}, `${overallPct}% inlärt`),
    el("p", { class: "muted" }, `${totalMastered} av ${totalItems} ord och meningar är inlärda. Träffsäkerhet: ${totalAttempts > 0 ? accuracyPct + "%" : "—"}.`),
    el("div", { class: "progress" }, [
      el("div", { class: "progress-bar", style: `width: ${overallPct}%` })
    ]),
    el("div", { class: "row", style: "margin-top: 16px;" }, [
      el("span", { class: "pill" }, `🔁 ${due.length} att repetera`),
      due.length > 0
        ? el("button", { class: "btn", onclick: () => navigate("review") }, "Repetera nu")
        : null
    ])
  ]));

  // Hardest cards (most wrongs, attempted at least twice)
  const allCards = [];
  for (const area of DATA.areas) {
    for (const t of ["words", "sentences"]) {
      const items = area[t] || [];
      for (let i = 0; i < items.length; i++) {
        const key = itemKey(area.id, t, i);
        const st = state.itemStats[key];
        if (st && (st.wrong || 0) > 0 && ((st.wrong || 0) + (st.correct || 0)) >= 2) {
          allCards.push({
            area, type: t, index: i, item: items[i], stats: st,
            score: difficultyScore(key)
          });
        }
      }
    }
  }
  allCards.sort((a, b) => b.score - a.score);
  const hardest = allCards.slice(0, 8);
  if (hardest.length > 0) {
    root.appendChild(el("h2", { style: "margin-top: 32px" }, "🔥 Svårast just nu"));
    root.appendChild(el("p", { class: "muted" }, "Korten du missar oftast — de dyker upp ofta i repetitionen tills du minns dem."));
    const tbl = el("table", { class: "simple" }, [
      el("thead", {}, el("tr", {}, [
        el("th", {}, "Spanska"),
        el("th", {}, "Svenska"),
        el("th", {}, "Område"),
        el("th", {}, "Rätt/Fel"),
        el("th", {}, "Nästa")
      ])),
      el("tbody", {}, hardest.map(c =>
        el("tr", {}, [
          el("td", {}, c.item.es),
          el("td", {}, c.item.sv),
          el("td", {}, `${c.area.icon} ${c.area.name}`),
          el("td", {},
            el("span", { class: "diff-pill hard" },
              `${c.stats.correct || 0} / ${c.stats.wrong || 0}`)),
          el("td", { class: "muted" },
            c.stats.srsDueAt ? formatNextReview(c.stats.srsDueAt) : "—")
        ])
      ))
    ]);
    root.appendChild(tbl);
  }

  // Per-area details (sorted by best mastery first)
  const sorted = DATA.areas.slice().sort((a, b) => {
    const pa = areaProgress(a), pb = areaProgress(b);
    const ra = pa.total > 0 ? pa.mastered / pa.total : 0;
    const rb = pb.total > 0 ? pb.mastered / pb.total : 0;
    return rb - ra;
  });

  root.appendChild(el("h2", { style: "margin-top: 32px" }, "Per område"));
  for (const area of sorted) {
    const p = areaProgress(area);
    const pct = p.total > 0 ? Math.round((p.mastered / p.total) * 100) : 0;
    const card = el("div", { class: "card" }, [
      el("div", { class: "row" }, [
        el("span", { class: "icon" }, area.icon),
        el("h3", { style: "margin: 0;" }, area.name),
        el("span", { class: "spacer" }),
        el("span", { class: "pill" }, `${pct}%`),
        p.accuracy != null ? el("span", { class: "pill" }, `🎯 ${p.accuracy}%`) : null,
        el("button", {
          class: "btn secondary",
          onclick: () => navigate(`area/${area.id}`)
        }, "Öppna")
      ]),
      el("div", { class: "progress" }, [
        el("div", { class: "progress-bar", style: `width: ${pct}%` })
      ]),
      el("div", { class: "muted", style: "margin-top: 8px;" },
        `${p.mastered} av ${p.total} klara · ${p.completedStages} av ${p.totalStages} pass slutförda`)
    ]);
    root.appendChild(card);
  }

  // XP and level system
  const lvl = getLevel(state.xp);
  root.appendChild(el("h2", { style: "margin-top: 32px" }, "⭐ XP- och nivåsystem"));
  root.appendChild(el("div", { class: "card" }, [
    el("p", { class: "muted", style: "margin-top: 0" }, "Så här tjänar du XP:"),
    el("ul", { class: "muted", style: "margin: 0 0 16px; padding-left: 20px; line-height: 2" }, [
      el("li", {}, "+5 XP för rätt ord på första försöket (+8 för meningar)"),
      el("li", {}, "+12 XP för rätt byggd mening på första försöket"),
      el("li", {}, "+2 XP för rätt efter ett fel"),
      el("li", {}, "+25–35 XP bonus när en hel övning klaras"),
      el("li", {}, "+50 XP bonus när alla övningar i ett område är klara")
    ]),
    el("table", { class: "simple" }, [
      el("thead", {}, el("tr", {}, [
        el("th", {}, "Nivå"),
        el("th", {}, "Krav (XP)"),
        el("th", {}, "Namn")
      ])),
      el("tbody", {}, LEVELS.map((lv, i) => {
        const isCurrent = i === lvl.level - 1;
        return el("tr", { style: isCurrent ? "font-weight: bold; background: #fff8e1;" : "" }, [
          el("td", {}, String(i + 1) + (isCurrent ? " ◀" : "")),
          el("td", {}, String(lv.xp)),
          el("td", {}, lv.name)
        ]);
      }))
    ])
  ]));

  root.appendChild(el("div", { class: "card", style: "margin-top: 32px" }, [
    el("h3", {}, "Nollställ"),
    el("p", { class: "muted" }, "Vill du börja om från början?"),
    el("div", { class: "btn-row" }, [
      el("button", {
        class: "btn ghost",
        onclick: () => {
          if (confirm("Är du säker? All data om dina framsteg försvinner.")) {
            localStorage.removeItem(STORAGE_KEY);
            state = loadState();
            render();
          }
        }
      }, "Nollställ all framsteg")
    ])
  ]));
}

function renderArea(root, areaId) {
  const area = areaById(areaId);
  if (!area) {
    root.appendChild(el("p", {}, "Området hittades inte."));
    return;
  }

  root.appendChild(el("button", {
    class: "btn ghost",
    style: "margin-bottom: 16px",
    onclick: () => navigate("dashboard")
  }, "← Tillbaka"));

  root.appendChild(el("div", { class: "card-header" }, [
    el("span", { class: "icon-large" }, area.icon),
    el("div", {}, [
      el("h1", { style: "margin: 0;" }, area.name),
      el("div", { class: "muted" }, area.description)
    ])
  ]));

  const stages = getStages(area);
  const list = el("div", { class: "stage-list" });
  for (const stage of stages) {
    const compl = state.stageCompletion[stageKey(area.id, stage.type, stage.dir, stage.mode)];
    const items = area[stage.type] || [];
    let mastered = 0;
    for (let i = 0; i < items.length; i++) {
      const st = state.itemStats[itemKey(area.id, stage.type, i)];
      if (st && (st.correct || 0) >= 1) mastered++;
    }
    const pct = items.length > 0 ? Math.round((mastered / items.length) * 100) : 0;
    const isDone = !!compl;
    const row = el("div", { class: `stage-row${isDone ? " done" : ""}` }, [
      el("span", { class: "icon" }, stage.icon || "🔤"),
      el("div", { class: "stage-info" }, [
        el("div", { class: "stage-name" }, stage.label),
        el("div", { class: "stage-meta" },
          `${items.length} stycken${compl ? ` · senast klart ${new Date(compl.lastCompleted).toLocaleDateString("sv-SE")} · ${compl.runs} ${compl.runs === 1 ? "gång" : "gånger"}` : ""}`)
      ]),
      el("div", { style: "display: flex; gap: 8px; align-items: center;" }, [
        el("span", { class: "pill" }, `${pct}%`),
        el("button", {
          class: "btn",
          onclick: () => navigate(stageRoute(area.id, stage))
        }, isDone ? "Repetera" : "Börja")
      ])
    ]);
    list.appendChild(row);
  }
  root.appendChild(list);

  // Show all words/sentences as a reference list
  if (area.words && area.words.length) {
    root.appendChild(el("h2", { style: "margin-top: 32px" }, "Ord i området"));
    const tbl = el("table", { class: "simple" }, [
      el("thead", {}, el("tr", {}, [
        el("th", {}, "Spanska"),
        el("th", {}, "Svenska"),
        el("th", {}, "")
      ])),
      el("tbody", {}, area.words.map(w =>
        el("tr", {}, [
          el("td", {}, w.es),
          el("td", {}, w.sv),
          el("td", {}, el("button", {
            class: "speak-btn",
            onclick: (e) => { e.stopPropagation(); speakSpanish(w.es); }
          }, "🔊"))
        ])
      ))
    ]);
    root.appendChild(tbl);
  }
  if (area.sentences && area.sentences.length) {
    root.appendChild(el("h2", { style: "margin-top: 32px" }, "Meningar i området"));
    const tbl = el("table", { class: "simple" }, [
      el("thead", {}, el("tr", {}, [
        el("th", {}, "Spanska"),
        el("th", {}, "Svenska"),
        el("th", {}, "")
      ])),
      el("tbody", {}, area.sentences.map(s =>
        el("tr", {}, [
          el("td", {}, s.es),
          el("td", {}, s.sv),
          el("td", {}, el("button", {
            class: "speak-btn",
            onclick: (e) => { e.stopPropagation(); speakSpanish(s.es); }
          }, "🔊"))
        ])
      ))
    ]);
    root.appendChild(tbl);
  }
}

// ---------- Quiz ----------
let quizState = null;

function startQuiz(areaId, type, dir) {
  const area = areaById(areaId);
  const items = area[type] || [];
  // Initialize queue with all indices, shuffled
  quizState = {
    areaId,
    type,
    dir,
    queue: shuffle(items.map((_, i) => i)),
    seenCorrect: new Set(),
    asked: 0,
    rightFirstTry: 0,
    wrongTotal: 0,
    items,
    area,
    currentIndex: null,
    options: [],
    answered: false,
    chosenIdx: null
  };
  pickNext();
}

function pickNext() {
  if (quizState.queue.length === 0) {
    quizState.done = true;
    return;
  }
  const idx = quizState.queue[0];
  quizState.currentIndex = idx;
  quizState.firstTryThisRound = !quizState.itemAttempted?.has(idx);
  if (!quizState.itemAttempted) quizState.itemAttempted = new Set();
  // Generate distractors
  const correct = quizState.items[idx];
  const otherIndices = quizState.items.map((_, i) => i).filter(i => i !== idx);
  const distractors = shuffle(otherIndices).slice(0, 3).map(i => quizState.items[i]);
  // If too few in area, pull from other areas of same type
  while (distractors.length < 3) {
    const pool = [];
    for (const a of DATA.areas) {
      if (a.id === quizState.areaId) continue;
      const arr = a[quizState.type] || [];
      pool.push(...arr);
    }
    if (pool.length === 0) break;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (!distractors.includes(pick) && pick !== correct) distractors.push(pick);
  }
  quizState.options = shuffle([correct, ...distractors]);
  quizState.correctOption = correct;
  quizState.answered = false;
  quizState.chosenIdx = null;
}

function answerQuiz(optionIdx) {
  if (quizState.answered) return;
  quizState.answered = true;
  quizState.chosenIdx = optionIdx;
  const chosen = quizState.options[optionIdx];
  const correct = quizState.correctOption;
  const isCorrect = chosen === correct;
  const idx = quizState.currentIndex;
  const key = itemKey(quizState.areaId, quizState.type, idx);
  const st = state.itemStats[key] || { correct: 0, wrong: 0 };
  const wasFirstTry = !quizState.itemAttempted.has(idx);
  if (isCorrect) {
    st.correct = (st.correct || 0) + 1;
    if (wasFirstTry) quizState.rightFirstTry++;
  } else {
    st.wrong = (st.wrong || 0) + 1;
    quizState.wrongTotal++;
  }
  st.lastAnswered = Date.now();
  state.itemStats[key] = st;
  quizState.itemAttempted.add(idx);
  quizState.asked++;
  saveState();

  if (isCorrect) {
    quizState.queue.shift();
    quizState.seenCorrect.add(idx);
    playCorrect();
    const xp = wasFirstTry ? (quizState.type === "sentences" ? 8 : 5) : 2;
    const anchor = document.querySelectorAll(".option-btn")[optionIdx];
    awardXp(xp, anchor);
    quizState.awaitingRating = true;
  } else {
    quizState.queue.shift();
    quizState.queue.push(idx);
    playWrong();
    applySrsWrong(key);
  }
  renderQuizView();
}

function rateAndAdvanceQuiz(rating) {
  const idx = quizState.currentIndex;
  const key = itemKey(quizState.areaId, quizState.type, idx);
  applySrsRating(key, rating);
  quizState.awaitingRating = false;
  nextQuiz();
}

function nextQuiz() {
  pickNext();
  renderQuizView();
}

function renderQuiz(root, areaId, type, dir) {
  if (!quizState || quizState.areaId !== areaId || quizState.type !== type || quizState.dir !== dir || quizState.done) {
    startQuiz(areaId, type, dir);
  }
  renderQuizView();
}

function renderQuizView() {
  const root = document.getElementById("view");
  root.innerHTML = "";
  const area = quizState.area;
  const total = quizState.items.length;
  const done = quizState.seenCorrect.size;
  const remaining = quizState.queue.length;

  root.appendChild(el("button", {
    class: "btn ghost",
    style: "margin-bottom: 16px",
    onclick: () => {
      if (confirm("Lämna övningen? Dina framsteg sparas.")) {
        navigate(`area/${area.id}`);
      }
    }
  }, "← Avsluta"));

  // Header
  const dirLabel = quizState.dir === "es-sv" ? "Spanska → Svenska" : "Svenska → Spanska";
  const typeLabel = quizState.type === "words" ? "Ord" : "Meningar";
  root.appendChild(el("div", { class: "row" }, [
    el("span", { class: "icon" }, area.icon),
    el("h2", { style: "margin: 0;" }, `${area.name} — ${typeLabel}`)
  ]));
  root.appendChild(el("p", { class: "muted" }, dirLabel));

  // Progress bar
  const progPct = total > 0 ? Math.round((done / total) * 100) : 0;
  root.appendChild(el("div", { class: "progress" }, [
    el("div", { class: "progress-bar", style: `width: ${progPct}%` })
  ]));

  if (quizState.done) {
    renderQuizDone(root);
    return;
  }

  // Status pills
  root.appendChild(el("div", { class: "quiz-status" }, [
    el("span", { class: "pill" }, `✅ ${done} klara`),
    el("span", { class: "pill" }, `🔄 ${remaining} kvar`),
    el("span", { class: "pill" }, `🎯 ${quizState.rightFirstTry} första försöket`)
  ]));

  const correct = quizState.correctOption;
  const promptText = quizState.dir === "es-sv" ? correct.es : correct.sv;
  const optionField = quizState.dir === "es-sv" ? "sv" : "es";

  // Prompt
  const promptCard = el("div", { class: "quiz-prompt" }, [
    el("div", { class: "quiz-prompt-direction" },
      quizState.dir === "es-sv" ? "Vad betyder detta på svenska?" : "Vad heter detta på spanska?"),
    el("div", { class: "quiz-prompt-word" }, promptText),
    quizState.dir === "es-sv"
      ? el("button", {
          class: "speak-btn",
          onclick: () => speakSpanish(promptText)
        }, "🔊 Lyssna")
      : null
  ]);
  root.appendChild(promptCard);

  // Options
  const opts = el("div", { class: "options" });
  quizState.options.forEach((opt, i) => {
    let cls = "option-btn";
    if (quizState.answered) {
      if (opt === correct) cls += " show-correct";
      else if (i === quizState.chosenIdx) cls += " wrong";
    }
    const btn = el("button", {
      class: cls,
      onclick: () => answerQuiz(i)
    }, opt[optionField]);
    if (quizState.answered) btn.disabled = true;
    opts.appendChild(btn);
  });
  root.appendChild(opts);

  // Feedback + next
  if (quizState.answered) {
    const chosen = quizState.options[quizState.chosenIdx];
    const isCorrect = chosen === correct;
    if (isCorrect) {
      root.appendChild(el("div", { class: "feedback good" }, [
        el("span", { class: "icon" }, "✅"),
        el("span", {}, [
          el("strong", {}, "Rätt! "),
          document.createTextNode(`${correct.es} = ${correct.sv}`)
        ])
      ]));
    } else {
      root.appendChild(el("div", { class: "feedback bad" }, [
        el("span", { class: "icon" }, "❌"),
        el("span", {}, [
          el("strong", {}, "Inte riktigt. "),
          document.createTextNode(`Rätt svar är: ${correct[optionField]}. (${correct.es} = ${correct.sv})`)
        ])
      ]));
    }
    root.appendChild(renderWritePractice(correct.es));
    const speakBtn = quizState.dir === "sv-es"
      ? el("button", {
          class: "btn secondary",
          onclick: () => speakSpanish(correct.es)
        }, "🔊 Hör spanska")
      : null;

    if (isCorrect && quizState.awaitingRating) {
      // Show difficulty rating instead of plain Nästa button
      root.appendChild(renderRatingRow(rateAndAdvanceQuiz));
      if (speakBtn) root.appendChild(el("div", { class: "btn-row" }, [speakBtn]));
      document.onkeydown = (e) => {
        if (document.activeElement && document.activeElement.tagName === "INPUT") return;
        if (e.key === "1") rateAndAdvanceQuiz("hard");
        else if (e.key === "2") rateAndAdvanceQuiz("ok");
        else if (e.key === "3") rateAndAdvanceQuiz("easy");
      };
    } else {
      const nextBtn = el("button", { class: "btn", onclick: nextQuiz },
        quizState.queue.length === 0 ? "Avsluta →" : "Nästa →");
      const row = el("div", { class: "btn-row" }, speakBtn ? [speakBtn, nextBtn] : [nextBtn]);
      root.appendChild(row);
      setTimeout(() => nextBtn.focus(), 0);
      document.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          nextQuiz();
        }
      };
    }
  } else {
    document.onkeydown = (e) => {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= quizState.options.length) {
        answerQuiz(n - 1);
      }
    };
  }
}

function renderWritePractice(correctEs) {
  const container = el("div", { class: "write-practice" });
  container.appendChild(el("div", { class: "write-practice-label" }, "✏️ Skriv det spanska ordet (frivilligt)"));
  const inputRow = el("div", { class: "write-practice-row" });
  const input = el("input", {
    type: "text",
    class: "write-practice-input",
    placeholder: "Skriv här...",
    autocomplete: "off",
    autocorrect: "off",
    spellcheck: "false"
  });
  const checkBtn = el("button", { class: "btn secondary", onclick: checkWrite }, "Kontrollera");
  inputRow.appendChild(input);
  inputRow.appendChild(checkBtn);
  container.appendChild(inputRow);
  const feedback = el("div", { class: "write-practice-feedback" });
  container.appendChild(feedback);

  function checkWrite() {
    const typed = input.value.trim();
    if (!typed) return;
    const norm = s => s.toLowerCase().replace(/[¿¡]/g, "").trim();
    if (norm(typed) === norm(correctEs)) {
      feedback.textContent = "✅ Perfekt!";
      feedback.className = "write-practice-feedback good";
      input.disabled = true;
      checkBtn.disabled = true;
    } else {
      feedback.innerHTML = `Inte riktigt — försök igen! (<strong>${correctEs}</strong>)`;
      feedback.className = "write-practice-feedback bad";
      input.value = "";
      input.focus();
    }
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); checkWrite(); }
  });

  setTimeout(() => input.focus(), 50);
  return container;
}

function renderRatingRow(onRate) {
  return el("div", { class: "rating-row" }, [
    el("div", { class: "rating-prompt muted" }, "Hur svårt var det? Då vet jag när du ska se det igen."),
    el("div", { class: "rating-buttons" }, [
      el("button", {
        class: "rating-btn hard",
        onclick: () => onRate("hard")
      }, [
        el("span", { class: "rating-emoji" }, "😓"),
        el("span", { class: "rating-label" }, "Svårt"),
        el("span", { class: "rating-meta" }, "snart igen")
      ]),
      el("button", {
        class: "rating-btn ok",
        onclick: () => onRate("ok")
      }, [
        el("span", { class: "rating-emoji" }, "🙂"),
        el("span", { class: "rating-label" }, "Ok"),
        el("span", { class: "rating-meta" }, "imorgon")
      ]),
      el("button", {
        class: "rating-btn easy",
        onclick: () => onRate("easy")
      }, [
        el("span", { class: "rating-emoji" }, "😎"),
        el("span", { class: "rating-label" }, "Lätt"),
        el("span", { class: "rating-meta" }, "om några dagar")
      ])
    ])
  ]);
}

function renderQuizDone(root) {
  document.onkeydown = null;
  const area = quizState.area;
  const sk = stageKey(quizState.areaId, quizState.type, quizState.dir);
  const prev = state.stageCompletion[sk] || { runs: 0 };
  const isFirstClear = !prev.lastCompleted;
  state.stageCompletion[sk] = {
    lastCompleted: Date.now(),
    runs: (prev.runs || 0) + 1
  };
  saveState();
  // Stage completion bonus (only first time per session, but always reward something)
  awardXp(isFirstClear ? 25 : 10);
  // Check if entire area complete
  const ap = areaProgress(area);
  if (ap.completedStages === ap.totalStages) {
    setTimeout(() => awardXp(50), 500);
  }
  playFanfare();
  confetti(70);

  const total = quizState.items.length;
  const accuracy = quizState.asked > 0 ? Math.round((quizState.rightFirstTry / total) * 100) : 0;

  // Suggest next stage
  const stages = getStages(area);
  const currentIdx = stages.findIndex(s => s.type === quizState.type && s.dir === quizState.dir);
  const nextStage = stages[currentIdx + 1];

  // Pick next area in plan
  const todayIdx = todaysAreaIndex();
  const currentAreaIdx = DATA.areas.findIndex(a => a.id === area.id);
  const nextAreaIdx = (currentAreaIdx + 1) % DATA.areas.length;
  const nextArea = DATA.areas[nextAreaIdx];

  root.appendChild(el("div", { class: "completion" }, [
    el("div", { class: "completion-emoji" }, accuracy >= 80 ? "🎉" : "💪"),
    el("h1", {}, "Bra jobbat!"),
    el("p", {}, `Du klarade alla ${total} ${quizState.type === "words" ? "ord" : "meningar"} i området.`),
    el("p", { class: "muted" }, `${quizState.rightFirstTry} av ${total} rätt på första försöket (${accuracy}%).`),
    el("div", { class: "btn-row", style: "justify-content: center;" }, [
      nextStage ? el("button", {
        class: "btn",
        onclick: () => {
          quizState = null;
          navigate(stageRoute(area.id, nextStage));
        }
      }, `Nästa: ${nextStage.label} →`) : null,
      el("button", {
        class: "btn secondary",
        onclick: () => {
          quizState = null;
          navigate(`area/${area.id}`);
        }
      }, "Tillbaka till området"),
      !nextStage ? el("button", {
        class: "btn",
        onclick: () => {
          quizState = null;
          navigate(`area/${nextArea.id}`);
        }
      }, `Nästa område: ${nextArea.name} →`) : null
    ])
  ]));
}

// ---------- Review (SRS due cards across all areas) ----------
let reviewState = null;

function startReview() {
  const due = getDueCards();
  if (due.length === 0) { reviewState = null; return; }
  reviewState = {
    queue: shuffle(due.slice()),
    seenCorrect: new Set(),
    asked: 0,
    rightFirstTry: 0,
    itemAttempted: new Set(),
    current: null,
    options: [],
    correctOption: null,
    answered: false,
    chosenIdx: null,
    awaitingRating: false,
    done: false,
    initialCount: due.length
  };
  pickReviewNext();
}

function pickReviewNext() {
  if (reviewState.queue.length === 0) {
    reviewState.done = true;
    return;
  }
  const card = reviewState.queue[0];
  reviewState.current = card;
  reviewState.dir = Math.random() < 0.5 ? "es-sv" : "sv-es";
  // Build distractors from same area + type
  const area = areaById(card.areaId);
  const items = area[card.type] || [];
  const others = items.filter((_, i) => i !== card.index);
  const distractors = shuffle(others).slice(0, 3);
  while (distractors.length < 3) {
    const pool = [];
    for (const a of DATA.areas) {
      if (a.id === card.areaId) continue;
      pool.push(...(a[card.type] || []));
    }
    if (pool.length === 0) break;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (!distractors.includes(pick) && pick !== card.item) distractors.push(pick);
  }
  reviewState.options = shuffle([card.item, ...distractors]);
  reviewState.correctOption = card.item;
  reviewState.answered = false;
  reviewState.chosenIdx = null;
  reviewState.awaitingRating = false;
}

function answerReview(idx) {
  if (reviewState.answered) return;
  reviewState.answered = true;
  reviewState.chosenIdx = idx;
  const chosen = reviewState.options[idx];
  const correct = reviewState.correctOption;
  const isCorrect = chosen === correct;
  const card = reviewState.current;
  const wasFirstTry = !reviewState.itemAttempted.has(card.key);
  const st = state.itemStats[card.key] || { correct: 0, wrong: 0 };
  if (isCorrect) {
    st.correct = (st.correct || 0) + 1;
    if (wasFirstTry) reviewState.rightFirstTry++;
  } else {
    st.wrong = (st.wrong || 0) + 1;
  }
  st.lastAnswered = Date.now();
  state.itemStats[card.key] = st;
  reviewState.itemAttempted.add(card.key);
  reviewState.asked++;
  saveState();

  if (isCorrect) {
    reviewState.queue.shift();
    reviewState.seenCorrect.add(card.key);
    playCorrect();
    const anchor = document.querySelectorAll(".option-btn")[idx];
    awardXp(wasFirstTry ? 6 : 2, anchor);
    reviewState.awaitingRating = true;
  } else {
    reviewState.queue.shift();
    reviewState.queue.push(card);
    playWrong();
    applySrsWrong(card.key);
  }
  renderReviewView();
}

function rateAndAdvanceReview(rating) {
  applySrsRating(reviewState.current.key, rating);
  reviewState.awaitingRating = false;
  pickReviewNext();
  renderReviewView();
}

function nextReview() {
  pickReviewNext();
  renderReviewView();
}

function renderReview(root) {
  if (!reviewState || reviewState.done) startReview();
  if (!reviewState) {
    root.appendChild(el("h1", {}, "🎉 Inget att repetera!"));
    root.appendChild(el("p", { class: "muted" }, "Du har inga kort som är förfallna just nu. Bra jobbat!"));
    root.appendChild(el("div", { class: "btn-row" }, [
      el("button", { class: "btn", onclick: () => navigate("dashboard") }, "Till hem")
    ]));
    return;
  }
  renderReviewView();
}

function renderReviewView() {
  const root = document.getElementById("view");
  root.innerHTML = "";

  root.appendChild(el("button", {
    class: "btn ghost",
    style: "margin-bottom: 16px",
    onclick: () => {
      if (confirm("Lämna repetitionen? Dina svar sparas.")) navigate("dashboard");
    }
  }, "← Avsluta"));

  root.appendChild(el("h2", {}, "🔁 Repetition"));
  const total = reviewState.initialCount;
  const done = reviewState.seenCorrect.size;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  root.appendChild(el("div", { class: "progress" }, [
    el("div", { class: "progress-bar", style: `width: ${pct}%` })
  ]));

  if (reviewState.done) {
    document.onkeydown = null;
    playFanfare();
    confetti(60);
    root.appendChild(el("div", { class: "completion" }, [
      el("div", { class: "completion-emoji" }, "🎉"),
      el("h1", {}, "Klart för idag!"),
      el("p", {}, `Du repeterade ${total} kort (${reviewState.rightFirstTry} rätt på första försöket).`),
      el("div", { class: "btn-row", style: "justify-content: center;" }, [
        el("button", { class: "btn", onclick: () => navigate("dashboard") }, "Till hem")
      ])
    ]));
    return;
  }

  const card = reviewState.current;
  const area = areaById(card.areaId);
  root.appendChild(el("div", { class: "quiz-status" }, [
    el("span", { class: "pill" }, `${area.icon} ${area.name}`),
    el("span", { class: "pill" }, `✅ ${done} klara`),
    el("span", { class: "pill" }, `🔄 ${reviewState.queue.length} kvar`)
  ]));

  const correct = reviewState.correctOption;
  const promptText = reviewState.dir === "es-sv" ? correct.es : correct.sv;
  const optionField = reviewState.dir === "es-sv" ? "sv" : "es";

  const promptCard = el("div", { class: "quiz-prompt" }, [
    el("div", { class: "quiz-prompt-direction" },
      reviewState.dir === "es-sv" ? "Vad betyder detta på svenska?" : "Vad heter detta på spanska?"),
    el("div", { class: "quiz-prompt-word" }, promptText),
    reviewState.dir === "es-sv"
      ? el("button", { class: "speak-btn", onclick: () => speakSpanish(promptText) }, "🔊 Lyssna")
      : null
  ]);
  root.appendChild(promptCard);

  const opts = el("div", { class: "options" });
  reviewState.options.forEach((opt, i) => {
    let cls = "option-btn";
    if (reviewState.answered) {
      if (opt === correct) cls += " show-correct";
      else if (i === reviewState.chosenIdx) cls += " wrong";
    }
    const btn = el("button", { class: cls, onclick: () => answerReview(i) }, opt[optionField]);
    if (reviewState.answered) btn.disabled = true;
    opts.appendChild(btn);
  });
  root.appendChild(opts);

  if (reviewState.answered) {
    const isCorrect = reviewState.options[reviewState.chosenIdx] === correct;
    if (isCorrect) {
      root.appendChild(el("div", { class: "feedback good" }, [
        el("span", { class: "icon" }, "✅"),
        el("span", {}, [
          el("strong", {}, "Rätt! "),
          document.createTextNode(`${correct.es} = ${correct.sv}`)
        ])
      ]));
    } else {
      root.appendChild(el("div", { class: "feedback bad" }, [
        el("span", { class: "icon" }, "❌"),
        el("span", {}, [
          el("strong", {}, "Inte riktigt. "),
          document.createTextNode(`Rätt svar: ${correct[optionField]} (${correct.es} = ${correct.sv})`)
        ])
      ]));
    }
    root.appendChild(renderWritePractice(correct.es));
    if (isCorrect && reviewState.awaitingRating) {
      root.appendChild(renderRatingRow(rateAndAdvanceReview));
      document.onkeydown = (e) => {
        if (document.activeElement && document.activeElement.tagName === "INPUT") return;
        if (e.key === "1") rateAndAdvanceReview("hard");
        else if (e.key === "2") rateAndAdvanceReview("ok");
        else if (e.key === "3") rateAndAdvanceReview("easy");
      };
    } else {
      const nextBtn = el("button", { class: "btn", onclick: nextReview },
        reviewState.queue.length === 0 ? "Avsluta →" : "Nästa →");
      root.appendChild(el("div", { class: "btn-row" }, [nextBtn]));
      setTimeout(() => nextBtn.focus(), 0);
      document.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); nextReview(); }
      };
    }
  } else {
    document.onkeydown = (e) => {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= reviewState.options.length) answerReview(n - 1);
    };
  }
}

// ---------- Sentence builder ----------
let builderState = null;

function tokenize(sentence) {
  // Split on whitespace, keep punctuation attached to adjacent token
  return sentence.split(/\s+/).filter(Boolean);
}

function startBuilder(areaId) {
  const area = areaById(areaId);
  const items = (area.sentences || []).slice();
  builderState = {
    areaId,
    area,
    items,
    queue: shuffle(items.map((_, i) => i)),
    seenCorrect: new Set(),
    asked: 0,
    rightFirstTry: 0,
    itemAttempted: new Set(),
    currentIndex: null,
    pool: [],         // [{ word, key, used }]
    answer: [],       // array of pool keys in chosen order
    answered: false,
    isCorrect: false,
    done: false
  };
  pickBuilderNext();
}

function pickBuilderNext() {
  if (builderState.queue.length === 0) {
    builderState.done = true;
    return;
  }
  const idx = builderState.queue[0];
  builderState.currentIndex = idx;
  const sentence = builderState.items[idx].es;
  const tokens = tokenize(sentence);
  // Build pool with unique keys
  builderState.pool = tokens.map((w, i) => ({ word: w, key: `${i}_${w}`, used: false }));
  builderState.pool = shuffle(builderState.pool);
  builderState.answer = [];
  builderState.answered = false;
  builderState.isCorrect = false;
}

function builderAddWord(key) {
  if (builderState.answered) return;
  const piece = builderState.pool.find(p => p.key === key);
  if (!piece || piece.used) return;
  piece.used = true;
  builderState.answer.push(key);
  renderBuilderView();
}

function builderRemoveWord(idx) {
  if (builderState.answered) return;
  const key = builderState.answer[idx];
  const piece = builderState.pool.find(p => p.key === key);
  if (piece) piece.used = false;
  builderState.answer.splice(idx, 1);
  renderBuilderView();
}

function builderClear() {
  if (builderState.answered) return;
  for (const p of builderState.pool) p.used = false;
  builderState.answer = [];
  renderBuilderView();
}

function builderCheck() {
  if (builderState.answered || builderState.answer.length === 0) return;
  const idx = builderState.currentIndex;
  const correct = builderState.items[idx].es;
  const guess = builderState.answer.map(k => {
    return builderState.pool.find(p => p.key === k).word;
  }).join(" ");
  // Normalize: lowercase, collapse whitespace
  const norm = s => s.toLowerCase().replace(/\s+/g, " ").trim();
  const isCorrect = norm(guess) === norm(correct);
  builderState.answered = true;
  builderState.isCorrect = isCorrect;

  // Update item stats
  const key = itemKey(builderState.areaId, "sentences", idx);
  const st = state.itemStats[key] || { correct: 0, wrong: 0 };
  const wasFirstTry = !builderState.itemAttempted.has(idx);
  if (isCorrect) {
    st.correct = (st.correct || 0) + 1;
    if (wasFirstTry) builderState.rightFirstTry++;
  } else {
    st.wrong = (st.wrong || 0) + 1;
  }
  st.lastAnswered = Date.now();
  state.itemStats[key] = st;
  builderState.itemAttempted.add(idx);
  builderState.asked++;
  saveState();

  if (isCorrect) {
    builderState.queue.shift();
    builderState.seenCorrect.add(idx);
    playCorrect();
    const checkBtn = document.getElementById("builder-check-btn");
    awardXp(wasFirstTry ? 12 : 4, checkBtn);
    builderState.awaitingRating = true;
  } else {
    builderState.queue.shift();
    builderState.queue.push(idx);
    playWrong();
    applySrsWrong(key);
  }
  renderBuilderView();
}

function rateAndAdvanceBuilder(rating) {
  const idx = builderState.currentIndex;
  const key = itemKey(builderState.areaId, "sentences", idx);
  applySrsRating(key, rating);
  builderState.awaitingRating = false;
  builderNext();
}

function builderNext() {
  pickBuilderNext();
  renderBuilderView();
}

function renderBuilder(root, areaId) {
  if (!builderState || builderState.areaId !== areaId || builderState.done) {
    startBuilder(areaId);
  }
  renderBuilderView();
}

function renderBuilderView() {
  const root = document.getElementById("view");
  root.innerHTML = "";
  const area = builderState.area;
  const total = builderState.items.length;
  const done = builderState.seenCorrect.size;
  const remaining = builderState.queue.length;

  root.appendChild(el("button", {
    class: "btn ghost",
    style: "margin-bottom: 16px",
    onclick: () => {
      if (confirm("Lämna övningen? Dina framsteg sparas.")) {
        navigate(`area/${area.id}`);
      }
    }
  }, "← Avsluta"));

  root.appendChild(el("div", { class: "row" }, [
    el("span", { class: "icon" }, area.icon),
    el("h2", { style: "margin: 0;" }, `${area.name} — Bygg meningen 🧩`)
  ]));
  root.appendChild(el("p", { class: "muted" }, "Klicka på orden i rätt ordning"));

  const progPct = total > 0 ? Math.round((done / total) * 100) : 0;
  root.appendChild(el("div", { class: "progress" }, [
    el("div", { class: "progress-bar", style: `width: ${progPct}%` })
  ]));

  if (builderState.done) {
    renderBuilderDone(root);
    return;
  }

  root.appendChild(el("div", { class: "quiz-status" }, [
    el("span", { class: "pill" }, `✅ ${done} klara`),
    el("span", { class: "pill" }, `🔄 ${remaining} kvar`),
    el("span", { class: "pill" }, `🎯 ${builderState.rightFirstTry} första försöket`)
  ]));

  const idx = builderState.currentIndex;
  const item = builderState.items[idx];

  // Swedish prompt
  root.appendChild(el("div", { class: "builder-prompt" }, [
    el("div", { class: "builder-prompt-direction" }, "Översätt till spanska"),
    el("div", { class: "builder-prompt-text" }, item.sv)
  ]));

  // Answer area
  let answerCls = "builder-answer";
  if (builderState.answer.length === 0 && !builderState.answered) answerCls += " empty";
  if (builderState.answered) answerCls += builderState.isCorrect ? " correct" : " wrong";
  const answerRow = el("div", { class: answerCls });
  builderState.answer.forEach((key, i) => {
    const piece = builderState.pool.find(p => p.key === key);
    const chip = el("button", {
      class: "word-chip in-answer",
      onclick: () => builderRemoveWord(i)
    }, piece.word);
    if (builderState.answered) chip.disabled = true;
    answerRow.appendChild(chip);
  });
  root.appendChild(answerRow);

  // Pool of unused words
  const pool = el("div", { class: "builder-pool" });
  for (const piece of builderState.pool) {
    if (piece.used) continue;
    const chip = el("button", {
      class: "word-chip",
      onclick: () => builderAddWord(piece.key)
    }, piece.word);
    if (builderState.answered) chip.disabled = true;
    pool.appendChild(chip);
  }
  root.appendChild(pool);

  // Action row
  if (!builderState.answered) {
    root.appendChild(el("div", { class: "btn-row" }, [
      el("button", {
        id: "builder-check-btn",
        class: "btn",
        onclick: builderCheck,
        disabled: builderState.answer.length === 0 ? "" : null
      }, "Kontrollera ✓"),
      el("button", {
        class: "btn secondary",
        onclick: builderClear
      }, "Rensa"),
      el("button", {
        class: "btn ghost",
        onclick: () => speakSpanish(item.es)
      }, "🔊 Lyssna på rätt svar")
    ]));
  } else {
    if (builderState.isCorrect) {
      root.appendChild(el("div", { class: "feedback good" }, [
        el("span", { class: "icon" }, "✅"),
        el("span", {}, [
          el("strong", {}, "Helt rätt! "),
          document.createTextNode(item.es)
        ])
      ]));
    } else {
      root.appendChild(el("div", { class: "feedback bad" }, [
        el("span", { class: "icon" }, "❌"),
        el("span", {}, [
          el("strong", {}, "Inte riktigt. "),
          document.createTextNode(`Rätt mening: ${item.es}`)
        ])
      ]));
    }
    const speakBtn = el("button", {
      class: "btn secondary",
      onclick: () => speakSpanish(item.es)
    }, "🔊 Hör spanska");

    if (builderState.isCorrect && builderState.awaitingRating) {
      root.appendChild(renderRatingRow(rateAndAdvanceBuilder));
      root.appendChild(el("div", { class: "btn-row" }, [speakBtn]));
      document.onkeydown = (e) => {
        if (e.key === "1") rateAndAdvanceBuilder("hard");
        else if (e.key === "2") rateAndAdvanceBuilder("ok");
        else if (e.key === "3") rateAndAdvanceBuilder("easy");
      };
    } else {
      const nextBtn = el("button", { class: "btn", onclick: builderNext },
        builderState.queue.length === 0 ? "Avsluta →" : "Nästa →");
      root.appendChild(el("div", { class: "btn-row" }, [speakBtn, nextBtn]));
      setTimeout(() => nextBtn.focus(), 0);
      document.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          builderNext();
        }
      };
    }
  }
}

function renderBuilderDone(root) {
  document.onkeydown = null;
  const area = builderState.area;
  const sk = stageKey(builderState.areaId, "sentences", "sv-es", "build");
  const prev = state.stageCompletion[sk] || { runs: 0 };
  const isFirstClear = !prev.lastCompleted;
  state.stageCompletion[sk] = {
    lastCompleted: Date.now(),
    runs: (prev.runs || 0) + 1
  };
  saveState();
  awardXp(isFirstClear ? 35 : 15);
  const ap = areaProgress(area);
  if (ap.completedStages === ap.totalStages) {
    setTimeout(() => awardXp(50), 500);
  }
  playFanfare();
  confetti(80);

  const total = builderState.items.length;
  const accuracy = total > 0 ? Math.round((builderState.rightFirstTry / total) * 100) : 0;

  root.appendChild(el("div", { class: "completion" }, [
    el("div", { class: "completion-emoji" }, accuracy >= 80 ? "🎉" : "💪"),
    el("h1", {}, "Bra jobbat!"),
    el("p", {}, `Du byggde alla ${total} meningar i området.`),
    el("p", { class: "muted" }, `${builderState.rightFirstTry} av ${total} rätt på första försöket (${accuracy}%).`),
    el("div", { class: "btn-row", style: "justify-content: center;" }, [
      el("button", {
        class: "btn",
        onclick: () => {
          builderState = null;
          navigate(`area/${area.id}`);
        }
      }, "Tillbaka till området")
    ])
  ]));
}

// ---------- Settings ----------
function renderSettings(root) {
  root.appendChild(el("h1", {}, "⚙️ Inställningar"));

  // Google Drive sync card
  root.appendChild(el("h2", { style: "margin-top: 8px" }, "☁️ Google Drive-synk"));
  root.appendChild(el("p", { class: "muted" }, "Synka din status automatiskt mellan datorer. Datan sparas dolt i din Google Drive — du ser den inte bland dina filer."));

  const clientIdInput = el("input", {
    type: "text",
    class: "settings-input",
    placeholder: "Klistra in ditt OAuth Client ID här",
    value: driveSync.clientId || "",
    spellcheck: "false",
    autocomplete: "off"
  });

  root.appendChild(el("div", { class: "settings-field" }, [
    el("label", { class: "settings-label" }, "Google OAuth Client ID"),
    clientIdInput
  ]));

  const saveClientId = () => {
    const val = clientIdInput.value.trim();
    if (!val) return;
    driveSync.clientId = val;
    saveDriveConfig();
    initDriveSync();
  };

  const statusPill = driveSync.connected
    ? el("span", { class: "pill good" }, "✅ Ansluten till Google Drive")
    : null;

  root.appendChild(el("div", { class: "btn-row" }, [
    statusPill,
    !driveSync.connected
      ? el("button", { class: "btn", onclick: () => { saveClientId(); signInDrive(); } }, "Logga in med Google →")
      : el("button", { class: "btn ghost", onclick: () => { signOutDrive(); render(); } }, "Logga ut"),
    driveSync.connected
      ? el("button", { class: "btn secondary", onclick: () => { driveSync.status = "syncing"; renderSyncStatus(); performInitialSync(); } }, "Synka nu")
      : null
  ]));

  // Drive file debug check
  if (driveSync.connected) {
    const debugOut = el("div", { class: "muted", style: "margin-top: 12px; font-size: 13px; white-space: pre-wrap; font-family: monospace;" });
    root.appendChild(el("div", { class: "btn-row", style: "margin-top: 8px;" }, [
      el("button", {
        class: "btn ghost",
        onclick: async () => {
          debugOut.textContent = "Kollar Drive...";
          try {
            const data = await driveGet(
              `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%3D'${DRIVE_FILE_NAME}'&fields=files(id%2CmodifiedTime%2Csize)`
            );
            const file = data.files?.[0];
            if (!file) {
              debugOut.textContent = "❌ Ingen fil hittad i Drive — data har aldrig laddats upp från någon enhet.";
              return;
            }
            const remote = await driveGet(
              `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`
            );
            const saved = new Date(file.modifiedTime).toLocaleString("sv-SE");
            debugOut.textContent = `✅ Fil hittad i Drive\nSenast sparad: ${saved}\nXP i Drive: ${remote.xp || 0}\nAntal tränade kort: ${Object.keys(remote.itemStats || {}).length}\nLokal XP: ${state.xp || 0}\nLokal lastSaved: ${state.lastSaved ? new Date(state.lastSaved).toLocaleString("sv-SE") : "aldrig"}`;
          } catch (e) {
            debugOut.textContent = `❌ Fel: ${e.message}\nKontrollera att https://acke.github.io är tillagt som tillåtet JavaScript-ursprung i Google Cloud Console.`;
          }
        }
      }, "🔍 Kontrollera Drive-fil")
    ]));
    root.appendChild(debugOut);
  }

  // Setup instructions
  root.appendChild(el("div", { class: "card", style: "margin-top: 24px" }, [
    el("h3", {}, "Hur skapar jag ett Client ID?"),
    el("p", { class: "muted" }, "Engångsinställning, tar ca 5 minuter."),
    el("ol", { class: "setup-steps" }, [
      el("li", {}, "Gå till console.cloud.google.com och logga in med ditt Google-konto."),
      el("li", {}, [document.createTextNode('Skapa ett nytt projekt, t.ex. "Spanska app".')]),
      el("li", {}, 'Sök efter "Drive API" i sökfältet och aktivera den.'),
      el("li", {}, 'Gå till "OAuth-medgivandeskärm" → välj "Extern" → fyll i appnamn → spara.'),
      el("li", {}, 'Gå till "Autentiseringsuppgifter" → "Skapa autentiseringsuppgifter" → "OAuth 2.0-klient-ID".'),
      el("li", {}, 'Välj "Webbapp". Under "Tillåtna JavaScript-ursprung" — lägg till adressen där appen är hostad (t.ex. https://dittnamn.github.io).'),
      el("li", {}, "Kopiera det genererade Client ID (slutar med .apps.googleusercontent.com) och klistra in det ovan.")
    ])
  ]));

  // Export / Import
  root.appendChild(el("h2", { style: "margin-top: 32px" }, "📦 Flytta status till ny enhet"));
  root.appendChild(el("p", { class: "muted" }, "Använd detta om du byter dator eller går från lokal fil till GitHub Pages. Exportera på den gamla enheten, importera på den nya."));

  const importInput = el("input", { type: "file", accept: ".json", style: "display:none" });
  importInput.addEventListener("change", () => {
    const file = importInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        if (!imported.itemStats) throw new Error("Ogiltig fil");
        Object.assign(state, imported);
        state.lastSaved = Date.now();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        scheduleSyncToDrive();
        alert("✅ Status importerad! Dina framsteg är nu inladdade.");
        render();
      } catch (err) {
        alert("❌ Kunde inte läsa filen. Kontrollera att det är en exporterad statusfil.");
      }
    };
    reader.readAsText(file);
  });

  root.appendChild(el("div", { class: "btn-row" }, [
    el("button", {
      class: "btn secondary",
      onclick: () => {
        const data = JSON.stringify(state, null, 2);
        const blob = new Blob([data], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `spanska-status-${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
      }
    }, "⬇️ Exportera status"),
    el("button", {
      class: "btn secondary",
      onclick: () => importInput.click()
    }, "⬆️ Importera status"),
    importInput
  ]));

  // Sound setting
  root.appendChild(el("h2", { style: "margin-top: 32px" }, "🔊 Ljud"));
  const soundToggle = el("input", { type: "checkbox" });
  soundToggle.checked = state.soundEnabled !== false;
  soundToggle.addEventListener("change", () => {
    state.soundEnabled = soundToggle.checked;
    saveState();
  });
  root.appendChild(el("div", { class: "toggle-row" }, [
    el("label", {}, "Ljud på"),
    soundToggle
  ]));
}

// ---------- Init ----------
saveState();
initDriveSync();
render();
