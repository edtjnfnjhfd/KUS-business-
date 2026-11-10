import { useState } from 'react';
import { demoState, emptyState } from '../store.js';
import { MODELS } from '../ai.js';
import { SETUP_SQL } from '../sync.js';
import { reportText, sendTelegram } from '../telegram.js';
import { checkboxStatus, explainFiscalError } from '../fiscal.js';
import { Field, Num, PageHead, Seg, Toast, useToast } from '../components/ui.jsx';

const TABS = [
  { id: 'brand', label: 'Бренд' },
  { id: 'acc', label: 'Облік' },
  { id: 'sync', label: '☁︎ Синхронізація' },
  { id: 'tg', label: 'Telegram' },
  { id: 'prro', label: 'ПРРО' },
  { id: 'ai', label: 'AI' },
  { id: 'data', label: 'Дані' },
];

export default function Settings(props) {
  const [tab, setTab] = useState('brand');
  const [toast, showToast] = useToast();
  const p = { ...props, toast: showToast };
  return (
    <section>
      <PageHead title="Налаштування" />
      <Seg value={tab} onChange={setTab} options={TABS} className="scroll-x" />
      {tab === 'brand' && <Brand {...p} />}
      {tab === 'acc' && <Accounting {...p} />}
      {tab === 'sync' && <Sync {...p} />}
      {tab === 'tg' && <Telegram {...p} />}
      {tab === 'prro' && <Prro {...p} />}
      {tab === 'ai' && <AI {...p} />}
      {tab === 'data' && <Data {...p} />}
      <Toast text={toast} />
    </section>
  );
}

function Brand({ state, update }) {
  const s = state.settings;
  const set = (patch) => update((d) => Object.assign(d.settings, patch));
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
    <div className="card pad">
      <div className="form-grid">
        <Field label="Назва бренду"><input value={s.brandName} onChange={(e) => set({ brandName: e.target.value })} /></Field>
        <Field label="Підпис"><input value={s.tagline} onChange={(e) => set({ tagline: e.target.value })} /></Field>
        <Field label="Фірмовий колір"><input type="color" value={s.accent} onChange={(e) => set({ accent: e.target.value })} /></Field>
        <Field label="Логотип">
          <div className="row gap wrap">
            {s.logo && <img src={s.logo} alt="Логотип" className="thumb" />}
            <label className="btn ghost small file-btn">Завантажити<input type="file" accept="image/*" onChange={onLogo} hidden /></label>
            {s.logo && <button className="btn ghost small" onClick={() => set({ logo: '' })}>Прибрати</button>}
          </div>
        </Field>
        <Field label="Виробник (для етикеток і накладних)" hint="ФОП Прізвище І.П., адреса, телефон" className="span2"><input value={s.producer || ''} onChange={(e) => set({ producer: e.target.value })} /></Field>
      </div>
    </div>
  );
}

function Accounting({ state, update }) {
  const s = state.settings;
  const set = (patch) => update((d) => Object.assign(d.settings, patch));
  const [newCh, setNewCh] = useState('');
  return (
    <div className="card pad">
      <div className="form-grid">
        <Field label="Валюта"><input value={s.currency} onChange={(e) => set({ currency: e.target.value })} /></Field>
        <Field label="Місто (для пошуку цін)"><input value={s.city} onChange={(e) => set({ city: e.target.value })} /></Field>
        <Field label="Цільова маржа, %" hint="Для рекомендованої ціни в техкартах"><Num value={s.targetMargin} onChange={(v) => set({ targetMargin: v })} /></Field>
        <Field label={`Доставка для клієнта, ${s.currency}`} hint="Підставляється в касі й замовленнях з доставкою (можна змінити в кожному)"><Num value={s.deliveryFee ?? 50} onChange={(v) => set({ deliveryFee: Math.max(0, v) })} /></Field>
        <Field label="Бонуси клієнтам, % кешбеку" hint="0 — вимкнено. Бонусами можна оплатити частину наступної покупки"><Num value={s.bonusPct} onChange={(v) => set({ bonusPct: Math.max(0, Math.min(50, v)) })} /></Field>
      </div>
      <h4>Рахунки</h4>
      <div className="line-list">
        {state.accounts.map((a) => (
          <div key={a.id} className="line-row">
            <input className="grow" value={a.name} onChange={(e) => update((d) => { d.accounts.find((x) => x.id === a.id).name = e.target.value; })} aria-label="Назва рахунку" />
            <select value={a.type} onChange={(e) => update((d) => { d.accounts.find((x) => x.id === a.id).type = e.target.value; })} aria-label="Тип">
              <option value="cash">Готівка</option><option value="card">Картка / термінал</option><option value="bank">Банківський рахунок</option>
            </select>
          </div>
        ))}
      </div>
      <h4>Канали продажів</h4>
      <div className="chips">
        {s.channels.map((c) => (
          <span key={c} className={'chip' + (s.defaultChannel === c ? ' on' : '')}>
            <button className="link plain-link" onClick={() => set({ defaultChannel: c })} title="Зробити каналом за замовчуванням">{c}</button>
            <button className="chip-x" onClick={() => set({ channels: s.channels.filter((x) => x !== c) })} aria-label={`Видалити ${c}`}>✕</button>
          </span>
        ))}
      </div>
      <div className="row gap">
        <input value={newCh} onChange={(e) => setNewCh(e.target.value)} placeholder="Новий канал (Glovo, ярмарок…)" />
        <button className="btn small" onClick={() => { if (newCh.trim() && !s.channels.includes(newCh.trim())) set({ channels: [...s.channels, newCh.trim()] }); setNewCh(''); }}>Додати</button>
      </div>
      <p className="muted small">Виділений канал ставиться в касі за замовчуванням.</p>
    </div>
  );
}

function Sync({ local, setLocal, sync, toast }) {
  const [url, setUrl] = useState(local.sync?.url || '');
  const [key, setKey] = useState(local.sync?.key || '');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const connected = sync.enabled;
  const auth = async (create) => {
    setBusy(true);
    try {
      const r = await sync.signIn(email.trim(), pw, create);
      toast(r === 'confirm' ? 'Підтвердіть email (лист від Supabase), потім увійдіть' : 'Вхід виконано, синхронізую…');
    } catch (e) { toast('Помилка: ' + e.message); } finally { setBusy(false); }
  };
  return (
    <div className="card pad">
      <p>Щоб дані були однакові на телефоні, ПК і в кількох працівників — підключіть безкоштовну хмарну базу <b>Supabase</b>. Без неї все працює, але лише в цьому браузері.</p>
      {!connected && (
        <ol className="steps">
          <li>Зареєструйтесь на <a href="https://supabase.com" target="_blank" rel="noreferrer">supabase.com</a> → <b>New project</b> (регіон — Frankfurt, пароль бази запишіть).</li>
          <li>Відкрийте <b>SQL Editor</b>, вставте код нижче й натисніть <b>Run</b>.</li>
          <li>У <b>Project Settings → API</b> скопіюйте <b>Project URL</b> і <b>anon public</b> key сюди.</li>
          <li>Створіть обліковий запис нижче (один на весь бізнес) і увійдіть ним на всіх пристроях.</li>
        </ol>
      )}
      {!connected && (
        <details className="sql-box">
          <summary>Показати SQL для Supabase</summary>
          <pre>{SETUP_SQL}</pre>
          <button className="btn small" onClick={async () => { try { await navigator.clipboard.writeText(SETUP_SQL); toast('SQL скопійовано'); } catch { toast('Скопіюйте вручну'); } }}>📋 Скопіювати</button>
        </details>
      )}
      <div className="form-grid">
        <Field label="Project URL"><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" disabled={connected} /></Field>
        <Field label="anon public key"><input value={key} onChange={(e) => setKey(e.target.value)} placeholder="eyJhbGciOi…" disabled={connected} /></Field>
      </div>
      {!connected ? (
        <button className="btn primary" disabled={!url || !key} onClick={() => setLocal({ sync: { url: url.trim(), key: key.trim() } })}>Підключити</button>
      ) : (
        <>
          <div className={'alert ' + (sync.status === 'ok' ? 'ok' : sync.status === 'error' ? 'err' : 'info')}>
            {sync.loggedIn ? <>Обліковий запис: <b>{sync.email}</b>. {sync.message || 'Синхронізація…'}</> : 'Увійдіть або створіть обліковий запис бізнесу.'}
          </div>
          {!sync.loggedIn ? (
            <>
              <div className="form-grid">
                <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></Field>
                <Field label="Пароль"><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" /></Field>
              </div>
              <div className="row gap wrap">
                <button className="btn primary" disabled={busy || !email || pw.length < 6} onClick={() => auth(false)}>Увійти</button>
                <button className="btn ghost" disabled={busy || !email || pw.length < 6} onClick={() => auth(true)}>Створити обліковий запис</button>
              </div>
            </>
          ) : (
            <div className="row gap wrap">
              <button className="btn" onClick={() => sync.syncNow()}>⟳ Синхронізувати зараз</button>
              <button className="btn ghost" onClick={() => sync.signOut()}>Вийти</button>
            </div>
          )}
          <button className="btn ghost danger small" style={{ marginTop: 12 }} onClick={() => window.confirm('Відключити синхронізацію на цьому пристрої? Дані в хмарі залишаться.') && sync.disconnect()}>Відключити Supabase</button>
        </>
      )}
      <p className="muted small">Перший пристрій вивантажує свої дані в хмару, наступні — зливають свої дані з хмарними (нічого не губиться). Якщо на новому пристрої є лише демо-дані — спершу натисніть «Дані → Почати з чистого аркуша».</p>
    </div>
  );
}

function Telegram({ state, update, toast }) {
  const tg = state.settings.telegram;
  const set = (patch) => update((d) => Object.assign(d.settings.telegram, patch));
  const [busy, setBusy] = useState(false);
  const test = async () => {
    setBusy(true);
    try { await sendTelegram(tg, reportText(state, 'today', 'звіт за сьогодні')); toast('Надіслано ✓'); } catch (e) { toast(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="card pad">
      <ol className="steps">
        <li>У Telegram відкрийте <b>@BotFather</b> → <code>/newbot</code> → придумайте назву → скопіюйте <b>токен</b>.</li>
        <li>Напишіть своєму боту будь-що (наприклад «привіт»).</li>
        <li>Відкрийте <b>@userinfobot</b> → він покаже ваш <b>ID</b> — це chat ID. Для групи: додайте бота в групу, ID групи починається з «-».</li>
      </ol>
      <div className="form-grid">
        <Field label="Токен бота"><input value={tg.token} onChange={(e) => set({ token: e.target.value.trim() })} placeholder="123456:ABC-DEF…" /></Field>
        <Field label="Chat ID"><input value={tg.chatId} onChange={(e) => set({ chatId: e.target.value.trim() })} placeholder="123456789" /></Field>
      </div>
      <label className="check"><input type="checkbox" checked={!!tg.onShiftClose} onChange={(e) => set({ onShiftClose: e.target.checked })} /> Надсилати звіт при закритті касової зміни</label>
      <label className="check"><input type="checkbox" checked={!!tg.daily} onChange={(e) => set({ daily: e.target.checked })} /> Щоденний звіт за вчора</label>
      <p className="muted small">Сайт не може сам надіслати повідомлення, коли він закритий. Тому щоденний звіт за вчора надсилається, коли застосунок уперше відкривають наступного дня (один раз, з будь-якого пристрою). Звіт містить виручку, прибуток, топ товарів і що закінчується на складі.</p>
      <button className="btn primary" disabled={busy || !tg.token || !tg.chatId} onClick={test}>Надіслати тестовий звіт</button>
    </div>
  );
}

function Prro({ state, update, toast }) {
  const cb = state.settings.checkbox;
  const set = (patch) => update((d) => Object.assign(d.settings.checkbox, patch));
  const [busy, setBusy] = useState(false);
  const check = async () => {
    setBusy(true);
    try { const r = await checkboxStatus(cb); toast(`Checkbox ✓ Касир: ${r.cashier}, зміна: ${r.shift === 'OPENED' ? 'відкрита' : 'закрита'}`); } catch (e) { toast('Checkbox: ' + explainFiscalError(e)); } finally { setBusy(false); }
  };
  return (
    <div className="card pad">
      <p>Фіскальні чеки через програмний РРО <b>Checkbox</b> (безкоштовний для ФОП). Обов’язковий, коли приймаєте оплату карткою/переказом на ФОП 2–3 групи — уточніть у бухгалтера.</p>
      <ol className="steps">
        <li>Зареєструйтесь на <a href="https://checkbox.ua" target="_blank" rel="noreferrer">checkbox.ua</a>, додайте ПРРО й касира з КЕП (ключ підпису).</li>
        <li>Спершу створіть <b>тестову касу</b> — чеки з неї не йдуть у податкову.</li>
        <li>Скопіюйте сюди <b>ключ ліцензії каси</b> (Каси → ваша каса) і <b>PIN-код касира</b> (Касири → касир).</li>
      </ol>
      <div className="form-grid">
        <Field label="Ключ ліцензії каси"><input value={cb.licenseKey} onChange={(e) => set({ licenseKey: e.target.value.trim() })} /></Field>
        <Field label="PIN-код касира"><input value={cb.pinCode} onChange={(e) => set({ pinCode: e.target.value.trim() })} inputMode="numeric" /></Field>
        <Field label="Коли видавати фіскальний чек">
          <select value={cb.mode} onChange={(e) => set({ mode: e.target.value })}>
            <option value="ask">Галочка в касі (вирішую сам)</option>
            <option value="card">Автоматично для безготівки</option>
            <option value="always">Завжди</option>
          </select>
        </Field>
      </div>
      <label className="check"><input type="checkbox" checked={!!cb.test} onChange={(e) => set({ test: e.target.checked })} /> Це тестова каса (позначка в чеках програми)</label>
      <label className="check"><input type="checkbox" checked={!!cb.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> <b>Увімкнути фіскалізацію</b></label>
      <div className="row gap wrap">
        <button className="btn" disabled={busy || !cb.licenseKey || !cb.pinCode} onClick={check}>Перевірити з’єднання</button>
      </div>
      <p className="muted small">Зміна в Checkbox відкривається автоматично з першим чеком і закривається з закриттям касової зміни в програмі (або сама о 23:50). Якщо чек не вдалося створити, продаж все одно зберігається — його можна фіскалізувати пізніше з розділу «Чеки».</p>
    </div>
  );
}

function AI({ local, setLocal }) {
  const [show, setShow] = useState(false);
  return (
    <div className="card pad">
      <p className="muted">
        Ключ отримайте на <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a> (потрібно поповнити баланс, кілька доларів вистачить надовго).
        Ключ зберігається тільки на цьому пристрої (не синхронізується) і надсилається лише в Anthropic.
      </p>
      <div className="form-grid">
        <Field label="API-ключ Anthropic">
          <div className="row gap">
            <input className="grow" type={show ? 'text' : 'password'} value={local.apiKey || ''} onChange={(e) => setLocal({ apiKey: e.target.value.trim() })} placeholder="sk-ant-…" autoComplete="off" />
            <button className="btn ghost small" onClick={() => setShow((v) => !v)}>{show ? 'Сховати' : 'Показати'}</button>
          </div>
        </Field>
        <Field label="Модель">
          <select value={local.model || 'claude-opus-5-5'} onChange={(e) => setLocal({ model: e.target.value })}>
            {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </Field>
      </div>
    </div>
  );
}

function Data({ state, replace, toast }) {
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
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
        replace(data);
        toast('Дані відновлено з резервної копії ✓');
      } catch {
        toast('Не вдалося прочитати файл — це точно резервна копія KUS?');
      }
    };
    r.readAsText(f);
    e.target.value = '';
  };
  const exportCsv = () => {
    const rows = [['Дата', 'Тип', 'Товар', 'Кількість', 'Ціна', 'Собівартість/шт', 'Знижка чеку', 'Оплата', 'Канал', 'Клієнт', 'Коментар']];
    const cn = new Map(state.customers.map((c) => [c.id, c.name]));
    for (const sale of state.sales) for (const i of sale.items) rows.push([sale.date, sale.type === 'return' ? 'повернення' : 'продаж', i.name, i.qty, i.price, i.cost, sale.discount || 0, sale.payment, sale.channel || '', cn.get(sale.customerId) || '', sale.note || '']);
    const csv = '﻿' + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `kus-sales-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };
  return (
    <div className="card pad">
      <p className="muted">Без синхронізації всі дані зберігаються лише в цьому браузері. Регулярно робіть резервну копію — нею ж можна перенести дані на інший пристрій.</p>
      <div className="row gap wrap">
        <button className="btn primary" onClick={exportJson}>⬇ Резервна копія (JSON)</button>
        <label className="btn ghost file-btn">⬆ Відновити з копії<input type="file" accept="application/json,.json" onChange={importJson} hidden /></label>
        <button className="btn ghost" onClick={exportCsv}>Продажі в Excel (CSV)</button>
      </div>
      <hr />
      <div className="row gap wrap">
        <button className="btn danger ghost" onClick={() => window.confirm('Видалити ВСІ дані (продажі, склад, техкарти…) і почати з чистого аркуша? Спершу зробіть резервну копію!') && replace({ ...emptyState(), settings: { ...state.settings, requirePin: false }, employees: state.employees })}>Почати з чистого аркуша</button>
        <button className="btn ghost" onClick={() => window.confirm('Замінити все демо-даними?') && replace({ ...demoState(), settings: { ...state.settings } })}>Завантажити демо-дані</button>
      </div>
      <p className="muted small">«Чистий аркуш» зберігає налаштування і список працівників.</p>
    </div>
  );
}
