// Звіти в Telegram через вашого бота (Bot API).
import { useEffect, useRef } from 'react';
import { buildReport, computeStock, dayKey, fmtQty, money, num, pct, periodRange, shiftCash } from './calc.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function sendTelegram(cfg, text, fetchImpl = fetch) {
  if (!cfg?.token || !cfg?.chatId) throw new Error('Вкажіть токен бота і chat ID у Налаштуваннях');
  const res = await fetchImpl(`https://api.telegram.org/bot${cfg.token.trim()}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: cfg.chatId.trim(), text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error('Telegram: ' + (data.description || res.status));
  return data;
}

export function lowStock(state) {
  const st = computeStock(state);
  return state.ingredients
    .filter((i) => (Number(i.minStock) || 0) > 0 && (st.get(i.id) || 0) < Number(i.minStock))
    .map((i) => ({ ing: i, have: st.get(i.id) || 0 }));
}

/** Текст звіту за період. */
export function reportText(state, periodId, title, range = periodRange(periodId)) {
  const cur = state.settings.currency;
  const r = buildReport(state, range);
  const lines = [
    `<b>${esc(state.settings.brandName || 'KUS')} — ${esc(title)}</b>`,
    '',
    `💰 Виручка: <b>${money(r.revenue, cur)}</b> (${r.checks} чеків, ${num(r.qty)} шт)`,
    `📦 Собівартість: ${money(r.cost, cur)}`,
    `📈 Валовий прибуток: <b>${money(r.profit, cur)}</b> (маржа ${pct(r.marginPct)})`,
  ];
  if (r.delivery || r.transport) lines.push(`🚗 Доставка: зібрано ${money(r.delivery, cur)}, транспорт ${money(r.transport, cur)} → <b>${money(r.deliveryResult, cur)}</b>`);
  if (r.expenses) lines.push(`💸 Витрати: ${money(r.expenses, cur)}`);
  if (r.losses) lines.push(`🗑 Списання: ${money(r.losses, cur)}`);
  lines.push(`✅ Чистий прибуток: <b>${money(r.net, cur)}</b>`);
  if (r.checks) lines.push(`🧾 Середній чек: ${money(r.avgCheck, cur)}`);
  if (r.products.length) {
    lines.push('', '<b>Топ продажів:</b>');
    r.products.slice(0, 5).forEach((p, k) => lines.push(`${k + 1}. ${esc(p.name)} — ${num(p.qty)} шт, ${money(p.revenue, cur)}`));
  }
  const low = lowStock(state);
  if (low.length) {
    lines.push('', '<b>⚠️ Закінчується на складі:</b>');
    low.slice(0, 15).forEach((x) => lines.push(`• ${esc(x.ing.name)} — ${fmtQty(Math.max(0, x.have), x.ing.baseUnit)} (мін. ${fmtQty(x.ing.minStock, x.ing.baseUnit)})`));
  }
  const today = new Date();
  const todays = state.orders.filter((o) => !['done', 'cancelled'].includes(o.status) && o.dueAt && dayKey(o.dueAt) === dayKey(new Date(today.getTime() + 86400000)));
  if (todays.length) lines.push('', `📦 Замовлень на завтра: <b>${todays.length}</b>`);
  return lines.join('\n');
}

export function shiftText(state, shift, employeeName) {
  const cur = state.settings.currency;
  const c = shiftCash(state, shift);
  const diff = (Number(shift.countedCash) || 0) - c.expected;
  return [
    `<b>${esc(state.settings.brandName || 'KUS')} — зміну закрито</b>`,
    `👤 ${esc(employeeName || '—')}`,
    `🕐 ${new Date(shift.openedAt).toLocaleString('uk-UA')} — ${new Date(shift.closedAt).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}`,
    '',
    `💰 Продажі: <b>${money(c.sales, cur)}</b> (${c.checks} чеків)`,
    `💳 З них безготівково: ${money(c.cardSales, cur)}`,
    `💵 Готівка: очікувалось ${money(c.expected, cur)}, пораховано ${money(shift.countedCash, cur)}`,
    diff ? `${diff < 0 ? '❗ Нестача' : '➕ Надлишок'}: <b>${money(Math.abs(diff), cur)}</b>` : '✅ Каса зійшлася',
  ].join('\n');
}

/**
 * «Щоденний звіт»: браузер не може надіслати повідомлення сам о 23:00, коли застосунок закритий.
 * Тому при першому відкритті застосунку за день надсилаємо звіт за вчора (один раз — позначка синхронізується).
 */
export function useDailyTelegram(state, update) {
  const tried = useRef('');
  const tg = state.settings.telegram || {};
  useEffect(() => {
    if (!tg.daily || !tg.token || !tg.chatId) return;
    const today = dayKey(new Date());
    if (tg.lastDaily === today || tried.current === today) return;
    tried.current = today;
    const t = setTimeout(async () => {
      try {
        await sendTelegram(tg, reportText(state, 'yesterday', 'звіт за вчора'));
        update((d) => { d.settings.telegram.lastDaily = today; });
      } catch (e) {
        console.warn(e);
      }
    }, 8000); // даємо синхронізації підтягнути дані з інших пристроїв
    return () => clearTimeout(t);
  }, [tg.daily, tg.token, tg.chatId, tg.lastDaily]); // eslint-disable-line react-hooks/exhaustive-deps
}
