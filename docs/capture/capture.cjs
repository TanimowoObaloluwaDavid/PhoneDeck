/*
 * Capture harness: renders the real PhoneDeck UI with mocked data and a
 * painted demo screen, then saves PNGs into docs/assets.
 *
 *   node_modules\.bin\electron docs\capture\capture.cjs
 */
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');

const ROOT = path.resolve(__dirname, '..', '..');
const PUBLIC = path.join(ROOT, 'engine', 'public');
const OUT = path.join(ROOT, 'docs', 'assets');
const DEMO = fs.readFileSync(path.join(__dirname, 'demo.js'), 'utf8');

const MIME = {
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.html': 'text/html',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const file =
      url.pathname === '/'
        ? path.join(PUBLIC, 'index.html')
        : path.join(PUBLIC, path.normalize(url.pathname).replace(/^([/\\])+/, '').replace(/^static[/\\]/, ''));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file)) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.disableHardwareAcceleration();
app.setPath('userData', path.join(os.tmpdir(), 'phonedeck-capture'));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let latestFrame = null;

async function shoot(win, name) {
  win.webContents.invalidate();
  await sleep(450);
  if (!latestFrame) throw new Error('no rendered frame');
  const file = path.join(OUT, name);
  fs.writeFileSync(file, latestFrame.toPNG());
  console.log('saved', file, latestFrame.getSize());
}

async function click(win, selector) {
  await win.webContents.executeJavaScript(
    `document.querySelector(${JSON.stringify(selector)})?.click(); 'ok'`,
  );
  await sleep(1100);
}

app.whenReady().then(async () => {
  console.log('ready');
  fs.mkdirSync(OUT, { recursive: true });

  const server = await startServer();
  const { port } = server.address();
  console.log('serving on', port);

  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    frame: false,
    show: false,
    backgroundColor: '#0a0c0f',
    webPreferences: {
      offscreen: true,
      contextIsolation: false,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  win.webContents.setFrameRate(30);
  win.webContents.on('paint', (_event, _dirty, image) => {
    latestFrame = image;
  });
  win.webContents.on('console-message', (_event, level, message) => {
    console.log(`page[${level}]`, message);
  });
  win.webContents.on('did-fail-load', (_event, code, description) => {
    console.error('did-fail-load', code, description);
  });

  await win.loadURL(`http://127.0.0.1:${port}/`);
  console.log('loaded', win.webContents.getURL());
  await sleep(1800);
  await win.webContents.executeJavaScript(DEMO);
  console.log('demo painted');
  await sleep(900);

  await shoot(win, 'screenshot-mirror.png');

  await click(win, '[data-section="notifications"]');
  await shoot(win, 'screenshot-notifications.png');

  await click(win, '[data-section="apps"]');
  await shoot(win, 'screenshot-apps.png');

  await click(win, '[data-section="files"]');
  await shoot(win, 'screenshot-files.png');

  await click(win, '[data-section="device"]');
  await shoot(win, 'screenshot-device.png');

  server.close();
  app.quit();
}).catch((error) => {
  console.error('capture failed', error);
  app.exit(1);
});

setTimeout(() => {
  console.error('watchdog: still running, exiting');
  app.exit(2);
}, 45000);
