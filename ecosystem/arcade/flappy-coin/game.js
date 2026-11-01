(() => {
  const cv = document.getElementById('c');
  const ctx = cv.getContext('2d');
  const startEl = document.getElementById('start');
  const overEl = document.getElementById('over');
  const nameIn = document.getElementById('nameIn');
  const saveBtn = document.getElementById('saveBtn');
  const saveNote = document.getElementById('saveNote');
  const saveBox = document.getElementById('saveBox');
  let W = 0, H = 0, dpr = 1;

  function css(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  let C = {};
  function readColors() {
    C = { bg: css('--bg'), grid: css('--grid'), line: css('--line'), text: css('--text'), muted: css('--muted'),
          long: css('--long'), short: css('--short'), coin: css('--coin'), edge: css('--coinEdge'),
          bolt: css('--bolt'), wing: css('--wing'), wingEdge: css('--wingEdge') };
  }
  function resize() {
    const r = cv.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  let best = parseInt(ls.get('flappyCoinBest') || '0', 10) || 0;
  nameIn.value = ls.get('flappyCoinName') || '';

  const quips = [
    'The market makers thank you for your liquidity.',
    'You were right about the direction. Wrong about the wick.',
    'A stop loss would have helped. Probably.',
    'Funding ate your margin while you were celebrating.',
    'That wick was personal.',
    'Wings don’t help when you’re at 40x.',
    'Down only, apparently.',
    'Your liquidation price was closer than you thought.',
    'Someone on the other side of that trade is very happy.',
    'Have you tried just holding spot?'
  ];

  // ---------- Leaderboard ----------
  // In the Strike ecosystem world (strike.benryan.com.au/ecosystem) this runs in a frame; scores go to the world's arcade
  // board on the Copilot Watch worker, and the world is told when a run ends so its cabinet can show the top score.
  // (The original used Claude's shared db, which only exists when the file is opened inside Claude.)
  const API = 'https://copilot-watch.benryan.workers.dev', GAME = 'flappy-coin';
  const qs = new URLSearchParams(location.search);
  if (qs.get('theme') === 'dark' || qs.get('theme') === 'light') document.documentElement.setAttribute('data-theme', qs.get('theme'));
  const tell = msg => { try { if (window.parent !== window) window.parent.postMessage(Object.assign({ game: GAME }, msg), location.origin); } catch (e) {} };
  let boardRows = [], boardState = 'loading', savedThisRun = false, runMs = 0;
  // The name used on the world's race leaderboard wins when there is one (the sheet says scores post under it)
  const clip = s => [...s].slice(0, 20).join('');
  try { const n = JSON.parse(localStorage.getItem('eco-race-name') || 'null'); if (typeof n === 'string' && n) nameIn.value = clip(n); } catch (e) {}
  const myKey = () => nameIn.value.trim().replace(/\s+/g, ' ').toLowerCase();
  function renderBoard() {
    for (const id of ['boardListStart', 'boardListOver']) {
      const ol = document.getElementById(id); ol.textContent = '';
      const note = text => { const li = document.createElement('li'); const s = document.createElement('span'); s.className = 'nm muted'; s.textContent = text; li.appendChild(s); ol.appendChild(li); };
      if (boardState === 'loading') { note('Loading leaderboard…'); continue; }
      if (boardState === 'offline') { note('Leaderboard can’t be reached right now.'); continue; }
      if (!boardRows.length) { note('No scores yet. Be the first.'); continue; }
      boardRows.forEach((r, i) => {
        const li = document.createElement('li'); if (r.name.toLowerCase() === myKey()) li.className = 'me';
        const a = document.createElement('span'); a.className = 'rk'; a.textContent = (i + 1) + '.';
        const b = document.createElement('span'); b.className = 'nm'; b.textContent = r.name;
        const c = document.createElement('span'); c.className = 'sc'; c.textContent = r.score + (r.won ? ' · cleared' : ' · L' + r.level);
        li.append(a, b, c); ol.appendChild(li);
      });
    }
  }
  renderBoard();
  async function loadBoard() {
    try {
      const r = await fetch(API + '/arcade/top?game=' + GAME, { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      boardRows = (await r.json()).top || []; boardState = 'ok';
    } catch (e) { boardState = 'offline'; }
    renderBoard();
  }
  loadBoard();

  let lastRun = { score: 0, lev: 2, level: 1, won: false };
  function prepareSave() {
    savedThisRun = false; saveNote.textContent = ''; saveBtn.disabled = false; saveBtn.textContent = 'Save score';
    nameIn.disabled = false;
    saveBox.style.display = lastRun.score > 0 ? '' : 'none';
  }
  const SAVE_ERRORS = { rate: 'Too many posts. Try again in a moment.', bad_name: 'That name won’t do. Try another.', rude_name: 'That name won’t do. Try another.',
    too_fast: 'That run doesn’t add up, so it wasn’t saved.', level_too_fast: 'That run doesn’t add up, so it wasn’t saved.', level_score: 'That run doesn’t add up, so it wasn’t saved.',
    bad_ms: 'That run doesn’t add up, so it wasn’t saved.', bad_score: 'That run doesn’t add up, so it wasn’t saved.', bad_level: 'That run doesn’t add up, so it wasn’t saved.', bad_won: 'That run doesn’t add up, so it wasn’t saved.' };
  async function saveScore() {
    const name = clip(nameIn.value.trim().replace(/\s+/g, ' '));
    if (!name) { saveNote.textContent = 'Enter a name first.'; nameIn.focus(); return; }
    ls.set('flappyCoinName', name);
    if (savedThisRun) return;
    saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
    try {
      const r = await fetch(API + '/arcade/score', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ game: GAME, name, score: lastRun.score, level: lastRun.level, won: !!lastRun.won, ms: runMs }) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(b.error || String(r.status)), { code: b.error });
      savedThisRun = true; saveBtn.textContent = 'Saved';
      boardRows = b.top || boardRows; boardState = 'ok'; renderBoard();
      saveNote.textContent = b.best ? (b.rank <= 10 ? 'You’re #' + b.rank + ' on the board.' : 'Saved. #' + b.rank + ' overall.') : 'Your best on the board is higher. Saved nothing new.';
      tell({ t: 'arcade.board', top: boardRows });
    } catch (e) {
      saveBtn.disabled = false; saveBtn.textContent = 'Save score';
      saveNote.textContent = SAVE_ERRORS[e && e.code] || 'Couldn’t save. Try again.';
    }
  }
  saveBtn.addEventListener('click', e => { e.stopPropagation(); saveScore(); });
  nameIn.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') saveScore(); if (e.key === 'Escape') tell({ t: 'arcade.close' }); });

  document.getElementById('shareBtn').addEventListener('click', async e => {
    e.stopPropagation();
    const text = lastRun.won ? 'I cleared all 10 levels of Flappy Coin at 40x. Beat that.' : 'I reached level ' + lastRun.level + ' of Flappy Coin (' + lastRun.score + ' points at ' + lastRun.lev + 'x) before getting liquidated. Beat that.';
    const btn = e.currentTarget;
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text); btn.textContent = 'Copied';
    } catch (err) { if (!(err && err.name === 'AbortError')) btn.textContent = 'Copy failed'; }
    setTimeout(() => btn.textContent = 'Share score', 1600);
  });
  document.getElementById('againBtn').addEventListener('click', e => { e.stopPropagation(); begin(); });

  // ---------- Game ----------
  let LEVELS = [
    { lev: 2,  hurdle: null,         title: 'Spot warmup',  tip: 'Just candles. Enjoy it while it lasts.' },
    { lev: 3,  hurdle: 'bolt',       title: 'Bolt',         tip: 'Bolt ships home in on you. Fast.' },
    { lev: 5,  hurdle: 'strikeabox', title: 'Strikeabox',   tip: 'Boxes that won’t sit still.' },
    { lev: 8,  hurdle: 'hizz',       title: 'Hizz',         tip: 'Hizz has locked on to your wallet.' },
    { lev: 10, hurdle: 'tamtam',     title: 'Tam-tam',      tip: 'On-chain messages incoming. Duck.' },
    { lev: 15, hurdle: 'argus',      title: 'Argus',        tip: 'Argus keeps an eye on you.' },
    { lev: 20, hurdle: 'stresslab',  title: 'StressLab',    tip: 'StressLab ships teleport toward you.' },
    { lev: 25, hurdle: 'strikeon',   title: 'Strike On',    tip: 'Strike On ships hunt in pairs.' },
    { lev: 30, hurdle: 'strikecity', title: 'StrikeCity',   tip: 'StrikeCity ships dive at you from above.' },
    { lev: 40, hurdle: 'realfi',     title: 'RealFi vault', tip: 'Vault ships weave toward you.' }
  ];
  const HCOL = { mine: '#FF3B3B', bolt: '#FF8A3D', strikeabox: '#3D8BFF', hizz: '#E94FD1', tamtam: '#22B8DD', argus: '#9B7BFF',
                 stresslab: '#E5B300', strikeon: '#3FCB6E', strikecity: '#8A94AD', realfi: '#14B8A6' };
  const HNAME = { mine: 'Mine', bolt: 'Bolt', strikeabox: 'Strikeabox', hizz: 'Hizz', tamtam: 'Tam-tam', argus: 'Argus',
                  stresslab: 'StressLab', strikeon: 'Strike On', strikecity: 'StrikeCity', realfi: 'RealFi' };
  const PER_LEVEL = 8, LAST_LEVEL_CANDLES = 12;

  let state = 'start';
  let p, pipes, floats, score, level, levelCandles, lev, t, nextFunding, fundingUntil, banner, bannerUntil, bannerKind,
      lastCenter, shake, trail, flapAnim, levelCardUntil;

  const L = () => LEVELS[level - 1];
  const speed = () => H * (0.30 + level * 0.022);
  const spacing = () => Math.max(H * 0.44, 200);
  const gap = () => Math.max(H * 0.20, H * (0.32 - (level - 1) * 0.0135));
  const pipeW = () => Math.max(46, H * 0.085);
  const levelGoal = () => level === 10 ? LAST_LEVEL_CANDLES : PER_LEVEL;

  function reset() {
    // shuffle which hurdle each level introduces (level 1 stays plain candles; leverage per level stays the same)
    const levs = LEVELS.map(l => l.lev), rest = LEVELS.slice(1);
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    LEVELS = [LEVELS[0], ...rest].map((l, i) => Object.assign({}, l, { lev: levs[i] }));
    p = { x: W * 0.28, y: H * 0.45, vy: 0, r: Math.max(13, H * 0.028), rot: 0 };
    pipes = []; floats = []; score = 0; level = 1; levelCandles = 0; lev = 2; t = 0; shake = 0; trail = []; flapAnim = 0;
    nextFunding = 9; fundingUntil = -1; banner = ''; bannerUntil = -1; levelCardUntil = 2.4; heavy = []; heavyUntil = -1; heavyMul = 1; bullets = []; parts = []; fireCd = 0;
    lastCenter = H * 0.5;
    for (let i = 0; i < 3; i++) spawn(W + i * spacing() + W * 0.2);
  }

  function pickHurdle() {
    const pool = LEVELS.slice(1, level).map(l => l.hurdle);
    if (!pool.length) return null;
    // newest hurdle shows up more often
    return Math.random() < 0.45 ? pool[pool.length - 1] : pool[Math.floor(Math.random() * pool.length)];
  }

  function spawnFloat(type, x, baseY) {
    const r = H * 0.032;
    const f = { type, x, y: baseY, by: baseY, r, ph: Math.random() * 6.28, vy: 0, jumped: false };
    if (type === 'tamtam') f.vy = (Math.random() < .5 ? -1 : 1) * H * 0.22;
    if (type === 'strikecity') { f.y = -r * 2; f.vy = H * 0.18; }
    if (type === 'strikeon') {
      floats.push(f);
      floats.push(Object.assign({}, f, { y: baseY + H * 0.16 > H * 0.9 ? baseY - H * 0.16 : baseY + H * 0.16, by: 0 }));
      floats[floats.length - 1].by = floats[floats.length - 1].y;
      return;
    }
    floats.push(f);
  }

  function spawn(x) {
    const g = gap();
    let c = lastCenter + (Math.random() * 2 - 1) * H * 0.2;
    c = Math.max(H * 0.12 + g / 2, Math.min(H * 0.86 - g / 2, c));
    const prevC = lastCenter;
    lastCenter = c;
    pipes.push({ x, c, g, passed: false, hunt: level >= 3 && Math.random() < 0.08 + level * 0.025, hunted: false, flash: 0 });
    // space mine parked in the middle of the gap: shoot it or squeeze past it
    if (level >= 2 && Math.random() < 0.2 + level * 0.03) {
      floats.push({ type: 'mine', pipe: pipes[pipes.length - 1], x: x + pipeW() / 2, y: c, by: c, r: H * 0.034, ph: Math.random() * 6.28 });
    }
    // floating hurdle between this candle and the previous one
    if (pipes.length > 1 && level >= 2) {
      const chance = Math.min(1, 0.45 + (level - 2) * 0.08);
      const count = level >= 9 && Math.random() < 0.35 ? 2 : 1;
      for (let k = 0; k < count; k++) {
        if (Math.random() > chance) continue;
        const type = pickHurdle(); if (!type) continue;
        const mid = (prevC + c) / 2;
        const off = (Math.random() < .5 ? -1 : 1) * H * (0.13 + Math.random() * 0.12);
        const fy = Math.max(H * 0.1, Math.min(H * 0.9, mid + off));
        const fx = x - spacing() / 2 + pipeW() / 2 + (k ? spacing() * 0.22 : 0);
        spawnFloat(type, fx, fy);
      }
    }
  }

  let actx = null;
  function bubble() {
    try {
      if (!actx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; actx = new AC(); }
      if (actx.state === 'suspended') actx.resume();
      const now = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
      const f0 = 360 + Math.random() * 140;
      o.type = 'sine';
      o.frequency.setValueAtTime(f0, now);
      o.frequency.exponentialRampToValueAtTime(f0 * 2.6, now + 0.09);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.35, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
      o.connect(g); g.connect(actx.destination);
      o.start(now); o.stop(now + 0.16);
    } catch (e) {}
  }

  // ---------- Techno soundtrack (generated live with Web Audio) ----------
  let musicOn = ls.get('flappyCoinMusic') !== 'off', musicGain = null, musicTimer = null, nextNoteTime = 0, step = 0, noiseBuf = null;
  const muteBtn = document.getElementById('mute');
  function paintMute() { muteBtn.textContent = musicOn ? '♪ On' : '♪ Off'; muteBtn.classList.toggle('off', !musicOn); }
  paintMute();
  function audio() {
    if (!actx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; actx = new AC(); }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  function noise() {
    if (!noiseBuf) { noiseBuf = actx.createBuffer(1, actx.sampleRate * 0.5, actx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const n = actx.createBufferSource(); n.buffer = noiseBuf; return n;
  }
  function env(g, t0, v, d) { g.gain.setValueAtTime(v, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d); }
  function kick(t0) { const o = actx.createOscillator(), g = actx.createGain(); o.frequency.setValueAtTime(150, t0); o.frequency.exponentialRampToValueAtTime(42, t0 + 0.12);
    env(g, t0, 0.9, 0.26); o.connect(g); g.connect(musicGain); o.start(t0); o.stop(t0 + 0.28); }
  function hat(t0, v) { const n = noise(), f = actx.createBiquadFilter(), g = actx.createGain(); f.type = 'highpass'; f.frequency.value = 7000;
    env(g, t0, v, 0.045); n.connect(f); f.connect(g); g.connect(musicGain); n.start(t0); n.stop(t0 + 0.06); }
  function clap(t0) { const n = noise(), f = actx.createBiquadFilter(), g = actx.createGain(); f.type = 'bandpass'; f.frequency.value = 1700;
    env(g, t0, 0.45, 0.16); n.connect(f); f.connect(g); g.connect(musicGain); n.start(t0); n.stop(t0 + 0.18); }
  function synth(type, freq, t0, d, v, cut) { const o = actx.createOscillator(), f = actx.createBiquadFilter(), g = actx.createGain();
    o.type = type; o.frequency.value = freq; f.type = 'lowpass'; f.frequency.value = cut; env(g, t0, v, d);
    o.connect(f); f.connect(g); g.connect(musicGain); o.start(t0); o.stop(t0 + d + 0.02); }
  // Lo-fi: ii–V–I–vi in C with jazzy 7th/9th chords, swung hats, soft drums, vinyl crackle
  const PROG = [
    { bass: 38, chord: [53, 57, 60, 64] },   // Dm9
    { bass: 43, chord: [53, 57, 59, 64] },   // G13
    { bass: 36, chord: [52, 55, 59, 62] },   // Cmaj9
    { bass: 45, chord: [55, 60, 64, 67] }    // Am7
  ];
  let hissSrc = null;
  function keys(freq, t0, d, v) {
    // soft electric-piano tone: sine + slightly detuned triangle through a warm filter
    const g = actx.createGain(), f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1600;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v, t0 + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    for (const [type, mul] of [['sine', 1], ['triangle', 1.004]]) {
      const o = actx.createOscillator(); o.type = type; o.frequency.value = freq * mul; o.connect(f); o.start(t0); o.stop(t0 + d + 0.05);
    }
    f.connect(g); g.connect(musicGain);
  }
  function softKick(t0) { const o = actx.createOscillator(), g = actx.createGain(); o.frequency.setValueAtTime(110, t0); o.frequency.exponentialRampToValueAtTime(40, t0 + 0.15);
    env(g, t0, 0.6, 0.3); o.connect(g); g.connect(musicGain); o.start(t0); o.stop(t0 + 0.32); }
  function softSnare(t0) { const n = noise(), f = actx.createBiquadFilter(), g = actx.createGain(); f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 0.7;
    env(g, t0, 0.22, 0.2); n.connect(f); f.connect(g); g.connect(musicGain); n.start(t0); n.stop(t0 + 0.22);
    const o = actx.createOscillator(), g2 = actx.createGain(); o.type = 'triangle'; o.frequency.value = 190; env(g2, t0, 0.12, 0.08); o.connect(g2); g2.connect(musicGain); o.start(t0); o.stop(t0 + 0.1); }
  function crackle(t0) { const n = noise(), f = actx.createBiquadFilter(), g = actx.createGain(); f.type = 'highpass'; f.frequency.value = 2500;
    env(g, t0, 0.04 + Math.random() * 0.05, 0.006); n.connect(f); f.connect(g); g.connect(musicGain); n.start(t0, Math.random() * 0.4); n.stop(t0 + 0.01); }
  function playStep(s, t0, len) {
    const st = s % 16, bar = Math.floor(s / 16) % 4, P = PROG[bar];
    const tt = st % 4 === 2 ? t0 + len * 0.32 : t0;           // swing the off-beat 8ths
    if (st === 0 || st === 10) softKick(tt);
    if (st === 4 || st === 12) softSnare(tt);
    if (st % 2 === 0) hat(tt, st % 4 === 0 ? 0.05 : 0.035);
    if (st === 0) { P.chord.forEach((m, i) => keys(mtof(m), t0 + i * 0.012, len * 15, 0.045)); }
    if (st === 7) { P.chord.forEach(m => keys(mtof(m), tt, len * 7, 0.025)); }   // lazy pushed re-hit
    if (st === 0 || st === 10) synth('sine', mtof(P.bass), tt, len * 5, 0.28, 320);
    if ((st === 6 || st === 14) && Math.random() < 0.45) {                   // sparse melody
      const m = P.chord[Math.floor(Math.random() * P.chord.length)] + 12; keys(mtof(m), tt, len * 5, 0.03);
    }
    if (Math.random() < 0.35) crackle(t0 + Math.random() * len);
  }
  function scheduler() {
    const len = 60 / 78 / 4;                                   // 78 BPM, stays chill no matter how bad it gets
    while (nextNoteTime < actx.currentTime + 0.15) { playStep(step, nextNoteTime, len); nextNoteTime += len; step = (step + 1) % 64; }
  }
  function startMusic() {
    if (!musicOn || musicTimer) return;
    const a = audio(); if (!a) return;
    try {
      musicGain = a.createGain(); musicGain.gain.setValueAtTime(0.0001, a.currentTime);
      musicGain.gain.exponentialRampToValueAtTime(0.32, a.currentTime + 1.2);
      const warm = a.createBiquadFilter(); warm.type = 'lowpass'; warm.frequency.value = 3200;
      musicGain.connect(warm); warm.connect(a.destination);
      // tape hiss bed
      hissSrc = noise(); hissSrc.loop = true; const hf = a.createBiquadFilter(), hg = a.createGain();
      hf.type = 'bandpass'; hf.frequency.value = 3000; hg.gain.value = 0.012; hissSrc.connect(hf); hf.connect(hg); hg.connect(musicGain); hissSrc.start();
      nextNoteTime = a.currentTime + 0.05; step = 0; musicTimer = setInterval(scheduler, 25);
    } catch (e) {}
  }
  function stopMusic() {
    if (!musicTimer) return;
    clearInterval(musicTimer); musicTimer = null;
    const g = musicGain, h = hissSrc, now = actx.currentTime;
    try { g.gain.cancelScheduledValues(now); g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), now); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.35); } catch (e) {}
    setTimeout(() => { try { h && h.stop(); g.disconnect(); } catch (e) {} }, 700);
  }
  muteBtn.addEventListener('pointerdown', e => e.stopPropagation());
  muteBtn.addEventListener('click', e => {
    e.stopPropagation(); musicOn = !musicOn; ls.set('flappyCoinMusic', musicOn ? 'on' : 'off'); paintMute();
    if (!musicOn) stopMusic(); else if (state === 'play' || state === 'countdown') startMusic();
  });

  function beep(freq, dur) {
    try {
      if (!actx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; actx = new AC(); }
      if (actx.state === 'suspended') actx.resume();
      const now = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
      o.type = 'square'; o.frequency.setValueAtTime(freq, now);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
      g.gain.setValueAtTime(0.12, now + dur - 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      o.connect(g); g.connect(actx.destination);
      o.start(now); o.stop(now + dur + 0.02);
    } catch (e) {}
  }
  let cd = 0, cdShown = 0;
  function begin() {
    state = 'countdown'; startEl.classList.add('hidden'); overEl.classList.add('hidden'); reset();
    cd = 5; cdShown = 5; beep(660, 0.12); startMusic(); fireBtn.classList.add('show');
  }
  function flap() {
    if (state === 'start') { begin(); return; }
    if (state !== 'play') return;
    p.vy = -H * 0.6; flapAnim = 1; bubble();
  }
  function say(text, kind, dur) { banner = text; bannerKind = kind; bannerUntil = t + dur; }

  function endRun(won) {
    state = 'over'; shake = 0; stopMusic(); fireBtn.classList.remove('show');
    lastRun = { score, lev, level, won };
    runMs = Math.round(t * 1000);
    tell({ t: 'arcade.run', score, level, won: !!won, ms: runMs });
    if (score > best) { best = score; ls.set('flappyCoinBest', String(best)); }
    const stamp = document.querySelector('#over .stamp');
    stamp.classList.toggle('won', !!won);
    const ko = stamp.querySelector('.ko');
    ko.textContent = won ? 'YOU WIN' : 'LIQUIDATED';
    stamp.querySelector('.ko-sub').textContent = won ? 'Survived at 40x' : 'Rekt at ' + lev + 'x';
    ko.style.animation = 'none'; void ko.offsetHeight; ko.style.animation = '';
    document.getElementById('final').textContent = won
      ? 'All 10 levels cleared at 40x. ' + score + ' points.'
      : 'Level ' + level + ' · ' + score + ' points at ' + lev + 'x';
    document.getElementById('quip').textContent = won ? 'Screenshot this. Nobody will believe you.' : quips[Math.floor(Math.random() * quips.length)];
    prepareSave();
    setTimeout(() => { overEl.classList.remove('hidden'); overEl.scrollTop = 0; }, won ? 200 : 450);
  }
  let meltT = 0, heavy = [], heavyUntil = -1, heavyMul = 1, bullets = [], parts = [], fireCd = 0;
  const fireBtn = document.getElementById('fire');
  function pew() {
    const a = audio(); if (!a) return;
    try { const now = a.currentTime, o = a.createOscillator(), g = a.createGain(); o.type = 'square';
      o.frequency.setValueAtTime(1400, now); o.frequency.exponentialRampToValueAtTime(260, now + 0.12);
      g.gain.setValueAtTime(0.07, now); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
      o.connect(g); g.connect(a.destination); o.start(now); o.stop(now + 0.15); } catch (e) {}
  }
  function boom() {
    const a = audio(); if (!a) return;
    try { const now = a.currentTime, n = noise(), f = a.createBiquadFilter(), g = a.createGain(); f.type = 'lowpass';
      f.frequency.setValueAtTime(1400, now); f.frequency.exponentialRampToValueAtTime(120, now + 0.35);
      g.gain.setValueAtTime(0.45, now); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
      n.connect(f); f.connect(g); g.connect(a.destination); n.start(now); n.stop(now + 0.42); } catch (e) {}
  }
  function explode(x, y, col) {
    for (let i = 0; i < 18; i++) { const a = Math.random() * Math.PI * 2, v = H * (0.15 + Math.random() * 0.45);
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.4, col: i % 3 ? col : '#FFD400' }); }
  }
  function findTarget() {
    // nearest ship in front of (or level with) the coin, within range
    let best = null, bd = Infinity;
    for (const f of floats) {
      if (f.dead || f.x < p.x - p.r * 2) continue;
      const dx = f.x - p.x, dy = f.y - p.y, d = Math.hypot(dx, dy);
      if (d < H * 0.75 && d < bd) { bd = d; best = f; }
    }
    return best;
  }
  function shoot() {
    if (state !== 'play' || fireCd > 0) return;
    fireCd = 0.3;
    const v = H * 1.7, tg = findTarget();
    let ang = 0;
    if (tg) {
      // lead the target a little for the scroll speed, then clamp so we never fire backwards
      const tt = Math.hypot(tg.x - p.x, tg.y - p.y) / v;
      ang = Math.atan2(tg.y - p.y, (tg.x - speed() * tt) - p.x);
      ang = Math.max(-1.35, Math.min(1.35, ang));
    }
    bullets.push({ x: p.x + Math.cos(ang) * p.r, y: p.y + Math.sin(ang) * p.r, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v });
    pew();
  }
  fireBtn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); fireBtn.classList.add('pressed'); shoot(); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => fireBtn.addEventListener(ev, () => fireBtn.classList.remove('pressed')));
  function womp() {
    try {
      if (!actx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; actx = new AC(); }
      if (actx.state === 'suspended') actx.resume();
      const now = actx.currentTime;
      [[311, 277, now, 0.32], [277, 208, now + 0.4, 0.8]].forEach(([f1, f2, st, d], i) => {
        const o = actx.createOscillator(), g = actx.createGain(), lp = actx.createBiquadFilter();
        o.type = 'sawtooth'; lp.type = 'lowpass'; lp.frequency.value = 850;
        o.frequency.setValueAtTime(f1, st); o.frequency.exponentialRampToValueAtTime(f2, st + d);
        if (i === 1) { const lfo = actx.createOscillator(), lg = actx.createGain(); lfo.frequency.value = 6; lg.gain.value = 9;
          lfo.connect(lg); lg.connect(o.frequency); lfo.start(st + 0.2); lfo.stop(st + d); }
        g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(0.28, st + 0.04);
        g.gain.setValueAtTime(0.28, st + d - 0.15); g.gain.exponentialRampToValueAtTime(0.0001, st + d);
        o.connect(lp); lp.connect(g); g.connect(actx.destination); o.start(st); o.stop(st + d + 0.02);
      });
    } catch (e) {}
  }
  function die() {
    if (state !== 'play') return;
    state = 'dying'; meltT = 0; shake = 14; stopMusic(); womp(); fireBtn.classList.remove('show');
    if (navigator.vibrate) { try { navigator.vibrate(120); } catch (e) {} }
  }

  function hitRect(cx, cy, r, x, y, w, h) {
    const nx = Math.max(x, Math.min(cx, x + w)), ny = Math.max(y, Math.min(cy, y + h));
    const dx = cx - nx, dy = cy - ny;
    return dx * dx + dy * dy < r * r * 0.8;
  }

  function floatRadius(f) { return f.type === 'hizz' ? f.r * (0.8 + 0.45 * (Math.sin(t * 4 + f.ph) + 1) / 2) : f.r; }

  function updateFloat(f, dt, s) {
    // every ship hunts the coin while it's still ahead of it
    const ahead = f.x > p.x - p.r;
    f.x -= s * dt;
    if (f.type === 'mine') { f.x = f.pipe.x + pipeW() / 2; f.y = f.pipe.c + Math.sin(t * 2 + f.ph) * H * 0.008; return; }
    const chase = (spd, key) => { if (!ahead) return; const cur = f[key], d = p.y - cur; f[key] = cur + Math.sign(d) * Math.min(Math.abs(d), H * spd * dt); };
    const bob = (amp, spd) => { f.y = f.by + Math.sin(t * spd + f.ph) * H * amp; };
    switch (f.type) {
      case 'bolt': chase(0.32, 'y'); break;                                   // fast homing
      case 'strikeabox': chase(0.14, 'by'); bob(0.08, 3); break;              // homing while bobbing
      case 'hizz': chase(0.12, 'y'); break;                                   // pulsing homer
      case 'tamtam': if (ahead) f.x -= s * 0.45 * dt; chase(0.16, 'y'); break; // dives in faster
      case 'argus': if (ahead) f.x -= s * 0.25 * dt; chase(0.2, 'y'); break;
      case 'stresslab':
        f.jt = (f.jt || 0) - dt;
        if (ahead && f.jt <= 0) { f.jt = 0.6 + Math.random() * 0.4; const d = p.y - f.y;
          f.y += Math.sign(d) * Math.min(Math.abs(d), H * 0.1); f.flash = 0.25; }               // teleports toward you
        if (f.flash > 0) f.flash -= dt; break;
      case 'strikeon': chase(0.15, 'by'); bob(0.03, 2.4); break;              // the pair homes together
      case 'strikecity': f.y += f.vy * dt; if (ahead) { const d = p.y - f.y; f.y += Math.sign(d) * Math.min(Math.abs(d), H * 0.12 * dt); }
        if (f.y > H + f.r * 2) f.y = -f.r * 2; break;
      case 'realfi': chase(0.13, 'by'); bob(0.07, 2.4); break;
    }
  }

  function update(dt) {
    t += dt;
    for (const q of parts) { q.x += q.vx * dt; q.y += q.vy * dt; if (q.ring) q.r += H * 0.9 * dt; else q.vy += H * 0.6 * dt; q.life -= dt; }
    parts = parts.filter(q => q.life > 0);
    flapAnim = Math.max(0, flapAnim - dt * 5);
    if (state === 'start') { p.y = H * 0.45 + Math.sin(t * 3) * H * 0.02; flapAnim = (Math.sin(t * 9) + 1) / 2; return; }
    if (state === 'dying') {
      meltT += dt;
      p.y = Math.min(H - p.r * 0.3, p.y + H * 0.12 * dt);
      if (meltT > 1.35) endRun(false);
      return;
    }
    if (state === 'countdown') {
      p.y = H * 0.45 + Math.sin(t * 3) * H * 0.02; flapAnim = (Math.sin(t * 9) + 1) / 2;
      cd -= dt;
      const n = Math.ceil(cd);
      if (cd <= 0) { state = 'play'; t = 0; p.vy = 0; levelCardUntil = 2.4; beep(1320, 0.35); }
      else if (n < cdShown) { cdShown = n; beep(660, 0.12); }
      return;
    }
    if (state !== 'play') return;

    if (level >= 2 && t > nextFunding) {
      fundingUntil = t + 1.3; nextFunding = t + Math.max(4, 9 - level * 0.5) + Math.random() * 4;
      say('Funding charged −' + (0.01 + Math.random() * 0.004 * lev).toFixed(3) + '%', 'bad', 1.6);
    }
    if (heavy.length && t > heavy[0]) {
      heavy.shift(); heavyMul = 3 + Math.random() * 2; heavyUntil = t + 1.4;
      say('Whale alert! ' + heavyMul.toFixed(1) + 'x heavier', 'bad', 1.4);
    }
    p.vy += H * 1.9 * (t < fundingUntil ? 1.5 : 1) * (t < heavyUntil ? heavyMul : 1) * dt;
    p.y += p.vy * dt;
    p.rot = Math.max(-0.45, Math.min(1.1, p.vy / (H * 1.3)));
    trail.push(p.y); if (trail.length > 12) trail.shift();

    if (p.y - p.r < 0) { p.y = p.r; p.vy = 0; }
    if (p.y + p.r > H) { p.y = H - p.r; die(); return; }

    const s = speed(), pw = pipeW();
    for (const q of pipes) {
      q.x -= s * dt;
      if (q.hunt && !q.hunted && q.x - p.x < H * 0.3 && q.x > p.x) {
        q.hunted = true; q.flash = 0.35;
        const dir = p.y < q.c ? 1 : -1;
        q.c = Math.max(H * 0.1 + q.g / 2, Math.min(H * 0.9 - q.g / 2, q.c + dir * H * 0.06));
        say('Stop hunt!', 'bad', 0.9);
      }
      if (q.flash > 0) q.flash -= dt;
      const top = q.c - q.g / 2, bot = q.c + q.g / 2;
      if (hitRect(p.x, p.y, p.r, q.x, 0, pw, top) || hitRect(p.x, p.y, p.r, q.x, bot, pw, H - bot)) { die(); return; }
      if (!q.passed && q.x + pw < p.x) {
        q.passed = true; score += 10; levelCandles++;
        if (levelCandles >= levelGoal()) {
          if (level === 10) { endRun(true); return; }
          level++; levelCandles = 0; lev = L().lev; levelCardUntil = t + 2.4;
          if (level === 10) { const a = t + 4 + Math.random() * 5; heavy = [a, a + 4 + Math.random() * 6]; }
        }
      }
    }
    for (const f of floats) {
      updateFloat(f, dt, s);
      const rr = floatRadius(f) * 0.85 + p.r * 0.85, dx = f.x - p.x, dy = f.y - p.y;
      if (dx * dx + dy * dy < rr * rr) { die(); return; }
    }
    // lasers
    fireCd -= dt;
    for (const b of bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt;
      for (const q of pipes) { if (b.x > q.x && b.x < q.x + pw && (b.y < q.c - q.g / 2 || b.y > q.c + q.g / 2)) b.dead = true; }
      for (const f of floats) {
        if (f.dead || b.dead) continue;
        const rr = floatRadius(f) * 1.25, dx = f.x - b.x, dy = f.y - b.y;
        if (dx * dx + dy * dy < rr * rr) {
          f.dead = b.dead = true; boom();
          if (f.type === 'mine') {
            explode(f.x, f.y, '#FF3B3B'); explode(f.x, f.y, '#FFD400');
            parts.push({ ring: true, x: f.x, y: f.y, vx: 0, vy: 0, r: f.r, life: 0.45, col: '#FFD400' });
            shake = 9; score += 10; say('+10 · Mine cleared', 'good', 0.9);
          } else { explode(f.x, f.y, HCOL[f.type]); score += 5; say('+5 · ' + HNAME[f.type] + ' down', 'good', 0.8); }
        }
      }
    }
    bullets = bullets.filter(b => !b.dead && b.x < W + 20 && b.x > -20 && b.y > -20 && b.y < H + 20);
    floats = floats.filter(f => !f.dead && f.x > -H * 0.2);
    if (pipes.length && pipes[0].x + pw < -10) pipes.shift();
    if (pipes[pipes.length - 1].x < W + 20) spawn(pipes[pipes.length - 1].x + spacing());
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function drawCandle(q) {
    const pw = pipeW(), top = q.c - q.g / 2, bot = q.c + q.g / 2, cx = q.x + pw / 2, wick = Math.max(10, q.g * 0.12);
    ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.strokeStyle = C.long; ctx.beginPath(); ctx.moveTo(cx, top - 4); ctx.lineTo(cx, top + wick); ctx.stroke();
    ctx.strokeStyle = C.short; ctx.beginPath(); ctx.moveTo(cx, bot + 4); ctx.lineTo(cx, bot - wick); ctx.stroke();
    ctx.fillStyle = q.flash > 0 ? C.bolt : C.long; roundRect(q.x, -10, pw, top + 10, 8); ctx.fill();
    ctx.fillStyle = q.flash > 0 ? C.bolt : C.short; roundRect(q.x, bot, pw, H - bot + 10, 8); ctx.fill();
    if (q.hunt && !q.hunted) {
      ctx.fillStyle = C.bg; ctx.font = '600 ' + Math.round(pw * 0.42) + 'px Rubik, system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText('?', cx, top - 14);
    }
  }

  function drawMine(f) {
    const r = f.r;
    ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(t * 0.8 + f.ph);
    ctx.strokeStyle = '#5A5F78'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8); ctx.lineTo(Math.cos(a) * r * 1.35, Math.sin(a) * r * 1.35); ctx.stroke();
      ctx.fillStyle = '#8A90AA'; ctx.beginPath(); ctx.arc(Math.cos(a) * r * 1.38, Math.sin(a) * r * 1.38, r * 0.13, 0, Math.PI * 2); ctx.fill(); }
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    g.addColorStop(0, '#9AA0BC'); g.addColorStop(1, '#2A2D40');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    const on = Math.sin(t * 9 + f.ph) > 0;
    ctx.fillStyle = on ? '#FF2A2A' : '#5A0A0A'; ctx.beginPath(); ctx.arc(f.x, f.y, r * 0.24, 0, Math.PI * 2); ctx.fill();
    if (on) { ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(f.x, f.y, r * 0.5, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
  }

  function drawFloat(f) {
    if (f.type === 'mine') { drawMine(f); return; }
    const r = floatRadius(f) * 1.1, col = HCOL[f.type];
    const ang = Math.atan2(p.y - f.y, p.x - f.x); // nose always points at the coin
    ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(ang);
    // engine flame
    const fl = r * (0.5 + Math.random() * 0.4);
    ctx.fillStyle = '#FF7A1A'; ctx.beginPath();
    ctx.moveTo(-r * 0.8, -r * 0.26); ctx.lineTo(-r * 0.8 - fl, 0); ctx.lineTo(-r * 0.8, r * 0.26); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#FFE66B'; ctx.beginPath();
    ctx.moveTo(-r * 0.8, -r * 0.13); ctx.lineTo(-r * 0.8 - fl * 0.55, 0); ctx.lineTo(-r * 0.8, r * 0.13); ctx.closePath(); ctx.fill();
    // wings
    ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1.5;
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(r * 0.15, sgn * r * 0.3); ctx.lineTo(-r * 0.55, sgn * r * 1.05);
      ctx.lineTo(-r * 0.9, sgn * r * 1.0); ctx.lineTo(-r * 0.6, sgn * r * 0.3); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(-r * 0.85, sgn * r * 0.95 - r * 0.06, r * 0.28, r * 0.12); ctx.fillStyle = col;
    }
    // hull
    ctx.beginPath();
    ctx.moveTo(r * 1.2, 0);
    ctx.quadraticCurveTo(r * 0.45, -r * 0.62, -r * 0.85, -r * 0.4);
    ctx.lineTo(-r * 0.85, r * 0.4);
    ctx.quadraticCurveTo(r * 0.45, r * 0.62, r * 1.2, 0);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // racing stripe
    ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(-r * 0.8, -r * 0.07, r * 1.5, r * 0.14);
    // cockpit
    ctx.fillStyle = '#CFF4FF'; ctx.strokeStyle = 'rgba(0,0,0,.4)';
    ctx.beginPath(); ctx.ellipse(r * 0.38, 0, r * 0.34, r * 0.22, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.ellipse(r * 0.46, -r * 0.07, r * 0.11, r * 0.06, 0, 0, Math.PI * 2); ctx.fill();
    // StressLab ships flash when they jump
    if (f.flash > 0) { ctx.strokeStyle = C.coin; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, r * 1.35, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = C.text; ctx.font = '600 11px Rubik, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(HNAME[f.type], f.x, f.y - r * 1.15 - 4);
  }

  function wing(side, r, lift) {
    ctx.save();
    ctx.rotate(-0.35 - lift * 0.9);
    ctx.fillStyle = C.wing; ctx.strokeStyle = C.wingEdge; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-r * 0.6, -r * 1.25, -r * 1.75, -r * 0.95);
    ctx.quadraticCurveTo(-r * 1.35, -r * 0.6, -r * 1.55, -r * 0.35);
    ctx.quadraticCurveTo(-r * 1.1, -r * 0.2, -r * 1.25, r * 0.12);
    ctx.quadraticCurveTo(-r * 0.6, r * 0.2, 0, 0);
    ctx.closePath(); ctx.globalAlpha *= side < 0 ? 0.65 : 1; ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawMelt() {
    const r = p.r, m = Math.min(1, meltT / 1.1);
    ctx.save(); ctx.translate(p.x, p.y);
    // wings droop and fade
    ctx.globalAlpha = Math.max(0, 1 - m * 1.4);
    ctx.save(); ctx.translate(-r * 0.3, r * 0.3 * m); ctx.rotate(m * 0.9); wing(1, r, 0); ctx.restore();
    ctx.globalAlpha = 1;
    const rx = r * (1 + 0.9 * m), ry = r * (1 - 0.72 * m), cy = r * 0.7 * m;
    // drips
    ctx.fillStyle = C.coin; ctx.strokeStyle = C.coin; ctx.lineCap = 'round';
    [-0.55, 0.1, 0.6].forEach((dx, i) => {
      const len = r * (0.6 + i * 0.35) * m * 1.6, x = dx * rx;
      ctx.lineWidth = r * 0.28; ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(x, cy + ry + len); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, cy + ry + len, r * 0.2, 0, Math.PI * 2); ctx.fill();
    });
    ctx.fillStyle = C.edge; ctx.beginPath(); ctx.ellipse(2, cy + 3, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.coin; ctx.beginPath(); ctx.ellipse(0, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    // fading bolt, squashed
    ctx.globalAlpha = Math.max(0, 1 - m); ctx.translate(0, cy); ctx.scale(1 + 0.9 * m, 1 - 0.72 * m);
    ctx.fillStyle = C.bolt; ctx.beginPath();
    ctx.moveTo(r * 0.12, -r * 0.62); ctx.lineTo(-r * 0.34, r * 0.08); ctx.lineTo(-r * 0.02, r * 0.08);
    ctx.lineTo(-r * 0.14, r * 0.62); ctx.lineTo(r * 0.36, -r * 0.1); ctx.lineTo(r * 0.04, -r * 0.1); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawCoin() {
    if (state === 'dying' || (state === 'over' && !lastRun.won)) { drawMelt(); return; }
    const r = p.r;
    for (let i = 0; i < trail.length; i++) {
      ctx.globalAlpha = (i / trail.length) * 0.22; ctx.fillStyle = C.coin;
      ctx.beginPath(); ctx.arc(p.x - (trail.length - i) * 4, trail[i], r * (0.35 + i / trail.length * 0.45), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    const lift = flapAnim;
    ctx.save(); ctx.translate(-r * 0.15, -r * 0.2); wing(-1, r, Math.min(1, lift + 0.25)); ctx.restore();
    ctx.fillStyle = C.edge; ctx.beginPath(); ctx.arc(2, 3, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.coin; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = C.edge; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r * 0.76, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = C.bolt; ctx.beginPath();
    ctx.moveTo(r * 0.12, -r * 0.62); ctx.lineTo(-r * 0.34, r * 0.08); ctx.lineTo(-r * 0.02, r * 0.08);
    ctx.lineTo(-r * 0.14, r * 0.62); ctx.lineTo(r * 0.36, -r * 0.1); ctx.lineTo(r * 0.04, -r * 0.1); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.translate(-r * 0.3, 0); wing(1, r, lift); ctx.restore();
    ctx.restore();
  }

  function draw() {
    ctx.save();
    if (shake > 0) { ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake); shake *= 0.88; if (shake < .5) shake = 0; }
    ctx.fillStyle = C.bg; ctx.fillRect(-20, -20, W + 40, H + 40);
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    const step = H / 10, off = state === 'play' ? (t * speed()) % step : 0;
    for (let x = -off; x < W; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    if (state !== 'start' && pipes.length > 1) {
      ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.beginPath();
      pipes.forEach((q, i) => { const x = q.x + pipeW() / 2; i ? ctx.lineTo(x, q.c) : ctx.moveTo(x, q.c); });
      ctx.stroke(); ctx.setLineDash([]);
    }
    if (state !== 'start') { pipes.forEach(drawCandle); floats.forEach(drawFloat); }
    if (state !== 'start') {
      ctx.lineCap = 'round';
      for (const b of bullets) {
        const sp = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / sp, uy = b.vy / sp;
        ctx.strokeStyle = '#FFD400'; ctx.lineWidth = 6; ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.moveTo(b.x - ux * 22, b.y - uy * 22); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2.5; ctx.globalAlpha = 1; ctx.beginPath(); ctx.moveTo(b.x - ux * 18, b.y - uy * 18); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      if (state === 'play') {
        const tg = findTarget();
        if (tg) {
          // auto-aim indicator: faint guide line and a crosshair on the locked ship
          ctx.save(); ctx.strokeStyle = '#FFD400'; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.45; ctx.setLineDash([4, 6]);
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(tg.x, tg.y); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 0.95;
          const cr = floatRadius(tg) * 1.6 + Math.sin(t * 10) * 2;
          ctx.beginPath(); ctx.arc(tg.x, tg.y, cr, 0, Math.PI * 2); ctx.stroke();
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.beginPath(); ctx.moveTo(tg.x + dx * cr * 0.6, tg.y + dy * cr * 0.6); ctx.lineTo(tg.x + dx * cr * 1.3, tg.y + dy * cr * 1.3); ctx.stroke(); }
          ctx.restore();
        }
      }
      for (const q of parts) { ctx.globalAlpha = Math.max(0, Math.min(1, q.life * 2));
        if (q.ring) { ctx.strokeStyle = q.col; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2); ctx.stroke(); }
        else { ctx.fillStyle = q.col; ctx.fillRect(q.x - 3, q.y - 3, 6, 6); } }
      ctx.globalAlpha = 1;
    }
    drawCoin();
    if (state !== 'start') {
      const fs = Math.round(Math.min(60, H * 0.075));
      ctx.fillStyle = C.text; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.font = fs + 'px Bungee, Impact, sans-serif'; ctx.fillText(String(score), W / 2, 18);
      ctx.font = '600 14px Rubik, system-ui, sans-serif'; ctx.fillStyle = C.muted;
      ctx.fillText('Level ' + level + '/10  ·  ' + lev + 'x long', W / 2, 24 + fs);
      // level progress bar
      const bw = Math.min(180, W * 0.45), bx = (W - bw) / 2, by = 46 + fs;
      ctx.fillStyle = C.grid; roundRect(bx, by, bw, 6, 3); ctx.fill();
      ctx.fillStyle = C.long; roundRect(bx, by, Math.max(6, bw * levelCandles / levelGoal()), 6, 3); ctx.fill();
    }
    if (state === 'countdown' || (state === 'play' && t < 0.7)) {
      const label = state === 'countdown' ? String(Math.max(1, Math.ceil(cd))) : 'Go!';
      const frac = state === 'countdown' ? cd - Math.floor(cd) : 1 - t / 0.7;
      const size = Math.round(Math.min(160, H * 0.2) * (0.8 + 0.4 * frac));
      ctx.save(); ctx.globalAlpha = state === 'countdown' ? 0.4 + 0.6 * frac : Math.max(0, frac);
      ctx.font = size + 'px Bungee, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = C.bolt; ctx.fillText(label, W / 2 + 4, H * 0.62 + 4);
      ctx.fillStyle = C.coin; ctx.fillText(label, W / 2, H * 0.62);
      ctx.restore();
    }
    if (state === 'play' && t < levelCardUntil) {
      const lv = L(), cw = Math.min(W - 40, 320), ch = 92, cx = (W - cw) / 2, cy = H * 0.3;
      ctx.globalAlpha = Math.min(1, (levelCardUntil - t) * 2);
      ctx.fillStyle = lv.hurdle ? HCOL[lv.hurdle] : C.bolt; roundRect(cx, cy, cw, ch, 18); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.font = '22px Bungee, Impact, sans-serif'; ctx.fillText('Level ' + level + ': ' + lv.title, W / 2, cy + 16);
      ctx.font = '600 15px Rubik, system-ui, sans-serif'; ctx.fillText(lv.tip, W / 2, cy + 50, cw - 24);
      ctx.globalAlpha = 1;
    } else if (state === 'play' && t < bannerUntil) {
      ctx.font = '600 17px Rubik, system-ui, sans-serif';
      const tw = ctx.measureText(banner).width + 28, bx = (W - tw) / 2, by = H * 0.22;
      ctx.fillStyle = bannerKind === 'good' ? C.long : C.short; roundRect(bx, by, tw, 34, 17); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(banner, W / 2, by + 17);
    }
    ctx.restore();
  }

  let last = performance.now();
  function loop(now) { const dt = Math.min(0.033, (now - last) / 1000); last = now; update(dt); draw(); requestAnimationFrame(loop); }

  cv.addEventListener('pointerdown', e => { e.preventDefault(); flap(); });
  startEl.addEventListener('pointerdown', e => { e.preventDefault(); flap(); });
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') { tell({ t: 'arcade.close' }); return; }
    if (e.target && e.target.tagName === 'INPUT') return;
    if (e.code === 'KeyF' || e.code === 'KeyX' || e.code === 'ArrowRight') { e.preventDefault(); shoot(); return; }
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      if (state === 'over') { if (!overEl.classList.contains('hidden')) begin(); } else flap();
    }
  });
  window.addEventListener('resize', () => { resize(); if (state !== 'play') reset(); });
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  if (mq.addEventListener) mq.addEventListener('change', readColors);

  // Test hook (the world's QA): end a run with a given score, level and play time, as if the coin had just been liquidated
  window.__flappy = { finish(s, l, secs) { startEl.classList.add('hidden'); state = 'play'; score = s; level = l; t = secs; endRun(false); } };
  readColors(); resize(); reset();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(readColors);
  requestAnimationFrame(loop);
})();
