/* Mock backend for the screenshot harness. Runs in the page's JS world. */
const DEVICE = {
  serial: 'pixel-8-pro._adb-tls-connect._tcp',
  state: 'device',
  model: 'Pixel 8 Pro',
  product: 'husky',
  device: 'husky',
  mdns: true,
  wireless: false,
};

const json = (data) =>
  Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(data)),
    json: () => Promise.resolve(data),
  });

const NOTIFICATIONS = [
  { title: 'Aurora Mail', text: 'Weekly design digest — 3 new replies in “Q4 roadmap”.', pkg: 'com.aurora.mail' },
  { title: 'Nimbus Drive', text: 'Backup finished · 1,284 photos synced', pkg: 'com.nimbus.drive' },
  { title: 'Pulse', text: 'Morning run complete — 5.2 km in 27:41', pkg: 'com.pulse.fitness' },
  { title: 'Calendar', text: 'Standup in 10 minutes · Studio B', pkg: 'com.android.calendar' },
  { title: 'Podcasts', text: 'New episode from The Local Loop', pkg: 'com.local.podcasts' },
];

const APPS = [
  ['Camera', 'com.android.camera'],
  ['Clock', 'com.android.deskclock'],
  ['Files', 'com.android.documentsui'],
  ['Gallery', 'com.android.gallery'],
  ['Maps', 'com.maps.app'],
  ['Messages', 'com.messages.app'],
  ['Music', 'com.music.player'],
  ['Notes', 'com.notes.app'],
  ['Photos', 'com.photos.app'],
  ['Podcasts', 'com.local.podcasts'],
  ['Recorder', 'com.recorder.app'],
  ['Settings', 'com.android.settings'],
  ['Wallet', 'com.wallet.app'],
  ['Weather', 'com.weather.app'],
].map(([label, pkg]) => ({ label, package: pkg }));

const FILES = {
  path: '/sdcard',
  entries: [
    { name: 'Android', dir: true },
    { name: 'DCIM', dir: true },
    { name: 'Download', dir: true },
    { name: 'Movies', dir: true },
    { name: 'Music', dir: true },
    { name: 'Pictures', dir: true },
    { name: 'Podcasts', dir: true },
    { name: 'notes.txt', dir: false },
    { name: 'recording.m4a', dir: false },
  ],
};

window.fetch = (url) => {
  const target = String(url);
  if (target.includes('/health')) return json({ ok: true, port: 8787 });
  if (target.includes('/devices')) return json({ devices: [DEVICE] });
  if (target.includes('/mirror/state')) return json({ state: 'streaming', meta: { width: 592, height: 1280 }, serial: DEVICE.serial });
  if (target.includes('/discover')) return json({ pairing: [], connect: [] });
  if (target.includes('/notifications')) return json({ notifications: NOTIFICATIONS });
  if (target.includes('/apps')) return json({ apps: APPS });
  if (target.includes('/files')) return json(FILES);
  if (target.includes('/info')) {
    return json({ model: 'Pixel 8 Pro', android: '15', width: 1344, height: 2992, battery: 78 });
  }
  return json({ ok: true, serial: DEVICE.serial });
};

class MockSocket {
  constructor() {
    this.readyState = 1;
    this.binaryType = 'arraybuffer';
    this.listeners = {};
    setTimeout(() => {
      this.emit('open', {});
      setTimeout(() => {
        this.emit('message', {
          data: JSON.stringify({
            type: 'meta',
            serial: DEVICE.serial,
            width: 592,
            height: 1280,
            codec: 'h264',
          }),
        });
      }, 150);
    }, 30);
  }

  addEventListener(type, handler) {
    (this.listeners[type] ||= []).push(handler);
  }

  removeEventListener(type, handler) {
    this.listeners[type] = (this.listeners[type] || []).filter((fn) => fn !== handler);
  }

  emit(type, event) {
    for (const handler of this.listeners[type] || []) handler(event);
  }

  send() {}

  close() {
    this.readyState = 3;
    this.emit('close', {});
  }
}

MockSocket.OPEN = 1;
window.WebSocket = MockSocket;
