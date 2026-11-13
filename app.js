"use strict";

/* ============================================================
   Lời Ru — record lullabies, play them back at bedtime.
   Everything is stored on the device (IndexedDB). Sharing
   between phones is done with an exported .loiru.json file.
   ============================================================ */

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (sec) => {
  if (!isFinite(sec) || sec < 0) sec = 0;
  sec = Math.round(sec);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
};
const fmt2 = (sec) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const KINDS = {
  ru: { icon: "🌙", label: "Hát ru" },
  story: { icon: "📖", label: "Kể chuyện" },
  wish: { icon: "💛", label: "Lời chúc" },
};

/* ---------------- Storage (IndexedDB) ---------------- */
const DB = (() => {
  let dbp;
  const open = () =>
    (dbp ??= new Promise((res, rej) => {
      const r = indexedDB.open("loi-ru", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("songs", { keyPath: "id" });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction("songs", mode);
      const out = fn(t.objectStore("songs"));
      t.oncomplete = () => res(out?.result ?? out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  };
  return {
    all: () => tx("readonly", (s) => s.getAll()),
    put: (song) => tx("readwrite", (s) => s.put(song)),
    del: (id) => tx("readwrite", (s) => s.delete(id)),
  };
})();

/* ---------------- Settings ---------------- */
const settings = {
  get child() { return localStorage.getItem("child") || ""; },
  set child(v) { localStorage.setItem("child", v); },
  get singer() { return localStorage.getItem("singer") || "Bố"; },
  set singer(v) { localStorage.setItem("singer", v || "Bố"); },
  get repeat() { return localStorage.getItem("repeat") || "all"; },
  set repeat(v) { localStorage.setItem("repeat", v); },
};

/* ---------------- State ---------------- */
let songs = [];
let filter = "all";

async function loadSongs() {
  songs = (await DB.all()).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt - b.createdAt);
  renderLibrary();
}
const visibleSongs = () => (filter === "all" ? songs : songs.filter((s) => s.kind === filter));

/* ---------------- UI helpers ---------------- */
let toastTimer;
function toast(msg, ms = 2400) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms);
}

function openSheet(html, onClick) {
  const sheet = $("#sheet");
  sheet.innerHTML = html;
  sheet.hidden = false;
  $("#sheet-back").hidden = false;
  sheet.onclick = (e) => onClick?.(e);
}
function closeSheet() {
  $("#sheet").hidden = true;
  $("#sheet-back").hidden = true;
  $("#sheet").innerHTML = "";
}
$("#sheet-back").onclick = closeSheet;

function showTab(name) {
  $$(".tab").forEach((t) => t.classList.toggle("active", t.id === `tab-${name}`));
  $$(".nav button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  if (name === "settings") updateStorageInfo();
  window.scrollTo(0, 0);
}
$$(".nav button").forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));

/* ---------------- Library ---------------- */
function renderHeader() {
  const child = settings.child;
  $("#hero-title").textContent = `Lời ru của ${settings.singer}`;
  $("#hello").textContent = child ? `Ngủ ngon nhé, ${child} ơi` : "Chúc con ngủ ngon";
}

function renderLibrary() {
  renderHeader();
  const list = visibleSongs();
  const playingId = player.current?.id;
  $("#songs").innerHTML = list
    .map((s) => {
      const k = KINDS[s.kind] || KINDS.ru;
      const d = new Date(s.createdAt).toLocaleDateString("vi-VN");
      return `<li class="song ${s.id === playingId ? "playing" : ""}" data-id="${s.id}">
        <button class="song-main" data-act="play">
          <span class="song-icon">${k.icon}</span>
          <span class="song-text"><strong>${esc(s.title)}</strong><small>${fmt(s.duration)} · ${d}${s.lyrics ? " · có lời" : ""}</small></span>
        </button>
        <button class="song-more" data-act="more" aria-label="Tuỳ chọn">⋯</button>
      </li>`;
    })
    .join("");
  $("#empty").hidden = songs.length > 0;
  $("#play-all").hidden = songs.length === 0;
  $("#filters").hidden = songs.length === 0;
  const total = list.reduce((a, s) => a + (s.duration || 0), 0);
  $("#play-all-sub").textContent = list.length ? `${list.length} bài · ${Math.max(1, Math.round(total / 60))} phút · lặp lại đến khi con ngủ` : "Chưa có bài trong mục này";
}

$("#filters").onclick = (e) => {
  const b = e.target.closest(".chip");
  if (!b) return;
  filter = b.dataset.kind;
  $$("#filters .chip").forEach((c) => c.classList.toggle("active", c === b));
  renderLibrary();
};

$("#songs").onclick = (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const id = btn.closest(".song").dataset.id;
  if (btn.dataset.act === "play") {
    const list = visibleSongs();
    player.start(list, list.findIndex((s) => s.id === id), true);
  } else songMenu(id);
};

$("#play-all").onclick = () => {
  const list = visibleSongs();
  if (list.length) player.start(list, 0, true);
};

function songMenu(id) {
  const s = songs.find((x) => x.id === id);
  if (!s) return;
  openSheet(
    `<h3>${esc(s.title)}</h3>
     <div class="sheet-list">
       <button data-a="edit">✏️ Sửa tên, lời bài</button>
       <button data-a="share">📤 Gửi riêng bài này</button>
       <button data-a="up">⬆️ Đưa lên trên</button>
       <button data-a="down">⬇️ Đưa xuống dưới</button>
       <button data-a="del" class="danger">🗑️ Xoá bài</button>
     </div>`,
    async (e) => {
      const a = e.target.closest("[data-a]")?.dataset.a;
      if (!a) return;
      if (a === "edit") return editSong(s);
      closeSheet();
      if (a === "share") shareSongs([s], fileBase(s.title));
      if (a === "up" || a === "down") moveSong(s, a === "up" ? -1 : 1);
      if (a === "del" && confirm(`Xoá "${s.title}"? Không thể khôi phục.`)) {
        if (player.current?.id === s.id) player.stop();
        await DB.del(s.id);
        await loadSongs();
        toast("Đã xoá");
      }
    },
  );
}

function editSong(s) {
  openSheet(
    `<h3>Sửa bài</h3>
     <form id="edit-form">
       <label>Tên bài <input name="title" maxlength="80" required value="${esc(s.title)}"></label>
       <div class="kind-pick">${Object.entries(KINDS)
         .map(([k, v]) => `<button type="button" class="chip ${s.kind === k ? "active" : ""}" data-kind="${k}">${v.icon} ${v.label}</button>`)
         .join("")}</div>
       <label>Lời bài hát <textarea name="lyrics" rows="8">${esc(s.lyrics)}</textarea></label>
       <div class="row"><button type="button" class="ghost" data-a="cancel">Huỷ</button><button class="primary">Lưu</button></div>
     </form>`,
    (e) => {
      const chip = e.target.closest(".chip");
      if (chip) $$("#edit-form .chip").forEach((c) => c.classList.toggle("active", c === chip));
      if (e.target.closest("[data-a=cancel]")) closeSheet();
    },
  );
  $("#edit-form").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    s.title = f.title.value.trim() || s.title;
    s.lyrics = f.lyrics.value.trim();
    s.kind = $("#edit-form .chip.active")?.dataset.kind || s.kind;
    await DB.put(s);
    closeSheet();
    await loadSongs();
    if (player.current?.id === s.id) player.renderNow();
    toast("Đã lưu");
  };
}

async function moveSong(s, dir) {
  const i = songs.indexOf(s);
  const j = i + dir;
  if (j < 0 || j >= songs.length) return;
  [songs[i], songs[j]] = [songs[j], songs[i]];
  await Promise.all(songs.map((x, k) => ((x.order = k), DB.put(x))));
  renderLibrary();
}

/* ---------------- Recorder ---------------- */
const rec = {
  state: "idle", // idle | recording | paused | review
  media: null,
  stream: null,
  chunks: [],
  mime: "",
  elapsed: 0,
  tickStart: 0,
  timer: 0,
  audioCtx: null,
  raf: 0,
  blob: null,
  kind: "ru",
  wake: null,
};

function pickMime() {
  if (!window.MediaRecorder) return null;
  const options = ["audio/mp4;codecs=mp4a.40.2", "audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"];
  return options.find((m) => MediaRecorder.isTypeSupported?.(m)) ?? "";
}

function setRecUI() {
  const st = $("#rec-stage");
  st.classList.toggle("recording", rec.state === "recording" || rec.state === "paused");
  st.classList.toggle("paused", rec.state === "paused");
  $("#rec-actions").hidden = !(rec.state === "recording" || rec.state === "paused");
  $("#rec-pause").textContent = rec.state === "paused" ? "▶ Hát tiếp" : "⏸ Tạm dừng";
  $("#rec-status").textContent =
    { idle: "Chạm vào nút để bắt đầu", recording: "Đang thu… chạm ■ khi hát xong", paused: "Đã tạm dừng", review: "" }[rec.state];
  $("#rec-hint").style.visibility = rec.state === "idle" ? "visible" : "hidden";
  $("#rec-btn").setAttribute("aria-label", rec.state === "idle" ? "Bắt đầu thu" : "Dừng thu");
  st.hidden = rec.state === "review";
  $("#rec-review").hidden = rec.state !== "review";
}

const recSeconds = () => rec.elapsed + (rec.state === "recording" ? (performance.now() - rec.tickStart) / 1000 : 0);

async function startRecording() {
  const mime = pickMime();
  if (mime === null || !navigator.mediaDevices?.getUserMedia) {
    alert("Trình duyệt này không hỗ trợ thu âm. Hãy mở bằng Chrome (Android) hoặc Safari (iPhone).");
    return;
  }
  try {
    rec.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
  } catch (err) {
    alert("Chưa được phép dùng micro. Hãy cho phép micro trong cài đặt trình duyệt rồi thử lại.");
    return;
  }
  player.pause();
  rec.chunks = [];
  rec.media = new MediaRecorder(rec.stream, mime ? { mimeType: mime, audioBitsPerSecond: 96000 } : undefined);
  rec.mime = rec.media.mimeType || mime || "audio/webm";
  rec.media.ondataavailable = (e) => e.data.size && rec.chunks.push(e.data);
  rec.media.onstop = onRecordingStopped;
  rec.media.start(1000);
  rec.elapsed = 0;
  rec.tickStart = performance.now();
  rec.state = "recording";
  rec.timer = setInterval(() => ($("#rec-time").textContent = fmt2(recSeconds())), 250);
  startMeter();
  try { rec.wake = await navigator.wakeLock?.request("screen"); } catch {}
  setRecUI();
}

function startMeter() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    rec.audioCtx = new Ctx();
    const src = rec.audioCtx.createMediaStreamSource(rec.stream);
    const an = rec.audioCtx.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    const buf = new Uint8Array(an.fftSize);
    const glow = $("#rec-glow");
    const loop = () => {
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += (v - 128) ** 2;
      const lvl = Math.min(1, Math.sqrt(sum / buf.length) / 40);
      glow.style.transform = `scale(${rec.state === "recording" ? 0.8 + lvl * 0.6 : 0.8})`;
      rec.raf = requestAnimationFrame(loop);
    };
    loop();
  } catch {}
}

function cleanupStream() {
  clearInterval(rec.timer);
  cancelAnimationFrame(rec.raf);
  rec.audioCtx?.close().catch(() => {});
  rec.audioCtx = null;
  rec.stream?.getTracks().forEach((t) => t.stop());
  rec.stream = null;
  rec.wake?.release().catch(() => {});
  rec.wake = null;
}

function stopRecording() {
  rec.elapsed = recSeconds();
  rec.state = "stopping";
  rec.media.stop();
}

function cancelRecording() {
  if (!confirm("Huỷ bản đang thu?")) return;
  rec.media.onstop = null;
  rec.media.stop();
  cleanupStream();
  resetRecorder();
}

function onRecordingStopped() {
  cleanupStream();
  if (rec.elapsed < 1 || !rec.chunks.length) {
    toast("Bản thu quá ngắn");
    return resetRecorder();
  }
  rec.blob = new Blob(rec.chunks, { type: rec.mime.split(";")[0] });
  const a = $("#review-audio");
  if (a.src) URL.revokeObjectURL(a.src);
  a.src = URL.createObjectURL(rec.blob);
  const now = new Date();
  $("#review-title").value = `${KINDS[rec.kind].label} ${now.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })} ${now.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`;
  $("#review-lyrics").value = "";
  rec.state = "review";
  setRecUI();
}

function resetRecorder() {
  rec.state = "idle";
  rec.blob = null;
  rec.chunks = [];
  const a = $("#review-audio");
  a.pause();
  if (a.src) URL.revokeObjectURL(a.src);
  a.removeAttribute("src");
  $("#rec-time").textContent = "00:00";
  setRecUI();
}

$("#rec-btn").onclick = () => {
  if (rec.state === "idle") startRecording();
  else if (rec.state === "recording" || rec.state === "paused") stopRecording();
};
$("#rec-pause").onclick = () => {
  if (rec.state === "recording") {
    rec.elapsed = recSeconds();
    rec.media.pause();
    rec.state = "paused";
  } else if (rec.state === "paused") {
    rec.media.resume();
    rec.tickStart = performance.now();
    rec.state = "recording";
  }
  setRecUI();
};
$("#rec-cancel").onclick = cancelRecording;
$("#review-redo").onclick = () => {
  if (confirm("Bỏ bản này và thu lại?")) resetRecorder();
};
$("#review-kind").onclick = (e) => {
  const c = e.target.closest(".chip");
  if (!c) return;
  $$("#review-kind .chip").forEach((x) => x.classList.toggle("active", x === c));
  const old = KINDS[rec.kind].label;
  rec.kind = c.dataset.kind;
  const t = $("#review-title");
  if (t.value.startsWith(old)) t.value = KINDS[rec.kind].label + t.value.slice(old.length);
};
$("#rec-review").onsubmit = async (e) => {
  e.preventDefault();
  const song = {
    id: uid(),
    title: $("#review-title").value.trim() || "Bài hát ru",
    lyrics: $("#review-lyrics").value.trim(),
    kind: rec.kind,
    createdAt: Date.now(),
    duration: rec.elapsed,
    mime: rec.blob.type,
    blob: rec.blob,
    singer: settings.singer,
    order: songs.length ? Math.max(...songs.map((s) => s.order ?? 0)) + 1 : 0,
  };
  try {
    await DB.put(song);
  } catch (err) {
    alert("Không lưu được (có thể điện thoại hết dung lượng).");
    return;
  }
  requestPersist();
  resetRecorder();
  await loadSongs();
  showTab("library");
  toast("Đã lưu bài hát 💛");
};

window.addEventListener("beforeunload", (e) => {
  if (rec.state === "recording" || rec.state === "paused" || rec.state === "review") {
    e.preventDefault();
    e.returnValue = "";
  }
});

/* ---------------- Player ---------------- */
const TIMER_OPTS = [
  { v: 0, label: "Không hẹn giờ" },
  { v: 15, label: "15 phút" },
  { v: 30, label: "30 phút" },
  { v: 45, label: "45 phút" },
  { v: 60, label: "1 tiếng" },
  { v: -1, label: "Hết bài đang phát" },
];
const REPEAT = {
  all: { icon: "🔁", label: "Lặp tất cả" },
  one: { icon: "🔂", label: "Lặp 1 bài" },
  off: { icon: "➡️", label: "Phát 1 lượt" },
};
const FADE_SEC = 45;

const player = {
  audio: new Audio(),
  queue: [],
  index: -1,
  url: null,
  timerEnd: 0, // ms timestamp; 0 = off
  timerEndOfSong: false,
  showLyrics: false,
  get current() { return this.queue[this.index]; },

  start(list, index, open) {
    this.queue = list.slice();
    this.load(Math.max(0, index), true);
    if (open) this.open();
  },

  load(i, autoplay) {
    const s = this.queue[i];
    if (!s) return;
    this.index = i;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = URL.createObjectURL(s.blob);
    this.audio.src = this.url;
    this.audio.volume = 1;
    if (autoplay) this.play();
    this.renderNow();
    this.mediaSession();
    renderLibrary();
  },

  play() {
    if (!this.current) {
      const list = visibleSongs();
      if (list.length) this.start(list, 0);
      return;
    }
    this.audio.play().catch(() => {});
  },
  pause() { this.audio.pause(); },
  toggle() { this.audio.paused ? this.play() : this.pause(); },

  stop() {
    this.audio.pause();
    this.audio.removeAttribute("src");
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    this.queue = [];
    this.index = -1;
    this.setTimer(0);
    this.close();
    $("#mini").hidden = true;
    renderLibrary();
  },

  next(auto) {
    if (!this.queue.length) return;
    const mode = settings.repeat;
    if (auto && mode === "one") return this.load(this.index, true);
    let i = this.index + 1;
    if (i >= this.queue.length) {
      if (auto && mode === "off") {
        this.audio.currentTime = 0;
        this.renderPlayState();
        return;
      }
      i = 0;
    }
    this.load(i, true);
  },
  prev() {
    if (this.audio.currentTime > 3) return (this.audio.currentTime = 0);
    this.load((this.index - 1 + this.queue.length) % this.queue.length, true);
  },

  duration() {
    const d = this.audio.duration;
    return isFinite(d) && d > 0 ? d : this.current?.duration || 0;
  },

  /* sleep timer */
  setTimer(min) {
    this.timerEndOfSong = min === -1;
    this.timerEnd = min > 0 ? Date.now() + min * 60000 : 0;
    this.audio.volume = 1;
    this.renderTimer();
  },
  checkTimer() {
    if (!this.timerEnd) return;
    const left = (this.timerEnd - Date.now()) / 1000;
    if (left <= 0) {
      this.pause();
      this.audio.volume = 1;
      this.timerEnd = 0;
      this.renderTimer();
      return;
    }
    // gentle fade over the last seconds (ignored on iOS, which locks volume)
    this.audio.volume = left < FADE_SEC ? Math.max(0.05, left / FADE_SEC) : 1;
    this.renderTimer();
  },

  /* rendering */
  open() {
    $("#player").hidden = false;
    this.renderNow();
  },
  close() {
    $("#player").hidden = true;
    $("#dim").hidden = true;
  },
  renderNow() {
    const s = this.current;
    if (!s) return;
    const k = KINDS[s.kind] || KINDS.ru;
    $("#p-title").textContent = s.title;
    $("#p-sub").textContent = `${k.icon} ${k.label} · ${s.singer || settings.singer} hát · bài ${this.index + 1}/${this.queue.length}`;
    $("#mini-title").textContent = s.title;
    $("#mini").hidden = false;
    const lyr = $("#p-lyrics");
    lyr.textContent = s.lyrics || "Bài này chưa có lời.\nBấm ⋯ ở danh sách → Sửa để thêm lời.";
    lyr.hidden = !this.showLyrics;
    $("#player").classList.toggle("with-lyrics", this.showLyrics);
    $("#p-lyrics-btn").classList.toggle("on", this.showLyrics);
    const r = REPEAT[settings.repeat];
    $("#p-repeat").innerHTML = `<span>${r.icon}</span><small>${r.label}</small>`;
    this.renderPlayState();
    this.renderTimer();
    this.renderTime();
  },
  renderPlayState() {
    const playing = !this.audio.paused;
    $("#p-play").textContent = playing ? "❚❚" : "▶";
    $("#mini-play").textContent = playing ? "❚❚" : "▶";
    $("#player").classList.toggle("is-playing", playing);
    $$(".song").forEach((el) => el.classList.toggle("playing", el.dataset.id === this.current?.id && playing));
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = playing ? "playing" : "paused";
  },
  renderTime() {
    const d = this.duration();
    const c = this.audio.currentTime || 0;
    $("#p-cur").textContent = fmt(c);
    $("#p-dur").textContent = fmt(d);
    if (!this.seeking) $("#p-seek").value = d ? Math.round((c / d) * 1000) : 0;
  },
  renderTimer() {
    let label = "Hẹn giờ tắt";
    if (this.timerEndOfSong) label = "Hết bài này";
    else if (this.timerEnd) {
      const left = Math.max(0, (this.timerEnd - Date.now()) / 1000);
      label = `Tắt sau ${fmt(left)}`;
    }
    const on = this.timerEndOfSong || !!this.timerEnd;
    $("#p-timer").innerHTML = `<span>⏲️</span><small>${label}</small>`;
    $("#p-timer").classList.toggle("on", on);
    $("#dim-timer").textContent = on ? label : "";
    $("#mini-sub").textContent = on ? `${settings.singer} hát · ${label.toLowerCase()}` : `${settings.singer} hát`;
  },

  mediaSession() {
    if (!("mediaSession" in navigator) || !this.current) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: this.current.title,
      artist: `${this.current.singer || settings.singer} hát cho con`,
      album: "Lời ru",
      artwork: [
        { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    });
    const set = (a, fn) => { try { navigator.mediaSession.setActionHandler(a, fn); } catch {} };
    set("play", () => this.play());
    set("pause", () => this.pause());
    set("nexttrack", () => this.next());
    set("previoustrack", () => this.prev());
  },
};

const A = player.audio;
A.preload = "auto";
A.addEventListener("play", () => player.renderPlayState());
A.addEventListener("pause", () => player.renderPlayState());
A.addEventListener("loadedmetadata", () => player.renderTime());
A.addEventListener("timeupdate", () => {
  player.renderTime();
  player.checkTimer();
});
A.addEventListener("ended", () => {
  if (player.timerEndOfSong) {
    player.setTimer(0);
    A.currentTime = 0;
    player.renderPlayState();
    return;
  }
  player.next(true);
});
A.addEventListener("error", () => {
  if (player.current) toast("Không phát được bài này trên máy này");
});
setInterval(() => player.checkTimer(), 1000);

$("#p-play").onclick = () => player.toggle();
$("#mini-play").onclick = () => player.toggle();
$("#mini-open").onclick = () => player.open();
$("#p-next").onclick = () => player.next();
$("#p-prev").onclick = () => player.prev();
$("#player-close").onclick = () => player.close();
$("#p-seek").addEventListener("input", (e) => {
  player.seeking = true;
  $("#p-cur").textContent = fmt((e.target.value / 1000) * player.duration());
});
$("#p-seek").addEventListener("change", (e) => {
  player.seeking = false;
  const d = player.duration();
  if (d) A.currentTime = (e.target.value / 1000) * d;
});
$("#p-repeat").onclick = () => {
  const order = ["all", "one", "off"];
  settings.repeat = order[(order.indexOf(settings.repeat) + 1) % order.length];
  player.renderNow();
  toast(REPEAT[settings.repeat].label);
};
$("#p-lyrics-btn").onclick = () => {
  player.showLyrics = !player.showLyrics;
  player.renderNow();
};
$("#p-timer").onclick = () => {
  const cur = player.timerEndOfSong ? -1 : player.timerEnd ? null : 0;
  openSheet(
    `<h3>⏲️ Hẹn giờ tắt nhạc</h3>
     <p class="muted" style="margin:-6px 0 8px">Nhạc nhỏ dần rồi tắt khi hết giờ.</p>
     <div class="sheet-list">${TIMER_OPTS.map((o) => `<button data-min="${o.v}" class="${o.v === cur ? "sel" : ""}">${o.label}</button>`).join("")}</div>`,
    (e) => {
      const b = e.target.closest("[data-min]");
      if (!b) return;
      const min = Number(b.dataset.min);
      player.setTimer(min);
      localStorage.setItem("timer", String(min));
      closeSheet();
      if (min) toast(min === -1 ? "Sẽ tắt khi hết bài này" : `Sẽ tắt sau ${min} phút`);
    },
  );
};
$("#player-dim").onclick = () => ($("#dim").hidden = false);
$("#dim").onclick = () => ($("#dim").hidden = true);

// Remember the last sleep-timer choice: apply it when bedtime playback starts.
const _start = player.start.bind(player);
player.start = (list, index, open) => {
  _start(list, index, open);
  const last = Number(localStorage.getItem("timer") || 0);
  if (last && !player.timerEnd && !player.timerEndOfSong) player.setTimer(last);
};

/* ---------------- Export / import ---------------- */
const blobToB64 = (blob) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
const b64ToBlob = (b64, type) => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
};
const fileBase = (title) =>
  "loi-ru-" +
  (title || "bai-hat")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 40);

async function shareSongs(list, base) {
  if (!list.length) return toast("Chưa có bài nào để gửi");
  toast("Đang đóng gói…", 10000);
  const payload = {
    app: "loi-ru",
    v: 1,
    exportedAt: Date.now(),
    songs: await Promise.all(
      list.map(async ({ blob, ...meta }) => ({ ...meta, data: await blobToB64(blob) })),
    ),
  };
  const file = new File([JSON.stringify(payload)], `${base}.loiru.json`, { type: "application/json" });
  $("#toast").hidden = true;
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Lời ru", text: `${list.length} bài hát ru cho con 🌙` });
      return;
    } catch (err) {
      if (err.name === "AbortError") return;
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast("Đã tải file về máy. Gửi file này qua Zalo cho vợ nhé.", 4000);
}

$("#export-all").onclick = () => shareSongs(songs, `loi-ru-${new Date().toISOString().slice(0, 10)}`);
$("#import-btn").onclick = () => $("#import-file").click();
$("#import-file").onchange = async (e) => {
  const files = [...e.target.files];
  e.target.value = "";
  if (!files.length) return;
  toast("Đang nhận…", 10000);
  let added = 0;
  let skipped = 0;
  const have = new Set(songs.map((s) => s.id));
  let order = songs.length ? Math.max(...songs.map((s) => s.order ?? 0)) + 1 : 0;
  try {
    for (const f of files) {
      if (f.name.endsWith(".json") || f.type === "application/json") {
        const data = JSON.parse(await f.text());
        if (data.app !== "loi-ru" || !Array.isArray(data.songs)) throw new Error("bad file");
        for (const { data: b64, ...meta } of data.songs) {
          if (have.has(meta.id)) { skipped++; continue; }
          await DB.put({ ...meta, blob: b64ToBlob(b64, meta.mime), order: order++ });
          have.add(meta.id);
          added++;
        }
      } else if (f.type.startsWith("audio/") || /\.(m4a|mp3|aac|wav|webm|ogg|opus)$/i.test(f.name)) {
        await DB.put({
          id: uid(),
          title: f.name.replace(/\.[^.]+$/, "").replace(/^loi-ru-/, "").replace(/-/g, " "),
          lyrics: "",
          kind: "ru",
          createdAt: Date.now(),
          duration: await probeDuration(f),
          mime: f.type || "audio/mpeg",
          blob: f,
          singer: settings.singer,
          order: order++,
        });
        added++;
      }
    }
  } catch (err) {
    console.error(err);
    alert("File này không đúng định dạng của app Lời Ru.");
  }
  requestPersist();
  await loadSongs();
  toast(added ? `Đã thêm ${added} bài${skipped ? `, bỏ qua ${skipped} bài đã có` : ""} 💛` : skipped ? "Các bài này đã có sẵn" : "Không có bài nào được thêm", 3500);
  if (added) showTab("library");
};

function probeDuration(blob) {
  return new Promise((res) => {
    const a = new Audio();
    const url = URL.createObjectURL(blob);
    const done = (d) => { URL.revokeObjectURL(url); res(isFinite(d) ? d : 0); };
    a.preload = "metadata";
    a.onloadedmetadata = () => done(a.duration);
    a.onerror = () => done(0);
    setTimeout(() => done(0), 5000);
    a.src = url;
  });
}

/* ---------------- Settings tab ---------------- */
$("#set-child").value = settings.child;
$("#set-singer").value = settings.singer === "Bố" && !localStorage.getItem("singer") ? "" : settings.singer;
$("#set-child").oninput = (e) => { settings.child = e.target.value.trim(); renderHeader(); };
$("#set-singer").oninput = (e) => { settings.singer = e.target.value.trim(); renderHeader(); };

async function requestPersist() {
  try { if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch {}
}

async function updateStorageInfo() {
  const el = $("#storage-info");
  const bytes = songs.reduce((a, s) => a + (s.blob?.size || 0), 0);
  const mins = Math.round(songs.reduce((a, s) => a + (s.duration || 0), 0) / 60);
  let text = `${songs.length} bài · ${mins} phút · ${(bytes / 1048576).toFixed(1)} MB.`;
  try {
    const persisted = await navigator.storage?.persisted?.();
    text += persisted
      ? " Bản thu được giữ an toàn trên máy."
      : " Mẹo: cài app ra màn hình chính để trình duyệt không tự xoá bản thu. Nên “Gửi tất cả” để có bản sao lưu.";
  } catch {}
  el.textContent = text;
}

/* ---------------- Boot ---------------- */
setRecUI();
loadSongs().catch((err) => {
  console.error(err);
  alert("Không mở được kho bài hát trên máy này.");
});
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
