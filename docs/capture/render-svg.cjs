/* Renders an SVG to PNG for previewing. Usage: electron render-svg.cjs in.svg out.png [width] [height] */
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.disableHardwareAcceleration();
app.setPath('userData', path.join(os.tmpdir(), 'phonedeck-svg'));

const [input, output, w, h] = process.argv.slice(2);
const width = Number(w) || 1280;
const height = Number(h) || 360;

app.whenReady().then(async () => {
  const svg = path.resolve(input).replace(/\\/g, '/');
  const wrapper = path.join(os.tmpdir(), `svg-preview-${Date.now()}.html`);
  fs.writeFileSync(
    wrapper,
    `<!doctype html><html><head><style>html,body{margin:0;padding:0;background:#0a0c0f;overflow:hidden}img{display:block;width:100%;height:auto}</style></head><body><img src="file:///${svg}"></body></html>`,
  );

  const win = new BrowserWindow({
    width,
    height,
    frame: false,
    show: false,
    backgroundColor: '#0a0c0f',
    webPreferences: { offscreen: true },
  });
  win.webContents.setFrameRate(15);

  let latest = null;
  win.webContents.on('paint', (_event, _dirty, image) => {
    latest = image;
  });

  await win.loadFile(wrapper);
  await new Promise((resolve) => setTimeout(resolve, 900));
  win.webContents.invalidate();
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (!latest) {
    console.error('no frame');
    app.exit(1);
    return;
  }
  fs.writeFileSync(path.resolve(output), latest.toPNG());
  console.log('wrote', output, latest.getSize());
  fs.unlinkSync(wrapper);
  app.quit();
});
