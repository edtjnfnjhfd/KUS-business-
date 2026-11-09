import { useMemo, useState } from 'react';
import { PAYMENTS } from '../store.js';
import { PERIODS, buildReport, money, num, pct, periodRange } from '../calc.js';
import { Empty, PeriodPicker, Stat } from '../components/ui.jsx';
import BarChart from '../components/BarChart.jsx';

export default function Reports({ state }) {
  const cur = state.settings.currency;
  const [period, setPeriod] = useState('month');
  const [custom, setCustom] = useState({});
  const [showTable, setShowTable] = useState(false);
  const rep = useMemo(() => buildReport(state, periodRange(period, new Date(), custom)), [state, period, custom]);

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Звіти</h1>
          <p className="muted">Скільки заробили: за день, тиждень, місяць або весь час.</p>
        </div>
      </header>
      <PeriodPicker value={period} onChange={setPeriod} custom={custom} onCustom={setCustom} periods={PERIODS} />

      <div className="stats">
        <Stat label="Виручка" value={money(rep.revenue, cur)} sub={rep.discount > 0 ? `знижки ${money(rep.discount, cur)}` : `${rep.checks} чеків`} />
        <Stat label="Собівартість проданого" value={money(rep.cost, cur)} sub="інгредієнти + пакування" />
        <Stat label="Валовий прибуток" value={money(rep.profit, cur)} sub={`маржа ${pct(rep.marginPct)}`} />
        <Stat label="Інші витрати" value={money(rep.expenses, cur)} sub="оренда, реклама…" />
        <Stat label="Чистий прибуток" value={money(rep.net, cur)} tone={rep.net < 0 ? 'neg' : 'pos'} sub="валовий − витрати" />
        <Stat label="Продано" value={`${num(rep.qty)} шт`} sub={`сер. чек ${money(rep.avgCheck, cur)}`} />
      </div>

      {rep.checks === 0 && rep.expenses === 0 ? <Empty icon="📊" title="За цей період немає даних" /> : (
        <>
          {rep.series.length > 1 && (
            <div className="card pad">
              <div className="row between">
                <h3>{rep.series.byMonth ? 'По місяцях' : 'По днях'}</h3>
                <button className="btn small ghost" onClick={() => setShowTable((v) => !v)}>{showTable ? 'Графік' : 'Таблиця'}</button>
              </div>
              {showTable ? (
                <div className="table-wrap">
                  <table className="table compact">
                    <thead><tr><th>{rep.series.byMonth ? 'Місяць' : 'День'}</th><th className="r">Виручка</th><th className="r">Валовий прибуток</th><th className="r">Шт</th></tr></thead>
                    <tbody>{rep.series.filter((b) => b.revenue || b.qty).map((b) => <tr key={b.key}><td>{b.key}</td><td className="r">{money(b.revenue, cur)}</td><td className="r">{money(b.profit, cur)}</td><td className="r">{num(b.qty)}</td></tr>)}</tbody>
                  </table>
                </div>
              ) : <BarChart data={rep.series} byMonth={rep.series.byMonth} currency={cur} />}
            </div>
          )}

          <div className="grid2 top">
            <div className="card pad">
              <h3>Що продається найкраще</h3>
              {rep.products.length === 0 ? <p className="muted">Немає продажів</p> : (
                <div className="table-wrap">
                  <table className="table compact">
                    <thead><tr><th>Товар</th><th className="r">Шт</th><th className="r">Виручка</th><th className="r">Прибуток</th><th className="r">Частка</th></tr></thead>
                    <tbody>
                      {rep.products.map((p) => (
                        <tr key={p.name}>
                          <td>{p.name}</td>
                          <td className="r">{num(p.qty)}</td>
                          <td className="r">{money(p.revenue, cur)}</td>
                          <td className="r">{money(p.profit, cur)}</td>
                          <td className="r muted">{pct(rep.revenue ? (p.revenue / rep.revenue) * 100 : 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="card pad">
              <h3>Оплати</h3>
              {rep.payments.length === 0 ? <p className="muted">—</p> : (
                <ul className="plain kv">{rep.payments.map((p) => <li key={p.key}><span>{PAYMENTS[p.key] || p.key}</span><b>{money(p.amount, cur)}</b></li>)}</ul>
              )}
              <h3>Витрати за категоріями</h3>
              {rep.expCats.length === 0 ? <p className="muted">Витрат немає</p> : (
                <ul className="plain kv">{rep.expCats.map((e) => <li key={e.name}><span>{e.name}</span><b>{money(e.amount, cur)}</b></li>)}</ul>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
