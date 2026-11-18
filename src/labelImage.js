// Етикетка як чорно-біла картинка точно під розмір і роздільність термопринтера.
// Потрібно для принтерів, що друкують лише через свій додаток (Niimbot тощо):
// завантажуєте PNG і вставляєте його в шаблон того самого розміру.
import { fmtDate, labelComposition, num } from './calc.js';

export const LABEL_SIZES = {
  '58x40': { w: 58, h: 40, label: '58×40 мм' },
  '40x30': { w: 40, h: 30, label: '40×30 мм' },
  '40x20': { w: 40, h: 20, label: '40×20 мм' },
};

export const DPIS = [
  { id: 203, label: '203 dpi — Niimbot B1, B21, D11, D110 та більшість термопринтерів' },
  { id: 300, label: '300 dpi — Niimbot B1 Pro, B3S Pro, Phomemo M221' },
];

export const VARIANTS = [
  { id: 'full', label: 'Усе на одній' },
  { id: 'front', label: 'Лицьова: назва й дати' },
  { id: 'back', label: 'Зворотна: склад і алергени' },
];

export const defaultVariant = (size) => (size === '40x20' ? 'front' : 'full');

export const mmToPx = (mm, dpi) => Math.round((mm / 25.4) * dpi);

/** Що саме друкується на етикетці. rel — відносний розмір шрифту. */
export function labelBlocks(state, recipe, { date, weight, variant = 'full' }) {
  const comp = (recipe.composition || labelComposition(state, recipe.id) || '').trim();
  const made = new Date(date + 'T12:00');
  const until = recipe.shelfLifeDays ? new Date(made.getTime() + recipe.shelfLifeDays * 86400000) : null;
  const brand = state.settings.brandName || 'KUS';
  const dates = [`Виготовлено: ${fmtDate(made)}`, until ? `Вжити до: ${fmtDate(until)}` : ''].filter(Boolean);
  const blocks = [];
  if (variant !== 'back') {
    blocks.push({ text: brand, bold: true, rel: 0.8 });
    blocks.push({ text: recipe.name, bold: true, rel: 1.35, gapAfter: 0.25 });
  } else {
    blocks.push({ text: `${brand} · ${recipe.name}`, bold: true, rel: 0.9, gapAfter: 0.2 });
  }
  if (variant !== 'front') {
    if (comp) blocks.push({ label: 'Склад: ', text: comp.replace(/\.$/, '') + '.', rel: 0.82 });
    if (recipe.allergens) blocks.push({ label: 'Алергени: ', text: recipe.allergens, rel: 0.82, gapAfter: 0.15 });
  }
  if (variant !== 'back') {
    if (weight > 0) dates.unshift(`Маса нетто: ${num(weight)} г`);
    for (const d of dates) blocks.push({ text: d, bold: variant === 'front', rel: variant === 'front' ? 1 : 0.88 });
  }
  if (variant !== 'front') {
    if (recipe.storage) blocks.push({ text: recipe.storage, rel: 0.75 });
    if (state.settings.producer) blocks.push({ text: `Виробник: ${state.settings.producer}`, rel: 0.7 });
  }
  return blocks;
}

const FONT = 'Arial, "Helvetica Neue", Helvetica, sans-serif';
const fontOf = (px, bold) => `${bold ? 'bold ' : ''}${px}px ${FONT}`;

/** Розбиває текст на рядки по ширині. Підпис («Склад: ») жирний, текст після нього — звичайний. */
function wrap(ctx, block, px, maxW) {
  const words = ((block.label || '') + block.text).split(/\s+/).filter(Boolean);
  const labelWords = (block.label || '').trim().split(/\s+/).filter(Boolean).length;
  const lines = [];
  let line = [];
  const width = (ws) => ws.reduce((t, w, i) => {
    ctx.font = fontOf(px, block.bold || w.bold);
    return t + ctx.measureText((i ? ' ' : '') + w.t).width;
  }, 0);
  words.forEach((t, i) => {
    const w = { t, bold: i < labelWords };
    if (line.length && width([...line, w]) > maxW) { lines.push(line); line = [w]; } else line.push(w);
  });
  if (line.length) lines.push(line);
  return lines;
}

/**
 * Малює етикетку на canvas. Повертає { fits } — чи вмістився текст без обрізання.
 */
export function renderLabel(canvas, state, recipe, { size = '40x20', dpi = 203, date, weight, variant }) {
  const S = LABEL_SIZES[size] || LABEL_SIZES['40x20'];
  const W = mmToPx(S.w, dpi);
  const H = mmToPx(S.h, dpi);
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'top';

  const pad = mmToPx(S.h <= 20 ? 1.2 : 1.6, dpi);
  const innerW = W - pad * 2;
  const innerH = H - pad * 2;
  const blocks = labelBlocks(state, recipe, { date, weight, variant: variant || defaultVariant(size) });
  // Найдрібніший текст, який ще чітко друкується: на 203 dpi крапок менше, тож поріг вищий
  const minPx = mmToPx(dpi >= 300 ? 1.35 : 1.75, dpi);
  const maxPx = Math.round(innerH * 0.3);

  const layout = (px) => {
    let h = 0;
    const out = blocks.map((b) => {
      const fpx = Math.max(Math.round(px * b.rel), 6);
      const lines = wrap(ctx, b, fpx, innerW);
      const lh = Math.round(fpx * 1.17);
      const gap = Math.round(px * (b.gapAfter || 0));
      h += lines.length * lh + gap;
      return { b, fpx, lines, lh, gap };
    });
    return { out, h };
  };

  let px = maxPx;
  let res = layout(px);
  while (res.h > innerH && px > minPx) { px -= 1; res = layout(px); }
  const fits = res.h <= innerH;

  // Вертикально центруємо короткі етикетки (лицьова), довгі — від верху
  let y = pad + Math.max(0, Math.round((innerH - res.h) / 2));
  for (const { b, fpx, lines, lh, gap } of res.out) {
    for (const ln of lines) {
      if (y + lh > H - pad / 2) break;
      let x = pad;
      ln.forEach((w, i) => {
        ctx.font = fontOf(fpx, b.bold || w.bold);
        const t = (i ? ' ' : '') + w.t;
        ctx.fillText(t, x, y);
        x += ctx.measureText(t).width;
      });
      y += lh;
    }
    y += gap;
  }

  // Термопринтер друкує лише чорне: прибираємо сірі краї згладжування — літери чіткіші
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    // поріг 190: напівсірі краї стають чорними — дрібні літери товщі й не «розсипаються»
    const v = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114 < 190 ? 0 : 255;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return { fits, width: W, height: H };
}

export function labelFileName(recipe, size, date, variant) {
  const slug = (recipe.name || 'label').toLowerCase().replace(/[^a-z0-9а-яіїєґ]+/gi, '-').replace(/^-|-$/g, '');
  const v = variant === 'front' ? '-front' : variant === 'back' ? '-back' : '';
  return `kus-${slug}-${size}${v}-${date}.png`;
}
