import { useMemo, useState } from 'react';
import { uid } from '../calc.js';
import { Empty, Field, Modal, PageHead, Toast, confirmDelete, useToast } from '../components/ui.jsx';

const NO_FOLDER = '__none__';

/** Копіювання в буфер з запасним способом для старих браузерів / file:// */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
}

/** Підсвічує місця для заповнення: <ім'я>, <…> */
function Highlighted({ text }) {
  const parts = String(text || '').split(/(<[^<>\n]{1,40}>)/g);
  return <>{parts.map((p, k) => (/^<[^<>\n]{1,40}>$/.test(p) ? <mark key={k} className="ph">{p}</mark> : p))}</>;
}

const hasPlaceholders = (t) => /<[^<>\n]{1,40}>/.test(t || '');

/** Інструкція: «## » — підзаголовок, «- » — пункт списку. */
function NoteText({ text }) {
  const blocks = [];
  let list = null;
  String(text || '').split('\n').forEach((line, i) => {
    if (/^\s*-\s+/.test(line)) {
      if (!list) { list = []; blocks.push({ type: 'ul', items: list, key: i }); }
      list.push(line.replace(/^\s*-\s+/, ''));
      return;
    }
    list = null;
    if (/^##\s+/.test(line)) blocks.push({ type: 'h', text: line.replace(/^##\s+/, ''), key: i });
    else if (line.trim()) blocks.push({ type: 'p', text: line, key: i });
  });
  return (
    <div className="note-text">
      {blocks.map((b) => (b.type === 'h' ? <h4 key={b.key}>{b.text}</h4> : b.type === 'ul' ? <ul key={b.key}>{b.items.map((t, j) => <li key={j}><Highlighted text={t} /></li>)}</ul> : <p key={b.key}><Highlighted text={b.text} /></p>))}
    </div>
  );
}

function ScriptCard({ sc, index, total, movable, folderName, onMove, onEdit, onCopy }) {
  const note = sc.kind === 'note';
  return (
    <article className={'card script-card' + (note ? ' note' : '')}>
      <div className="sc-head">
        <div className="sc-title">
          <b>{note ? '📖 ' : ''}{sc.title || 'Без назви'}</b>
          {sc.hint && <span className="muted small">{sc.hint}</span>}
          {folderName && <span className="tag">{folderName}</span>}
        </div>
        <div className="sc-actions">
          {movable && <button className="icon-btn" onClick={() => onMove(sc, -1)} disabled={index === 0} aria-label="Вгору">↑</button>}
          {movable && <button className="icon-btn" onClick={() => onMove(sc, 1)} disabled={index === total - 1} aria-label="Вниз">↓</button>}
          <button className="icon-btn" onClick={() => onEdit(sc.id)} aria-label="Редагувати" title="Редагувати">✎</button>
        </div>
      </div>
      {note ? <NoteText text={sc.text} /> : <div className="sc-text"><Highlighted text={sc.text} /></div>}
      {!note && <button className="btn primary block sc-copy" onClick={() => onCopy(sc)}>📋 Копіювати</button>}
    </article>
  );
}

export default function Scripts({ state, update }) {
  const folders = [...state.scriptFolders].sort((a, b) => (a.order || 0) - (b.order || 0));
  const folderIds = new Set(folders.map((f) => f.id));
  const top = folders.filter((f) => !f.parentId || !folderIds.has(f.parentId));
  const childrenOf = (id) => folders.filter((f) => f.parentId === id);
  const [folder, setFolder] = useState(top[0]?.id || NO_FOLDER);
  const [q, setQ] = useState('');
  const [editId, setEditId] = useState(null);
  const [folderEdit, setFolderEdit] = useState(null);
  const [toast, showToast] = useToast();

  const inFolder = (sc) => (folder === NO_FOLDER ? !folderIds.has(sc.folderId) : sc.folderId === folder);
  const orphans = state.scripts.filter((sc) => !folderIds.has(sc.folderId));
  const s = q.trim().toLowerCase();
  const list = useMemo(() => state.scripts
    .filter((sc) => (s ? `${sc.title}\n${sc.hint}\n${sc.text}`.toLowerCase().includes(s) : inFolder(sc)))
    .sort((a, b) => (a.order || 0) - (b.order || 0)), [state.scripts, folder, s]); // eslint-disable-line react-hooks/exhaustive-deps

  const sorted = (arr) => [...arr].sort((a, b) => (a.order || 0) - (b.order || 0));
  const countIn = (id) => state.scripts.filter((x) => x.folderId === id).length + childrenOf(id).reduce((t, c) => t + countIn(c.id), 0);
  const copy = async (sc) => {
    const ok = await copyText(sc.text);
    if (!ok) { showToast('Не вдалося скопіювати — виділіть текст вручну'); return; }
    showToast(hasPlaceholders(sc.text) ? 'Скопійовано ✓ Не забудьте замінити <…> своїм' : 'Скопійовано ✓');
  };
  const add = () => {
    const id = uid();
    const fid = folder === NO_FOLDER ? (top[0]?.id || '') : folder;
    const order = Math.max(0, ...state.scripts.filter((x) => x.folderId === fid).map((x) => x.order || 0)) + 1;
    update((d) => { d.scripts.push({ id, folderId: fid, order, title: 'Новий скрипт', hint: '', text: '' }); });
    setQ('');
    setEditId(id);
  };
  const move = (sc, dir) => update((d) => {
    const same = d.scripts.filter((x) => x.folderId === sc.folderId).sort((a, b) => (a.order || 0) - (b.order || 0));
    same.forEach((x, k) => { x.order = k + 1; });
    const k = same.findIndex((x) => x.id === sc.id);
    const j = k + dir;
    if (j < 0 || j >= same.length) return;
    [same[k].order, same[j].order] = [same[j].order, same[k].order];
  });
  const addFolder = () => {
    const id = uid();
    update((d) => { d.scriptFolders.push({ id, name: 'Нова папка', parentId: '', order: Math.max(0, ...d.scriptFolders.map((f) => f.order || 0)) + 1 }); });
    setFolder(id);
    setFolderEdit(id);
  };

  const current = folders.find((f) => f.id === folder);

  return (
    <section>
      <PageHead title="Скрипти" sub="Готові відповіді для Direct: скопіюйте одним натиском і вставте в повідомлення. Місця на кшталт <ім'я> підсвічені — їх треба замінити своїм.">
        <button className="btn ghost" onClick={addFolder}>+ Папка</button>
        <button className="btn primary" onClick={add}>+ Скрипт</button>
      </PageHead>

      <div className="toolbar">
        <input className="search" placeholder="Пошук по всіх скриптах…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {!s && (
        <div className="chips scroll-x">
          {top.map((f) => (
            <button key={f.id} className={'chip' + (folder === f.id ? ' on' : '')} onClick={() => setFolder(f.id)}>
              {f.name} <span className="chip-count">{countIn(f.id)}</span>
            </button>
          ))}
          {orphans.length > 0 && <button className={'chip' + (folder === NO_FOLDER ? ' on' : '')} onClick={() => setFolder(NO_FOLDER)}>Без папки <span className="chip-count">{orphans.length}</span></button>}
        </div>
      )}
      {!s && current && (
        <div className="row gap wrap folder-bar">
          <span className="muted small">Папка «{current.name}»</span>
          <button className="link small" onClick={() => setFolderEdit(current.id)}>✎ Перейменувати / видалити</button>
        </div>
      )}

      {!s && current && childrenOf(current.id).map((sub) => {
        const subList = sorted(state.scripts.filter((x) => x.folderId === sub.id));
        return (
          <details key={sub.id} className="subfolder">
            <summary>
              <span className="sf-name">{sub.name}</span>
              <span className="chip-count">{subList.length}</span>
              <button className="link small" onClick={(e) => { e.preventDefault(); setFolderEdit(sub.id); }}>✎</button>
            </summary>
            <div className="script-list">
              {subList.length === 0 && <p className="muted small">Порожньо. Перемістіть сюди скрипт через ✎ → «Папка».</p>}
              {subList.map((sc, k) => <ScriptCard key={sc.id} sc={sc} index={k} total={subList.length} movable onMove={move} onEdit={setEditId} onCopy={copy} />)}
            </div>
          </details>
        );
      })}

      {list.length === 0 && !(current && childrenOf(current.id).length && !s) ? (
        <Empty icon="💬" title={s ? 'Нічого не знайдено' : 'У цій папці ще немає скриптів'}>
          {!s && <button className="btn primary" onClick={add}>+ Додати скрипт</button>}
        </Empty>
      ) : (
        <div className="script-list">
          {list.map((sc, k) => (
            <ScriptCard key={sc.id} sc={sc} index={k} total={list.length} movable={!s} folderName={s ? folders.find((f) => f.id === sc.folderId)?.name || 'Без папки' : ''} onMove={move} onEdit={setEditId} onCopy={copy} />
          ))}
        </div>
      )}

      {editId && <ScriptModal id={editId} state={state} update={update} folders={folders} onClose={() => setEditId(null)} />}
      {folderEdit && <FolderModal id={folderEdit} state={state} update={update} onClose={() => setFolderEdit(null)} onDeleted={() => { const wasCurrent = folderEdit === folder; setFolderEdit(null); if (wasCurrent) setFolder(top.find((f) => f.id !== folderEdit)?.id || NO_FOLDER); }} />}
      <Toast text={toast} />
    </section>
  );
}

function ScriptModal({ id, state, update, folders, onClose }) {
  const sc = state.scripts.find((x) => x.id === id);
  if (!sc) return null;
  const set = (patch) => update((d) => { Object.assign(d.scripts.find((x) => x.id === id), patch); });
  const remove = () => {
    if (!confirmDelete(`скрипт «${sc.title}»`)) return;
    update((d) => { d.scripts = d.scripts.filter((x) => x.id !== id); });
    onClose();
  };
  return (
    <Modal title="Скрипт" onClose={onClose} wide
      footer={<><button className="btn danger ghost" onClick={remove}>Видалити</button><span className="grow" /><button className="btn primary" onClick={onClose}>Готово</button></>}>
      <div className="form-grid">
        <Field label="Назва"><input value={sc.title} onChange={(e) => set({ title: e.target.value })} autoFocus /></Field>
        <Field label="Папка">
          <select value={sc.folderId} onChange={(e) => set({ folderId: e.target.value })}>
            {folders.filter((f) => !f.parentId).map((f) => [
              <option key={f.id} value={f.id}>{f.name}</option>,
              ...folders.filter((c) => c.parentId === f.id).map((c) => <option key={c.id} value={c.id}>— {c.name}</option>),
            ])}
            {!folders.some((f) => f.id === sc.folderId) && <option value={sc.folderId}>Без папки</option>}
          </select>
        </Field>
      </div>
      <Field label="Коли використовувати" hint="Підказка для себе, клієнт її не бачить"><input value={sc.hint || ''} onChange={(e) => set({ hint: e.target.value })} /></Field>
      <label className="check"><input type="checkbox" checked={sc.kind === 'note'} onChange={(e) => set({ kind: e.target.checked ? 'note' : '' })} /> Це інструкція для себе (без кнопки «Копіювати»)</label>
      <Field label={sc.kind === 'note' ? 'Текст інструкції' : 'Текст повідомлення'} hint={sc.kind === 'note' ? '«## Заголовок» — підзаголовок, «- пункт» — список' : "Те, що копіюється. Місця для заповнення пишіть у кутових дужках: <ім'я>, <дата>"}>
        <textarea className="script-edit" rows={12} value={sc.text} onChange={(e) => set({ text: e.target.value })} />
      </Field>
      <p className="muted small">Зміни зберігаються автоматично.</p>
    </Modal>
  );
}

function FolderModal({ id, state, update, onClose, onDeleted }) {
  const f = state.scriptFolders.find((x) => x.id === id);
  if (!f) return null;
  const count = state.scripts.filter((x) => x.folderId === id).length;
  const hasChildren = state.scriptFolders.some((x) => x.parentId === id);
  const others = state.scriptFolders.filter((x) => x.id !== id && x.parentId !== id);
  const parents = state.scriptFolders.filter((x) => x.id !== id && !x.parentId);
  const remove = () => {
    const target = others[0];
    const msg = count ? `папку «${f.name}»? ${count} скрипт(ів) з неї перейдуть у «${target?.name || 'Без папки'}»` : `папку «${f.name}»`;
    if (!confirmDelete(msg)) return;
    update((d) => {
      for (const sc of d.scripts) if (sc.folderId === id) sc.folderId = target?.id || '';
      for (const f of d.scriptFolders) if (f.parentId === id) f.parentId = '';
      d.scriptFolders = d.scriptFolders.filter((x) => x.id !== id);
    });
    onDeleted();
  };
  return (
    <Modal title="Папка" onClose={onClose}
      footer={<><button className="btn danger ghost" onClick={remove}>Видалити папку</button><span className="grow" /><button className="btn primary" onClick={onClose}>Готово</button></>}>
      <Field label="Назва папки"><input value={f.name} onChange={(e) => update((d) => { d.scriptFolders.find((x) => x.id === id).name = e.target.value; })} autoFocus /></Field>
      <Field label="Розташування" hint={hasChildren ? 'У цій папці є підпапки, тому вона може бути лише основною' : 'Підпапка показується згорнутим блоком усередині іншої папки'}>
        <select value={f.parentId || ''} disabled={hasChildren} onChange={(e) => update((d) => { d.scriptFolders.find((x) => x.id === id).parentId = e.target.value; })}>
          <option value="">Основна папка</option>
          {parents.map((x) => <option key={x.id} value={x.id}>Усередині «{x.name}»</option>)}
        </select>
      </Field>
    </Modal>
  );
}
