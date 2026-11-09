import { useState } from 'react';
import { EXPENSE_CATEGORIES } from '../store.js';
import { PERIODS, dayKey, inRange, money, periodRange, uid } from '../calc.js';
import { Empty, Field, Num, PageHead, PeriodPicker, confirmDelete } from '../components/ui.jsx';

export default function Expenses({ state, update }) {
  const cur = state.settings.currency;
  const [period, setPeriod] = useState('month');
  const [custom, setCustom] = useState({});
  const [form, setForm] = useState({ date: dayKey(new Date()), category: 'Реклама', amount: 0, note: '', accountId: 'cash' });

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
      <PageHead title="Витрати" sub="Оренда, реклама, обладнання тощо. Інгредієнти вносьте як «Постачання» — вони потрапляють у собівартість. Зарплата — у «Персонал»." />

      <form className="card pad" onSubmit={add}>
        <div className="form-grid">
          <Field label="Дата"><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="Категорія">
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          </Field>
          <Field label={`Сума, ${cur}`}><Num value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} /></Field>
          <Field label="Оплачено з">
            <select value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>
              {state.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              <option value="">Не з рахунків бізнесу</option>
            </select>
          </Field>
          <Field label="Опис" className="span2"><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
        </div>
        <button className="btn primary" type="submit">+ Додати витрату</button>
      </form>

      <PeriodPicker value={period} onChange={setPeriod} custom={custom} onCustom={setCustom} periods={PERIODS} />
      <p className="muted">Разом за період: <b>{money(total, cur)}</b></p>

      {list.length === 0 ? <Empty icon="💸" title="Витрат за цей період немає" /> : (
        <div className="table-wrap">
          <table className="table stack edit">
            <thead><tr><th>Дата</th><th>Категорія</th><th>Опис</th><th>Рахунок</th><th className="r">Сума</th><th /></tr></thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id}>
                  <td data-label="Дата"><input type="date" value={dayKey(e.date)} onChange={(ev) => ev.target.value && set(e.id, { date: new Date(ev.target.value + 'T12:00').toISOString() })} aria-label="Дата" /></td>
                  <td data-label="Категорія"><select value={e.category} onChange={(ev) => set(e.id, { category: ev.target.value })} aria-label="Категорія">{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></td>
                  <td data-label="Опис"><input value={e.note || ''} onChange={(ev) => set(e.id, { note: ev.target.value })} aria-label="Опис" /></td>
                  <td data-label="Рахунок"><select value={e.accountId || ''} onChange={(ev) => set(e.id, { accountId: ev.target.value })} aria-label="Рахунок">{state.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}<option value="">—</option></select></td>
                  <td data-label="Сума" className="r"><Num className="price-in" value={e.amount} onChange={(v) => set(e.id, { amount: v })} aria-label="Сума" /></td>
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
