'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useAuth } from '@/components/auth-provider';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types — mirror public.brain_briefings (written by the Brain automation)
// ---------------------------------------------------------------------------

interface BriefingProject {
  name: string;
  status: string;
  next_action: string;
  owner: string;
}
interface BriefingTask {
  task: string;
  project: string;
  due: string;
  owner: string;
  status: string;
}
interface BriefingConvo {
  title: string;
  summary: string;
}
interface Briefing {
  briefing_date: string;
  kind: string;
  headline: string | null;
  summary_md: string | null;
  projects: BriefingProject[];
  open_tasks: BriefingTask[];
  todos: string[];
  strategic_flags: string[];
  conversation_summaries: BriefingConvo[];
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Small building blocks (match the dashboard's zinc theme)
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      {children}
    </div>
  );
}

function statusColor(status: string): string {
  const s = status.toLowerCase();
  if (s.includes('scaffold')) return 'text-amber-400';
  if (s.includes('active') || s.includes('done')) return 'text-emerald-400';
  if (s.includes('risk') || s.includes('blocked')) return 'text-red-400';
  return 'text-zinc-300';
}

function ownerColor(owner: string): string {
  return owner.toUpperCase() === 'CONFIRM' ? 'text-amber-400' : 'text-zinc-300';
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BrainPage() {
  const { user } = useAuth();
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    async function load() {
      const { data } = await supabase
        .from('brain_briefings')
        .select('*')
        .order('briefing_date', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setBriefing((data as Briefing | null) ?? null);
      setLoading(false);
    }
    load();
  }, [user]);

  if (!user || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-zinc-400">Loading...</p>
      </div>
    );
  }

  if (!briefing) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-white">🧠 Brain</h1>
          <p className="text-sm text-zinc-400 mt-0.5">Daily briefing from your knowledge vault</p>
        </div>
        <Section title="No briefing yet">
          <p className="text-zinc-500 text-sm">
            Your first briefing appears after the next morning (≈5 AM) or nightly (9:30 PM) run.
          </p>
        </Section>
      </div>
    );
  }

  const updated = new Date(briefing.updated_at).toLocaleString('en-CA', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">🧠 Brain</h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            {briefing.briefing_date} · <span className="capitalize">{briefing.kind}</span> · updated {updated}
          </p>
        </div>
      </div>

      {/* Headline */}
      {briefing.headline && (
        <div className="bg-blue-600/10 border border-blue-600/30 rounded-xl p-5">
          <p className="text-base leading-snug text-white">{briefing.headline}</p>
        </div>
      )}

      {/* Summary */}
      {briefing.summary_md && (
        <Section title="Summary">
          <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">{briefing.summary_md}</p>
        </Section>
      )}

      {/* Projects */}
      {briefing.projects?.length > 0 && (
        <Section title="Projects">
          <div className="space-y-3">
            {briefing.projects.map((p, i) => (
              <div key={i} className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-white">{p.name}</span>
                  <span className={cn('text-xs font-medium uppercase tracking-wide', statusColor(p.status))}>{p.status}</span>
                </div>
                <p className="text-sm text-zinc-400 mt-1.5">{p.next_action}</p>
                <p className="text-xs mt-1.5">
                  <span className="text-zinc-500">Owner: </span>
                  <span className={ownerColor(p.owner)}>{p.owner}</span>
                </p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Open tasks */}
      {briefing.open_tasks?.length > 0 && (
        <Section title="Open tasks">
          <div className="space-y-2">
            {briefing.open_tasks.map((t, i) => (
              <div key={i} className="flex justify-between items-start gap-3 border-b border-zinc-800 pb-2 last:border-0">
                <div>
                  <p className="text-sm text-zinc-200">{t.task}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{t.project}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-zinc-400">{t.due}</p>
                  <p className={cn('text-xs', ownerColor(t.owner))}>{t.owner}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* To-do */}
      {briefing.todos?.length > 0 && (
        <Section title="To-do">
          <ul className="space-y-1.5">
            {briefing.todos.map((t, i) => (
              <li key={i} className="text-sm text-zinc-300 flex gap-2">
                <span className="text-zinc-600">•</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Strategic flags */}
      {briefing.strategic_flags?.length > 0 && (
        <Section title="Strategic flags for review">
          <ol className="space-y-2.5">
            {briefing.strategic_flags.map((f, i) => (
              <li key={i} className="text-sm text-zinc-300 flex gap-2.5">
                <span className="text-amber-400 font-semibold shrink-0">{i + 1}.</span>
                <span>{f}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {/* Conversation summaries */}
      {briefing.conversation_summaries?.length > 0 && (
        <Section title="Recent conversation summaries">
          <div className="space-y-3">
            {briefing.conversation_summaries.map((c, i) => (
              <div key={i}>
                <p className="text-sm font-medium text-white">{c.title}</p>
                <p className="text-sm text-zinc-400 mt-0.5">{c.summary}</p>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
