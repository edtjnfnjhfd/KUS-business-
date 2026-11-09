import { useMemo, useState } from 'react';
import { customerStats, fmtDate, fmtDateTime, money, saleTotals, uid, upcomingBirthdays } from '../calc.js';
import { Badge, Empty, Field, Modal, Num, PageHead, Seg, Stat, confirmDelete } from '../components/ui.jsx';

export default function Customers({ state, update, can }) {
  const cur = state.settings.currency;
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [openId, setOpenId] = useState(null);
  const stats = useMemo(() => new Map(state.customers.map((c) => [c.id, customerStats(state, c.id)])), [state]);
  const bdays = upcomingBirthdays(state.customers, 7);
  const s = q.trim().toLowerCase();
  const list = state.customers
    .filter((c) => !s || c.name.toLowerCase().includes(s) || (c.phone || '').includes(s) || (c.instagram || '').toLowerCase().includes(s))
    .filter((c) => filter === 'all' || (filter === 'wholesale' ? c.type === 'wholesale' : filter === 'retail' ? c.type !== 'wholesale' : stats.get(c.id).debt > 0.009))
    .sort((a, b) => stats.get(b.id).spent - stats.get(a.id).spent);
  const totalDebt = [...stats.values()].reduce((t, x) => t + Math.max(0, x.debt), 0);

  const add = () => {
    const id = uid();
    update((d) => { d.customers.push({ id, name: 'Новий клієнт', phone: '', instagram: '', birthday: '', type: 'retail', discountPct: 0, note: '', createdAt: new Date().toISOString() }); });
    setOpenId(id);
  };

  return (
    <section>
      <PageHead title="Клієнти та опт" sub={`Бонуси: ${Number(state.settings.bonusPct) > 0 ? `${state.settings.bonusPct}% кешбеку з кожної покупки` : 'вимкнено (увімкніть у Налаштуваннях)'}. Оптовим клієнтам каса ставить оптові ціни з техкарт.`}>
        <button className="btn primary" onClick={add}>+ Клієнт</button>
      </PageHead>
      <div className="stats stats-3">
        <Stat label="Клієнтів" value={state.customers.length} sub={`з них опт: ${state.customers.filter((c) => c.type === 'wholesale').length}`} />
        <Stat label="Винні вам" value={money(totalDebt, cur)} tone={totalDebt > 0 ? 'neg' : undefined} sub="борги клієнтів" />
        <Stat label="Дні народження" value={bdays.length} sub="найближчі 7 днів" />
      </div>
      {bdays.length > 0 && (
        <div className="alert info">🎂 {bdays.map((b) => `${b.customer.name} — ${b.inDays === 0 ? 'сьогодні' : b.inDays === 1 ? 'завтра' : `через ${b.inDays} дн.`}`).join(' · ')}</div>
      )}
      <div className="toolbar">
        <input className="search" placeholder="Ім’я, телефон, Instagram…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Seg value={filter} onChange={setFilter} className="no-mb" options={[{ id: 'all', label: 'Усі' }, { id: 'retail', label: 'Роздріб' }, { id: 'wholesale', label: 'Опт' }, { id: 'debt', label: 'Боржники' }]} />
      </div>
      {list.length === 0 ? <Empty icon="👥" title="Клієнтів не знайдено">Клієнта можна додати і прямо з каси — почніть вводити ім’я в чеку.</Empty> : (
        <div className="table-wrap">
          <table className="table stack">
            <thead><tr><th>Клієнт</th><th>Контакти</th><th className="r">Покупки</th><th className="r">Остання</th><th className="r">Бонуси</th><th className="r">Борг</th></tr></thead>
            <tbody>
              {list.map((c) => {
                const st = stats.get(c.id);
                return (
                  <tr key={c.id} className="clickable" onClick={() => setOpenId(c.id)}>
                    <td data-label="Клієнт"><b>{c.name}</b> {c.type === 'wholesale' && <Badge tone="blue">опт</Badge>}{c.discountPct > 0 && <Badge tone="grey">−{c.discountPct}%</Badge>}{c.note && <div className="muted small ellipsis">{c.note}</div>}</td>
                    <td data-label="Контакти">{c.phone}{c.instagram && <div className="muted small">{c.instagram}</div>}</td>
                    <td data-label="Покупки" className="r nowrap">{money(st.spent, cur)}<div className="muted small">{st.checks} чеків</div></td>
                    <td data-label="Остання" className="r nowrap">{st.last ? fmtDate(st.last) : '—'}</td>
                    <td data-label="Бонуси" className="r nowrap">{st.bonus > 0 ? money(st.bonus, cur) : '—'}</td>
                    <td data-label="Борг" className={'r nowrap ' + (st.debt > 0.009 ? 'neg strong' : '')}>{st.debt > 0.009 ? money(st.debt, cur) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {openId && <CustomerModal id={openId} state={state} update={update} can={can} onClose={() => setOpenId(null)} />}
    </section>
  );
}

function CustomerModal({ id, state, update, can, onClose }) {
  const c = state.customers.find((x) => x.id === id);
  const [pay, setPay] = useState({ amount: 0, accountId: 'cash' });
  if (!c) return null;
  const cur = state.settings.currency;
  const st = customerStats(state, id);
  const set = (patch) => update((d) => Object.assign(d.customers.find((x) => x.id === id), patch));
  const remove = () => {
    if (!confirmDelete(`клієнта «${c.name}» (його чеки залишаться)`)) return;
    update((d) => { d.customers = d.customers.filter((x) => x.id !== id); });
    onClose();
  };
  const payDebt = () => {
    if (!(pay.amount > 0)) return;
    update((d) => { d.moneyMoves.push({ id: uid(), date: new Date().toISOString(), type: 'debtPayment', accountId: pay.accountId, customerId: id, amount: Number(pay.amount), note: c.name }); });
    setPay({ ...pay, amount: 0 });
  };
  const history = [...st.sales].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 30);

  return (
    <Modal title={c.name} onClose={onClose} wide
      footer={<><button className="btn danger ghost" onClick={remove}>Видалити</button><span className="grow" /><button className="btn primary" onClick={onClose}>Готово</button></>}>
      <div className="grid2">
        <Field label="Ім’я / назва"><input value={c.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Телефон"><input type="tel" value={c.phone || ''} onChange={(e) => set({ phone: e.target.value })} /></Field>
        <Field label="Instagram / Telegram"><input value={c.instagram || ''} onChange={(e) => set({ instagram: e.target.value })} /></Field>
        <Field label="День народження"><input type="date" value={c.birthday || ''} onChange={(e) => set({ birthday: e.target.value })} /></Field>
        <Field label="Тип">
          <select value={c.type || 'retail'} onChange={(e) => set({ type: e.target.value })}>
            <option value="retail">Роздрібний</option>
            <option value="wholesale">Оптовий (кав’ярня, магазин)</option>
          </select>
        </Field>
        <Field label="Персональна знижка, %"><Num value={c.discountPct || 0} onChange={(v) => set({ discountPct: Math.max(0, Math.min(100, v)) })} /></Field>
      </div>
      <Field label="Нотатки"><textarea rows={2} value={c.note || ''} onChange={(e) => set({ note: e.target.value })} /></Field>

      <div className="stats stats-4">
        <Stat label="Купив на" value={money(st.spent, cur)} sub={`${st.checks} чеків`} />
        <Stat label="Середній чек" value={money(st.avg, cur)} />
        <Stat label="Бонуси" value={money(st.bonus, cur)} />
        <Stat label="Борг" value={money(Math.max(0, st.debt), cur)} tone={st.debt > 0.009 ? 'neg' : undefined} />
      </div>

      {st.debt > 0.009 && (
        <div className="card pad soft">
          <b>Погашення боргу</b>
          <div className="form-grid">
            <Field label={`Сума, ${cur}`}><Num value={pay.amount} onChange={(v) => setPay({ ...pay, amount: v })} /></Field>
            <Field label="Куди надійшли гроші">
              <select value={pay.accountId} onChange={(e) => setPay({ ...pay, accountId: e.target.value })}>{state.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            </Field>
          </div>
          <div className="row gap"><button className="btn primary small" onClick={payDebt}>Записати оплату</button><button className="btn ghost small" onClick={() => setPay({ ...pay, amount: st.debt })}>Весь борг ({money(st.debt, cur)})</button></div>
        </div>
      )}

      <h4>Історія покупок</h4>
      {history.length === 0 ? <p className="muted">Покупок ще не було.</p> : (
        <table className="table compact">
          <tbody>{history.map((s) => <tr key={s.id}><td className="nowrap">{fmtDateTime(s.date)}</td><td>{s.items.map((i) => `${i.name} × ${i.qty}`).join(', ')}</td><td className="r nowrap">{money(saleTotals(s).revenue, cur)}{s.payment === 'debt' && <div className="neg small">в борг</div>}</td></tr>)}</tbody>
        </table>
      )}
      {!can('costs') && null}
    </Modal>
  );
}
