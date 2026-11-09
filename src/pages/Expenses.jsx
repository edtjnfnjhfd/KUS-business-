import { useState } from 'react';
import { EXPENSE_CATEGORIES } from '../store.js';
import { PERIODS, dayKey, fmtDate, inRange, money, periodRange, uid } from '../calc.js';
import { Empty, Num, PeriodPicker, confirmDelete } from '../components/ui.jsx';

export default function Expenses({ state, update }) {
  const cur = state.settings.currency;
  const [period, setPeriod] = useState('month');
  const [custom, setCustom] = useState({});
  const [form, setForm] = useState({ date: dayKey(new Date()), category: 'Реклама', amount: 0, note: '' });

  const range = periodRange(period, new Date(), custom);
  const list = state.expenses.filter((e) => inRange(e.date, range)).sort((a, b) => new Date(b.date) - new Date(a.date));
  const total = list.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const add = (e) => {
    e.preventDefault();
    if (!form.amount) return;
    update((d) => { d.expenses.push({ id: uid(), ...form, date: new Date(form.date + 'T12:00').toISOString() }); });
    setForm({ ...form, amount: 0, note: '' });
  };
  const set = (id, patch) => update((d) => Object.assign(d.expenses.find((x) => x.id === id), patch));

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Витрати</h1>
          <p className="muted">Оренда, реклама, обладнання тощо. Інгредієнти й пакування сюди не вносьте — вони вже враховані в собівартості проданого.</p>
        </div>
      </header>

      <form className="card pad expense-form" onSubmit={add}>
        <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} aria-label="Дата" />
        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} aria-label="Категорія">
          {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <Num value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} placeholder={`Сума, ${cur}`} aria-label="Сума" />
        <input className="grow" placeholder="Опис" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        <button className="btn primary" type="submit">+ Додати</button>
      </form>

      <PeriodPicker value={period} onChange={setPeriod} custom={custom} onCustom={setCustom} periods={PERIODS} />
      <p className="muted">Разом за період: <b>{money(total, cur)}</b></p>

      {list.length === 0 ? <Empty icon="💸" title="Витрат за цей період немає" /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Дата</th><th>Категорія</th><th>Опис</th><th className="r">Сума</th><th /></tr></thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id}>
                  <td className="nowrap"><input type="date" className="inline-date" value={dayKey(e.date)} onChange={(ev) => ev.target.value && set(e.id, { date: new Date(ev.target.value + 'T12:00').toISOString() })} aria-label={`Дата ${fmtDate(e.date)}`} /></td>
                  <td>
                    <select value={e.category} onChange={(ev) => set(e.id, { category: ev.target.value })}>
                      {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </td>
                  <td><input value={e.note || ''} onChange={(ev) => set(e.id, { note: ev.target.value })} aria-label="Опис" /></td>
                  <td className="r"><Num className="inline" value={e.amount} onChange={(v) => set(e.id, { amount: v })} aria-label="Сума" /></td>
                  <td><button className="icon-btn" onClick={() => confirmDelete('витрату') && update((d) => { d.expenses = d.expenses.filter((x) => x.id !== e.id); })} aria-label="Видалити">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
