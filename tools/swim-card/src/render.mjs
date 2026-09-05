// Draws the swim-report card to a PNG buffer with @napi-rs/canvas — chosen
// over a headless-browser/HTML render (Playwright, node-html-to-image) so
// this tool has no browser download/runtime to install: @napi-rs/canvas
// ships prebuilt native binaries for the common platforms via npm, and
// nothing else. See docs/decisions/ for the full reasoning.
//
// Takes the plain CardData shape compute.mjs (or sampleData.mjs) produces —
// this file only draws, it never fetches or interpolates.

import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const FONT_HEAVY = 'Swim Card Heavy'; // Baloo 2 800 — logo, headings, big numbers
const FONT_BODY = 'Swim Card Body'; // Nunito 700/800 — labels, body text

let fontsRegistered = false;
function ensureFonts() {
  if (fontsRegistered) return;
  GlobalFonts.registerFromPath(require.resolve('@fontsource/baloo-2/files/baloo-2-latin-800-normal.woff2'), FONT_HEAVY);
  GlobalFonts.registerFromPath(require.resolve('@fontsource/nunito/files/nunito-latin-700-normal.woff2'), FONT_BODY);
  fontsRegistered = true;
}

const COLOR = {
  cream: '#f3ead9',
  panel: '#fbf5e9',
  ink: '#232131',
  coral: '#e8604c',
  navy: '#233350',
  teal: '#2f9490',
  tealDark: '#1f6a67',
  amber: '#f3b632',
  seaDeep: '#1d5b70',
  seaShallow: '#2f8392',
  sand: '#d8c39a',
  gray: '#8a8577',
};

const W = 1200;
const H = 1620;

function roundRectPath(ctx, x, y, w, h, r) {
  const radius = typeof r === 'number' ? { tl: r, tr: r, br: r, bl: r } : r;
  ctx.beginPath();
  ctx.moveTo(x + radius.tl, y);
  ctx.lineTo(x + w - radius.tr, y);
  ctx.arcTo(x + w, y, x + w, y + radius.tr, radius.tr);
  ctx.lineTo(x + w, y + h - radius.br);
  ctx.arcTo(x + w, y + h, x + w - radius.br, y + h, radius.br);
  ctx.lineTo(x + radius.bl, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius.bl, radius.bl);
  ctx.lineTo(x, y + radius.tl);
  ctx.arcTo(x, y, x + radius.tl, y, radius.tl);
  ctx.closePath();
}

function panel(ctx, x, y, w, h, r, { fill = COLOR.panel, stroke = COLOR.ink, lineWidth = 4 } = {}) {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

function wavyLine(ctx, x, y, width, { amplitude = 6, wavelength = 34, color = COLOR.teal, lineWidth = 6 } = {}) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  const steps = Math.ceil(width / 4);
  for (let i = 0; i <= steps; i++) {
    const px = x + (i / steps) * width;
    const py = y + Math.sin((i / steps) * (width / wavelength) * 2 * Math.PI) * amplitude;
    ctx.lineTo(px, py);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.stroke();
}

function drawSunIcon(ctx, cx, cy, r, { color = COLOR.amber, rays = true } = {}) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  if (rays) {
    ctx.strokeStyle = color;
    ctx.lineWidth = r * 0.22;
    ctx.lineCap = 'round';
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const inner = r * 1.35;
      const outer = r * 1.85;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawCloudIcon(ctx, cx, cy, r, { color = '#ffffff', stroke = COLOR.ink } = {}) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx - r * 0.5, cy + r * 0.15, r * 0.55, Math.PI * 0.5, Math.PI * 1.6);
  ctx.arc(cx - r * 0.05, cy - r * 0.35, r * 0.6, Math.PI * 1.0, Math.PI * 2.15);
  ctx.arc(cx + r * 0.55, cy + r * 0.05, r * 0.5, Math.PI * 1.35, Math.PI * 0.55, false);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawMoonIcon(ctx, cx, cy, r, { color = '#e8e4d6' } = {}) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(cx + r * 0.45, cy - r * 0.25, r * 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function periodIcon(ctx, cx, cy, r, periodLabel) {
  if (periodLabel === 'MORNING') drawSunIcon(ctx, cx, cy, r, { rays: true });
  else if (periodLabel === 'AFTERNOON') drawSunIcon(ctx, cx, cy, r, { rays: true });
  else if (periodLabel === 'EVENING') drawSunIcon(ctx, cx, cy, r, { color: COLOR.coral, rays: true });
  else drawMoonIcon(ctx, cx, cy, r);
}

// Water-quality flag styling per pin — never defaults an unrecognised or
// missing status to 'clear' (see beachQuality.mjs): 'unknown' gets its own
// dashed, gray look so a fetch failure reads as "not checked", not "safe".
const FLAG_STYLE = {
  clear: { fill: '#ffffff', ring: COLOR.teal, center: COLOR.teal, dashed: false },
  flagged: { fill: COLOR.coral, ring: COLOR.ink, center: '#ffffff', dashed: false },
  unknown: { fill: '#d8d2c1', ring: COLOR.gray, center: COLOR.gray, dashed: true },
};

function drawPin(ctx, x, groundY, stalkHeight, label, status) {
  const style = FLAG_STYLE[status] ?? FLAG_STYLE.unknown;
  const topY = groundY - stalkHeight;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2;
  if (style.dashed) ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(x, groundY);
  ctx.lineTo(x, topY);
  ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(x, topY, 10, 0, Math.PI * 2);
  ctx.fillStyle = style.fill;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = style.ring;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, topY, 4, 0, Math.PI * 2);
  ctx.fillStyle = style.center;
  ctx.fill();

  ctx.font = `700 22px "${FONT_BODY}"`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.strokeText(label, x, topY - 20);
  ctx.fillText(label, x, topY - 20);
}

function drawCoastline(ctx, x, y, w, h, beachFlags) {
  roundRectPath(ctx, x, y, w, h, 20);
  ctx.save();
  ctx.clip();

  // Sky/land gradient
  const skyGrad = ctx.createLinearGradient(0, y, 0, y + h);
  skyGrad.addColorStop(0, '#e9dcc0');
  skyGrad.addColorStop(1, COLOR.sand);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(x, y, w, h);

  // Dotted texture over the land
  ctx.fillStyle = 'rgba(150,120,70,0.18)';
  for (let py = y + 10; py < y + h * 0.62; py += 16) {
    for (let px = x + ((py / 16) % 2 === 0 ? 8 : 16); px < x + w; px += 16) {
      ctx.beginPath();
      ctx.arc(px, py, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Sea, as a gently rising-to-the-right band (Hastings' coast runs SW->NE)
  const shoreBase = y + h * 0.62;
  const shoreRise = h * 0.16;
  ctx.beginPath();
  ctx.moveTo(x, shoreBase);
  ctx.quadraticCurveTo(x + w * 0.35, shoreBase + h * 0.05, x + w * 0.62, shoreBase - shoreRise * 0.4);
  ctx.quadraticCurveTo(x + w * 0.85, shoreBase - shoreRise, x + w, shoreBase - shoreRise * 1.15);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  const seaGrad = ctx.createLinearGradient(0, shoreBase - shoreRise, 0, y + h);
  seaGrad.addColorStop(0, COLOR.seaShallow);
  seaGrad.addColorStop(1, COLOR.seaDeep);
  ctx.fillStyle = seaGrad;
  ctx.fill();

  // Small chevron wave marks on the sea
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 10; i++) {
    const wx = x + 40 + i * (w - 80) / 9;
    const wy = y + h * 0.82 + ((i % 2) * 26);
    ctx.beginPath();
    ctx.moveTo(wx - 16, wy);
    ctx.quadraticCurveTo(wx, wy - 10, wx + 16, wy);
    ctx.stroke();
  }

  // Beach markers along the shoreline, colored by water-quality flag
  const usableWidth = w - 100;
  beachFlags.forEach((beach, i) => {
    const fx = x + 50 + (usableWidth * i) / (beachFlags.length - 1);
    const t = i / (beachFlags.length - 1);
    const shoreY = shoreBase + (shoreBase - shoreRise * 1.15 - shoreBase) * t - shoreRise * 0.3 * Math.sin(t * Math.PI);
    const stalk = 46 + (i % 2 === 0 ? 34 : 0);
    drawPin(ctx, fx, shoreY, stalk, beach.name, beach.status);
  });

  ctx.restore();
  roundRectPath(ctx, x, y, w, h, 20);
  ctx.lineWidth = 4;
  ctx.strokeStyle = COLOR.ink;
  ctx.stroke();
}

function drawCompass(ctx, cx, cy, r, compassPoint) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = COLOR.ink;
  ctx.stroke();

  // Screen angle (0 = right/east, clockwise) the wind is blowing TOWARD —
  // the opposite of the "from" compass point the label reads.
  const bearings = { N: 90, NE: 135, E: 180, SE: 225, S: 270, SW: 315, W: 0, NW: 45 };
  const angle = ((bearings[compassPoint] ?? 0) * Math.PI) / 180;
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(r * 0.75, 0);
  ctx.lineTo(-r * 0.35, r * 0.32);
  ctx.lineTo(-r * 0.35, -r * 0.32);
  ctx.closePath();
  ctx.fillStyle = COLOR.coral;
  ctx.fill();
  ctx.restore();
}

function beachFlagBadge(beachFlags) {
  if (!beachFlags || beachFlags.length === 0) return { text: 'FLAGS UNKNOWN', color: COLOR.gray };
  const flagged = beachFlags.filter((b) => b.status === 'flagged').length;
  const unknown = beachFlags.filter((b) => b.status === 'unknown').length;

  if (unknown === beachFlags.length) return { text: 'FLAGS UNKNOWN', color: COLOR.gray };
  if (flagged > 0) {
    const parts = [`${flagged} BEACH${flagged > 1 ? 'ES' : ''} FLAGGED`];
    if (unknown > 0) parts.push(`${unknown} UNKNOWN`);
    return { text: parts.join(' · '), color: COLOR.coral };
  }
  return { text: unknown > 0 ? `ALL CLEAR · ${unknown} UNKNOWN` : 'ALL CLEAR', color: COLOR.teal };
}

function drawTideChart(ctx, x, y, w, h, tide24h) {
  panel(ctx, x, y, w, h, 20);
  const padX = 50;
  const padTop = 96;
  const padBottom = 60;
  const plotX = x + padX;
  const plotW = w - padX * 2;
  const plotY = y + padTop;
  const plotH = h - padTop - padBottom;

  ctx.font = `800 26px "${FONT_HEAVY}"`;
  ctx.fillStyle = COLOR.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('TIDE · THE NEXT 24 HOURS', x + padX, y + 48);

  const points = tide24h.points;
  if (points.length < 2) {
    ctx.font = `700 22px "${FONT_BODY}"`;
    ctx.fillStyle = COLOR.gray;
    ctx.fillText('Tide data unavailable', plotX, plotY + plotH / 2);
    return;
  }

  const t0 = points[0].time.getTime();
  const t1 = points[points.length - 1].time.getTime();
  const heights = points.map((p) => p.heightM);
  const hMin = Math.min(...heights);
  const hMax = Math.max(...heights);
  const hPad = (hMax - hMin) * 0.25 || 0.5;

  const xFor = (t) => plotX + ((t - t0) / (t1 - t0)) * plotW;
  const yFor = (v) => plotY + plotH - ((v - (hMin - hPad)) / (hMax - hMin + hPad * 2)) * plotH;

  // filled area under the curve
  ctx.beginPath();
  ctx.moveTo(xFor(points[0].time.getTime()), plotY + plotH);
  for (const p of points) ctx.lineTo(xFor(p.time.getTime()), yFor(p.heightM));
  ctx.lineTo(xFor(points[points.length - 1].time.getTime()), plotY + plotH);
  ctx.closePath();
  const areaGrad = ctx.createLinearGradient(0, plotY, 0, plotY + plotH);
  areaGrad.addColorStop(0, 'rgba(47,148,144,0.35)');
  areaGrad.addColorStop(1, 'rgba(47,148,144,0.03)');
  ctx.fillStyle = areaGrad;
  ctx.fill();

  // the curve itself
  ctx.beginPath();
  points.forEach((p, i) => {
    const px = xFor(p.time.getTime());
    const py = yFor(p.heightM);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.strokeStyle = COLOR.tealDark;
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  // "now" marker
  const now = tide24h.now;
  if (now.getTime() >= t0 && now.getTime() <= t1) {
    const nx = xFor(now.getTime());
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = COLOR.coral;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(nx, plotY);
    ctx.lineTo(nx, plotY + plotH);
    ctx.stroke();
    ctx.restore();

    let nowHeight = null;
    for (let i = 0; i < points.length - 1; i++) {
      if (points[i].time.getTime() <= now.getTime() && points[i + 1].time.getTime() >= now.getTime()) {
        const span = points[i + 1].time.getTime() - points[i].time.getTime();
        const ratio = span > 0 ? (now.getTime() - points[i].time.getTime()) / span : 0;
        nowHeight = points[i].heightM + (points[i + 1].heightM - points[i].heightM) * ratio;
        break;
      }
    }
    if (nowHeight !== null) {
      ctx.beginPath();
      ctx.arc(nx, yFor(nowHeight), 8, 0, Math.PI * 2);
      ctx.fillStyle = COLOR.coral;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = COLOR.panel;
      ctx.stroke();
    }
  }

  // extreme labels, alternating above (high) / below (low)
  ctx.font = `800 22px "${FONT_HEAVY}"`;
  tide24h.extremes.forEach((e) => {
    const ex = xFor(e.time.getTime());
    const ey = yFor(e.heightM);
    const above = e.type === 'high';
    const label = `${e.type === 'high' ? 'HW' : 'LW'} ${e.timeLabel} · ${e.heightM.toFixed(1)} m`;

    ctx.beginPath();
    ctx.arc(ex, ey, 6, 0, Math.PI * 2);
    ctx.fillStyle = COLOR.ink;
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.fillStyle = COLOR.ink;
    ctx.fillText(label, Math.min(Math.max(ex, plotX + 90), plotX + plotW - 90), above ? ey - 20 : ey + 38);
  });
}

export function renderCard(cardData) {
  ensureFonts();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Outer background
  roundRectPath(ctx, 0, 0, W, H, 0);
  ctx.fillStyle = COLOR.cream;
  ctx.fill();

  const pad = 40;
  let cursorY = 44;

  // --- Header: logo + dynamic badge ---
  drawSunIcon(ctx, pad + 56, cursorY + 56, 34);
  ctx.beginPath();
  ctx.moveTo(pad, cursorY + 96);
  for (let i = 0; i <= 20; i++) {
    ctx.lineTo(pad + i * 5.6, cursorY + 96 + Math.sin(i / 2) * 4);
  }
  ctx.strokeStyle = COLOR.teal;
  ctx.lineWidth = 5;
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `800 58px "${FONT_HEAVY}"`;
  ctx.fillStyle = COLOR.coral;
  ctx.fillText('SWIM', pad + 118, cursorY + 46);
  ctx.fillStyle = COLOR.navy;
  ctx.fillText('HASTINGS', pad + 118, cursorY + 104);
  wavyLine(ctx, pad + 118, cursorY + 122, 330, { amplitude: 5, wavelength: 60 });

  // Badge: real beach-flag counts (see beachQuality.mjs) — never a
  // hardcoded "all clear".
  const badge = beachFlagBadge(cardData.beachFlags);
  ctx.font = `800 30px "${FONT_HEAVY}"`;
  const badgeTextWidth = ctx.measureText(badge.text).width;
  const badgeW = badgeTextWidth + 64;
  const badgeH = 66;
  const badgeX = W - pad - badgeW;
  const badgeY = cursorY + 20;
  panel(ctx, badgeX, badgeY, badgeW, badgeH, badgeH / 2, { fill: COLOR.panel, stroke: badge.color, lineWidth: 5 });
  ctx.fillStyle = COLOR.ink;
  ctx.textAlign = 'center';
  ctx.fillText(badge.text, badgeX + badgeW / 2, badgeY + badgeH / 2 + 10);

  cursorY += 176;

  // --- Status bar ---
  const statusH = 68;
  panel(ctx, pad, cursorY, W - pad * 2, statusH, statusH / 2, { fill: COLOR.teal, stroke: COLOR.ink, lineWidth: 4 });
  periodIcon(ctx, pad + 46, cursorY + statusH / 2, 16, cardData.periodLabel);
  ctx.font = `800 28px "${FONT_HEAVY}"`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.fillText(`${cardData.periodLabel} · ${cardData.dateLabel}`, pad + 76, cursorY + statusH / 2 + 10);
  ctx.textAlign = 'right';
  ctx.fillText(`UPDATED ${cardData.updatedLabel}`, W - pad - 24, cursorY + statusH / 2 + 10);

  cursorY += statusH + 24;

  // --- Hero panel: weather box + coastline illustration ---
  const heroH = 640;
  panel(ctx, pad, cursorY, W - pad * 2, heroH, 26, { fill: COLOR.panel });

  // weather box, floating top-left inside the hero panel
  const wbX = pad + 24;
  const wbY = cursorY + 24;
  const wbW = 340;
  const wbH = 130;
  panel(ctx, wbX, wbY, wbW, wbH, 18, { fill: COLOR.panel, lineWidth: 4 });
  drawSunIcon(ctx, wbX + 34, wbY + 34, 15);
  ctx.font = `800 30px "${FONT_HEAVY}"`;
  ctx.fillStyle = COLOR.ink;
  ctx.textAlign = 'left';
  const tempText = cardData.airTempC !== null ? `${cardData.airTempC}° ${cardData.skyLabel ?? ''}` : 'No data';
  ctx.fillText(tempText, wbX + 62, wbY + 42);
  drawMoonIcon(ctx, wbX + 34, wbY + 88, 13);
  ctx.font = `700 26px "${FONT_BODY}"`;
  ctx.fillText(`Sun sets ${cardData.sunsetLabel ?? '—'}`, wbX + 62, wbY + 96);

  const coastX = pad + 24;
  const coastY = wbY + wbH + 20;
  const coastW = W - pad * 2 - 48;
  const coastH = heroH - (coastY - cursorY) - 90;
  drawCoastline(ctx, coastX, coastY, coastW, coastH, cardData.beachFlags);

  // Wind readout, bottom-right of the hero panel
  const windY = coastY + coastH + 46;
  drawCompass(ctx, pad + 24 + 28, windY, 28, cardData.windCompass ?? 'W');
  ctx.font = `800 26px "${FONT_HEAVY}"`;
  ctx.fillStyle = COLOR.ink;
  ctx.textAlign = 'left';
  const windText =
    cardData.windSpeedMph !== null ? `WIND ${cardData.windSpeedMph} MPH ${cardData.windCompass ?? ''}` : 'WIND —';
  ctx.fillText(windText, pad + 24 + 66, windY + 9);

  cursorY += heroH + 24;

  // --- TIDE / SEA stat boxes ---
  const statH = 200;
  const gap = 24;
  const statW = (W - pad * 2 - gap) / 2;

  panel(ctx, pad, cursorY, statW, statH, 22);
  ctx.font = `800 24px "${FONT_HEAVY}"`;
  ctx.fillStyle = COLOR.teal;
  ctx.textAlign = 'left';
  ctx.fillText('TIDE', pad + 28, cursorY + 44);
  const tideMain = cardData.tide.stateLabel ? `${cardData.tide.stateLabel} ${cardData.tide.stateTime}` : '—';
  ctx.font = `800 52px "${FONT_HEAVY}"`;
  ctx.fillStyle = COLOR.ink;
  ctx.fillText(tideMain, pad + 28, cursorY + 108);
  ctx.font = `700 26px "${FONT_BODY}"`;
  ctx.fillStyle = COLOR.gray;
  const tideSub =
    cardData.tide.direction && cardData.tide.nowHeightM !== null
      ? `${cardData.tide.direction} · ~${cardData.tide.nowHeightM.toFixed(1)} m now`
      : '—';
  ctx.fillText(tideSub, pad + 28, cursorY + 150);

  const seaX = pad + statW + gap;
  panel(ctx, seaX, cursorY, statW, statH, 22);
  ctx.font = `800 24px "${FONT_HEAVY}"`;
  ctx.fillStyle = COLOR.teal;
  ctx.fillText('SEA', seaX + 28, cursorY + 44);
  const seaMain = cardData.seaTempC !== null ? `${cardData.seaTempC.toFixed(1)}°` : '—';
  ctx.font = `800 52px "${FONT_HEAVY}"`;
  ctx.fillStyle = COLOR.ink;
  ctx.fillText(seaMain, seaX + 28, cursorY + 108);
  ctx.font = `800 26px "${FONT_HEAVY}"`;
  ctx.fillStyle = COLOR.teal;
  ctx.fillText(cardData.seaStateLabel ?? '—', seaX + 28, cursorY + 140);
  ctx.font = `700 24px "${FONT_BODY}"`;
  ctx.fillStyle = COLOR.gray;
  const waveSub = cardData.waveHeightM !== null ? `waves ${cardData.waveHeightM.toFixed(1)} m` : '';
  ctx.fillText(waveSub, seaX + 28, cursorY + 172);

  cursorY += statH + 24;

  // --- Tide chart ---
  const chartH = 300;
  drawTideChart(ctx, pad, cursorY, W - pad * 2, chartH, cardData.tide24h);
  cursorY += chartH + 20;

  // --- Footer ---
  ctx.font = `700 20px "${FONT_BODY}"`;
  ctx.fillStyle = COLOR.gray;
  ctx.textAlign = 'center';
  const footerLine1 = 'Estimates from public data — beach flags are best-effort, not a substitute for local advisories.';
  const footerLine2 = 'TideCheck · Open-Meteo · Environment Agency · Hastings Pier, East Sussex';
  ctx.fillText(footerLine1, W / 2, cursorY + 24);
  ctx.fillText(footerLine2, W / 2, cursorY + 52);

  return canvas.toBuffer('image/png');
}
