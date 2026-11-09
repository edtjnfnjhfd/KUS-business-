import { useMemo, useState } from 'react';
import { MONEY_TYPES, PERIODS, accountBalances, customerStats, fmtDateTime, inRange, money, moneyFlow, periodRange, uid } from '../calc.js';
import { Empty, Field, Num, PageHead, PeriodPicker, Seg, Toast, confirmDelete, useToast } from '../components/ui.jsx';

const OPS = [
  { id: 'deposit', label: 'Внесення' },
  { id: 'withdraw', label: 'Вилучення' },
  { id: 'transfer', label: 'Переказ' },
  { id: 'opening', label: 'Початковий залишок' },
];

export default function Money({ state, update }) {
  const cur = state.settings.currency;
  const [period, setPeriod] = useState('month');
  const [custom, setCustom] = useState({});
  const [acc, setAcc] = useState('');
  const [op, setOp] = useState({ type: 'withdraw', accountId: 'cash', toAccountId: 'transfer', amount: 0, note: '' });
  const [toast, showToast] = useToast();
  const balances = useMemo(() => accountBalances(state), [state]);
  const range = periodRange(period, new Date(), custom);
  const flow = useMemo(() => moneyFlow(state).filter((m) => inRange(m.date, range) && (!acc || m.accountId === acc)).sort((a, b) => new Date(b.date) - new Date(a.date)), [state, period, custom, acc]); // eslint-disable-line react-hooks/exhaustive-deps
  const debts = state.customers.reduce((t, c) => t + Math.max(0, customerStats(state, c.id).debt), 0);
  const total = [...balances.values()].reduce((a, b) => a + b, 0);
  const inSum = flow.filter((m) => m.amount > 0).reduce((t, m) => t + m.amount, 0);
  const outSum = flow.filter((m) => m.amount < 0).reduce((t, m) => t + m.amount, 0);

  const save = () => {
    if (!op.amount) return;
    const a = Math.abs(Number(op.amount));
    const amount = op.type === 'withdraw' ? -a : a;
    update((d) => { d.moneyMoves.push({ id: uid(), date: new Date().toISOString(), type: op.type, accountId: op.accountId, toAccountId: op.type === 'transfer' ? op.toAccountId : '', amount, note: op.note }); });
    setOp({ ...op, amount: 0, note: '' });
    showToast('Записано');
  };
  const addAccount = () => {
    const name = window.prompt('Назва рахунку (наприклад «Монобанк ФОП», «Сейф»):');
    if (!name) return;
    update((d) => { d.accounts.push({ id: uid(), name, type: 'bank' }); });
  };

  return (
    <section>
      <PageHead title="Гроші й рахунки" sub="Скільки грошей де лежить: каса, термінал, рахунок ФОП. Продажі, витрати, постачання й передоплати потрапляють сюди автоматично.">
        <button className="btn ghost" onClick={addAccount}>+ Рахунок</button>
      </PageHead>
      <div className="stats">
        {state.accounts.map((a) => (
          <button key={a.id} className={'stat stat-btn' + (acc === a.id ? ' sel' : '')} onClick={() => setAcc(acc === a.id ? '' : a.id)}>
            <div className="stat-label">{a.name}</div>
            <div className={'stat-value ' + ((balances.get(a.id) || 0) < 0 ? 'neg' : '')}>{money(balances.get(a.id) || 0, cur)}</div>
            <div className="stat-sub">{acc === a.id ? 'показано лише цей рахунок' : 'натисніть, щоб відфільтрувати'}</div>
          </button>
        ))}
        <div className="stat"><div className="stat-label">Разом</div><div className="stat-value">{money(total, cur)}</div><div className="stat-sub">+ вам винні {money(debts, cur)}</div></div>
      </div>

      <div className="card pad">
        <h3>Операція</h3>
        <Seg value={op.type} onChange={(t) => setOp({ ...op, type: t })} options={OPS} />
        <div className="form-grid">
          <Field label={op.type === 'transfer' ? 'З рахунку' : 'Рахунок'}>
            <select value={op.accountId} onChange={(e) => setOp({ ...op, accountId: e.target.value })}>{state.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          </Field>
          {op.type === 'transfer' && (
            <Field label="На рахунок">
              <select value={op.toAccountId} onChange={(e) => setOp({ ...op, toAccountId: e.target.value })}>{state.accounts.filter((a) => a.id !== op.accountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            </Field>
          )}
          <Field label={`Сума, ${cur}`}><Num value={op.amount} onChange={(v) => setOp({ ...op, amount: v })} /></Field>
          <Field label="Коментар"><input value={op.note} onChange={(e) => setOp({ ...op, note: e.target.value })} placeholder={op.type === 'transfer' ? 'Інкасація в банк' : ''} /></Field>
        </div>
        <button className="btn primary" onClick={save}>Записати</button>
      </div>

      <PeriodPicker value={period} onChange={setPeriod} custom={custom} onCustom={setCustom} periods={PERIODS} />
      <p className="muted">Надходження: <b className="pos">{money(inSum, cur)}</b> · Видатки: <b className="neg">{money(outSum, cur)}</b></p>
      {flow.length === 0 ? <Empty icon="💳" title="Рухів за період немає" /> : (
        <div className="table-wrap">
          <table className="table stack">
            <thead><tr><th>Дата</th><th>Операція</th><th>Рахунок</th><th className="r">Сума</th><th /></tr></thead>
            <tbody>
              {flow.slice(0, 300).map((m, k) => (
                <tr key={m.ref + k}>
                  <td data-label="Дата" className="nowrap">{fmtDateTime(m.date)}</td>
                  <td data-label="Операція">{m.label}</td>
                  <td data-label="Рахунок">{state.accounts.find((a) => a.id === m.accountId)?.name || m.accountId}</td>
                  <td data-label="Сума" className={'r nowrap strong ' + (m.amount < 0 ? 'neg' : 'pos')}>{m.amount > 0 ? '+' : ''}{money(m.amount, cur)}</td>
                  <td>{MONEY_TYPES[m.kind] && <button className="icon-btn" onClick={() => confirmDelete('операцію') && update((d) => { d.moneyMoves = d.moneyMoves.filter((x) => x.id !== m.ref); })} aria-label="Видалити">✕</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Toast text={toast} />
    </section>
  );
}
