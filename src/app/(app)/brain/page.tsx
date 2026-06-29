'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useAuth } from '@/components/auth-provider';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Briefing {
  briefing_date: string;
  kind: string;
  headline: string | null;
  summary_md: string | null;
  updated_at: string;
}

type ItemKind = 'project' | 'decision' | 'commitment' | 'person' | 'insight' | 'todo';

interface BrainItem {
  id: string;
  item_key: string;
  kind: ItemKind;
  title: string;
  detail: string | null;
  project: string | null;
  owner: string | null;
  due_by: string | null;
  status: string;
  done: boolean;
  comment: string | null;
  out_to: boolean;
  out_to_who: string | null;
  needs_due_date: boolean;
  notes: string | null;
  sort_order: number;
}

type EditableFields = Partial<
  Pick<BrainItem, 'done' | 'comment' | 'out_to' | 'out_to_who' | 'due_by' | 'notes' | 'status'>
>;

const ITEM_SELECT = '*';

// ---------------------------------------------------------------------------
// Building blocks (match the dashboard's zinc theme)
// ---------------------------------------------------------------------------

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {hint ? <p className="text-xs text-zinc-500 mt-0.5">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

function ownerColor(owner: string | null): string {
  return (owner ?? '').toUpperCase() === 'CONFIRM' ? 'text-amber-400' : 'text-zinc-300';
}

const inputCls =
  'bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:border-zinc-500 focus:outline-none';

function DueDate({ value, onChange, warn }: { value: string | null; onChange: (v: string | null) => void; warn?: boolean }) {
  return (
    <input
      type="date"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className={cn(inputCls, warn && !value && 'border-amber-500/60 text-amber-400')}
    />
  );
}

// Uncontrolled blur-to-save field. `key` (set by caller via value) remounts it
// when the stored value changes, so no state-sync effect is needed.
function TextField({
  value,
  placeholder,
  onSave,
}: {
  value: string | null;
  placeholder: string;
  onSave: (v: string | null) => void;
}) {
  return (
    <textarea
      defaultValue={value ?? ''}
      placeholder={placeholder}
      onBlur={(e) => {
        const next = e.target.value;
        if ((next || '') !== (value ?? '')) onSave(next || null);
      }}
      rows={1}
      className="mt-2 w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-300 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none resize-y"
    />
  );
}

function OutTo({ item, onUpdate }: { item: BrainItem; onUpdate: (id: string, f: EditableFields) => void }) {
  return (
    <>
      <label className="flex items-center gap-1.5 text-zinc-400 cursor-pointer">
        <input
          type="checkbox"
          checked={item.out_to}
          onChange={(e) => onUpdate(item.id, { out_to: e.target.checked, out_to_who: e.target.checked ? item.out_to_who : null })}
          className="accent-blue-500"
        />
        Out to
      </label>
      {item.out_to ? (
        <input
          type="text"
          placeholder="who?"
          defaultValue={item.out_to_who ?? ''}
          onBlur={(e) => onUpdate(item.id, { out_to_who: e.target.value || null })}
          className={cn(inputCls, 'w-28')}
        />
      ) : null}
    </>
  );
}

function ActionCard({ item, onUpdate }: { item: BrainItem; onUpdate: (id: string, f: EditableFields) => void }) {
  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={item.done}
          onChange={(e) => onUpdate(item.id, { done: e.target.checked })}
          className="mt-1 h-4 w-4 accent-emerald-500 shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className={cn('text-sm', item.done ? 'line-through text-zinc-500' : 'text-zinc-100')}>{item.title}</p>
          {item.detail ? <p className="text-xs text-zinc-400 mt-0.5">{item.detail}</p> : null}
          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs">
            {item.project ? <span className="text-zinc-500">{item.project}</span> : null}
            {item.owner ? (
              <span>
                <span className="text-zinc-500">Owner: </span>
                <span className={ownerColor(item.owner)}>{item.owner}</span>
              </span>
            ) : null}
            <label className="flex items-center gap-1.5 text-zinc-400">
              Due <DueDate value={item.due_by} onChange={(v) => onUpdate(item.id, { due_by: v })} />
            </label>
            <OutTo item={item} onUpdate={onUpdate} />
          </div>
          <TextField key={item.comment ?? ''} value={item.comment} placeholder="Add a comment..." onSave={(v) => onUpdate(item.id, { comment: v })} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BrainPage() {
  const { user } = useAuth();
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [items, setItems] = useState<BrainItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const [briefingRes, itemsRes] = await Promise.all([
        supabase
          .from('brain_briefings')
          .select('briefing_date, kind, headline, summary_md, updated_at')
          .eq('kind', 'daily')
          .order('briefing_date', { ascending: false })
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('brain_items')
          .select(ITEM_SELECT)
          .eq('active', true)
          .order('kind', { ascending: true })
          .order('sort_order', { ascending: true }),
      ]);
      if (cancelled) return;
      setBriefing((briefingRes.data as Briefing | null) ?? null);
      setItems((itemsRes.data as BrainItem[] | null) ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const onUpdate = useCallback((id: string, fields: EditableFields) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...fields } : it)));
    const supabase = createClient();
    supabase
      .from('brain_items')
      .update(fields)
      .eq('id', id)
      .then((res) => {
        if (!res.error) return;
        // Persist failed — resync from the server.
        supabase
          .from('brain_items')
          .select(ITEM_SELECT)
          .eq('active', true)
          .order('kind', { ascending: true })
          .order('sort_order', { ascending: true })
          .then((r) => setItems((r.data as BrainItem[] | null) ?? []));
      });
  }, []);

  if (!user || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-zinc-400">Loading...</p>
      </div>
    );
  }

  const byKind = (k: ItemKind) => items.filter((i) => i.kind === k);
  const projects = byKind('project');
  const decisions = byKind('decision');
  const commitments = byKind('commitment');
  const people = byKind('person');
  const insights = byKind('insight');
  const todos = byKind('todo');

  const updated = briefing
    ? new Date(briefing.updated_at).toLocaleString('en-CA', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  const empty = <p className="text-sm text-zinc-500">Nothing right now.</p>;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white">Brain</h1>
        <p className="text-sm text-zinc-400 mt-0.5">
          {briefing ? (
            <>
              {briefing.briefing_date} - updated {updated}
            </>
          ) : (
            'Daily briefing from your knowledge vault'
          )}
        </p>
      </div>

      {briefing?.headline ? (
        <div className="bg-blue-600/10 border border-blue-600/30 rounded-xl p-5">
          <p className="text-base leading-snug text-white">{briefing.headline}</p>
        </div>
      ) : null}
      {briefing?.summary_md ? (
        <Section title="Summary">
          <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">{briefing.summary_md}</p>
        </Section>
      ) : null}

      <Section title="Open Projects" hint="Set a due-by date and add notes. Projects with no date are flagged in the To-do list.">
        {projects.length === 0 ? (
          <p className="text-sm text-zinc-500">No projects.</p>
        ) : (
          <div className="space-y-3">
            {projects.map((p) => (
              <div key={p.id} className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-white">{p.title}</span>
                  <DueDate value={p.due_by} warn onChange={(v) => onUpdate(p.id, { due_by: v })} />
                </div>
                {p.detail ? <p className="text-sm text-zinc-400 mt-1.5">{p.detail}</p> : null}
                <p className="text-xs mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                  {p.owner ? (
                    <span>
                      <span className="text-zinc-500">Owner: </span>
                      <span className={ownerColor(p.owner)}>{p.owner}</span>
                    </span>
                  ) : null}
                  {p.needs_due_date && !p.due_by ? <span className="text-amber-400">needs a due date</span> : null}
                </p>
                <TextField key={p.notes ?? ''} value={p.notes} placeholder="Add notes..." onSave={(v) => onUpdate(p.id, { notes: v })} />
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Decisions to be made">
        {decisions.length === 0 ? empty : <div className="space-y-2">{decisions.map((d) => <ActionCard key={d.id} item={d} onUpdate={onUpdate} />)}</div>}
      </Section>

      <Section title="Commitments">
        {commitments.length === 0 ? empty : <div className="space-y-2">{commitments.map((c) => <ActionCard key={c.id} item={c} onUpdate={onUpdate} />)}</div>}
      </Section>

      <Section title="People stuff to deal with">
        {people.length === 0 ? empty : <div className="space-y-2">{people.map((p) => <ActionCard key={p.id} item={p} onUpdate={onUpdate} />)}</div>}
      </Section>

      <Section title="Key insights">
        {insights.length === 0 ? (
          empty
        ) : (
          <ul className="space-y-2">
            {insights.map((i) => (
              <li key={i.id} className="text-sm text-zinc-300 flex gap-2.5">
                <span className="text-blue-400 shrink-0">-</span>
                <span>
                  {i.title}
                  {i.detail ? <span className="text-zinc-500"> - {i.detail}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="To-do list" hint="Check off daily, set dates, add comments, and flag what's out to someone else.">
        {todos.length === 0 ? empty : <div className="space-y-2">{todos.map((t) => <ActionCard key={t.id} item={t} onUpdate={onUpdate} />)}</div>}
      </Section>
    </div>
  );
}
