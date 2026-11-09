import { useState } from 'react';
import { demoState, emptyState } from '../store.js';
import { MODELS } from '../ai.js';
import { Field, Num } from '../components/ui.jsx';

export default function Settings({ state, update, replace }) {
  const s = state.settings;
  const set = (patch) => update((d) => Object.assign(d.settings, patch));
  const [showKey, setShowKey] = useState(false);
  const [msg, setMsg] = useState('');

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ ...state, settings: { ...state.settings, apiKey: '' } }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kus-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importJson = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        if (!window.confirm('Замінити всі поточні дані даними з файлу?')) return;
        replace({ ...data, settings: { ...data.settings, apiKey: s.apiKey } });
        setMsg('Дані відновлено з резервної копії ✓');
      } catch {
        setMsg('Не вдалося прочитати файл — це точно резервна копія KUS?');
      }
    };
    r.readAsText(f);
    e.target.value = '';
  };
  const exportCsv = () => {
    const rows = [['Дата', 'Товар', 'Кількість', 'Ціна', 'Собівартість/шт', 'Знижка чеку', 'Оплата', 'Коментар']];
    for (const sale of state.sales) for (const i of sale.items) rows.push([sale.date, i.name, i.qty, i.price, i.cost, sale.discount || 0, sale.payment, sale.note || '']);
    const csv = '﻿' + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `kus-sales-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };
  const onLogo = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        const k = Math.min(1, 160 / Math.max(img.width, img.height));
        c.width = img.width * k; c.height = img.height * k;
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        set({ logo: c.toDataURL('image/png') });
      };
      img.src = r.result;
    };
    r.readAsDataURL(f);
  };

  return (
    <section>
      <header className="page-head"><div><h1>Налаштування</h1></div></header>

      <div className="card pad">
        <h3>Бренд</h3>
        <div className="grid2">
          <Field label="Назва бренду"><input value={s.brandName} onChange={(e) => set({ brandName: e.target.value })} /></Field>
          <Field label="Підпис"><input value={s.tagline} onChange={(e) => set({ tagline: e.target.value })} /></Field>
          <Field label="Фірмовий колір"><input type="color" value={s.accent} onChange={(e) => set({ accent: e.target.value })} /></Field>
          <Field label="Логотип">
            <div className="row gap">
              {s.logo && <img src={s.logo} alt="Логотип" className="thumb" />}
              <label className="btn ghost small file-btn">Завантажити<input type="file" accept="image/*" onChange={onLogo} hidden /></label>
              {s.logo && <button className="btn ghost small" onClick={() => set({ logo: '' })}>Прибрати</button>}
            </div>
          </Field>
        </div>
      </div>

      <div className="card pad">
        <h3>Облік</h3>
        <div className="grid2">
          <Field label="Валюта"><input value={s.currency} onChange={(e) => set({ currency: e.target.value })} /></Field>
          <Field label="Місто (для пошуку цін)"><input value={s.city} onChange={(e) => set({ city: e.target.value })} /></Field>
          <Field label="Цільова маржа, %" hint="Для підказки рекомендованої ціни в техкартах"><Num value={s.targetMargin} onChange={(v) => set({ targetMargin: v })} /></Field>
        </div>
      </div>

      <div className="card pad">
        <h3>✨ AI (Claude від Anthropic)</h3>
        <p className="muted">
          Ключ отримайте на <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a> (потрібно поповнити баланс, кілька доларів вистачить надовго).
          Ключ зберігається тільки в цьому браузері й надсилається лише в Anthropic. Не користуйтеся цим на чужих комп’ютерах.
        </p>
        <div className="grid2">
          <Field label="API-ключ">
            <div className="row gap">
              <input className="grow" type={showKey ? 'text' : 'password'} value={s.apiKey} onChange={(e) => set({ apiKey: e.target.value.trim() })} placeholder="sk-ant-…" autoComplete="off" />
              <button className="btn ghost small" onClick={() => setShowKey((v) => !v)}>{showKey ? 'Сховати' : 'Показати'}</button>
            </div>
          </Field>
          <Field label="Модель">
            <select value={s.model} onChange={(e) => set({ model: e.target.value })}>
              {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </Field>
        </div>
      </div>

      <div className="card pad">
        <h3>Дані</h3>
        <p className="muted">Усі дані зберігаються у вашому браузері на цьому пристрої. Регулярно робіть резервну копію — і нею ж можна перенести дані на інший пристрій.</p>
        <div className="row gap wrap">
          <button className="btn primary" onClick={exportJson}>⬇ Резервна копія (JSON)</button>
          <label className="btn ghost file-btn">⬆ Відновити з копії<input type="file" accept="application/json,.json" onChange={importJson} hidden /></label>
          <button className="btn ghost" onClick={exportCsv}>Продажі в Excel (CSV)</button>
        </div>
        {msg && <div className="alert ok">{msg}</div>}
        <hr />
        <div className="row gap wrap">
          <button className="btn danger ghost" onClick={() => window.confirm('Видалити ВСІ дані й почати з чистого аркуша? Спершу зробіть резервну копію!') && replace({ ...emptyState(), settings: { ...s } })}>Почати з чистого аркуша</button>
          <button className="btn ghost" onClick={() => window.confirm('Замінити все демо-даними?') && replace({ ...demoState(), settings: { ...s } })}>Завантажити демо-дані</button>
        </div>
      </div>
    </section>
  );
}
