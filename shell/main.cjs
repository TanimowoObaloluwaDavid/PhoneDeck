const { app, BrowserWindow, Menu, shell, screen } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const http = require('node:http');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8787;
const URL = `http://127.0.0.1:${PORT}/`;

let engineProcess = null;
let mainWindow = null;

function probe() {
  return new Promise((resolve) => {
    const request = http.get(
      { host: '127.0.0.1', port: PORT, path: '/health', timeout: 700 },
      (response) => {
        response.resume();
        resolve(response.statusCode === 200);
      },
    );
    request.on('error', () => resolve(false));
    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function ensureEngine() {
  if (await probe()) return;

  const bundledNode = path.join(process.resourcesPath ?? ROOT, 'node.exe');
  const hasBundledNode = require('node:fs').existsSync(bundledNode);

  let node = process.env.PHONEDECK_NODE || (hasBundledNode ? bundledNode : 'node');
  let env = process.env;
  let args = [path.join(ROOT, 'engine', 'server.mjs')];

  // Packaged builds have no external Node: reuse this Electron binary as Node.
  if (!process.env.PHONEDECK_NODE && !hasBundledNode && app.isPackaged) {
    node = process.execPath;
    env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
  }

  engineProcess = spawn(node, args, {
    cwd: ROOT,
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  engineProcess.stdout.on('data', (chunk) => process.stdout.write(chunk));
  engineProcess.stderr.on('data', (chunk) => process.stderr.write(chunk));
  engineProcess.on('exit', () => {
    engineProcess = null;
  });

  for (let attempt = 0; attempt < 80; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (await probe()) return;
    if (!engineProcess) break;
  }

  throw new Error('Engine did not start');
}

function createWindow() {
  const area = screen.getPrimaryDisplay().workAreaSize;
  const width = Math.max(900, Math.min(1480, area.width - 16));
  const height = Math.max(600, Math.min(920, area.height - 16));

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a0c0f',
    title: 'PhoneDeck',
    show: false,
    autoHideMenuBar: true,
    icon: path.join(ROOT, 'resources', 'icon.ico'),
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#12151a',
      symbolColor: '#818a96',
      height: 42,
    },
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://127.0.0.1')) return { action: 'allow' };
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadURL(URL);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    try {
      await ensureEngine();
    } catch (error) {
      console.error('[phonedeck]', error.message);
    }
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  app.on('before-quit', () => {
    if (engineProcess) {
      try {
        engineProcess.kill();
      } catch {
        /* already gone */
      }
      engineProcess = null;
    }
  });
}
