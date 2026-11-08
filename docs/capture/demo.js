/* Runs inside the app page: paints a demo phone screen and fills the HUD. */
(() => {
  const canvas = document.querySelector('#screen');
  const veil = document.querySelector('#veil');
  if (veil) veil.classList.add('gone');

  const W = 592;
  const H = 1280;
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext('2d');

  const bg = c.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0b2233');
  bg.addColorStop(0.45, '#0f3145');
  bg.addColorStop(1, '#060d16');
  c.fillStyle = bg;
  c.fillRect(0, 0, W, H);

  const glow = (x, y, r, color) => {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  };
  glow(110, 150, 400, 'rgba(94, 234, 212, 0.30)');
  glow(540, 640, 430, 'rgba(163, 230, 53, 0.13)');
  glow(80, 1120, 360, 'rgba(129, 140, 248, 0.22)');

  // vignette
  const vg = c.createLinearGradient(0, 0, 0, H);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.38)');
  c.fillStyle = vg;
  c.fillRect(0, 0, W, H);

  const font = (weight, size) => `${weight} ${size}px "Segoe UI", system-ui, sans-serif`;
  const center = (text, y, weight, size, alpha) => {
    c.font = font(weight, size);
    c.fillStyle = `rgba(255,255,255,${alpha})`;
    c.textAlign = 'center';
    c.fillText(text, W / 2, y);
    c.textAlign = 'left';
  };

  // ---------------- status bar ----------------
  c.fillStyle = 'rgba(255,255,255,0.94)';
  c.font = font(600, 24);
  c.fillText('08:32', 38, 58);

  const bar = (x, y, h) => {
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.beginPath();
    c.roundRect(x, y, 5, h, 2);
    c.fill();
  };
  bar(438, 40, 8);
  bar(447, 34, 14);
  bar(456, 30, 18);
  bar(465, 24, 24);

  // wifi
  c.strokeStyle = 'rgba(255,255,255,0.9)';
  c.lineWidth = 4;
  c.lineCap = 'round';
  [10, 17, 24].forEach((r, index) => {
    c.beginPath();
    c.arc(494, 52, r, Math.PI * 1.22, Math.PI * 1.78);
    c.globalAlpha = 1 - index * 0.12;
    c.stroke();
  });
  c.globalAlpha = 1;

  // battery
  c.strokeStyle = 'rgba(255,255,255,0.55)';
  c.lineWidth = 3;
  c.beginPath();
  c.roundRect(520, 34, 46, 24, 7);
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.9)';
  c.beginPath();
  c.roundRect(524, 38, 32, 16, 4);
  c.fill();

  // ---------------- clock ----------------
  center('08:32', 300, 700, 118, 0.96);
  center('Sun, 8 Nov', 356, 500, 28, 0.72);
  center('23°  Mostly clear', 398, 500, 22, 0.52);

  // ---------------- icon grid ----------------
  const palette = [
    ['#38bdf8', '#0369a1'],
    ['#fbbf24', '#b45309'],
    ['#34d399', '#047857'],
    ['#f472b6', '#9d174d'],
    ['#a78bfa', '#5b21b6'],
    ['#fb7185', '#9f1239'],
    ['#22d3ee', '#0e7490'],
    ['#a3e635', '#4d7c0f'],
    ['#60a5fa', '#1d4ed8'],
    ['#f97316', '#9a3412'],
    ['#e879f9', '#86198f'],
    ['#2dd4bf', '#115e59'],
  ];
  const labels = [
    'Camera', 'Mail', 'Maps', 'Notes',
    'Music', 'Photos', 'Wallet', 'Weather',
    'Files', 'Clock', 'Calendar', 'Settings',
  ];

  const glyph = (kind, cx, cy) => {
    c.save();
    c.strokeStyle = 'rgba(255,255,255,0.95)';
    c.fillStyle = 'rgba(255,255,255,0.95)';
    c.lineWidth = 5;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    if (kind === 0) { // camera
      c.beginPath(); c.roundRect(cx - 22, cy - 15, 44, 32, 9); c.stroke();
      c.beginPath(); c.arc(cx, cy + 1, 9, 0, Math.PI * 2); c.stroke();
    } else if (kind === 1) { // mail
      c.beginPath(); c.roundRect(cx - 22, cy - 15, 44, 30, 6); c.stroke();
      c.beginPath(); c.moveTo(cx - 20, cy - 12); c.lineTo(cx, cy + 3); c.lineTo(cx + 20, cy - 12); c.stroke();
    } else if (kind === 2) { // maps
      c.beginPath(); c.moveTo(cx, cy - 22);
      c.bezierCurveTo(cx + 17, cy - 6, cx + 15, cy + 12, cx, cy + 22);
      c.bezierCurveTo(cx - 15, cy + 12, cx - 17, cy - 6, cx, cy - 22);
      c.stroke();
      c.beginPath(); c.arc(cx, cy - 4, 6, 0, Math.PI * 2); c.stroke();
    } else if (kind === 3) { // notes
      [-12, 0, 12].forEach((dy) => {
        c.beginPath(); c.moveTo(cx - 18, cy + dy); c.lineTo(cx + 18, cy + dy); c.stroke();
      });
    } else if (kind === 4) { // music
      c.beginPath(); c.arc(cx - 8, cy + 10, 7, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.moveTo(cx - 1, cy + 10); c.lineTo(cx - 1, cy - 18);
      c.lineTo(cx + 16, cy - 24); c.moveTo(cx - 1, cy - 10); c.lineTo(cx + 16, cy - 16);
      c.stroke();
    } else if (kind === 5) { // photos
      c.beginPath(); c.roundRect(cx - 21, cy - 17, 42, 34, 7); c.stroke();
      c.beginPath(); c.moveTo(cx - 16, cy + 8); c.lineTo(cx - 2, cy - 6); c.lineTo(cx + 8, cy + 4);
      c.lineTo(cx + 14, cy - 2); c.lineTo(cx + 18, cy + 8); c.stroke();
    } else if (kind === 6) { // wallet
      c.beginPath(); c.roundRect(cx - 22, cy - 14, 44, 28, 7); c.stroke();
      c.beginPath(); c.roundRect(cx + 4, cy - 4, 18, 10, 4); c.fill();
    } else if (kind === 7) { // weather
      c.beginPath(); c.arc(cx - 6, cy - 6, 10, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.arc(cx + 4, cy + 8, 12, Math.PI, Math.PI * 2); c.stroke();
    } else if (kind === 8) { // files
      c.beginPath(); c.roundRect(cx - 21, cy - 14, 42, 28, 6); c.stroke();
      c.beginPath(); c.moveTo(cx - 21, cy - 8); c.lineTo(cx + 21, cy - 8); c.stroke();
    } else if (kind === 9) { // clock
      c.beginPath(); c.arc(cx, cy, 21, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx, cy - 12); c.moveTo(cx, cy); c.lineTo(cx + 10, cy + 5); c.stroke();
    } else if (kind === 10) { // calendar
      c.beginPath(); c.roundRect(cx - 20, cy - 18, 40, 36, 7); c.stroke();
      c.beginPath(); c.moveTo(cx - 20, cy - 6); c.lineTo(cx + 20, cy - 6); c.stroke();
      c.beginPath(); c.moveTo(cx - 8, cy - 24); c.lineTo(cx - 8, cy - 14);
      c.moveTo(cx + 8, cy - 24); c.lineTo(cx + 8, cy - 14); c.stroke();
    } else { // settings
      c.beginPath(); c.arc(cx, cy, 20, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.arc(cx, cy, 7, 0, Math.PI * 2); c.stroke();
    }
    c.restore();
  };

  const size = 86;
  const gapX = 34;
  const startX = (W - (size * 4 + gapX * 3)) / 2;
  const startY = 560;
  const stepY = 150;

  labels.forEach((label, index) => {
    const col = index % 4;
    const row = Math.floor(index / 4);
    const x = startX + col * (size + gapX);
    const y = startY + row * stepY;
    const [from, to] = palette[index];

    const g = c.createLinearGradient(x, y, x + size, y + size);
    g.addColorStop(0, from);
    g.addColorStop(1, to);

    c.save();
    c.shadowColor = 'rgba(0,0,0,0.45)';
    c.shadowBlur = 18;
    c.shadowOffsetY = 8;
    c.fillStyle = g;
    c.beginPath();
    c.roundRect(x, y, size, size, 24);
    c.fill();
    c.restore();

    glyph(index, x + size / 2, y + size / 2);

    c.font = font(500, 15);
    c.fillStyle = 'rgba(255,255,255,0.86)';
    c.textAlign = 'center';
    c.fillText(label, x + size / 2, y + size + 26);
    c.textAlign = 'left';
  });

  // ---------------- dock ----------------
  c.fillStyle = 'rgba(255,255,255,0.09)';
  c.beginPath();
  c.roundRect(38, 1042, W - 76, 124, 38);
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.10)';
  c.lineWidth = 1.5;
  c.stroke();

  [0, 3, 4, 8].forEach((kind, index) => {
    const size2 = 66;
    const x = 82 + index * 118;
    const y = 1071;
    const [from, to] = palette[kind];
    const g = c.createLinearGradient(x, y, x + size2, y + size2);
    g.addColorStop(0, from);
    g.addColorStop(1, to);
    c.fillStyle = g;
    c.beginPath();
    c.roundRect(x, y, size2, size2, 20);
    c.fill();
    glyph(kind, x + size2 / 2, y + size2 / 2);
  });

  // ---------------- gesture bar ----------------
  c.fillStyle = 'rgba(255,255,255,0.55)';
  c.beginPath();
  c.roundRect(W / 2 - 105, 1224, 210, 9, 5);
  c.fill();

  // ---------------- HUD ----------------
  const stage = canvas.parentElement.getBoundingClientRect();
  const scale = Math.min((stage.width - 28) / W, (stage.height - 28) / H);
  canvas.style.width = `${Math.max(1, Math.floor(W * scale))}px`;
  canvas.style.height = `${Math.max(1, Math.floor(H * scale))}px`;
  canvas.classList.remove('hidden');

  const hudState = document.querySelector('#hud-state');
  if (hudState) hudState.textContent = 'streaming';
  const hudFps = document.querySelector('#hud-fps');
  if (hudFps) hudFps.textContent = '60 fps';
})();
