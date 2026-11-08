/* PhoneDeck — local UI. Talks only to 127.0.0.1:8787. */

const API = 'http://127.0.0.1:8787';

const state = {
  devices: [],
  serial: null,
  section: 'mirror',
  mirrorArmed: false,
  mirrorPhase: 'idle',
  panelTimer: null,
  apps: null,
  filePath: '/sdcard',
  lastStartAt: 0,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

if (navigator.userAgent.includes('Electron')) {
  document.body.classList.add('electron');
}

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

function h(tag, props, ...children) {
  const node = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key === 'style') node.style.cssText = value;
      else node.setAttribute(key, value);
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function toast(message, bad = false) {
  const node = h('div', { class: `toast${bad ? ' bad' : ''}`, text: message });
  $('#toasts').append(node);
  setTimeout(() => {
    node.style.opacity = '0';
    node.style.transition = 'opacity .25s';
    setTimeout(() => node.remove(), 260);
  }, 4200);
}

async function api(path, options) {
  const response = await fetch(`${API}${path}`, {
    headers: { 'content-type': 'application/json' },
    ...options,
  });
  let data = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!response.ok) {
    throw new Error(data?.error ?? `Request failed (${response.status})`);
  }
  return data;
}

const post = (path, body) =>
  api(path, { method: 'POST', body: JSON.stringify(body ?? {}) });

/* ------------------------------------------------------------------ */
/* engine status                                                      */
/* ------------------------------------------------------------------ */

function setEngineStatus(ok, label) {
  $('#engine-dot').className = `dot ${ok ? 'ok' : 'bad'}`;
  $('#engine-label').textContent = label;
  $('#rail-dot').className = `dot rail-dot ${ok ? 'ok' : 'bad'}`;
}

async function ping() {
  try {
    const health = await api('/health');
    setEngineStatus(true, 'engine live');
    return health;
  } catch {
    setEngineStatus(false, 'engine offline');
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* devices                                                            */
/* ------------------------------------------------------------------ */

async function refreshDevices() {
  let devices = [];
  try {
    const data = await api('/devices');
    devices = data.devices ?? [];
  } catch {
    return;
  }

  state.devices = devices;

  if (state.serial && !devices.some((d) => d.serial === state.serial)) {
    state.serial = null;
    state.mirrorArmed = false;
  }

  if (!state.serial) {
    const ready = devices.filter((device) => device.state === 'device');
    const preferred = ready.find((device) => device.mdns) ?? ready[0];
    if (preferred) selectDevice(preferred.serial);
  }

  renderDeviceList();
  renderTitlebarDevice();
  renderRailState();
  maybeStartMirror();
}

function selectDevice(serial) {
  if (state.serial === serial) return;
  state.serial = serial;
  state.mirrorArmed = true;
  state.mirrorPhase = 'idle';
  state.apps = null;
  $('#mirror-serial').textContent = serial;
  showMirror();
  if (state.section !== 'mirror') renderPanel();
  startMirror();
}

function maybeStartMirror() {
  if (!state.serial) return;
  if (!state.mirrorArmed) return;

  const device = state.devices.find((entry) => entry.serial === state.serial);
  if (!device || device.state !== 'device') {
    if (state.mirrorPhase !== 'streaming') {
      state.mirrorPhase = 'offline';
      setVeil('Phone offline', 'Turn Wireless debugging on, or plug the USB cable back in.');
    }
    return;
  }

  if (state.mirrorPhase === 'starting' || state.mirrorPhase === 'streaming') return;
  if (Date.now() - state.lastStartAt < 8000) return;
  startMirror();
}

function renderDeviceList() {
  const list = $('#device-list');
  list.textContent = '';

  if (!state.devices.length) {
    list.append(
      h(
        'p',
        { class: 'empty' },
        'Nothing yet. Pair the phone above, or connect it with a USB cable.',
      ),
    );
    return;
  }

  for (const device of state.devices) {
    const ready = device.state === 'device';
    list.append(
      h(
        'div',
        { class: 'device-row' },
        h('span', { class: `dot ${ready ? 'ok' : ''}` }),
        h(
          'div',
          { class: 'grow' },
          h('div', { class: 'name', text: device.model ?? device.serial }),
          h('div', { class: 'sub', text: `${device.serial} · ${device.state}` }),
        ),
        h('button', {
          class: 'btn btn-ghost use',
          text: ready ? 'Use' : 'Unavailable',
          onclick: () => {
            if (!ready) return;
            selectDevice(device.serial);
          },
        }),
      ),
    );
  }
}

function renderTitlebarDevice() {
  const box = $('#titlebar-device');
  if (!state.serial) {
    box.hidden = true;
    return;
  }
  const device = state.devices.find((d) => d.serial === state.serial);
  box.hidden = false;
  $('#device-name').textContent = device?.model ?? 'Android device';
  $('#device-serial').textContent = state.serial;
}

/* ------------------------------------------------------------------ */
/* navigation                                                         */
/* ------------------------------------------------------------------ */

function setSection(section) {
  state.section = section;

  for (const item of $$('.rail-item')) {
    item.classList.toggle('is-active', item.dataset.section === section);
  }

  const panel = $('#panel');
  if (section === 'mirror' || !state.serial) {
    panel.hidden = true;
    clearPanelTimer();
    return;
  }

  panel.hidden = false;
  renderPanel();
}

function renderRailState() {
  for (const item of $$('.rail-item')) {
    const section = item.dataset.section;
    item.disabled = !state.serial && section !== 'mirror';
  }
}

function clearPanelTimer() {
  if (state.panelTimer) {
    clearInterval(state.panelTimer);
    state.panelTimer = null;
  }
}

const panelTitles = {
  notifications: 'Notifications',
  apps: 'Apps',
  files: 'Files',
  device: 'Device',
};

function renderPanel() {
  const section = state.section;
  if (section === 'mirror') return;

  $('#panel-title').textContent = panelTitles[section] ?? section;
  $('#panel-body').textContent = '';
  clearPanelTimer();

  if (!state.serial) {
    $('#panel-body').append(
      h('p', { class: 'panel-empty', text: 'Connect a phone first.' }),
    );
    return;
  }

  if (section === 'notifications') renderNotifications();
  else if (section === 'apps') renderApps();
  else if (section === 'files') renderFiles();
  else if (section === 'device') renderDevice();
}

/* ------------------------------------------------------------------ */
/* notifications                                                      */
/* ------------------------------------------------------------------ */

async function renderNotifications() {
  const body = $('#panel-body');
  body.textContent = '';
  body.append(h('p', { class: 'panel-empty', text: 'Reading notifications…' }));

  try {
    const data = await api(`/notifications?serial=${encodeURIComponent(state.serial)}`);
    body.textContent = '';
    const items = data.notifications ?? [];

    if (!items.length) {
      body.append(h('p', { class: 'panel-empty', text: 'No active notifications right now.' }));
    } else {
      for (const item of items) {
        const pkg = item.pkg ?? '';
        const name = item.title || pkg;
        body.append(
          h(
            'div',
            { class: 'row' },
            h('div', { class: 'avatar accent', text: (name[0] ?? '?').toUpperCase() }),
            h(
              'div',
              { class: 'grow' },
              h(
                'div',
                { class: 'row-head' },
                h('span', { class: 'title', text: name }),
                h('span', { class: 'sub', text: pkg.split('.').pop() }),
              ),
              item.text ? h('div', { class: 'text', text: item.text }) : null,
            ),
          ),
        );
      }
    }
  } catch (error) {
    body.textContent = '';
    body.append(h('p', { class: 'panel-empty', text: String(error.message ?? error) }));
  }

  state.panelTimer = setInterval(() => {
    if (state.section === 'notifications' && !document.hidden) renderNotifications();
  }, 5000);
}

/* ------------------------------------------------------------------ */
/* apps                                                               */
/* ------------------------------------------------------------------ */

async function renderApps() {
  const body = $('#panel-body');
  body.textContent = '';

  const search = h('input', { placeholder: 'Search installed apps', spellcheck: 'false' });
  body.append(h('div', { class: 'search' }, search));

  const list = h('div');
  body.append(list);

  const draw = (query) => {
    list.textContent = '';
    const apps = state.apps ?? [];
    if (!apps.length) {
      list.append(h('p', { class: 'panel-empty', text: 'No apps found.' }));
      return;
    }
    const needle = query.trim().toLowerCase();
    const visible = needle
      ? apps.filter(
          (app) =>
            app.label.toLowerCase().includes(needle) ||
            app.package.toLowerCase().includes(needle),
        )
      : apps;

    if (!visible.length) {
      list.append(h('p', { class: 'panel-empty', text: 'No matching apps.' }));
      return;
    }

    for (const app of visible.slice(0, 400)) {
      list.append(
        h(
          'div',
          {
            class: 'row clickable',
            onclick: async () => {
              try {
                await post('/apps/launch', { serial: state.serial, package: app.package });
                toast(`Opening ${app.label}…`);
              } catch (error) {
                toast(String(error.message ?? error), true);
              }
            },
          },
          h('div', { class: 'avatar accent', text: (app.label[0] ?? '?').toUpperCase() }),
          h(
            'div',
            { class: 'grow' },
            h('div', { class: 'title', text: app.label }),
            h('div', { class: 'sub', text: app.package }),
          ),
          h('span', { class: 'sub', text: '▶' }),
        ),
      );
    }
  };

  if (state.apps) {
    draw('');
  } else {
    list.append(h('p', { class: 'panel-empty', text: 'Loading apps…' }));
    try {
      const data = await api(`/apps?serial=${encodeURIComponent(state.serial)}`);
      state.apps = data.apps ?? [];
      draw('');
    } catch (error) {
      list.textContent = '';
      list.append(h('p', { class: 'panel-empty', text: String(error.message ?? error) }));
    }
  }

  search.addEventListener('input', () => draw(search.value));
  setTimeout(() => search.focus(), 40);
}

/* ------------------------------------------------------------------ */
/* files                                                              */
/* ------------------------------------------------------------------ */

async function renderFiles(path) {
  const body = $('#panel-body');
  const target = path ?? state.filePath;
  body.textContent = '';

  const bar = h(
    'div',
    { class: 'path', title: target },
    target,
  );
  body.append(bar);

  try {
    const data = await api(
      `/files?serial=${encodeURIComponent(state.serial)}&path=${encodeURIComponent(target)}`,
    );
    state.filePath = target;
    const entries = data.entries ?? [];

    if (!entries.length) {
      body.append(h('p', { class: 'panel-empty', text: 'Empty folder.' }));
      return;
    }

    for (const entry of entries) {
      const isDir = entry.dir;
      body.append(
        h(
          'div',
          {
            class: `row${isDir ? ' clickable' : ''}`,
            onclick: isDir
              ? () => renderFiles(target.endsWith('/') ? `${target}${entry.name}` : `${target}/${entry.name}`)
              : null,
          },
          folderIcon(isDir),
          h('div', { class: 'grow' }, h('div', { class: 'title', text: entry.name })),
          isDir ? h('span', { class: 'sub', text: '›' }) : null,
        ),
      );
    }
  } catch (error) {
    body.append(h('p', { class: 'panel-empty', text: String(error.message ?? error) }));
  }
}

function folderIcon(isDir) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', `file-icon${isDir ? ' dir' : ''}`);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute(
    'd',
    isDir
      ? 'M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2.4h8A1.5 1.5 0 0 1 20.5 10v7.5A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5Z'
      : 'M6 3.5h7L18.5 9v11.5h-12Z M12.5 3.5V9h6',
  );
  svg.append(path);
  return svg;
}

function filesUp() {
  const current = state.filePath;
  if (!current || current === '/') return;
  const index = current.lastIndexOf('/');
  renderFiles(index <= 0 ? '/' : current.slice(0, index));
}

/* ------------------------------------------------------------------ */
/* device                                                             */
/* ------------------------------------------------------------------ */

async function renderDevice() {
  const body = $('#panel-body');
  body.textContent = '';
  const wrap = h('div', { class: 'panel-pad' });
  body.append(wrap);
  wrap.append(h('p', { class: 'panel-empty', text: 'Reading device…' }));

  let info = null;
  try {
    info = await api(`/info?serial=${encodeURIComponent(state.serial)}`);
  } catch {
    info = null;
  }

  wrap.textContent = '';
  const device = state.devices.find((d) => d.serial === state.serial);

  wrap.append(
    h('div', { class: 'name', text: info?.model || device?.model || state.serial }),
    h('div', { class: 'sub', text: state.serial }),
    h('div', { style: 'height:14px' }),
    kv('Android', info?.android || '—'),
    kv('Resolution', info?.width ? `${info.width} × ${info.height}` : '—'),
    kv('Battery', info?.battery == null ? '—' : `${info.battery}%`),
    h('div', { class: 'divider' }),
    h('div', { class: 'label', text: 'Stream quality' }),
    h('div', { style: 'height:8px' }),
  );

  for (const preset of [
    ['Light', 960, 4, 30],
    ['Balanced', 1280, 8, 60],
    ['Sharp', 1920, 16, 60],
  ]) {
    wrap.append(
      h(
        'button',
        {
          class: 'btn',
          onclick: () => applyQuality(preset[1], preset[2], preset[3], preset[0]),
        },
        h('span', { text: preset[0] }),
        h('span', { class: 'spacer' }),
        h('span', { class: 'sub', text: `${preset[1]} px · ${preset[2]} Mbps` }),
      ),
    );
  }

  wrap.append(
    h('div', { style: 'height:10px' }),
    h('button', { class: 'btn', text: 'Restart stream', onclick: () => restartMirror() }),
    h('button', {
      class: 'btn',
      text: 'Stop stream',
      onclick: () => stopMirror(),
    }),
    h('button', {
      class: 'btn btn-danger',
      style: 'width:100%;margin-top:8px;padding:11px',
      text: 'Disconnect device',
      onclick: () => disconnect(),
    }),
  );
}

function kv(label, value) {
  return h('div', { class: 'kv' }, h('b', { text: label }), h('span', { text: value }));
}

/* ------------------------------------------------------------------ */
/* mirror lifecycle                                                   */
/* ------------------------------------------------------------------ */

async function startMirror() {
  if (!state.serial) return;
  state.mirrorPhase = 'starting';
  state.lastStartAt = Date.now();
  setVeil('Connecting to phone', 'Starting the stream…');
  try {
    const result = await post('/mirror/start', {
      serial: state.serial,
      maxSize: 1280,
      bitRateMbps: 8,
      maxFps: 60,
    });
    if (result?.serial && result.serial !== state.serial) {
      state.serial = result.serial;
      $('#mirror-serial').textContent = result.serial;
      renderTitlebarDevice();
    }
  } catch (error) {
    state.mirrorPhase = 'error';
    toast(String(error.message ?? error), true);
    setVeil('Connection failed', String(error.message ?? error));
  }
}

async function restartMirror() {
  state.mirrorArmed = true;
  try {
    await post('/mirror/stop', {});
  } catch {
    /* ignore */
  }
  state.mirrorPhase = 'idle';
  resetDecoder();
  await startMirror();
}

async function stopMirror() {
  state.mirrorArmed = false;
  state.mirrorPhase = 'idle';
  resetDecoder();
  try {
    await post('/mirror/stop', {});
  } catch (error) {
    toast(String(error.message ?? error), true);
  }
  setVeil('Not streaming', 'Press Restart stream to resume.');
}

async function applyQuality(maxSize, bitRateMbps, maxFps, label) {
  if (!state.serial) return;
  toast(`Quality: ${label}`);
  try {
    await post('/mirror/stop', {});
  } catch {
    /* ignore */
  }
  resetDecoder();
  state.mirrorPhase = 'idle';
  state.mirrorArmed = true;
  try {
    await post('/mirror/start', { serial: state.serial, maxSize, bitRateMbps, maxFps });
  } catch (error) {
    toast(String(error.message ?? error), true);
  }
}

async function disconnect() {
  if (!state.serial) return;
  const serial = state.serial;
  try {
    await post('/mirror/stop', {});
    await post('/disconnect', { address: serial });
  } catch {
    /* ignore */
  }
  resetDecoder();
  state.serial = null;
  state.mirrorArmed = false;
  state.mirrorPhase = 'idle';
  state.apps = null;
  clearPanelTimer();
  $('#panel').hidden = true;
  showConnect();
  await refreshDevices();
}

/* ------------------------------------------------------------------ */
/* video                                                              */
/* ------------------------------------------------------------------ */

const canvas = $('#screen');
const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });

let socket = null;
let decoder = null;
let configured = false;
let decoderConfigBytes = null;
let sawKeyframe = false;
let timestamp = 0;
let frames = 0;
let lastFpsAt = performance.now();
let resetRequestedAt = 0;
let pressed = false;

function connectSocket() {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  socket = new WebSocket(`${protocol}://${location.host}/ws`);
  socket.binaryType = 'arraybuffer';

  socket.addEventListener('open', () => {
    if (state.mirrorPhase === 'idle') state.mirrorPhase = 'idle';
  });

  socket.addEventListener('close', () => {
    setVeil('Reconnecting', 'Engine connection lost…');
    setTimeout(connectSocket, 900);
  });

  socket.addEventListener('message', (event) => {
    if (event.data instanceof ArrayBuffer) {
      onPacket(new Uint8Array(event.data));
      return;
    }
    try {
      onControl(JSON.parse(event.data));
    } catch {
      /* ignore */
    }
  });
}

function onControl(message) {
  switch (message.type) {
    case 'state':
      state.mirrorPhase = message.state;
      $('#hud-state').textContent = message.state;
      if (message.state === 'idle') setVeil('Not streaming', 'Press Restart stream to resume.');
      break;
    case 'log':
      $('#veil-sub').textContent = message.message;
      break;
    case 'meta':
      state.mirrorPhase = 'streaming';
      $('#hud-state').textContent = 'streaming';
      break;
    case 'error':
      state.mirrorPhase = 'error';
      $('#hud-state').textContent = 'error';
      setVeil('Connection problem', message.message ?? 'Unknown error');
      break;
    case 'warn':
      console.warn('[engine]', message.message);
      break;
    default:
      break;
  }
}

function setVeil(title, subtitle) {
  $('#veil-title').textContent = title;
  $('#veil-sub').textContent = subtitle ?? '';
  $('#veil').classList.remove('gone');
}

function hideVeil() {
  $('#veil').classList.add('gone');
}

function resetDecoder() {
  try {
    decoder?.close();
  } catch {
    /* ignore */
  }
  decoder = null;
  configured = false;
  decoderConfigBytes = null;
  sawKeyframe = false;
  canvas.classList.add('hidden');
}

function onPacket(bytes) {
  const kind = bytes[0];
  const isKey = bytes[1] === 1;
  const payload = bytes.subarray(2);

  if (kind === 0) {
    configureDecoder(payload);
    return;
  }

  if (!decoder || !configured) {
    requestReset();
    return;
  }

  if (!sawKeyframe && !isKey) {
    requestReset();
    return;
  }

  if (isKey) sawKeyframe = true;

  if (!isKey && decoder.decodeQueueSize > 12) return;

  try {
    timestamp += 1000;
    // Chromium needs the SPS/PPS in front of the keyframe: scrcpy sends them
    // once, ahead of the stream, not in-band.
    let data = payload;
    if (isKey && decoderConfigBytes?.length) {
      data = new Uint8Array(decoderConfigBytes.length + payload.length);
      data.set(decoderConfigBytes, 0);
      data.set(payload, decoderConfigBytes.length);
    }
    decoder.decode(
      new EncodedVideoChunk({
        type: isKey ? 'key' : 'delta',
        timestamp,
        data,
      }),
    );
  } catch (error) {
    console.warn('decode failed', error);
  }
}

function configureDecoder(configBytes) {
  const codec = codecString(configBytes);
  decoderConfigBytes = configBytes.slice();
  try {
    decoder?.close();
  } catch {
    /* ignore */
  }

  decoder = new VideoDecoder({
    output: drawFrame,
    error: (error) => {
      console.warn('decoder error', error);
      requestReset();
    },
  });

  decoder.configure({
    codec,
    avc: { format: 'annexb' },
    optimizeForLatency: true,
    hardwareAcceleration: 'prefer-hardware',
  });

  configured = true;
  sawKeyframe = false;
}

function drawFrame(frame) {
  if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
    canvas.width = frame.displayWidth;
    canvas.height = frame.displayHeight;
    fitStage();
  }
  ctx.drawImage(frame, 0, 0);
  frame.close();

  frames += 1;
  if (sawKeyframe) {
    canvas.classList.remove('hidden');
    hideVeil();
  }

  const now = performance.now();
  if (now - lastFpsAt >= 500) {
    $('#hud-fps').textContent = `${Math.round((frames * 1000) / (now - lastFpsAt))} fps`;
    frames = 0;
    lastFpsAt = now;
  }
}

/**
 * The canvas keeps the phone's own aspect ratio (it flips on rotation), so its
 * CSS size is computed from the stage instead of relying on max-width alone.
 */
function fitStage() {
  const stage = canvas.parentElement;
  if (!stage) return;
  const rect = stage.getBoundingClientRect();
  const sourceWidth = canvas.width || 1;
  const sourceHeight = canvas.height || 1;
  if (!rect.width || !rect.height) return;
  const scale = Math.min((rect.width - 28) / sourceWidth, (rect.height - 28) / sourceHeight);
  const fit = Math.max(0.01, scale);
  canvas.style.width = `${Math.max(1, Math.floor(sourceWidth * fit))}px`;
  canvas.style.height = `${Math.max(1, Math.floor(sourceHeight * fit))}px`;
}

window.addEventListener('resize', fitStage);
if (typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(fitStage).observe(canvas.parentElement);
}

function codecString(data) {
  for (let i = 3; i + 3 < data.length; i += 1) {
    if (data[i] === 0x67 && data[i - 1] === 1 && data[i - 2] === 0 && data[i - 3] === 0) {
      const hex = (n) => n.toString(16).padStart(2, '0');
      return `avc1.${hex(data[i + 1])}${hex(data[i + 2])}${hex(data[i + 3])}`;
    }
  }
  return 'avc1.42E01E';
}

function requestReset() {
  const now = performance.now();
  if (now - resetRequestedAt < 1200) return;
  resetRequestedAt = now;
  send({ t: 'action', name: 'reset-video' });
}

/* ------------------------------------------------------------------ */
/* input                                                              */
/* ------------------------------------------------------------------ */

function send(message) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function toPoint(event) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return {
    x: Math.max(0, Math.min(canvas.width - 1, ((event.clientX - rect.left) / rect.width) * canvas.width)),
    y: Math.max(0, Math.min(canvas.height - 1, ((event.clientY - rect.top) / rect.height) * canvas.height)),
  };
}

function sendTouch(action, event) {
  const point = toPoint(event);
  if (!point) return;
  send({ t: 'touch', action, x: point.x, y: point.y, vw: canvas.width, vh: canvas.height });
}

canvas.addEventListener('pointerdown', (event) => {
  canvas.focus();
  if (event.button === 2) {
    send({ t: 'key', code: 4 });
    return;
  }
  if (event.button !== 0) return;
  pressed = true;
  canvas.setPointerCapture(event.pointerId);
  sendTouch('down', event);
});

canvas.addEventListener('pointermove', (event) => {
  if (pressed) sendTouch('move', event);
});

const release = (event) => {
  if (!pressed) return;
  pressed = false;
  sendTouch('up', event);
};

canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);

canvas.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault();
    const point = toPoint(event);
    if (!point) return;
    send({
      t: 'scroll',
      x: point.x,
      y: point.y,
      vw: canvas.width,
      vh: canvas.height,
      dx: Math.max(-1, Math.min(1, event.deltaX / 120)),
      dy: Math.max(-1, Math.min(1, event.deltaY / 120)),
    });
  },
  { passive: false },
);

const SPECIAL_KEYS = {
  Enter: 66,
  Backspace: 67,
  Tab: 61,
  Escape: 111,
  Delete: 112,
  ArrowUp: 19,
  ArrowDown: 20,
  ArrowLeft: 21,
  ArrowRight: 22,
  Home: 122,
  End: 123,
  PageUp: 92,
  PageDown: 93,
  Insert: 124,
};

canvas.addEventListener('keydown', (event) => {
  if (event.key === ' ') {
    event.preventDefault();
    send({ t: 'key', code: 62 });
    return;
  }

  const special = SPECIAL_KEYS[event.key];
  if (special) {
    event.preventDefault();
    send({ t: 'key', code: special });
    return;
  }

  if ((event.ctrlKey || event.metaKey) && /^[a-zA-Z]$/.test(event.key)) {
    event.preventDefault();
    send({ t: 'key', code: 29 + (event.key.toUpperCase().charCodeAt(0) - 65), meta: 4096 });
    return;
  }

  if (event.key.length === 1) {
    event.preventDefault();
    send({ t: 'text', text: event.key });
  }
});

canvas.addEventListener('contextmenu', (event) => event.preventDefault());

/* ------------------------------------------------------------------ */
/* screens                                                             */
/* ------------------------------------------------------------------ */

function showConnect() {
  $('#connect').hidden = false;
  $('#mirror').hidden = true;
}

function showMirror() {
  $('#connect').hidden = true;
  $('#mirror').hidden = false;
}

/* ------------------------------------------------------------------ */
/* wiring                                                             */
/* ------------------------------------------------------------------ */

for (const item of $$('.rail-item')) {
  item.addEventListener('click', () => setSection(item.dataset.section));
}

$('#btn-rescan').addEventListener('click', async () => {
  await refreshDevices();
  toast('Scanned for devices');
});

let discoveredPairingAddress = '';

async function refreshDiscover() {
  try {
    const data = await api('/discover');
    const pairing = data.pairing ?? [];
    const connect = data.connect ?? [];
    const box = $('#pair-detect');
    const text = $('#pair-detect-text');

    if (pairing.length) {
      discoveredPairingAddress = `${pairing[0].host}:${pairing[0].port}`;
      box.classList.add('found');
      text.textContent = `Found the phone at ${discoveredPairingAddress}`;
      return;
    }

    discoveredPairingAddress = '';
    box.classList.remove('found');

    if (connect.length) {
      text.textContent = `Phone found at ${connect[0].host}:${connect[0].port} — connecting…`;
      autoConnect();
      return;
    }

    text.textContent =
      'Not seeing the phone. Turn on Wireless debugging, or plug in a USB cable once.';
  } catch {
    /* engine not ready yet */
  }
}

let lastAutoConnectAt = 0;

async function autoConnect() {
  if (state.serial) return;
  if (Date.now() - lastAutoConnectAt < 9000) return;
  lastAutoConnectAt = Date.now();
  try {
    const result = await post('/reconnect', {});
    if (result.connected) await refreshDevices();
  } catch {
    /* next tick retries */
  }
}

$('#btn-usb').addEventListener('click', async () => {
  const button = $('#btn-usb');
  const status = $('#usb-status');
  button.disabled = true;
  button.textContent = 'Working…';
  status.textContent = 'Looking for the USB device…';
  try {
    const result = await post('/setup/usb', {});
    status.textContent = `Now on Wi-Fi at ${result.address} — you can unplug the cable.`;
    toast('Connected over Wi-Fi');
    await refreshDevices();
  } catch (error) {
    status.textContent = String(error.message ?? error);
    toast(String(error.message ?? error), true);
  } finally {
    button.disabled = false;
    button.textContent = 'Set up over USB';
  }
});

$('#btn-pair').addEventListener('click', async () => {
  const code = $('#pair-code').value.trim();
  if (!/^\d{4,8}$/.test(code)) {
    toast('Enter the 6-digit code shown on the phone', true);
    return;
  }

  const manual = $('#pair-address').value.trim();
  const button = $('#btn-pair');
  button.disabled = true;
  button.textContent = 'Pairing…';

  try {
    const result = await post('/pair', {
      code,
      address: manual || discoveredPairingAddress || '',
    });
    $('#pair-code').value = '';
    toast(`Connected to ${result.address}`);
    await refreshDevices();
  } catch (error) {
    toast(String(error.message ?? error), true);
  } finally {
    button.disabled = false;
    button.textContent = 'Pair';
  }
});

$('#pair-code').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') $('#btn-pair').click();
});

$('#btn-reconnect').addEventListener('click', async () => {
  const button = $('#btn-reconnect');
  button.disabled = true;
  try {
    const result = await post('/reconnect', {});
    if (!result.connected) {
      toast('No phone answered. Check that Wireless debugging is on.', true);
      return;
    }
    toast(`Reconnected to ${result.address}`);
    await refreshDevices();
  } catch (error) {
    toast(String(error.message ?? error), true);
  } finally {
    button.disabled = false;
  }
});

$('#btn-connect').addEventListener('click', async () => {
  const address = $('#connect-address').value.trim();
  if (!address) {
    toast('Enter the phone IP:port', true);
    return;
  }
  const button = $('#btn-connect');
  button.disabled = true;
  button.textContent = 'Connecting…';
  try {
    await post('/connect', { address });
    toast('Connected');
    await refreshDevices();
  } catch (error) {
    toast(String(error.message ?? error), true);
  } finally {
    button.disabled = false;
    button.textContent = 'Connect to address';
  }
});

$('#btn-disconnect').addEventListener('click', () => disconnect());
$('#btn-stop').addEventListener('click', () => stopMirror());
$('#btn-restart').addEventListener('click', () => restartMirror());
$('#panel-refresh').addEventListener('click', () => {
  if (state.section === 'apps') state.apps = null;
  renderPanel();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    $('#quality-menu').hidden = true;
  }
});

for (const control of $$('.ctrl[data-action]')) {
  control.addEventListener('click', async () => {
    if (!state.serial) return;
    try {
      await post('/action', { serial: state.serial, name: control.dataset.action });
    } catch (error) {
      toast(String(error.message ?? error), true);
    }
  });
}

$('#btn-shot').addEventListener('click', async () => {
  if (!state.serial) return;
  try {
    const response = await fetch(`${API}/screenshot?serial=${encodeURIComponent(state.serial)}`);
    if (!response.ok) throw new Error('Screenshot failed');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const link = h('a', { href: url, download: `phonedeck-${stamp}.png` });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('Screenshot saved to Downloads');
  } catch (error) {
    toast(String(error.message ?? error), true);
  }
});

$('#btn-quality').addEventListener('click', (event) => {
  event.stopPropagation();
  const menu = $('#quality-menu');
  menu.hidden = !menu.hidden;
});

document.addEventListener('click', (event) => {
  const menu = $('#quality-menu');
  if (!menu.hidden && !event.target.closest('.quality')) menu.hidden = true;
});

for (const option of $$('#quality-menu button')) {
  option.addEventListener('click', () => {
    $('#quality-menu').hidden = true;
    applyQuality(
      Number(option.dataset.size),
      Number(option.dataset.rate),
      Number(option.dataset.fps),
      option.querySelector('b').textContent,
    );
  });
}

/* ------------------------------------------------------------------ */

async function boot() {
  resetDecoder();
  showConnect();
  setVeil('Waiting for phone', 'Connect a device to begin.');

  const health = await ping();
  if (!health) {
    setEngineStatus(false, 'engine offline');
    toast('Engine is not running. Start it with start-engine.cmd', true);
    return;
  }

  connectSocket();
  await refreshDevices();

  if (!state.serial) {
    try {
      const result = await post('/reconnect', {});
      if (result.connected) await refreshDevices();
    } catch {
      /* nothing saved yet */
    }
  }

  await refreshDiscover();
  setInterval(refreshDevices, 3000);
  setInterval(() => {
    if (!state.serial) refreshDiscover();
  }, 4000);
}

boot();
