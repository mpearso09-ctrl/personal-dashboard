'use client';
// Brain is two things: open action items, and today's Halifax calendar.
//
// "Draft a reply" asks /api/brain/draft for a suggested reply from the AI
// Gateway (AI_GATEWAY_MODEL) and shows it in a copy box. The route has no
// mail client. Nothing on this page can send email. The Gmail deep-link
// alternative was not used, and rows are never marked "drafting" — that
// status is not in the action_items check constraint.
//
// brain_items and brain_briefings stay in the database. This view does not
// read them.

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ChevronDown } from 'lucide-react';
import { createClient } from '@/lib/supabase-browser';
import { useAuth } from '@/components/auth-provider';
import { actionAge, groupActionItems, type ActionItem } from '@/lib/action-items';
import { HALIFAX_TIME_ZONE } from '@/lib/zoned-day';
import { cn } from '@/lib/utils';

type CalendarEvent = { id: string; title: string; when: string; allDay: boolean };

type CalendarState =
  | { status: 'loading' }
  | { status: 'ready'; connected: boolean; events: CalendarEvent[]; reason?: string };

type DraftState =
  | { status: 'writing' }
  | { status: 'ready'; text: string; copied: boolean; copyError?: string }
  | { status: 'error'; message: string };

function subscribeNoop() {
  return () => {};
}

function readCalendarBanner() {
  const code = new URLSearchParams(window.location.search).get('calendar') ?? '';
  return CALENDAR_BANNER[code] ?? '';
}

const CALENDAR_BANNER: Record<string, string> = {
  connected: 'Calendar connected.',
  denied: 'Calendar access was cancelled. Today stays empty until you connect.',
  missing: 'Google did not grant calendar access. Connect again and allow read-only calendar.',
  token: 'Google did not return a usable calendar connection. Try Connect calendar again.',
  state: 'That connect attempt expired. Tap Connect calendar to start again.',
  config: 'Google is not set up on the server yet.',
  save: 'Calendar was approved, but it could not be saved. Run supabase/migration-v21-action-items.sql in Supabase.',
};

export default function BrainPage() {
  const supabase = useMemo(() => createClient(), []);
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [setup, setSetup] = useState('');
  const [loadError, setLoadError] = useState('');
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [calendar, setCalendar] = useState<CalendarState>({ status: 'loading' });
  const banner = useSyncExternalStore(subscribeNoop, readCalendarBanner, () => '');

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from('action_items')
      .select('id, business, source_inbox, title, summary, created_at')
      .eq('status', 'open')
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          if (/action_items|schema cache|does not exist/i.test(error.message)) {
            setSetup('Action items are not in the database yet. Run supabase/migration-v21-action-items.sql in the Supabase SQL editor.');
          } else {
            setLoadError('Could not load action items.');
          }
          setItems([]);
        } else {
          setSetup('');
          setLoadError('');
          setItems((data ?? []) as ActionItem[]);
        }
        setLoading(false);
      });
    fetch('/api/google-calendar/events')
      .then((response) => response.json())
      .then((body: { connected?: boolean; events?: CalendarEvent[]; reason?: string }) => {
        if (cancelled) return;
        setCalendar({
          status: 'ready',
          connected: Boolean(body.connected),
          events: body.events ?? [],
          reason: body.reason,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setCalendar({ status: 'ready', connected: false, events: [], reason: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [user, supabase]);

  const groups = useMemo(() => groupActionItems(items), [items]);
  const todayLabel = new Date().toLocaleDateString('en-CA', {
    timeZone: HALIFAX_TIME_ZONE,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  function isOpen(id: string, count: number) {
    if (id in closed) return !closed[id];
    return count > 0;
  }

  function toggle(id: string, count: number) {
    setClosed((current) => {
      const open = id in current ? !current[id] : count > 0;
      return { ...current, [id]: open };
    });
  }

  async function markDone(id: string) {
    if (pendingId) return;
    setPendingId(id);
    const doneAt = new Date().toISOString();
    const { data, error } = await supabase
      .from('action_items')
      .update({ status: 'done', done_at: doneAt })
      .eq('id', id)
      .select('id');
    if (error || !data?.length) {
      setDrafts((current) => ({
        ...current,
        [id]: { status: 'error', message: 'Could not mark that done.' },
      }));
      setPendingId(null);
      return;
    }
    setItems((rows) => rows.filter((row) => row.id !== id));
    setPendingId(null);
  }

  async function draftReply(id: string) {
    setDrafts((current) => ({ ...current, [id]: { status: 'writing' } }));
    try {
      const response = await fetch('/api/brain/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const body = await response.json().catch(() => ({})) as { draft?: string; error?: string };
      if (!response.ok || !body.draft) {
        setDrafts((current) => ({
          ...current,
          [id]: { status: 'error', message: body.error || 'Could not draft a reply.' },
        }));
        return;
      }
      setDrafts((current) => ({ ...current, [id]: { status: 'ready', text: body.draft as string, copied: false } }));
    } catch {
      setDrafts((current) => ({
        ...current,
        [id]: { status: 'error', message: 'Could not draft a reply.' },
      }));
    }
  }

  async function copyDraft(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setDrafts((current) => ({ ...current, [id]: { status: 'ready', text, copied: true } }));
    } catch {
      setDrafts((current) => ({
        ...current,
        [id]: { status: 'ready', text, copied: false, copyError: 'Could not copy. Select the reply and copy it yourself.' },
      }));
    }
  }

  if (authLoading || (user && loading)) {
    return <p className="py-8 text-base text-zinc-400">Loading Brain…</p>;
  }

  return (
    <div className="mx-auto max-w-xl space-y-8 pb-8">
      <header>
        <p className="text-sm text-zinc-400">{todayLabel}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">Brain</h1>
      </header>

      {banner && (
        <p className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-200">{banner}</p>
      )}

      <CalendarPanel state={calendar} />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Open</h2>
        {setup && <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">{setup}</p>}
        {loadError && <p className="text-sm text-red-300">{loadError}</p>}
        {groups.map((group) => {
          const open = isOpen(group.id, group.items.length);
          return (
            <div key={group.id} className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => toggle(group.id, group.items.length)}
                className="flex min-h-14 w-full items-center gap-3 px-4 text-left"
              >
                <span className="text-lg font-semibold text-white">{group.label}</span>
                <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-sm font-medium text-zinc-200">
                  {group.items.length}
                </span>
                <ChevronDown
                  aria-hidden
                  className={cn('ml-auto text-zinc-400 transition-transform', open && 'rotate-180')}
                  size={22}
                />
              </button>
              {open && (
                group.items.length === 0 ? (
                  <p className="border-t border-zinc-800 px-4 py-4 text-sm text-zinc-500">Nothing open.</p>
                ) : (
                  <ul>
                    {group.items.map((item) => (
                      <ActionCard
                        key={item.id}
                        item={item}
                        pending={pendingId === item.id}
                        draft={drafts[item.id]}
                        onDone={() => markDone(item.id)}
                        onDraft={() => draftReply(item.id)}
                        onCopy={(text) => copyDraft(item.id, text)}
                      />
                    ))}
                  </ul>
                )
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}

function CalendarPanel({ state }: { state: CalendarState }) {
  const needsConnect = state.status === 'ready' && !state.connected;
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Today&apos;s calendar</h2>
      <div className="mt-2 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        {state.status === 'loading' && <p className="px-4 py-5 text-base text-zinc-400">Loading today…</p>}
        {needsConnect && (
          <div className="space-y-4 px-4 py-5">
            <p className="text-base text-zinc-300">
              {state.reason === 'error'
                ? 'Could not load today’s calendar.'
                : 'No events yet. Connect Google Calendar to see today in Halifax.'}
            </p>
            <a
              href="/api/google-calendar/connect"
              className="flex min-h-12 items-center justify-center rounded-xl bg-white px-4 text-base font-semibold text-zinc-900"
            >
              Connect calendar
            </a>
          </div>
        )}
        {state.status === 'ready' && state.connected && state.events.length === 0 && (
          <p className="px-4 py-5 text-base text-zinc-400">Nothing on the calendar today.</p>
        )}
        {state.status === 'ready' && state.connected && state.events.length > 0 && (
          <ul>
            {state.events.map((event) => (
              <li key={event.id} className="flex min-h-14 items-start gap-3 border-t border-zinc-800 px-4 py-3 first:border-t-0">
                <span className="w-24 shrink-0 pt-0.5 text-sm font-medium text-zinc-300">{event.when}</span>
                <span className="text-base text-white">{event.title}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ActionCard({
  item,
  pending,
  draft,
  onDone,
  onDraft,
  onCopy,
}: {
  item: ActionItem;
  pending: boolean;
  draft?: DraftState;
  onDone: () => void;
  onDraft: () => void;
  onCopy: (text: string) => void;
}) {
  return (
    <li className="border-t border-zinc-800 px-4 py-4">
      <h3 className="text-base font-semibold leading-snug text-white">{item.title}</h3>
      {item.summary && <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-zinc-400">{item.summary}</p>}
      <p className="mt-2 text-sm text-zinc-500">
        {item.source_inbox}
        <span aria-hidden> · </span>
        <span>{actionAge(item.created_at)}</span>
      </p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={onDone}
          disabled={pending}
          className="min-h-12 rounded-xl bg-emerald-600 px-4 text-base font-semibold text-white disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Mark done'}
        </button>
        <button
          type="button"
          onClick={onDraft}
          disabled={draft?.status === 'writing'}
          className="min-h-12 rounded-xl border border-zinc-700 bg-zinc-800 px-4 text-base font-semibold text-white disabled:opacity-60"
        >
          {draft?.status === 'writing' ? 'Writing…' : 'Draft a reply'}
        </button>
      </div>
      {draft?.status === 'ready' && (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-zinc-400">Suggested reply. Nothing is sent.</p>
          <textarea
            readOnly
            value={draft.text}
            rows={6}
            className="w-full resize-y rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-base text-zinc-100"
          />
          <button
            type="button"
            onClick={() => onCopy(draft.text)}
            className="min-h-12 w-full rounded-xl border border-zinc-700 px-4 text-base font-semibold text-white sm:w-auto"
          >
            {draft.copied ? 'Copied' : 'Copy'}
          </button>
          {draft.copyError && <p className="text-sm text-red-300">{draft.copyError}</p>}
        </div>
      )}
      {draft?.status === 'error' && <p className="mt-3 text-sm text-red-300">{draft.message}</p>}
    </li>
  );
}
