// Синхронізація між пристроями через Supabase (безкоштовна хмарна база Postgres).
// Кожен запис зберігається окремим рядком, тож зміни з різних пристроїв зливаються по записах:
// перемагає новіша версія запису, видалення теж синхронізуються.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { COLLECTIONS } from './store.js';

export const TABLE = 'kus_docs';

export const SETUP_SQL = `-- KUS: таблиця для синхронізації. Виконайте один раз у Supabase → SQL Editor → Run.
create table if not exists public.kus_docs (
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  coll text not null,
  id text not null,
  data jsonb,
  updated_at bigint not null,
  deleted boolean not null default false,
  server_ts timestamptz not null default now(),
  primary key (owner, coll, id)
);
create index if not exists kus_docs_owner_ts on public.kus_docs (owner, server_ts);
alter table public.kus_docs enable row level security;
drop policy if exists "own rows" on public.kus_docs;
create policy "own rows" on public.kus_docs for all
  using (owner = auth.uid()) with check (owner = auth.uid());

-- Не дає старішій версії перезаписати новішу
create or replace function public.kus_keep_newer() returns trigger language plpgsql as $$
begin
  if new.updated_at < old.updated_at then return old; end if;
  new.server_ts := now();
  return new;
end $$;
drop trigger if exists kus_keep_newer on public.kus_docs;
create trigger kus_keep_newer before update on public.kus_docs
  for each row execute function public.kus_keep_newer();`;

const META_KEY = 'kus-sync-meta-v1';
const loadMeta = () => { try { return { synced: {}, lastPull: '', ...JSON.parse(localStorage.getItem(META_KEY) || '{}') }; } catch { return { synced: {}, lastPull: '' }; } };
const saveMeta = (m) => { try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch { /* ignore */ } };

/** Рядки, які треба відправити: записи, чия версія відрізняється від останньої синхронізованої. */
export function pendingRows(state, synced, owner) {
  const rows = [];
  for (const c of COLLECTIONS) {
    for (const r of state[c]) {
      const u = r._u || 1;
      if (synced[`${c}:${r.id}`] !== u) rows.push({ owner, coll: c, id: r.id, data: r, updated_at: u, deleted: false });
    }
  }
  for (const [id, t] of Object.entries(state.deleted || {})) {
    if (synced[`del:${id}`] !== t) rows.push({ owner, coll: 'deleted', id, data: null, updated_at: t, deleted: true });
  }
  const s = state.settings;
  const su = s._u || 1;
  if (synced['settings:main'] !== su) rows.push({ owner, coll: 'settings', id: 'main', data: s, updated_at: su, deleted: false });
  return rows;
}

/** Перетворює рядки з бази на частковий стан для злиття. */
export function rowsToState(rows) {
  const part = { deleted: {} };
  for (const c of COLLECTIONS) part[c] = [];
  for (const row of rows) {
    if (row.coll === 'deleted') part.deleted[row.id] = Number(row.updated_at);
    else if (row.coll === 'settings') part.settings = { ...row.data, _u: Number(row.updated_at) };
    else if (part[row.coll] && row.data) part[row.coll].push({ ...row.data, _u: Number(row.updated_at) });
  }
  return part;
}

export function markSynced(meta, rows) {
  for (const r of rows) {
    const key = r.coll === 'deleted' ? `del:${r.id}` : `${r.coll}:${r.id}`;
    meta.synced[key] = Number(r.updated_at);
  }
}

export function useSync(store) {
  const { local, setLocal, mergeRemote, subscribe } = store;
  const cfg = local.sync || {};
  const enabled = !!(cfg.url && cfg.key);
  const [client, setClient] = useState(null);
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState(enabled ? 'syncing' : 'off');
  const [message, setMessage] = useState('');
  const stateRef = useRef(store.state);
  stateRef.current = store.state;
  const busy = useRef(false);
  const timer = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setClient(null); setSession(null);
    if (!enabled) { setStatus('off'); return undefined; }
    (async () => {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const c = createClient(cfg.url.trim(), cfg.key.trim(), { auth: { persistSession: true, storageKey: 'kus-supabase-auth' } });
        if (cancelled) return;
        setClient(c);
        const { data } = await c.auth.getSession();
        if (!cancelled) setSession(data.session);
        c.auth.onAuthStateChange((_e, s) => { if (!cancelled) setSession(s); });
        if (!data.session) setStatus('login');
      } catch (e) {
        setStatus('error'); setMessage('Не вдалося підключитися: ' + (e.message || e));
      }
    })();
    return () => { cancelled = true; };
  }, [enabled, cfg.url, cfg.key]);

  const run = useCallback(async (full = false) => {
    if (!client || !session || busy.current) return;
    busy.current = true;
    setStatus('syncing');
    const meta = loadMeta();
    try {
      // 1) Забираємо зміни з хмари (з запасом у 2 хв на розбіжність годинників і транзакцій)
      const since = full || !meta.lastPull ? '1970-01-01T00:00:00Z' : new Date(new Date(meta.lastPull).getTime() - 120000).toISOString();
      let all = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await client.from(TABLE).select('*').gt('server_ts', since).order('server_ts').range(from, from + 999);
        if (error) throw error;
        all = all.concat(data);
        if (data.length < 1000) break;
      }
      if (all.length) {
        mergeRemote(rowsToState(all));
        markSynced(meta, all);
        meta.lastPull = all[all.length - 1].server_ts;
      }
      // 2) Відправляємо свої зміни (стан беремо після злиття на наступному тіку)
      await new Promise((r) => setTimeout(r, 0));
      const rows = pendingRows(stateRef.current, meta.synced, session.user.id);
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error } = await client.from(TABLE).upsert(chunk, { onConflict: 'owner,coll,id' });
        if (error) throw error;
        markSynced(meta, chunk);
      }
      saveMeta(meta);
      setStatus('ok');
      setMessage(`Синхронізовано о ${new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}`);
    } catch (e) {
      saveMeta(meta);
      setStatus('error');
      const msg = e?.message || String(e);
      setMessage(/relation .* does not exist|kus_docs/.test(msg) ? 'У базі немає таблиці — виконайте SQL з Налаштувань.' : msg);
    } finally {
      busy.current = false;
    }
  }, [client, session, mergeRemote]);

  // Перша синхронізація після входу, далі — кожні 30 с, при поверненні у вкладку і після змін
  useEffect(() => {
    if (!session) return undefined;
    run(true);
    const iv = setInterval(() => run(), 30000);
    const onFocus = () => run();
    window.addEventListener('focus', onFocus);
    const unsub = subscribe(() => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => run(), 1500);
    });
    return () => { clearInterval(iv); window.removeEventListener('focus', onFocus); unsub(); clearTimeout(timer.current); };
  }, [session, run, subscribe]);

  const signIn = useCallback(async (email, password, create = false) => {
    if (!client) throw new Error('Спершу вкажіть адресу й ключ Supabase');
    const fn = create ? client.auth.signUp : client.auth.signInWithPassword;
    const { data, error } = await fn.call(client.auth, { email, password });
    if (error) throw new Error(error.message);
    if (create && !data.session) return 'confirm';
    return 'ok';
  }, [client]);

  const signOut = useCallback(async () => {
    if (client) await client.auth.signOut();
    saveMeta({ synced: {}, lastPull: '' });
    setStatus('login');
  }, [client]);

  const disconnect = useCallback(async () => {
    await signOut();
    setLocal({ sync: { url: '', key: '' } });
  }, [signOut, setLocal]);

  return useMemo(() => ({
    enabled, status: enabled ? status : 'off', message, email: session?.user?.email || '', loggedIn: !!session,
    signIn, signOut, disconnect, syncNow: () => run(true),
  }), [enabled, status, message, session, signIn, signOut, disconnect, run]);
}
