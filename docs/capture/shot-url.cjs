/* Loads a URL offscreen and screenshots the viewport. */
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

console.log('boot', process.argv.slice(2));
process.on('uncaughtException', (error) => {
  console.error('uncaught', error);
  app.exit(1);
});

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.disableHardwareAcceleration();
const userData = path.join(os.tmpdir(), 'phonedeck-shoturl');
fs.mkdirSync(userData, { recursive: true });
app.setPath('userData', userData);

const [url, output, w, h] = process.argv.slice(2);
const width = Number(w) || 1280;
const height = Number(h) || 1600;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width,
    height,
    frame: false,
    show: false,
    backgroundColor: '#0d1117',
    webPreferences: { offscreen: true },
  });
  win.webContents.setFrameRate(10);
  let latest = null;
  win.webContents.on('paint', (_e, _d, image) => {
    latest = image;
  });

  try {
    await win.loadURL(url);
  } catch (error) {
    console.error('load failed', error.message);
  }
  await new Promise((r) => setTimeout(r, 9000));
  win.webContents.invalidate();
  await new Promise((r) => setTimeout(r, 1500));
  if (!latest) {
    console.error('no frame');
    app.exit(1);
    return;
  }
  fs.writeFileSync(path.resolve(output), latest.toPNG());
  console.log('wrote', output, latest.getSize());
  app.quit();
});
