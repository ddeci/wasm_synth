let audioCtx = null;
let workletNode = null;
let analyser = null;
let synthReady = false;
let pendingNotes = [];
let keyboardCaptured = false;

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const NATURAL_NOTES = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B semitone offsets

let currentOctave = 4;
let currentRoot = 0; // index into NATURAL_NOTES: 0=C, 1=D, 2=E, 3=F, 4=G, 5=A, 6=B

// Ableton-style: home row = white keys, QWERTY row = black keys
// First octave:  A=C W=C# S=D E=D# D=E F=F T=F# G=G Y=G# H=A U=A# J=B
// Second octave: K=C O=C# L=D P=D# ;=E
const WHITE_BINDS = ['a','s','d','f','g','h','j','k','l',';',"'"];
const BLACK_BINDS = ['w','e','t','y','u','o','p'];

// Build key map dynamically based on the piano layout
function buildLayout() {
  const baseNote = (currentOctave + 1) * 12 + NATURAL_NOTES[currentRoot];

  // Generate ~20 semitones of chromatic notes from baseNote
  const numSemitones = 22;
  const whites = []; // { note, name }
  const blacks = []; // { note, name, afterWhiteIndex }

  let whiteCount = 0;
  for (let s = 0; s < numSemitones; s++) {
    const note = baseNote + s;
    const name = NOTE_NAMES[note % 12];
    const isBlack = name.includes('#');
    if (isBlack) {
      blacks.push({ note, name, afterWhiteIndex: whiteCount });
    } else {
      whites.push({ note, name });
      whiteCount++;
    }
  }

  // Map keyboard binds to notes
  const keyMap = {};
  const noteToKey = {};

  whites.forEach((w, i) => {
    if (i < WHITE_BINDS.length) {
      keyMap[WHITE_BINDS[i]] = w.note;
      noteToKey[w.note] = WHITE_BINDS[i].toUpperCase();
    }
  });

  let blackBindIdx = 0;
  blacks.forEach((b) => {
    // Only assign binds to black keys that fall between bound white keys
    if (b.afterWhiteIndex > 0 && b.afterWhiteIndex <= WHITE_BINDS.length && blackBindIdx < BLACK_BINDS.length) {
      keyMap[BLACK_BINDS[blackBindIdx]] = b.note;
      noteToKey[b.note] = BLACK_BINDS[blackBindIdx].toUpperCase();
      blackBindIdx++;
    }
  });

  return { whites, blacks, keyMap, noteToKey };
}

function getNoteLabel(midiNote) {
  return NOTE_NAMES[midiNote % 12] + Math.floor(midiNote / 12 - 1);
}

const activeKeys = new Set();

let startPromise = null;
function start() {
  if (startPromise) return startPromise;
  startPromise = doStart();
  return startPromise;
}

async function doStart() {
  audioCtx = new AudioContext({ latencyHint: 'interactive' });

  const [, wasmBytes] = await Promise.all([
    audioCtx.audioWorklet.addModule('worklet.js'),
    fetch('pkg/wasm_synth_bg.wasm').then(r => r.arrayBuffer()),
  ]);

  workletNode = new AudioWorkletNode(audioCtx, 'synth-processor', {
    outputChannelCount: [1],
  });

  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 4096;
  workletNode.connect(analyser);
  analyser.connect(audioCtx.destination);

  workletNode.port.onmessage = (e) => {
    if (e.data.type === 'ready') {
      synthReady = true;
      setCaptured(true);
      syncParams();
      for (const msg of pendingNotes) {
        workletNode.port.postMessage(msg);
      }
      pendingNotes = [];
    } else if (e.data.type === 'error') {
      console.error('Synth error:', e.data.message);
    }
  };

  workletNode.port.postMessage({ type: 'init', wasmBytes });
}

function send(msg) {
  if (!workletNode) return;
  if (!synthReady) {
    pendingNotes.push(msg);
    return;
  }
  workletNode.port.postMessage(msg);
}

function syncParams() {
  document.querySelectorAll('[data-param]').forEach(el => {
    const param = parseInt(el.dataset.param);
    let value;
    if (el.classList.contains('filter-type-toggle')) {
      const active = el.querySelector('.filter-type-btn.active');
      value = active ? parseFloat(active.dataset.value) : 0;
    } else {
      value = parseFloat(el.value);
    }
    send({ type: 'param', param, value });
  });
}

function releaseAll() {
  for (const note of activeKeys) {
    send({ type: 'noteOff', note });
    highlightKey(note, false);
  }
  activeKeys.clear();
}

function setCaptured(on) {
  keyboardCaptured = on;
  const zone = document.getElementById('capture-zone');
  const label = document.getElementById('capture-label');
  zone.classList.toggle('active', on);
  label.textContent = on ? 'Keyboard captured — playing!' : 'Click here to play';
  if (!on) releaseAll();
}

function setupCapture() {
  const input = document.getElementById('capture-input');

  input.addEventListener('focus', () => {
    start();
    setCaptured(true);
  });

  input.addEventListener('blur', () => {
    setCaptured(false);
  });

  // Clear any typed text constantly so the input never fills up
  input.addEventListener('input', () => {
    input.value = '';
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.blur();
      return;
    }
    if (e.key === 'Tab') return;
    e.preventDefault();
    if (e.repeat) return;

    const key = e.key.toLowerCase();

    // Z/X for octave down/up (Ableton-style)
    if (key === 'z' || key === 'x') {
      releaseAll();
      currentOctave = Math.max(1, Math.min(7, currentOctave + (key === 'x' ? 1 : -1)));
      // Update the note grid button and selection
      const btn = document.getElementById('note-picker-btn');
      btn.textContent = `${NATURAL_NAMES[currentRoot]}${currentOctave}`;
      const grid = document.getElementById('note-grid');
      grid.querySelector('.selected')?.classList.remove('selected');
      const cell = grid.querySelector(`[data-root="${currentRoot}"][data-octave="${currentOctave}"]`);
      if (cell) cell.classList.add('selected');
      rebuildPiano();
      return;
    }

    const { keyMap } = buildLayout();
    const note = keyMap[key];
    if (note === undefined) return;

    if (activeKeys.has(note)) return;
    activeKeys.add(note);
    send({ type: 'noteOn', note, velocity: 0.8 });
    highlightKey(note, true);
  });

  input.addEventListener('keyup', (e) => {
    const { keyMap } = buildLayout();
    const note = keyMap[e.key.toLowerCase()];
    if (note === undefined) return;
    activeKeys.delete(note);
    send({ type: 'noteOff', note });
    highlightKey(note, false);
  });
}

// Piano
function rebuildPiano() {
  const piano = document.getElementById('piano');
  piano.innerHTML = '';

  const { whites, blacks, noteToKey } = buildLayout();
  const numWhites = Math.min(whites.length, WHITE_BINDS.length);

  // White keys
  whites.forEach((w, i) => {
    if (i >= WHITE_BINDS.length) return;
    const key = document.createElement('div');
    key.className = 'white-key';
    key.dataset.note = w.note;

    const bind = noteToKey[w.note] || '';
    key.innerHTML = `<span class="key-note">${getNoteLabel(w.note)}</span><span class="key-bind">${bind}</span>`;

    piano.appendChild(key);
  });

  // Black keys — position relative to white keys using percentages
  blacks.forEach((b) => {
    const bind = noteToKey[b.note];
    if (!bind) return;

    if (b.afterWhiteIndex >= numWhites) return;

    const key = document.createElement('div');
    key.className = 'black-key';
    key.dataset.note = b.note;

    key.innerHTML = `<span class="key-bind">${bind}</span>`;
    const whiteWidthPct = 100 / numWhites;
    const blackWidthPct = whiteWidthPct * 0.6;
    const leftPct = b.afterWhiteIndex * whiteWidthPct - blackWidthPct / 2;
    key.style.left = `${leftPct}%`;
    key.style.width = `${blackWidthPct}%`;

    piano.appendChild(key);
  });
}

let pianoMouseDown = false;
let pianoCurrentNote = null;

function setupPianoMouse() {
  const piano = document.getElementById('piano');

  piano.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const key = e.target.closest('.white-key, .black-key');
    if (!key) return;
    pianoMouseDown = true;
    start();
    document.getElementById('capture-input').focus();
    const note = parseInt(key.dataset.note);
    pianoCurrentNote = note;
    send({ type: 'noteOn', note, velocity: 0.8 });
    highlightKey(note, true);
  });

  piano.addEventListener('mouseover', (e) => {
    if (!pianoMouseDown) return;
    const key = e.target.closest('.white-key, .black-key');
    if (!key) return;
    const note = parseInt(key.dataset.note);
    if (note === pianoCurrentNote) return;
    if (pianoCurrentNote !== null) {
      send({ type: 'noteOff', note: pianoCurrentNote });
      highlightKey(pianoCurrentNote, false);
    }
    pianoCurrentNote = note;
    send({ type: 'noteOn', note, velocity: 0.8 });
    highlightKey(note, true);
  });

  document.addEventListener('mouseup', () => {
    if (!pianoMouseDown) return;
    pianoMouseDown = false;
    if (pianoCurrentNote !== null) {
      send({ type: 'noteOff', note: pianoCurrentNote });
      highlightKey(pianoCurrentNote, false);
      pianoCurrentNote = null;
    }
  });
}

function highlightKey(note, on) {
  const key = document.querySelector(`[data-note="${note}"]`);
  if (key) key.classList.toggle('active', on);
}

// Presets
// Param IDs:
//   0=osc1 wave, 1=osc2 wave, 2=mix, 3=detune, 4=osc2 oct, 5=noise
//   10=cutoff, 11=reso, 12=filter type
//   13=filt env amt, 14=filt A, 15=filt D, 16=filt S, 17=filt R
//   20=amp A, 21=amp D, 22=amp S, 23=amp R
//   25=lfo rate, 26=lfo amount
//   30=gain, 31=drive
// Waveforms: 0=sine, 1=saw, 2=square, 3=tri | Filter: 0=LP, 1=HP, 2=BP

function p(osc1, osc2, mix, detune, oct, noise,
           cutoff, reso, ftype,
           famt, fA, fD, fS, fR,
           aA, aD, aS, aR,
           lfoRate, lfoAmt, lfoWave, lfoTarget,
           pAmt, pA, pD, pS, pR,
           gain, drive) {
  return {
    0: osc1, 1: osc2, 2: mix, 3: detune, 4: oct, 5: noise,
    10: cutoff, 11: reso, 12: ftype,
    13: famt, 14: fA, 15: fD, 16: fS, 17: fR,
    18: pAmt, 19: pA, 40: pD, 41: pS, 42: pR,
    20: aA, 21: aD, 22: aS, 23: aR,
    25: lfoRate, 26: lfoAmt, 27: lfoWave, 28: lfoTarget,
    30: gain, 31: drive,
  };
}

const PRESET_CATEGORIES = {
  'All': null,
  'Leads': ['Classic Lead', 'Saw Lead', 'Square Lead', 'Trance Lead'],
  'Bass': ['Sub Bass', 'Analog Bass', 'Reese Bass', 'Acid Bass', '808 Bass'],
  'Pads': ['Warm Pad', 'String Pad', 'Dark Pad', 'Shimmer Pad'],
  'Keys': ['Electric Piano', 'Pluck', 'Bell', 'Organ', 'Kalimba'],
};

const PRESETS = {
  //                osc1 osc2 mix   det   oct  noise  cut   res  ft   famt  fA    fD    fS    fR    aA    aD    aS    aR    lR   lA   lW tgt  pAmt  pA    pD    pS    pR    gain  drv
  // --- LEADS ---
  'Classic Lead':  p(1,   2,   0.35, 0.08, 0,   0,     4500, 0.15,0,   0.2,  0.005,0.3,  0.4,  0.15, 0.005,0.1,  0.85, 0.15, 5.0, 0.01,0, 1,  0,    0.01, 0.1,  0, 0.1,  0.7,  0.1),
  'Saw Lead':      p(1,   1,   0.45, 0.12, 0,   0,     6000, 0.1, 0,   0.25, 0.005,0.25, 0.5,  0.2,  0.005,0.1,  0.9,  0.15, 5.5, 0.01,0, 1,  0,    0.01, 0.1,  0, 0.1,  0.7,  0.15),
  'Square Lead':   p(2,   2,   0.4,  0.06, 0,   0,     3500, 0.2, 0,   0.15, 0.005,0.2,  0.5,  0.15, 0.005,0.1,  0.85, 0.2,  5.0, 0.01,0, 1,  0,    0.01, 0.1,  0, 0.1,  0.7,  0.05),
  'Trance Lead':   p(1,   1,   0.5,  0.15, 0,   0.03,  7000, 0.12,0,   0.3,  0.005,0.4,  0.3,  0.2,  0.005,0.15, 0.85, 0.25, 5.5, 0.01,0, 1,  0,    0.01, 0.1,  0, 0.1,  0.75, 0.2),

  // --- BASS ---
  'Sub Bass':      p(0,   0,   0,    0,    0,   0,     200,  0.0, 0,   0,    0.005,0.1,  1.0,  0.1,  0.005,0.05, 1.0,  0.1,  0.1, 0,   0, 0,  0,    0.01, 0.1,  0, 0.1,  0.85, 0),
  'Analog Bass':   p(1,   2,   0.3,  0.03, 0,   0,     800,  0.25,0,   0.4,  0.005,0.25, 0.2,  0.1,  0.005,0.3,  0.75, 0.1,  0.1, 0,   0, 0,  0,    0.01, 0.1,  0, 0.1,  0.75, 0.2),
  'Reese Bass':    p(1,   1,   0.5,  0.10, 0,   0,     1200, 0.15,0,   0.1,  0.01, 0.5,  0.6,  0.2,  0.01, 0.1,  1.0,  0.15, 0.3, 0.15,0, 0,  0,    0.01, 0.1,  0, 0.1,  0.75, 0.3),
  'Acid Bass':     p(1,   2,   0.1,  0,    0,   0,     500,  0.75,0,   0.7,  0.005,0.2,  0,    0.1,  0.005,0.3,  0.6,  0.05, 0.1, 0,   0, 0,  0,    0.01, 0.1,  0, 0.1,  0.7,  0.35),
  '808 Bass':      p(0,   0,   0,    0,    0,   0,     300,  0,   0,   0,    0.005,0.1,  1.0,  0.1,  0.005,1.5,  0,    0.3,  0.1, 0,   0, 0,  0.25, 0.005,0.08, 0, 0.05, 0.85, 0.15),

  // --- PADS ---
  'Warm Pad':      p(1,   2,   0.4,  0.07, 0,   0.02,  2000, 0,   0,   0.15, 0.8,  0.5,  0.7,  1.0,  0.8,  0.3,  0.85, 1.5,  0.4, 0.1, 0, 0,  0,    0.01, 0.1,  0, 0.1,  0.6,  0.1),
  'String Pad':    p(1,   1,   0.5,  0.09, 0,   0.01,  3000, 0.05,0,   0.2,  1.0,  0.5,  0.8,  1.2,  0.6,  0.3,  0.9,  1.5,  0.3, 0.06,0, 1,  0,    0.01, 0.1,  0, 0.1,  0.6,  0.05),
  'Dark Pad':      p(2,   1,   0.35, 0.06, -1,  0.03,  800,  0.15,0,   0.1,  1.2,  1.0,  0.6,  2.0,  1.0,  0.5,  0.85, 2.0,  0.15,0.12,0, 0,  0,    0.01, 0.1,  0, 0.1,  0.6,  0.15),
  'Shimmer Pad':   p(1,   3,   0.4,  0.10, 1,   0.05,  8000, 0.1, 0,   0.2,  0.8,  0.6,  0.7,  1.5,  1.0,  0.4,  0.8,  2.0,  2.5, 0.12,1, 0,  0,    0.01, 0.1,  0, 0.1,  0.55, 0.05),

  // --- KEYS ---
  'Electric Piano': p(0,  3,   0.25, 0,    1,   0,     3500, 0.05,0,   0.3,  0.005,0.6,  0.2,  0.2,  0.005,1.5,  0.3,  0.4,  4.5, 0.04,0, 2,  0,    0.01, 0.1,  0, 0.1,  0.7,  0.1),
  'Pluck':         p(1,   3,   0.3,  0.04, 0,   0.05,  5000, 0.1, 0,   0.5,  0.005,0.15, 0,    0.1,  0.005,0.4,  0,    0.3,  0.1, 0,   0, 0,  0,    0.01, 0.1,  0, 0.1,  0.7,  0.05),
  'Bell':          p(0,   3,   0.35, 0.5,  2,   0,     6000, 0.05,0,   0.35, 0.005,0.8,  0.1,  0.5,  0.005,2.0,  0,    2.0,  0.1, 0,   0, 0,  0,    0.01, 0.1,  0, 0.1,  0.65, 0),
  'Organ':         p(0,   0,   0.4,  0,    1,   0,     4000, 0,   0,   0,    0.005,0.1,  1.0,  0.1,  0.005,0.01, 1.0,  0.01, 6.0, 0.15,0, 2,  0,    0.01, 0.1,  0, 0.1,  0.7,  0.25),
  'Kalimba':       p(0,   3,   0.2,  0.02, 2,   0.03,  4000, 0.1, 0,   0.4,  0.005,0.2,  0.05, 0.15, 0.005,0.8,  0,    0.6,  0.1, 0,   0, 0,  0,    0.01, 0.1,  0, 0.1,  0.7,  0),
};

function applyPreset(name) {
  const preset = PRESETS[name];
  if (!preset) return;

  for (const [paramStr, value] of Object.entries(preset)) {
    const param = parseInt(paramStr);
    send({ type: 'param', param, value });

    // Update the UI control to match
    const el = document.querySelector(`[data-param="${param}"]`);
    if (!el) continue;

    if (el.classList.contains('filter-type-toggle')) {
      el.querySelectorAll('.filter-type-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.value === String(value));
      });
    } else if (el.tagName === 'SELECT') {
      el.value = String(value);
    } else {
      el.value = value;
      const label = el.nextElementSibling;
      if (label) label.textContent = Number(value).toFixed(2);
    }
  }

  // Highlight active preset button
  document.querySelectorAll('.preset-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.preset === name);
  });
}

function setupPresets() {
  const container = document.getElementById('presets');

  // Category tabs
  const tabs = document.createElement('div');
  tabs.className = 'preset-tabs';
  for (const cat of Object.keys(PRESET_CATEGORIES)) {
    const tab = document.createElement('button');
    tab.className = 'preset-tab';
    tab.textContent = cat;
    if (cat === 'All') tab.classList.add('active');
    tab.addEventListener('click', () => {
      tabs.querySelectorAll('.preset-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      filterPresets(cat);
    });
    tabs.appendChild(tab);
  }
  container.appendChild(tabs);

  // Preset buttons
  const grid = document.createElement('div');
  grid.className = 'preset-grid';
  grid.id = 'preset-grid';
  for (const name of Object.keys(PRESETS)) {
    const btn = document.createElement('button');
    btn.className = 'preset-btn';
    btn.dataset.preset = name;
    btn.textContent = name;
    if (name === 'Classic Lead') btn.classList.add('active');
    btn.addEventListener('click', () => {
      start();
      applyPreset(name);
    });
    grid.appendChild(btn);
  }
  container.appendChild(grid);
}

function filterPresets(category) {
  const grid = document.getElementById('preset-grid');
  const allowed = PRESET_CATEGORIES[category];
  grid.querySelectorAll('.preset-btn').forEach(btn => {
    btn.style.display = (!allowed || allowed.includes(btn.dataset.preset)) ? '' : 'none';
  });
}

const NATURAL_NAMES = ['C','D','E','F','G','A','B'];

function setupNoteGrid() {
  const btn = document.getElementById('note-picker-btn');
  const grid = document.getElementById('note-grid');

  // Header row
  for (let oct = 1; oct <= 7; oct++) {
    const header = document.createElement('div');
    header.className = 'note-grid-header';
    header.textContent = `Oct ${oct}`;
    grid.appendChild(header);
  }

  // Note cells
  for (let ri = 0; ri < NATURAL_NAMES.length; ri++) {
    for (let oct = 1; oct <= 7; oct++) {
      const cell = document.createElement('div');
      cell.className = 'note-grid-cell';
      cell.textContent = `${NATURAL_NAMES[ri]}${oct}`;
      cell.dataset.root = ri;
      cell.dataset.octave = oct;
      if (oct === currentOctave && ri === currentRoot) cell.classList.add('selected');

      cell.addEventListener('click', (e) => {
        e.stopPropagation();
        releaseAll();
        currentRoot = ri;
        currentOctave = oct;
        grid.querySelector('.selected')?.classList.remove('selected');
        cell.classList.add('selected');
        btn.textContent = `${NATURAL_NAMES[ri]}${oct}`;
        grid.classList.remove('open');
        btn.classList.remove('open');
        rebuildPiano();
      });

      grid.appendChild(cell);
    }
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = grid.classList.toggle('open');
    btn.classList.toggle('open', isOpen);
  });

  document.addEventListener('click', () => {
    grid.classList.remove('open');
    btn.classList.remove('open');
  });
}

function init() {
  rebuildPiano();
  setupPianoMouse();
  initVisualizer();
  setupNoteGrid();
  setupCapture();
  setupPresets();
  applyPreset('Classic Lead');

  document.querySelectorAll('[data-param]').forEach(el => {
    if (el.classList.contains('filter-type-toggle')) return;
    el.addEventListener('input', () => {
      start();
      const param = parseInt(el.dataset.param);
      const value = parseFloat(el.value);
      send({ type: 'param', param, value });
      const label = el.nextElementSibling;
      if (label) label.textContent = value.toFixed(2);
    });
  });

  // Filter type toggle buttons
  document.querySelectorAll('.filter-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      start();
      const toggle = btn.closest('.filter-type-toggle');
      toggle.querySelectorAll('.filter-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const param = parseInt(toggle.dataset.param);
      const value = parseFloat(btn.dataset.value);
      send({ type: 'param', param, value });
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function initVisualizer() {
  const canvas = document.getElementById('visualizer');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const drawLen = 512;

  function draw() {
    requestAnimationFrame(draw);

    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0a0e14';
    ctx.fillRect(0, 0, w, h);

    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ff6b8a';
    ctx.beginPath();

    if (analyser) {
      const buf = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteTimeDomainData(buf);

      // Find a rising zero-crossing to stabilize the display
      let trigger = 0;
      for (let i = 1; i < buf.length - drawLen; i++) {
        if (buf[i - 1] < 128 && buf[i] >= 128) {
          trigger = i;
          break;
        }
      }

      const sliceWidth = w / drawLen;
      let x = 0;
      for (let i = 0; i < drawLen; i++) {
        const y = (buf[trigger + i] / 255) * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }
    } else {
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
    }

    ctx.stroke();
  }

  draw();
}
