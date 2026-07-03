'use client';
// src/app/(app)/brain/page.tsx  (Brain Dashboard v3)
// The daily operating board. Top to bottom:
//   Scoreboard (donut + urgency + 7-day trend) → Today (calendar) → Open Projects
//   → To-Do (unified: todos + decisions + commitments + people) → Key insights
//   → Context questions.
// Reads/writes brain_items + brain_briefings directly via the browser Supabase
// client (RLS: authenticated). No API route, no service-role key.

import { useEffect, useMemo, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useAuth } from '@/components/auth-provider';

/* ---------------------------------- types --------------------------------- */

type Item = {
  id: string;
  item_key: string;
  kind: string;
  title: string;
  detail: string | null;
  project: string | null;
  owner: string | null;
  start_date: string | null;
  due_by: string | null;
  status: string;
  done: boolean;
  comment: string | null;
  out_to: boolean;
  out_to_who: string | null;
  needs_due_date: boolean;
  notes: string | null;
  source: string;
  sort_order: number;
};

type Briefing = {
  headline: string;
  summary_md: string;
  briefing_date: string | null;
};

/* --------------------------------- helpers -------------------------------- */

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

type Urgency = 'overdue' | 'today' | 'week' | 'later' | 'none';

function urgency(due: string | null, done: boolean): Urgency {
  if (done || !due) return 'none';
  const t = todayISO();
  if (due < t) return 'overdue';
  if (due === t) return 'today';
  const week = new Date();
  week.setDate(week.getDate() + 7);
  const w = `${week.getFullYear()}-${String(week.getMonth() + 1).padStart(2, '0')}-${String(
    week.getDate()
  ).padStart(2, '0')}`;
  return due <= w ? 'week' : 'later';
}

const URGENCY_META: Record<Urgency, { label: string; chip: string; bar: string }> = {
  overdue: { label: 'Overdue', chip: 'bg-red-100 text-red-700', bar: 'bg-red-500' },
  today: { label: 'Due today', chip: 'bg-amber-100 text-amber-700', bar: 'bg-amber-500' },
  week: { label: 'This week', chip: 'bg-sky-100 text-sky-700', bar: 'bg-sky-500' },
  later: { label: 'Later', chip: 'bg-slate-100 text-slate-600', bar: 'bg-slate-400' },
  none: { label: 'No date', chip: 'bg-slate-100 text-slate-500', bar: 'bg-slate-300' },
};

const KIND_META: Record<string, { label: string; chip: string }> = {
  todo: { label: 'To-do', chip: 'bg-slate-100 text-slate-600' },
  decision: { label: 'Decision', chip: 'bg-amber-100 text-amber-800' },
  commitment: { label: 'Commitment', chip: 'bg-sky-100 text-sky-800' },
  person: { label: 'People', chip: 'bg-violet-100 text-violet-800' },
};

const OWNER_CHIP: Record<string, string> = {
  Personal: 'bg-emerald-100 text-emerald-700',
  Protocase: 'bg-blue-100 text-blue-700',
  MMP: 'bg-violet-100 text-violet-700',
  Frameworks: 'bg-amber-100 text-amber-700',
};

function fmtDate(d: string | null) {
  if (!d) return '';
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
  });
}

/* --------------------------------- component ------------------------------- */

export default function BrainPage() {
  const supabase = useMemo(() => createClient(), []);
  const { user } = useAuth();

  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [closed7d, setClosed7d] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [filter, setFilter] = useState<'all' | 'overdue' | 'today' | 'waiting' | 'done'>('all');

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const [b, it, cl] = await Promise.all([
      supabase
        .from('brain_briefings')
        .select('headline, summary_md, briefing_date')
        .eq('kind', 'daily')
        .order('briefing_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('brain_items')
        .select('*')
        .eq('active', true)
        .order('sort_order', { ascending: true }),
      supabase
        .from('brain_items')
        .select('done_at')
        .gte('done_at', since)
        .not('done_at', 'is', null),
    ]);
    setBriefing((b.data as Briefing) ?? null);
    setItems((it.data as Item[]) ?? []);
    setClosed7d(((cl.data as { done_at: string }[]) ?? []).map((c) => c.done_at));
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const update = useCallback(
    (id: string, fields: Partial<Item>) => {
      setItems((arr) => arr.map((it) => (it.id === id ? { ...it, ...fields } : it)));
      setSaveState('saving');
      supabase
        .from('brain_items')
        .update(fields)
        .eq('id', id)
        .then(({ error }: { error: unknown }) => {
          if (error) {
            setSaveState('error');
            load();
          } else {
            setSaveState('saved');
            setTimeout(() => setSaveState('idle'), 1500);
          }
        });
    },
    [supabase, load]
  );

  const addTodo = useCallback(
    async (f: { title: string; due_by?: string; out_to_who?: string }) => {
      const { error } = await supabase.from('brain_items').insert({
        item_key: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        kind: 'todo',
        title: f.title,
        owner: 'Mike',
        due_by: f.due_by || null,
        out_to: Boolean(f.out_to_who),
        out_to_who: f.out_to_who || null,
        source: 'manual',
        sort_order: 999,
        active: true,
        briefing_date: todayISO(),
      });
      if (!error) load();
    },
    [supabase, load]
  );

  const byKind = useCallback(
    (k: string) => items.filter((i) => i.kind === k),
    [items]
  );

  const calendar = byKind('calendar');
  const projects = byKind('project');
  const insights = byKind('insight');
  const context = byKind('context');

  const actions = useMemo(() => {
    const merged = items.filter((i) =>
      ['todo', 'decision', 'commitment', 'person'].includes(i.kind)
    );
    const rank: Record<Urgency, number> = { overdue: 0, today: 1, week: 2, later: 3, none: 4 };
    return [...merged].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      const ua = rank[urgency(a.due_by, a.done)];
      const ub = rank[urgency(b.due_by, b.done)];
      if (ua !== ub) return ua - ub;
      return (a.due_by ?? '9999').localeCompare(b.due_by ?? '9999');
    });
  }, [items]);

  const people = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) {
      if (it.out_to_who) set.add(it.out_to_who);
      for (const o of (it.owner ?? '').split(/[\/+,]/)) {
        const t = o.trim();
        if (t && t !== 'Mike' && t.length > 1) set.add(t);
      }
    }
    return Array.from(set).sort();
  }, [items]);

  const scoreboard = useMemo(() => {
    const actionable = [...actions, ...projects];
    const open = actionable.filter((i) => !i.done && !i.out_to).length;
    const waiting = actionable.filter((i) => !i.done && i.out_to).length;
    const done = actionable.filter((i) => i.done).length;
    const counts: Record<Urgency, number> = { overdue: 0, today: 0, week: 0, later: 0, none: 0 };
    for (const i of actionable) if (!i.done) counts[urgency(i.due_by, i.done)]++;
    const days: { label: string; n: number }[] = [];
    for (let k = 6; k >= 0; k--) {
      const d = new Date();
      d.setDate(d.getDate() - k);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
      ).padStart(2, '0')}`;
      days.push({
        label: d.toLocaleDateString('en-CA', { weekday: 'narrow' }),
        n: closed7d.filter((ts) => ts.slice(0, 10) === iso).length,
      });
    }
    return { open, waiting, done, counts, days };
  }, [actions, projects, closed7d]);

  if (loading) return <div className="p-6 text-slate-500">Loading Brain…</div>;

  return (
    <div className="max-w-5xl space-y-10 pb-24">
      {/* header */}
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-slate-400">
            {new Date().toLocaleDateString('en-CA', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            {briefing?.headline ?? 'Brain'}
          </h1>
          {briefing?.summary_md && (
            <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
              {briefing.summary_md}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <SaveBadge state={saveState} />
          <button
            onClick={() => {
              setLoading(true);
              load();
            }}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>
      </header>

      {/* scoreboard */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="flex items-center gap-5 rounded-xl border border-slate-200 bg-white p-5">
          <Donut open={scoreboard.open} waiting={scoreboard.waiting} done={scoreboard.done} />
          <div className="space-y-1.5 text-sm">
            <LegendRow color="bg-slate-800" label="Open" n={scoreboard.open} />
            <LegendRow color="bg-sky-500" label="Waiting on others" n={scoreboard.waiting} />
            <LegendRow color="bg-emerald-500" label="Done" n={scoreboard.done} />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Open items by urgency
          </div>
          <div className="space-y-2">
            {(['overdue', 'today', 'week', 'none'] as Urgency[]).map((u) => {
              const max = Math.max(
                1,
                ...(['overdue', 'today', 'week', 'none'] as Urgency[]).map(
                  (x) => scoreboard.counts[x]
                )
              );
              const n = scoreboard.counts[u];
              return (
                <div key={u} className="flex items-center gap-2 text-xs">
                  <span className="w-16 shrink-0 text-slate-500">{URGENCY_META[u].label}</span>
                  <div className="h-3 flex-1 overflow-hidden rounded bg-slate-100">
                    <div
                      className={`h-full rounded ${URGENCY_META[u].bar}`}
                      style={{ width: `${(n / max) * 100}%` }}
                    />
                  </div>
                  <span className="w-5 text-right font-semibold text-slate-700">{n}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Closed — last 7 days
          </div>
          <div className="flex h-16 items-end gap-1.5">
            {scoreboard.days.map((d, i) => {
              const max = Math.max(1, ...scoreboard.days.map((x) => x.n));
              return (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className={`w-full rounded-t ${d.n ? 'bg-emerald-500' : 'bg-slate-100'}`}
                    style={{ height: `${Math.max(6, (d.n / max) * 100)}%` }}
                    title={`${d.n} closed`}
                  />
                  <span className="text-[10px] text-slate-400">{d.label}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-2 text-xs text-slate-500">
            {closed7d.length === 0
              ? 'Nothing closed this week — check something off.'
              : `${closed7d.length} closed this week`}
          </div>
        </div>
      </section>

      {/* today */}
      <Section title="Today" count={calendar.length}>
        {calendar.length === 0 ? (
          <Empty text="No calendar events synced for today." />
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {calendar.map((c, i) => {
              const m = c.title.match(/^(\d{1,2}:\d{2}\s*[AP]M)\s*[-–—]\s*(.+)$/i);
              const time = m?.[1] ?? '';
              const label = m?.[2] ?? c.title;
              return (
                <div
                  key={c.id}
                  className={`flex items-center gap-4 px-4 py-3 ${
                    i > 0 ? 'border-t border-slate-100' : ''
                  } ${c.done ? 'opacity-50' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={c.done}
                    onChange={(e) => update(c.id, { done: e.target.checked })}
                    className="h-4 w-4 accent-emerald-600"
                  />
                  <span className="w-20 shrink-0 font-mono text-xs font-semibold text-slate-500">
                    {time}
                  </span>
                  <span
                    className={`flex-1 text-sm ${
                      c.done ? 'text-slate-400 line-through' : 'text-slate-800'
                    }`}
                  >
                    {label}
                    {c.detail && <span className="ml-2 text-xs text-slate-400">{c.detail}</span>}
                  </span>
                  {c.owner && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        OWNER_CHIP[c.owner] ?? 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {c.owner}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* open projects */}
      <Section title="Open Projects" count={projects.length}>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {[...projects]
            .sort((a, b) => {
              const rank: Record<Urgency, number> = {
                overdue: 0, today: 1, week: 2, later: 3, none: 4,
              };
              return (
                rank[urgency(a.due_by, a.done)] - rank[urgency(b.due_by, b.done)] ||
                (a.due_by ?? '9999').localeCompare(b.due_by ?? '9999')
              );
            })
            .map((p) => {
              const u = urgency(p.due_by, p.done);
              return (
                <div
                  key={p.id}
                  className="flex flex-col rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-semibold text-slate-900">{p.title}</div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${URGENCY_META[u].chip}`}
                    >
                      {u === 'none'
                        ? 'Needs date'
                        : u === 'later' || u === 'week'
                        ? `Due ${fmtDate(p.due_by)}`
                        : URGENCY_META[u].label}
                    </span>
                  </div>
                  {p.detail && (
                    <div className="mt-1 text-sm leading-snug text-slate-600">{p.detail}</div>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
                    {p.owner && (
                      <span>
                        <span className="text-slate-400">Owner</span>{' '}
                        <span className="font-medium text-slate-700">{p.owner}</span>
                      </span>
                    )}
                    <label className="flex items-center gap-1">
                      <span className="text-slate-400">Start</span>
                      <input
                        type="date"
                        value={p.start_date ?? ''}
                        onChange={(e) => update(p.id, { start_date: e.target.value || null })}
                        className="rounded border border-slate-200 px-1.5 py-0.5 text-slate-700"
                      />
                    </label>
                    <label className="flex items-center gap-1">
                      <span className="text-slate-400">Due</span>
                      <input
                        type="date"
                        value={p.due_by ?? ''}
                        onChange={(e) => update(p.id, { due_by: e.target.value || null })}
                        className={`rounded border px-1.5 py-0.5 ${
                          p.due_by
                            ? 'border-slate-200 text-slate-700'
                            : 'border-amber-300 text-amber-600'
                        }`}
                      />
                    </label>
                  </div>
                  <NotesField
                    value={p.notes ?? ''}
                    placeholder="Notes — clarify issues, leave instructions; folded into the vault tonight…"
                    onSave={(v) => update(p.id, { notes: v })}
                  />
                </div>
              );
            })}
        </div>
      </Section>

      {/* to-do */}
      <Section
        title="To-Do"
        count={actions.filter((a) => !a.done).length}
        right={
          <div className="flex gap-1">
            {(
              [
                ['all', 'All'],
                ['overdue', 'Overdue'],
                ['today', 'Today'],
                ['waiting', 'Waiting on'],
                ['done', 'Done'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  filter === key
                    ? 'bg-slate-800 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        <QuickAdd people={people} onAdd={addTodo} />
        <div className="mt-3 space-y-2">
          {actions
            .filter((t) => {
              if (filter === 'overdue') return urgency(t.due_by, t.done) === 'overdue';
              if (filter === 'today') return urgency(t.due_by, t.done) === 'today';
              if (filter === 'waiting') return t.out_to && !t.done;
              if (filter === 'done') return t.done;
              return true;
            })
            .map((t) => (
              <ActionRow key={t.id} item={t} onUpdate={update} />
            ))}
        </div>
      </Section>

      {/* insights */}
      <Section title="Key insights" count={insights.length}>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700">
            {insights.map((i) => (
              <li key={i.id}>
                {i.title}
                {i.detail && <span className="text-slate-400"> — {i.detail}</span>}
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* context questions */}
      <Section title="Context questions" count={context.length}>
        <p className="-mt-1 mb-3 text-xs text-slate-500">
          Answer inline — answers are folded into the vault on the next pass.
        </p>
        <div className="space-y-2">
          {context.map((q) => (
            <div key={q.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-medium text-slate-900">{q.title}</div>
              {q.detail && <div className="mt-0.5 text-xs text-slate-500">{q.detail}</div>}
              <NotesField
                value={q.comment ?? ''}
                placeholder="Answer…"
                onSave={(v) => update(q.id, { comment: v })}
              />
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

/* ------------------------------ sub-components ----------------------------- */

function Section({
  title, count, right, children,
}: {
  title: string;
  count?: number;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {title}
          {typeof count === 'number' && (
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
              {count}
            </span>
          )}
        </h3>
        {right}
      </div>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
      {text}
    </div>
  );
}

function SaveBadge({ state }: { state: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (state === 'idle') return null;
  const map = {
    saving: ['Saving…', 'text-slate-400'],
    saved: ['Saved ✓', 'text-emerald-600'],
    error: ['Save failed — reloaded', 'text-red-600'],
  } as const;
  const [label, cls] = map[state];
  return <span className={`text-xs font-medium ${cls}`}>{label}</span>;
}

function LegendRow({ color, label, n }: { color: string; label: string; n: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <span className="text-slate-600">{label}</span>
      <span className="ml-auto pl-3 font-semibold text-slate-900">{n}</span>
    </div>
  );
}

function Donut({ open, waiting, done }: { open: number; waiting: number; done: number }) {
  const total = Math.max(1, open + waiting + done);
  const R = 34;
  const C = 2 * Math.PI * R;
  const segs = [
    { n: done, cls: 'stroke-emerald-500' },
    { n: waiting, cls: 'stroke-sky-500' },
    { n: open, cls: 'stroke-slate-800' },
  ];
  let offset = 0;
  return (
    <svg viewBox="0 0 90 90" className="h-24 w-24 shrink-0 -rotate-90">
      <circle cx="45" cy="45" r={R} className="fill-none stroke-slate-100" strokeWidth="10" />
      {segs.map((s, i) => {
        const len = (s.n / total) * C;
        const el = (
          <circle
            key={i}
            cx="45"
            cy="45"
            r={R}
            className={`fill-none ${s.cls}`}
            strokeWidth="10"
            strokeDasharray={`${len} ${C - len}`}
            strokeDashoffset={-offset}
          />
        );
        offset += len;
        return el;
      })}
      <text
        x="45"
        y="45"
        className="fill-slate-900 text-lg font-bold"
        textAnchor="middle"
        dominantBaseline="central"
        transform="rotate(90 45 45)"
      >
        {open + waiting}
      </text>
    </svg>
  );
}

function NotesField({
  value, placeholder, onSave,
}: {
  value: string;
  placeholder?: string;
  onSave: (v: string) => void;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <textarea
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onSave(v)}
      rows={1}
      className="mt-3 w-full resize-y rounded-md border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-sm placeholder:text-slate-300 focus:border-slate-400 focus:bg-white focus:outline-none"
    />
  );
}

function QuickAdd({
  people, onAdd,
}: {
  people: string[];
  onAdd: (f: { title: string; due_by?: string; out_to_who?: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [who, setWho] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await onAdd({ title: title.trim(), due_by: due || undefined, out_to_who: who || undefined });
      setTitle('');
      setDue('');
      setWho('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-3">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="Add a to-do… (Enter to save)"
        className="min-w-[200px] flex-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
      />
      <input
        type="date"
        value={due}
        onChange={(e) => setDue(e.target.value)}
        className="rounded-md border border-slate-200 px-2 py-1.5 text-xs text-slate-600"
      />
      <input
        type="text"
        list="brain-people"
        value={who}
        onChange={(e) => setWho(e.target.value)}
        placeholder="Assign to…"
        className="w-32 rounded-md border border-slate-200 px-2 py-1.5 text-xs"
      />
      <button
        onClick={submit}
        disabled={!title.trim() || busy}
        className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
      >
        Add
      </button>
      <datalist id="brain-people">
        {people.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
    </div>
  );
}

function ActionRow({
  item, onUpdate,
}: {
  item: Item;
  onUpdate: (id: string, f: Partial<Item>) => void;
}) {
  const u = urgency(item.due_by, item.done);
  const kind = KIND_META[item.kind] ?? KIND_META.todo;
  return (
    <div
      className={`rounded-xl border bg-white p-3.5 ${
        u === 'overdue' && !item.done ? 'border-red-200' : 'border-slate-200'
      } ${item.done ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={item.done}
          onChange={(e) => onUpdate(item.id, { done: e.target.checked })}
          className="mt-0.5 h-4 w-4 accent-emerald-600"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`text-sm ${
                item.done ? 'text-slate-400 line-through' : 'font-medium text-slate-900'
              }`}
            >
              {item.title}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${kind.chip}`}>
              {kind.label}
            </span>
            {u !== 'none' && u !== 'later' && !item.done && (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${URGENCY_META[u].chip}`}
              >
                {URGENCY_META[u].label}
              </span>
            )}
            {item.out_to && item.out_to_who && (
              <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                → {item.out_to_who}
              </span>
            )}
          </div>
          {item.detail && (
            <div className="mt-0.5 text-xs leading-snug text-slate-500">{item.detail}</div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
            {item.project && <span className="text-slate-400">{item.project}</span>}
            {item.owner && item.owner !== 'Mike' && (
              <span className="text-slate-400">Owner: {item.owner}</span>
            )}
            <label className="flex items-center gap-1">
              Due
              <input
                type="date"
                value={item.due_by ?? ''}
                onChange={(e) => onUpdate(item.id, { due_by: e.target.value || null })}
                className="rounded border border-slate-200 px-1 py-0.5"
              />
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={item.out_to}
                onChange={(e) =>
                  onUpdate(item.id, {
                    out_to: e.target.checked,
                    ...(e.target.checked ? {} : { out_to_who: null }),
                  })
                }
              />
              Out to
            </label>
            {item.out_to && (
              <input
                type="text"
                list="brain-people"
                placeholder="who?"
                defaultValue={item.out_to_who ?? ''}
                onBlur={(e) => onUpdate(item.id, { out_to_who: e.target.value || null })}
                className="w-32 rounded border border-slate-200 px-2 py-0.5"
              />
            )}
          </div>
          <NotesField
            value={item.comment ?? ''}
            placeholder="Comment — read as an instruction by the nightly pass…"
            onSave={(v) => onUpdate(item.id, { comment: v })}
          />
        </div>
      </div>
    </div>
  );
}
