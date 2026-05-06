'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useAuth } from '@/components/auth-provider';
import {
  PROGRAM,
  type ProgramDay,
  type ProgramExercise,
  type TrainingWorkout,
  type TrainingExercise,
  type TrainingSet,
  type TrainingProgramSettings,
} from '@/lib/types';
import { cn, formatDate, getToday } from '@/lib/utils';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Zap,
  CheckCircle2,
  Circle,
  Play,
  Square,
  Timer,
  ChevronRight,
  ChevronLeft,
  Trophy,
  Flame,
  RotateCcw,
  Calendar,
  Dumbbell,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function getProgramDay(startDate: string, targetDate?: string): { week: number; day: number; totalDay: number } {
  const start = new Date(startDate + 'T00:00:00');
  const target = new Date((targetDate ?? getToday()) + 'T00:00:00');
  const daysSinceStart = Math.floor((target.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (daysSinceStart < 0) return { week: 1, day: 1, totalDay: 0 };
  const totalDay = daysSinceStart + 1;
  const weekIndex = Math.floor(daysSinceStart / 7) % 8;
  const dayIndex = daysSinceStart % 7;
  return { week: weekIndex + 1, day: dayIndex + 1, totalDay };
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function roundToFive(n: number): number {
  return Math.round(n / 5) * 5;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function parseTime(str: string): number {
  const parts = str.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parseInt(str) || 0;
}

function getDurationStr(exercise: ProgramExercise): string {
  if (exercise.durationMin && exercise.durationMinMax) {
    return `${exercise.durationMin}–${exercise.durationMinMax} min`;
  }
  if (exercise.durationMin) return `${exercise.durationMin} min`;
  return '';
}

// ---------------------------------------------------------------------------
// Types for local workout state
// ---------------------------------------------------------------------------

interface LocalSet {
  setNumber: number;
  targetReps: number | 'max' | null;
  targetWeight: number | null;
  actualWeight: string;
  actualReps: string;
  timeSeconds: string; // mm:ss for cardio/intervals
  isCompleted: boolean;
  dbId: string | null;
}

interface LocalExercise {
  programExercise: ProgramExercise;
  exerciseOrder: number;
  sets: LocalSet[];
  // For AMRAP
  amrapRounds: string;
  amrapNotes: string;
  amrapTimerRunning: boolean;
  amrapSecondsLeft: number;
  // For circuits
  circuitRounds: number;
  circuitTime: string;
  circuitNotes: string;
  // For optional (day 6) — which option selected
  optionSelected: 'A' | 'B' | null;
  // Cardio
  cardioTimeStr: string;
  cardioTimerRunning: boolean;
  cardioElapsedSeconds: number;
  isCompleted: boolean;
  dbId: string | null;
}

// ---------------------------------------------------------------------------
// Tab type
// ---------------------------------------------------------------------------

type TabKey = 'today' | 'program' | 'history';

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function TrainingPage() {
  const { user, loading: authLoading } = useAuth();
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<TabKey>('today');

  // Program settings
  const [settings, setSettings] = useState<TrainingProgramSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [startDateInput, setStartDateInput] = useState(getToday());
  const [savingSettings, setSavingSettings] = useState(false);
  const [editingStartDate, setEditingStartDate] = useState(false);
  const [newStartDateInput, setNewStartDateInput] = useState('');

  // Date navigation — which day we're viewing/logging
  const [selectedTrainingDate, setSelectedTrainingDate] = useState(getToday());

  // Calendar month for Program tab (YYYY-MM)
  const [calendarMonth, setCalendarMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  // Today's workout DB state
  const [todayWorkout, setTodayWorkout] = useState<TrainingWorkout | null>(null);
  const [workoutLoading, setWorkoutLoading] = useState(false);

  // Local interactive workout state
  const [workoutStarted, setWorkoutStarted] = useState(false);
  const [exercises, setExercises] = useState<LocalExercise[]>([]);
  const [completingWorkout, setCompletingWorkout] = useState(false);

  // Completed workout detail for read-only view (past/completed days)
  // null = not yet fetched, [] = fetched but no exercise data saved
  const [completedWorkoutDetail, setCompletedWorkoutDetail] = useState<
    (TrainingExercise & { sets: TrainingSet[] })[] | null
  >(null);

  // Save indicator
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // 1RM cache: milestoneMatch -> best 1RM value
  const [oneRMCache, setOneRMCache] = useState<Record<string, number>>({});

  // PR toast
  const [prToasts, setPrToasts] = useState<string[]>([]);

  // History
  const [historyWorkouts, setHistoryWorkouts] = useState<TrainingWorkout[]>([]);
  const [historyDetail, setHistoryDetail] = useState<{
    workout: TrainingWorkout;
    exercises: (TrainingExercise & { sets: TrainingSet[] })[];
  } | null>(null);

  // Debounce refs
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // ---------------------------------------------------------------------------
  // Wake lock
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    async function acquireWakeLock() {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch { /* ignore */ }
    }
    if (workoutStarted) acquireWakeLock();
    return () => { wakeLock?.release().catch(() => {}); };
  }, [workoutStarted]);

  // ---------------------------------------------------------------------------
  // Interval timers (AMRAP countdown + cardio elapsed)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!workoutStarted) return;
    const interval = setInterval(() => {
      setExercises((prev) =>
        prev.map((ex) => {
          let updated = { ...ex };

          // AMRAP countdown
          if (ex.amrapTimerRunning && ex.amrapSecondsLeft > 0) {
            updated = { ...updated, amrapSecondsLeft: ex.amrapSecondsLeft - 1 };
            if (updated.amrapSecondsLeft === 0) {
              updated = { ...updated, amrapTimerRunning: false };
            }
          }

          // Cardio elapsed timer
          if (ex.cardioTimerRunning) {
            updated = { ...updated, cardioElapsedSeconds: ex.cardioElapsedSeconds + 1 };
          }

          return updated;
        })
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [workoutStarted]);

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const fetchSettings = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('training_program_settings')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();
    setSettings(data ?? null);
    setSettingsLoading(false);
  }, [user]);

  const fetchTodayWorkout = useCallback(async () => {
    if (!user || !settings) return;
    setWorkoutLoading(true);
    const { data } = await supabase
      .from('training_workouts')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', selectedTrainingDate)
      .single();
    setTodayWorkout(data ?? null);
    setWorkoutLoading(false);
  }, [user, settings, selectedTrainingDate]);

  const fetch1RMs = useCallback(async (programDay: ProgramDay) => {
    if (!user) return;
    const names = programDay.exercises
      .filter((e) => e.milestoneMatch)
      .map((e) => e.milestoneMatch!);
    if (!names.length) return;

    // Get milestone_type IDs for these names
    const { data: types } = await supabase
      .from('milestone_types')
      .select('id, name')
      .eq('user_id', user.id)
      .in('name', names);

    if (!types?.length) return;

    const typeMap: Record<string, string> = {};
    types.forEach((t) => { typeMap[t.name] = t.id; });

    // Get best 1RM entries
    const typeIds = types.map((t) => t.id);
    const { data: entries } = await supabase
      .from('milestone_entries')
      .select('milestone_type_id, value')
      .in('milestone_type_id', typeIds)
      .eq('rep_max', 1)
      .order('value', { ascending: false });

    if (!entries?.length) return;

    const cache: Record<string, number> = {};
    names.forEach((name) => {
      const tid = typeMap[name];
      if (!tid) return;
      const best = entries.filter((e) => e.milestone_type_id === tid)[0];
      if (best) cache[name] = best.value;
    });
    setOneRMCache(cache);
  }, [user]);

  const fetchHistory = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('training_workouts')
      .select('*')
      .eq('user_id', user.id)
      .not('completed_at', 'is', null)
      .order('date', { ascending: false })
      .limit(30);
    setHistoryWorkouts(data ?? []);
  }, [user]);

  // ---------------------------------------------------------------------------
  // Fetch all exercises + sets for a workout (used for restore & read-only view)
  // ---------------------------------------------------------------------------

  const fetchWorkoutDetail = useCallback(async (
    workoutId: string
  ): Promise<(TrainingExercise & { sets: TrainingSet[] })[]> => {
    const { data: exData } = await supabase
      .from('training_exercises')
      .select('*')
      .eq('workout_id', workoutId)
      .order('exercise_order');
    if (!exData?.length) return [];
    return Promise.all(
      exData.map(async (ex) => {
        const { data: sets } = await supabase
          .from('training_sets')
          .select('*')
          .eq('exercise_id', ex.id)
          .order('set_number');
        return { ...ex, sets: sets ?? [] };
      })
    );
  }, [supabase]);

  // ---------------------------------------------------------------------------
  // Restore LocalExercise[] from DB data (re-entering an in-progress workout)
  // ---------------------------------------------------------------------------

  function restoreExercisesFromDB(
    dbExercises: (TrainingExercise & { sets: TrainingSet[] })[],
    programDay: ProgramDay,
    week: number,
    orCache: Record<string, number>
  ): LocalExercise[] {
    const base = buildExercises(programDay, week, orCache);
    return base.map((baseEx, idx) => {
      const dbEx = dbExercises.find((e) => e.exercise_order === idx);
      if (!dbEx) return baseEx;

      const type = baseEx.programExercise.type;
      const restoredSets = baseEx.sets.map((baseSet) => {
        const dbSet = dbEx.sets.find((s) => s.set_number === baseSet.setNumber);
        if (!dbSet) return baseSet;
        return {
          ...baseSet,
          dbId: dbSet.id,
          actualWeight: dbSet.actual_weight != null ? String(dbSet.actual_weight) : '',
          actualReps: dbSet.actual_reps != null ? String(dbSet.actual_reps) : '',
          timeSeconds: dbSet.time_seconds != null ? formatTime(dbSet.time_seconds) : '',
          isCompleted: dbSet.is_completed ?? false,
        };
      });

      // For AMRAP / circuit / cardio restore from summary set (set_number=1)
      const summarySet = dbEx.sets.find((s) => s.set_number === 1);
      let extra: Partial<LocalExercise> = {};
      if (type === 'amrap' && summarySet) {
        extra = {
          amrapRounds: summarySet.actual_reps != null ? String(summarySet.actual_reps) : '',
          amrapNotes: summarySet.notes ?? '',
          isCompleted: summarySet.is_completed ?? false,
        };
      } else if (type === 'circuit' && summarySet) {
        extra = {
          circuitRounds: summarySet.actual_reps ?? 0,
          circuitTime: summarySet.time_seconds != null ? formatTime(summarySet.time_seconds) : '',
          circuitNotes: summarySet.notes ?? '',
          isCompleted: summarySet.is_completed ?? false,
        };
      } else if (type === 'cardio' && summarySet) {
        extra = {
          cardioElapsedSeconds: summarySet.time_seconds ?? 0,
          cardioTimeStr: summarySet.time_seconds != null ? formatTime(summarySet.time_seconds) : '',
          isCompleted: summarySet.is_completed ?? false,
        };
      }

      return { ...baseEx, dbId: dbEx.id, sets: restoredSets, ...extra };
    });
  }

  useEffect(() => {
    if (!user) return;
    fetchSettings();
  }, [user, fetchSettings]);

  useEffect(() => {
    if (!user || !settings) return;
    setWorkoutStarted(false);
    setExercises([]);
    setCompletedWorkoutDetail(null);
    setLastSavedAt(null);
    fetchTodayWorkout();
  }, [user, settings, fetchTodayWorkout, selectedTrainingDate]);

  // When todayWorkout row arrives: restore in-progress OR load completed detail
  useEffect(() => {
    if (!user || !settings || !todayWorkout) return;
    const { week, day } = getProgramDay(settings.start_date, todayWorkout.date);
    const programDay = PROGRAM[(day - 1) % 7];

    if (todayWorkout.started_at && !todayWorkout.completed_at) {
      // In-progress — restore exercise state so the user picks up where they left off
      (async () => {
        const orCache = await buildOneRMCache(programDay);
        const dbExercises = await fetchWorkoutDetail(todayWorkout.id);
        if (dbExercises.length > 0) {
          const restored = restoreExercisesFromDB(dbExercises, programDay, week, orCache);
          setExercises(restored);
          setWorkoutStarted(true);
        }
      })();
    } else if (todayWorkout.completed_at) {
      // Completed — load detail for read-only view
      fetchWorkoutDetail(todayWorkout.id).then(setCompletedWorkoutDetail);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayWorkout?.id]);

  useEffect(() => {
    if (!user || !settings) return;
    if (activeTab === 'history') fetchHistory();
  }, [user, settings, activeTab, fetchHistory]);

  // ---------------------------------------------------------------------------
  // Build local exercise state from program day
  // ---------------------------------------------------------------------------

  function buildExercises(programDay: ProgramDay, week: number, orCache: Record<string, number>): LocalExercise[] {
    const isPhase2 = week >= 5;
    return programDay.exercises.map((ex, idx) => {
      const sets = getSetsForPhase(ex, isPhase2, orCache);
      return {
        programExercise: ex,
        exerciseOrder: idx,
        sets,
        amrapRounds: '',
        amrapNotes: '',
        amrapTimerRunning: false,
        amrapSecondsLeft: (ex.amrapMinutes ?? 10) * 60,
        circuitRounds: 0,
        circuitTime: '',
        circuitNotes: '',
        optionSelected: null,
        cardioTimeStr: '',
        cardioTimerRunning: false,
        cardioElapsedSeconds: 0,
        isCompleted: false,
        dbId: null,
      };
    });
  }

  function getSetsForPhase(ex: ProgramExercise, isPhase2: boolean, orCache: Record<string, number>): LocalSet[] {
    const rawSets = isPhase2 ? (ex.phase2Sets ?? ex.sets ?? []) : (ex.phase1Sets ?? ex.sets ?? []);

    if (ex.type === 'intervals') {
      const minRounds = ex.intervalRounds?.[0] ?? 6;
      return Array.from({ length: minRounds }, (_, i) => ({
        setNumber: i + 1,
        targetReps: null,
        targetWeight: null,
        actualWeight: '',
        actualReps: '',
        timeSeconds: '',
        isCompleted: false,
        dbId: null,
      }));
    }

    if (!rawSets.length) return [];

    return rawSets.map((s, i) => {
      let targetWeight: number | null = null;
      if (s.pctOf1RM && ex.milestoneMatch && orCache[ex.milestoneMatch]) {
        targetWeight = roundToFive(orCache[ex.milestoneMatch] * s.pctOf1RM);
      }
      return {
        setNumber: i + 1,
        targetReps: s.targetReps ?? null,
        targetWeight,
        actualWeight: '',
        actualReps: '',
        timeSeconds: '',
        isCompleted: false,
        dbId: null,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Start workout
  // ---------------------------------------------------------------------------

  async function startWorkout() {
    if (!user || !settings) return;
    const { week, day } = getProgramDay(settings.start_date, selectedTrainingDate);
    const programDay = PROGRAM[(day - 1) % 7];

    await fetch1RMs(programDay);
    const orCache = await buildOneRMCache(programDay);

    let workout = todayWorkout;

    if (!workout) {
      const { data } = await supabase
        .from('training_workouts')
        .upsert({
          user_id: user.id,
          date: selectedTrainingDate,
          week_number: week,
          day_number: day,
          day_name: programDay.name,
          started_at: new Date().toISOString(),
        }, { onConflict: 'user_id,date' })
        .select()
        .single();
      workout = data;
      setTodayWorkout(data);
    }

    const exs = buildExercises(programDay, week, orCache);
    setExercises(exs);
    setWorkoutStarted(true);
  }

  async function buildOneRMCache(programDay: ProgramDay): Promise<Record<string, number>> {
    if (!user) return {};
    const names = programDay.exercises
      .filter((e) => e.milestoneMatch)
      .map((e) => e.milestoneMatch!);
    if (!names.length) return {};

    const { data: types } = await supabase
      .from('milestone_types')
      .select('id, name')
      .eq('user_id', user.id)
      .in('name', names);

    if (!types?.length) return {};

    const typeMap: Record<string, string> = {};
    types.forEach((t) => { typeMap[t.name] = t.id; });

    const typeIds = types.map((t) => t.id);
    const { data: entries } = await supabase
      .from('milestone_entries')
      .select('milestone_type_id, value')
      .in('milestone_type_id', typeIds)
      .eq('rep_max', 1)
      .order('value', { ascending: false });

    const cache: Record<string, number> = {};
    names.forEach((name) => {
      const tid = typeMap[name];
      if (!tid) return;
      const best = (entries ?? []).filter((e) => e.milestone_type_id === tid)[0];
      if (best) cache[name] = best.value;
    });
    setOneRMCache(cache);
    return cache;
  }

  // ---------------------------------------------------------------------------
  // Auto-save helpers
  // ---------------------------------------------------------------------------

  function scheduleExerciseSave(exIdx: number, updatedExercises: LocalExercise[]) {
    const key = `ex-${exIdx}`;
    clearTimeout(saveTimers.current[key]);
    saveTimers.current[key] = setTimeout(() => {
      persistExercise(exIdx, updatedExercises);
    }, 500);
  }

  async function ensureWorkoutRow(): Promise<string | null> {
    if (!user || !settings) return null;
    if (todayWorkout?.id) return todayWorkout.id;

    const { week, day } = getProgramDay(settings.start_date, selectedTrainingDate);
    const programDay = PROGRAM[(day - 1) % 7];

    const { data } = await supabase
      .from('training_workouts')
      .upsert({
        user_id: user.id,
        date: selectedTrainingDate,
        week_number: week,
        day_number: day,
        day_name: programDay.name,
        started_at: new Date().toISOString(),
      }, { onConflict: 'user_id,date' })
      .select()
      .single();
    if (data) setTodayWorkout(data);
    return data?.id ?? null;
  }

  async function persistExercise(exIdx: number, currentExercises: LocalExercise[]) {
    if (!user) return;
    const ex = currentExercises[exIdx];
    if (!ex) return;

    setIsSaving(true);
    const workoutId = await ensureWorkoutRow();
    if (!workoutId) { setIsSaving(false); return; }

    // Upsert exercise row
    let exDbId = ex.dbId;
    if (!exDbId) {
      const { data } = await supabase
        .from('training_exercises')
        .upsert({
          workout_id: workoutId,
          exercise_name: ex.programExercise.name,
          exercise_order: ex.exerciseOrder,
          exercise_type: ex.programExercise.type,
        }, { onConflict: 'workout_id,exercise_order' })
        .select()
        .single();
      exDbId = data?.id ?? null;
      if (exDbId) {
        const id = exDbId;
        setExercises((prev) => {
          const updated = [...prev];
          updated[exIdx] = { ...updated[exIdx], dbId: id };
          return updated;
        });
      }
    }

    if (!exDbId) { setIsSaving(false); return; }

    const type = ex.programExercise.type;

    if (type === 'strength' || type === 'intervals') {
      // Save individual sets
      for (const set of ex.sets) {
        const payload = {
          exercise_id: exDbId,
          set_number: set.setNumber,
          target_reps: typeof set.targetReps === 'number' ? set.targetReps : null,
          actual_reps: set.actualReps ? parseInt(set.actualReps) : null,
          target_weight: set.targetWeight,
          actual_weight: set.actualWeight ? parseFloat(set.actualWeight) : null,
          time_seconds: set.timeSeconds ? parseTime(set.timeSeconds) : null,
          is_completed: set.isCompleted,
          notes: null,
        };
        if (set.dbId) {
          await supabase.from('training_sets').update(payload).eq('id', set.dbId);
        } else {
          const { data } = await supabase
            .from('training_sets')
            .upsert(payload, { onConflict: 'exercise_id,set_number' })
            .select()
            .single();
          if (data?.id) {
            const setDbId = data.id;
            const sn = set.setNumber;
            setExercises((prev) => {
              const updated = [...prev];
              const exCopy = { ...updated[exIdx] };
              exCopy.sets = exCopy.sets.map((s) =>
                s.setNumber === sn ? { ...s, dbId: setDbId } : s
              );
              updated[exIdx] = exCopy;
              return updated;
            });
          }
        }
      }
    } else if (type === 'amrap') {
      // Save as a single summary set
      await supabase.from('training_sets').upsert({
        exercise_id: exDbId,
        set_number: 1,
        actual_reps: ex.amrapRounds ? parseInt(ex.amrapRounds) : null,
        is_completed: ex.isCompleted,
        notes: ex.amrapNotes || null,
      }, { onConflict: 'exercise_id,set_number' });
    } else if (type === 'circuit') {
      await supabase.from('training_sets').upsert({
        exercise_id: exDbId,
        set_number: 1,
        actual_reps: ex.circuitRounds || null,
        time_seconds: ex.circuitTime ? parseTime(ex.circuitTime) : null,
        is_completed: ex.isCompleted,
        notes: ex.circuitNotes || null,
      }, { onConflict: 'exercise_id,set_number' });
    } else if (type === 'cardio' || type === 'optional') {
      await supabase.from('training_sets').upsert({
        exercise_id: exDbId,
        set_number: 1,
        time_seconds: ex.cardioElapsedSeconds > 0
          ? ex.cardioElapsedSeconds
          : ex.cardioTimeStr ? parseTime(ex.cardioTimeStr) : null,
        is_completed: ex.isCompleted,
      }, { onConflict: 'exercise_id,set_number' });
    }

    setIsSaving(false);
    setLastSavedAt(new Date());
  }

  // ---------------------------------------------------------------------------
  // Update helpers
  // ---------------------------------------------------------------------------

  function updateSet(exIdx: number, setIdx: number, changes: Partial<LocalSet>) {
    setExercises((prev) => {
      const updated = [...prev];
      const exCopy = { ...updated[exIdx] };
      const sets = [...exCopy.sets];
      sets[setIdx] = { ...sets[setIdx], ...changes };
      exCopy.sets = sets;
      updated[exIdx] = exCopy;
      scheduleExerciseSave(exIdx, updated);
      return updated;
    });
  }

  function updateExercise(exIdx: number, changes: Partial<LocalExercise>) {
    setExercises((prev) => {
      const updated = [...prev];
      updated[exIdx] = { ...updated[exIdx], ...changes };
      scheduleExerciseSave(exIdx, updated);
      return updated;
    });
  }

  function toggleSetComplete(exIdx: number, setIdx: number) {
    setExercises((prev) => {
      const updated = [...prev];
      const exCopy = { ...updated[exIdx] };
      const sets = [...exCopy.sets];
      sets[setIdx] = { ...sets[setIdx], isCompleted: !sets[setIdx].isCompleted };
      exCopy.sets = sets;
      updated[exIdx] = exCopy;
      // Cancel debounced save and persist immediately on checkmark tap
      clearTimeout(saveTimers.current[`ex-${exIdx}`]);
      persistExercise(exIdx, updated);
      return updated;
    });
  }

  function toggleExerciseComplete(exIdx: number) {
    setExercises((prev) => {
      const updated = [...prev];
      updated[exIdx] = { ...updated[exIdx], isCompleted: !updated[exIdx].isCompleted };
      clearTimeout(saveTimers.current[`ex-${exIdx}`]);
      persistExercise(exIdx, updated);
      return updated;
    });
  }

  // ---------------------------------------------------------------------------
  // Complete workout + PR detection
  // ---------------------------------------------------------------------------

  async function completeWorkout() {
    if (!user || !todayWorkout) return;
    setCompletingWorkout(true);

    // Mark completed
    await supabase
      .from('training_workouts')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', todayWorkout.id);

    // PR detection
    const newPRs: string[] = [];
    for (const ex of exercises) {
      if (!ex.programExercise.milestoneMatch) continue;
      const name = ex.programExercise.milestoneMatch;

      // Get milestone type
      const { data: types } = await supabase
        .from('milestone_types')
        .select('id, unit')
        .eq('user_id', user.id)
        .eq('name', name)
        .single();
      if (!types) continue;

      for (const set of ex.sets) {
        if (!set.actualWeight || !set.actualReps) continue;
        const w = parseFloat(set.actualWeight);
        const r = parseInt(set.actualReps);
        if (isNaN(w) || isNaN(r)) continue;

        // Check rep_max = r
        const { data: best } = await supabase
          .from('milestone_entries')
          .select('value')
          .eq('user_id', user.id)
          .eq('milestone_type_id', types.id)
          .eq('rep_max', r <= 10 ? r : null)
          .order('value', { ascending: false })
          .limit(1)
          .single();

        const isNewPR = !best || w > best.value;
        if (isNewPR) {
          await supabase.from('milestone_entries').insert({
            user_id: user.id,
            milestone_type_id: types.id,
            rep_max: r <= 10 ? r : null,
            value: w,
            date: selectedTrainingDate,
            is_pr: true,
          });
          newPRs.push(`${name} ${r}RM: ${w} lbs`);
        }
      }
    }

    if (newPRs.length) setPrToasts(newPRs);
    await fetchTodayWorkout();
    setWorkoutStarted(false);
    setCompletingWorkout(false);

    if (newPRs.length) {
      setTimeout(() => setPrToasts([]), 5000);
    }
  }

  // ---------------------------------------------------------------------------
  // Save settings
  // ---------------------------------------------------------------------------

  async function saveSettings() {
    if (!user) return;
    setSavingSettings(true);
    const { data } = await supabase
      .from('training_program_settings')
      .upsert({
        user_id: user.id,
        start_date: startDateInput,
        is_active: true,
      }, { onConflict: 'user_id' })
      .select()
      .single();
    setSettings(data ?? null);
    setSavingSettings(false);
  }

  async function changeStartDate() {
    if (!user || !newStartDateInput) return;
    setSavingSettings(true);
    const { data } = await supabase
      .from('training_program_settings')
      .upsert({
        user_id: user.id,
        start_date: newStartDateInput,
        is_active: true,
      }, { onConflict: 'user_id' })
      .select()
      .single();
    setSettings(data ?? null);
    setEditingStartDate(false);
    setNewStartDateInput('');
    setSavingSettings(false);
  }

  // ---------------------------------------------------------------------------
  // History detail
  // ---------------------------------------------------------------------------

  async function loadHistoryDetail(workout: TrainingWorkout) {
    const result = await fetchWorkoutDetail(workout.id);
    setHistoryDetail({ workout, exercises: result });
  }

  // ---------------------------------------------------------------------------
  // Guards
  // ---------------------------------------------------------------------------

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return <p className="text-zinc-400 p-8">Please sign in to view training data.</p>;
  }

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  const programInfo = settings ? getProgramDay(settings.start_date, selectedTrainingDate) : null;
  const todayProgramDay = programInfo ? PROGRAM[(programInfo.day - 1) % 7] : null;
  const isPhase2 = programInfo ? programInfo.week >= 5 : false;
  const isViewingPast = selectedTrainingDate < getToday();
  const isViewingFuture = selectedTrainingDate > getToday();
  const phaseLabel = isPhase2 ? 'Push Phase' : 'Build Phase';
  const phaseColor = isPhase2 ? 'bg-red-600/20 text-red-400 border-red-600/30' : 'bg-blue-600/20 text-blue-400 border-blue-600/30';
  const alreadyCompleted = !!todayWorkout?.completed_at;

  // ---------------------------------------------------------------------------
  // Sub-renders
  // ---------------------------------------------------------------------------

  // -- Set row for strength exercise --
  function renderStrengthSet(ex: LocalExercise, exIdx: number, set: LocalSet, setIdx: number) {
    const repLabel =
      set.targetReps === 'max'
        ? 'Max reps'
        : set.targetReps
        ? ex.programExercise.sets?.[setIdx]?.perLeg || ex.programExercise.phase1Sets?.[setIdx]?.perLeg || ex.programExercise.phase2Sets?.[setIdx]?.perLeg
          ? `${set.targetReps} reps/leg`
          : `${set.targetReps} reps`
        : null;

    const targetStr = set.targetWeight
      ? `${repLabel ?? 'reps'} @ ${set.targetWeight} lbs`
      : repLabel ?? '';

    return (
      <div
        key={setIdx}
        className={cn(
          'flex items-center gap-2 py-2.5 border-b border-zinc-800/60 last:border-0',
          set.isCompleted && 'opacity-50'
        )}
      >
        {/* Set number */}
        <span className="text-zinc-500 text-sm w-6 shrink-0 text-center">{set.setNumber}</span>

        {/* Target */}
        <span className={cn('text-xs text-zinc-400 flex-1 min-w-0', set.isCompleted && 'line-through')}>
          {targetStr || (set.targetWeight ? `${set.targetWeight} lbs` : '—')}
        </span>

        {/* Actual weight */}
        <input
          type="number"
          inputMode="numeric"
          value={set.actualWeight}
          onChange={(e) => updateSet(exIdx, setIdx, { actualWeight: e.target.value })}
          placeholder={set.targetWeight ? String(set.targetWeight) : 'lbs'}
          className="w-16 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white text-center focus:border-blue-500 focus:outline-none min-h-[44px]"
        />

        {/* Actual reps */}
        <input
          type="number"
          inputMode="numeric"
          value={set.actualReps}
          onChange={(e) => updateSet(exIdx, setIdx, { actualReps: e.target.value })}
          placeholder={set.targetReps === 'max' ? 'reps' : String(set.targetReps ?? 'reps')}
          className="w-14 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white text-center focus:border-blue-500 focus:outline-none min-h-[44px]"
        />

        {/* Check button */}
        <button
          onClick={() => toggleSetComplete(exIdx, setIdx)}
          className={cn(
            'min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg transition-colors shrink-0',
            set.isCompleted
              ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/40'
              : 'bg-zinc-800 text-zinc-500 border border-zinc-700 hover:border-emerald-600/50 hover:text-emerald-400'
          )}
        >
          {set.isCompleted ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
        </button>
      </div>
    );
  }

  // -- Intervals exercise --
  function renderIntervalsExercise(ex: LocalExercise, exIdx: number) {
    const minRounds = ex.programExercise.intervalRounds?.[0] ?? 6;
    const maxRounds = ex.programExercise.intervalRounds?.[1] ?? 8;
    const dist = ex.programExercise.intervalDistanceMeters ?? 400;
    const restSec = ex.programExercise.intervalRestSec ?? 90;

    return (
      <div className="space-y-2">
        <p className="text-xs text-zinc-400 mb-3">
          {minRounds}–{maxRounds} rounds of {dist}m · {restSec}s rest between
          {ex.programExercise.notes && ` · ${ex.programExercise.notes}`}
        </p>
        {ex.sets.map((set, setIdx) => (
          <div key={setIdx} className="flex items-center gap-3 py-2 border-b border-zinc-800/60 last:border-0">
            <span className="text-zinc-500 text-sm w-16 shrink-0">Round {set.setNumber}</span>
            <input
              type="text"
              inputMode="numeric"
              value={set.timeSeconds}
              onChange={(e) => updateSet(exIdx, setIdx, { timeSeconds: e.target.value })}
              placeholder="mm:ss"
              className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white text-center focus:border-blue-500 focus:outline-none min-h-[44px]"
            />
            <button
              onClick={() => toggleSetComplete(exIdx, setIdx)}
              className={cn(
                'min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg transition-colors',
                set.isCompleted
                  ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/40'
                  : 'bg-zinc-800 text-zinc-500 border border-zinc-700 hover:border-emerald-600/50 hover:text-emerald-400'
              )}
            >
              {set.isCompleted ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
            </button>
          </div>
        ))}
        {/* Add extra round */}
        {ex.sets.length < maxRounds && (
          <button
            onClick={() => {
              setExercises((prev) => {
                const updated = [...prev];
                const exCopy = { ...updated[exIdx] };
                exCopy.sets = [
                  ...exCopy.sets,
                  {
                    setNumber: exCopy.sets.length + 1,
                    targetReps: null,
                    targetWeight: null,
                    actualWeight: '',
                    actualReps: '',
                    timeSeconds: '',
                    isCompleted: false,
                    dbId: null,
                  },
                ];
                updated[exIdx] = exCopy;
                return updated;
              });
            }}
            className="text-xs text-blue-400 hover:text-blue-300 mt-1"
          >
            + Add round
          </button>
        )}
      </div>
    );
  }

  // -- AMRAP exercise --
  function renderAmrapExercise(ex: LocalExercise, exIdx: number) {
    const totalSeconds = (ex.programExercise.amrapMinutes ?? 10) * 60;
    const pct = Math.max(0, ex.amrapSecondsLeft / totalSeconds);

    return (
      <div className="space-y-4">
        {ex.programExercise.notes && (
          <p className="text-sm text-zinc-300 bg-zinc-800/50 rounded-lg p-3">{ex.programExercise.notes}</p>
        )}

        {/* Timer */}
        <div className="flex flex-col items-center gap-3 py-2">
          <div className="relative w-28 h-28">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="44" stroke="#27272a" strokeWidth="8" fill="none" />
              <circle
                cx="50" cy="50" r="44"
                stroke={pct > 0.5 ? '#3b82f6' : pct > 0.2 ? '#f59e0b' : '#ef4444'}
                strokeWidth="8" fill="none"
                strokeDasharray={`${2 * Math.PI * 44}`}
                strokeDashoffset={`${2 * Math.PI * 44 * (1 - pct)}`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl font-bold text-white tabular-nums">
                {formatTime(ex.amrapSecondsLeft)}
              </span>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => updateExercise(exIdx, { amrapTimerRunning: !ex.amrapTimerRunning })}
              className={cn(
                'flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-base min-h-[52px] transition-colors',
                ex.amrapTimerRunning
                  ? 'bg-red-600 hover:bg-red-500 text-white'
                  : ex.amrapSecondsLeft === 0
                  ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-500 text-white'
              )}
              disabled={ex.amrapSecondsLeft === 0}
            >
              {ex.amrapTimerRunning ? <Square className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              {ex.amrapTimerRunning ? 'Stop' : 'Start'}
            </button>
            <button
              onClick={() => updateExercise(exIdx, {
                amrapSecondsLeft: (ex.programExercise.amrapMinutes ?? 10) * 60,
                amrapTimerRunning: false,
              })}
              className="p-3 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 min-h-[52px] min-w-[52px] flex items-center justify-center"
            >
              <RotateCcw className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Result entry */}
        <div className="space-y-3">
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Rounds + Reps (e.g. 3 + 5)</label>
            <input
              type="text"
              value={ex.amrapRounds}
              onChange={(e) => updateExercise(exIdx, { amrapRounds: e.target.value })}
              placeholder="e.g. 3 + 5"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white focus:border-blue-500 focus:outline-none min-h-[44px]"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Notes</label>
            <textarea
              value={ex.amrapNotes}
              onChange={(e) => updateExercise(exIdx, { amrapNotes: e.target.value })}
              rows={2}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white resize-none focus:border-blue-500 focus:outline-none"
              placeholder="Optional notes..."
            />
          </div>
        </div>

        <button
          onClick={() => toggleExerciseComplete(exIdx)}
          className={cn(
            'w-full py-3 rounded-xl font-semibold text-base min-h-[52px] transition-colors',
            ex.isCompleted
              ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/40'
              : 'bg-zinc-800 text-zinc-300 border border-zinc-700 hover:border-emerald-600/40'
          )}
        >
          {ex.isCompleted ? 'Completed' : 'Mark Complete'}
        </button>
      </div>
    );
  }

  // -- Cardio exercise --
  function renderCardioExercise(ex: LocalExercise, exIdx: number) {
    const durationStr = getDurationStr(ex.programExercise);

    return (
      <div className="space-y-4">
        {durationStr && (
          <p className="text-sm text-zinc-400">
            Target: <span className="text-white font-medium">{durationStr}</span>
          </p>
        )}
        {ex.programExercise.distanceMeters && (
          <p className="text-sm text-zinc-400">
            Distance: <span className="text-white font-medium">{(ex.programExercise.distanceMeters / 1000).toFixed(1)} km</span>
          </p>
        )}
        {ex.programExercise.notes && (
          <p className="text-sm text-zinc-300 bg-zinc-800/50 rounded-lg p-3">{ex.programExercise.notes}</p>
        )}

        {/* Timer */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              const running = !ex.cardioTimerRunning;
              if (!running && ex.cardioElapsedSeconds > 0) {
                // Stop — fill in the time
                const formatted = formatTime(ex.cardioElapsedSeconds);
                updateExercise(exIdx, { cardioTimerRunning: false, cardioTimeStr: formatted });
              } else {
                updateExercise(exIdx, { cardioTimerRunning: running });
              }
            }}
            className={cn(
              'flex items-center gap-2 px-5 py-3 rounded-xl font-semibold min-h-[52px] transition-colors',
              ex.cardioTimerRunning
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            )}
          >
            {ex.cardioTimerRunning ? <Square className="h-5 w-5" /> : <Timer className="h-5 w-5" />}
            {ex.cardioTimerRunning
              ? formatTime(ex.cardioElapsedSeconds)
              : ex.cardioElapsedSeconds > 0
              ? formatTime(ex.cardioElapsedSeconds)
              : 'Timer'}
          </button>

          <div className="flex-1">
            <label className="text-xs text-zinc-400 block mb-1">Time (mm:ss)</label>
            <input
              type="text"
              inputMode="numeric"
              value={ex.cardioTimeStr}
              onChange={(e) => updateExercise(exIdx, { cardioTimeStr: e.target.value })}
              placeholder="mm:ss"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none min-h-[44px]"
            />
          </div>
        </div>

        <button
          onClick={() => toggleExerciseComplete(exIdx)}
          className={cn(
            'w-full py-3 rounded-xl font-semibold text-base min-h-[52px] transition-colors',
            ex.isCompleted
              ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/40'
              : 'bg-zinc-800 text-zinc-300 border border-zinc-700 hover:border-emerald-600/40'
          )}
        >
          {ex.isCompleted ? 'Completed' : 'Mark Complete'}
        </button>
      </div>
    );
  }

  // -- Circuit exercise --
  function renderCircuitExercise(ex: LocalExercise, exIdx: number) {
    return (
      <div className="space-y-4">
        {ex.programExercise.notes && (
          <p className="text-sm text-zinc-300 bg-zinc-800/50 rounded-lg p-3">{ex.programExercise.notes}</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Rounds completed</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => updateExercise(exIdx, { circuitRounds: Math.max(0, ex.circuitRounds - 1) })}
                className="min-h-[44px] min-w-[44px] bg-zinc-800 border border-zinc-700 rounded-lg flex items-center justify-center text-zinc-300 hover:bg-zinc-700"
              >
                −
              </button>
              <span className="text-xl font-bold text-white w-8 text-center">{ex.circuitRounds}</span>
              <button
                onClick={() => updateExercise(exIdx, { circuitRounds: Math.min(5, ex.circuitRounds + 1) })}
                className="min-h-[44px] min-w-[44px] bg-zinc-800 border border-zinc-700 rounded-lg flex items-center justify-center text-zinc-300 hover:bg-zinc-700"
              >
                +
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Total time (mm:ss)</label>
            <input
              type="text"
              inputMode="numeric"
              value={ex.circuitTime}
              onChange={(e) => updateExercise(exIdx, { circuitTime: e.target.value })}
              placeholder="mm:ss"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none min-h-[44px]"
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-zinc-400 block mb-1">Notes</label>
          <textarea
            value={ex.circuitNotes}
            onChange={(e) => updateExercise(exIdx, { circuitNotes: e.target.value })}
            rows={2}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white resize-none focus:border-blue-500 focus:outline-none"
            placeholder="Optional notes..."
          />
        </div>
        <button
          onClick={() => toggleExerciseComplete(exIdx)}
          className={cn(
            'w-full py-3 rounded-xl font-semibold text-base min-h-[52px] transition-colors',
            ex.isCompleted
              ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/40'
              : 'bg-zinc-800 text-zinc-300 border border-zinc-700 hover:border-emerald-600/40'
          )}
        >
          {ex.isCompleted ? 'Completed' : 'Mark Complete'}
        </button>
      </div>
    );
  }

  // -- Optional exercise (Day 6) --
  function renderOptionalExercise(exIdx: number) {
    const ex = exercises[exIdx];
    const optionAEx = exercises.find((e) => e.programExercise.name.includes('Option A'));
    const optionBEx = exercises.find((e) => e.programExercise.name.includes('Option B'));
    const optionAIdx = exercises.findIndex((e) => e.programExercise.name.includes('Option A'));
    const optionBIdx = exercises.findIndex((e) => e.programExercise.name.includes('Option B'));

    // Only render the selector once (for option A), then show active option
    if (exIdx === optionAIdx) {
      const selected = ex.optionSelected ?? optionAEx?.optionSelected ?? null;
      return (
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">Choose one option for today:</p>
          <div className="grid grid-cols-2 gap-3">
            {optionAEx && (
              <button
                onClick={() => {
                  updateExercise(optionAIdx, { optionSelected: 'A' });
                  if (optionBIdx >= 0) updateExercise(optionBIdx, { optionSelected: 'A' });
                }}
                className={cn(
                  'p-4 rounded-xl border text-left transition-colors',
                  selected === 'A'
                    ? 'bg-blue-600/20 border-blue-600/50 text-white'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-600'
                )}
              >
                <div className="font-semibold text-sm mb-1">Option A</div>
                <div className="text-xs text-zinc-400">{optionAEx.programExercise.notes}</div>
                {optionAEx.programExercise.durationMin && (
                  <div className="text-xs text-zinc-500 mt-1">{getDurationStr(optionAEx.programExercise)}</div>
                )}
              </button>
            )}
            {optionBEx && (
              <button
                onClick={() => {
                  if (optionAIdx >= 0) updateExercise(optionAIdx, { optionSelected: 'B' });
                  updateExercise(optionBIdx, { optionSelected: 'B' });
                }}
                className={cn(
                  'p-4 rounded-xl border text-left transition-colors',
                  selected === 'B'
                    ? 'bg-blue-600/20 border-blue-600/50 text-white'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-600'
                )}
              >
                <div className="font-semibold text-sm mb-1">Option B</div>
                <div className="text-xs text-zinc-400">{optionBEx.programExercise.notes}</div>
              </button>
            )}
          </div>

          {/* Show tracker for selected option */}
          {selected === 'A' && optionAEx && (
            <div className="mt-2">{renderCardioExercise(optionAEx, optionAIdx)}</div>
          )}
          {selected === 'B' && optionBEx && (
            <div className="mt-2">{renderCircuitExercise(optionBEx, optionBIdx)}</div>
          )}
        </div>
      );
    }

    // Don't re-render option B standalone (it's shown inside A's block)
    return null;
  }

  // -- Single exercise block in active workout --
  function renderExerciseBlock(ex: LocalExercise, exIdx: number) {
    const { type } = ex.programExercise;

    if (type === 'rest') {
      return (
        <Card key={exIdx} className="border-zinc-800">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🛌</span>
            <div>
              <div className="font-semibold text-white text-lg">Rest Day</div>
              {ex.programExercise.notes && (
                <p className="text-sm text-zinc-400 mt-1">{ex.programExercise.notes}</p>
              )}
            </div>
          </div>
        </Card>
      );
    }

    if (type === 'optional') {
      const optionAIdx = exercises.findIndex((e) => e.programExercise.name.includes('Option A'));
      if (exIdx !== optionAIdx) return null;
      return (
        <Card key={exIdx}>
          <CardHeader>
            <CardTitle>Optional Activity</CardTitle>
          </CardHeader>
          {renderOptionalExercise(exIdx)}
        </Card>
      );
    }

    let content: React.ReactNode;
    switch (type) {
      case 'strength':
        content = (
          <>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-zinc-500">Set</span>
              <span className="flex-1 text-xs text-zinc-500">Target</span>
              <span className="w-16 text-xs text-zinc-500 text-center">Weight</span>
              <span className="w-14 text-xs text-zinc-500 text-center">Reps</span>
              <span className="w-11" />
            </div>
            {ex.sets.map((set, setIdx) => renderStrengthSet(ex, exIdx, set, setIdx))}
          </>
        );
        break;
      case 'intervals':
        content = renderIntervalsExercise(ex, exIdx);
        break;
      case 'amrap':
        content = renderAmrapExercise(ex, exIdx);
        break;
      case 'cardio':
        content = renderCardioExercise(ex, exIdx);
        break;
      case 'circuit':
        content = renderCircuitExercise(ex, exIdx);
        break;
      default:
        content = null;
    }

    const allSetsComplete = type === 'strength'
      ? ex.sets.length > 0 && ex.sets.every((s) => s.isCompleted)
      : ex.isCompleted;

    return (
      <Card key={exIdx} className={cn(allSetsComplete && 'border-emerald-800/40 bg-emerald-950/20')}>
        <CardHeader className="mb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{ex.programExercise.name}</CardTitle>
            {allSetsComplete && <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />}
          </div>
          {ex.programExercise.notes && type !== 'amrap' && type !== 'circuit' && (
            <p className="text-xs text-zinc-500 mt-1">{ex.programExercise.notes}</p>
          )}
          {ex.programExercise.milestoneMatch && oneRMCache[ex.programExercise.milestoneMatch] && (
            <p className="text-xs text-zinc-500 mt-0.5">
              1RM: <span className="text-amber-400">{oneRMCache[ex.programExercise.milestoneMatch]} lbs</span>
            </p>
          )}
          {ex.programExercise.milestoneMatch && !oneRMCache[ex.programExercise.milestoneMatch] && (
            <p className="text-xs text-zinc-600 mt-0.5">1RM: ? (not set)</p>
          )}
        </CardHeader>
        {content}
      </Card>
    );
  }

  // ---------------------------------------------------------------------------
  // Tab: TODAY
  // ---------------------------------------------------------------------------

  function renderTodayTab() {
    if (settingsLoading || workoutLoading) {
      return (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full" />
        </div>
      );
    }

    // No settings yet
    if (!settings) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Set Program Start Date</CardTitle>
          </CardHeader>
          <p className="text-zinc-400 text-sm mb-4">
            Set the date you started (or plan to start) the HYROX Hybrid Training program. The app will automatically track your current week and day.
          </p>
          <div className="space-y-4 max-w-xs">
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Program Start Date</label>
              <input
                type="date"
                value={startDateInput}
                onChange={(e) => setStartDateInput(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white min-h-[44px] focus:border-blue-500 focus:outline-none"
              />
            </div>
            <button
              onClick={saveSettings}
              disabled={savingSettings}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-3 rounded-xl font-semibold min-h-[52px] transition-colors"
            >
              {savingSettings ? 'Saving...' : 'Start Program'}
            </button>
          </div>
        </Card>
      );
    }

    if (!programInfo || !todayProgramDay) return null;

    // Shared date nav + header block
    const dateNavBlock = (
      <div className="space-y-3">
        {/* Date navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedTrainingDate((d) => shiftDate(d, -1))}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 text-center">
            <span className="text-base font-semibold text-white">
              {selectedTrainingDate === getToday()
                ? 'Today'
                : isViewingPast
                ? formatDate(selectedTrainingDate)
                : formatDate(selectedTrainingDate)}
            </span>
            {selectedTrainingDate !== getToday() && (
              <button
                onClick={() => setSelectedTrainingDate(getToday())}
                className="ml-2 text-xs text-blue-400 hover:text-blue-300 underline"
              >
                Back to today
              </button>
            )}
          </div>
          <button
            onClick={() => setSelectedTrainingDate((d) => shiftDate(d, 1))}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Week/day header + change start date */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xl font-bold text-white">
                Week {programInfo.week} · Day {programInfo.day}
              </span>
              <span className={cn('text-xs px-2 py-1 rounded-full border font-medium', phaseColor)}>
                {phaseLabel}
              </span>
            </div>
            <p className={cn('text-sm font-medium mt-0.5', todayProgramDay.color)}>
              {todayProgramDay.focus}
            </p>
          </div>
          <button
            onClick={() => { setEditingStartDate(true); setNewStartDateInput(settings!.start_date); }}
            className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-700 rounded-lg px-3 py-2 min-h-[44px] transition-colors"
          >
            Started {formatDate(settings!.start_date)}
          </button>
        </div>

        {/* Change start date inline form */}
        {editingStartDate && (
          <div className="flex items-center gap-2 bg-zinc-800/60 border border-zinc-700 rounded-xl p-3">
            <span className="text-xs text-zinc-400 shrink-0">New start date:</span>
            <input
              type="date"
              value={newStartDateInput}
              onChange={(e) => setNewStartDateInput(e.target.value)}
              className="flex-1 bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white min-h-[44px] focus:border-blue-500 focus:outline-none"
            />
            <button
              onClick={changeStartDate}
              disabled={savingSettings || !newStartDateInput}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium min-h-[44px] transition-colors"
            >
              Save
            </button>
            <button
              onClick={() => setEditingStartDate(false)}
              className="text-zinc-400 hover:text-white px-3 py-2 rounded-lg text-sm min-h-[44px] transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    );

    // Future workout — locked
    if (isViewingFuture) {
      return (
        <div className="space-y-4">
          {dateNavBlock}
          <Card className="border-zinc-800">
            <div className="flex items-center gap-4 py-4">
              <span className="text-4xl">🔒</span>
              <div>
                <div className="text-lg font-bold text-zinc-400">{todayProgramDay.name}</div>
                <p className={cn('text-sm font-medium mt-0.5', todayProgramDay.color)}>
                  {todayProgramDay.focus}
                </p>
                <p className="text-zinc-500 text-sm mt-1">
                  Available on {formatDate(selectedTrainingDate)}
                </p>
              </div>
            </div>
            <div className="space-y-1 border-t border-zinc-800 pt-3 mt-2">
              {todayProgramDay.exercises.filter(e => e.type !== 'rest').map((ex, i) => (
                <div key={i} className="flex items-center gap-2 py-1 text-sm text-zinc-500">
                  <span className="w-4 text-center text-xs">{i + 1}</span>
                  <span>{ex.name}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      );
    }

    // Rest day — no workout tracker needed
    if (todayProgramDay.exercises[0]?.type === 'rest') {
      return (
        <div className="space-y-4">
          {dateNavBlock}
          <Card className="border-zinc-800">
            <div className="flex items-center gap-4 py-4">
              <span className="text-5xl">🛌</span>
              <div>
                <div className="text-xl font-bold text-white">Rest Day</div>
                <p className="text-zinc-400 mt-1">{todayProgramDay.exercises[0]?.notes}</p>
              </div>
            </div>
          </Card>
        </div>
      );
    }

    // Already completed — show detailed read-only results
    if (alreadyCompleted && !workoutStarted) {
      const startedAt = todayWorkout?.started_at ? new Date(todayWorkout.started_at) : null;
      const completedAt = todayWorkout?.completed_at ? new Date(todayWorkout.completed_at) : null;
      const durationMin = startedAt && completedAt
        ? Math.round((completedAt.getTime() - startedAt.getTime()) / 60000)
        : null;

      return (
        <div className="space-y-4">
          {dateNavBlock}

          {/* Completed badge */}
          <Card className="border-emerald-800/50 bg-emerald-950/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-emerald-400 shrink-0" />
                <div>
                  <div className="text-base font-bold text-emerald-400">
                    Completed{isViewingPast ? ` · ${formatDate(selectedTrainingDate)}` : ''}
                  </div>
                  <div className="text-sm text-zinc-400 mt-0.5">
                    {todayProgramDay.focus}
                    {durationMin ? ` · ${durationMin} min` : ''}
                  </div>
                </div>
              </div>
              {!isViewingPast && (
                <button
                  onClick={async () => {
                    const orCache = await buildOneRMCache(todayProgramDay);
                    const restored = completedWorkoutDetail && completedWorkoutDetail.length > 0
                      ? restoreExercisesFromDB(completedWorkoutDetail, todayProgramDay, programInfo.week, orCache)
                      : buildExercises(todayProgramDay, programInfo.week, orCache);
                    setExercises(restored);
                    setWorkoutStarted(true);
                  }}
                  className="text-xs text-blue-400 hover:text-blue-300 border border-blue-800/40 rounded-lg px-3 py-2 min-h-[40px] whitespace-nowrap"
                >
                  Edit
                </button>
              )}
            </div>
          </Card>

          {/* Exercise results */}
          {completedWorkoutDetail === null ? (
            // Still fetching
            <div className="flex items-center justify-center h-16">
              <div className="animate-spin h-5 w-5 border-2 border-emerald-500 border-t-transparent rounded-full" />
            </div>
          ) : completedWorkoutDetail.length === 0 ? (
            // Workout was completed but no set data was saved (logged before persistence fix)
            <Card className="border-zinc-800">
              <p className="text-sm text-zinc-500 py-2">
                This workout was marked complete but no exercise data was recorded.
              </p>
            </Card>
          ) : (
            completedWorkoutDetail.map((dbEx) => {
              const hasSets = dbEx.sets.some(
                (s) => s.actual_reps || s.actual_weight || s.time_seconds || s.notes
              );
              return (
                <Card key={dbEx.id} className={cn(
                  'border-zinc-800',
                  dbEx.sets.some(s => s.is_completed) && 'border-emerald-900/40'
                )}>
                  <CardHeader className="mb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">{dbEx.exercise_name}</CardTitle>
                      {dbEx.sets.some(s => s.is_completed) && (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      )}
                    </div>
                  </CardHeader>
                  {hasSets ? (
                    <div>
                      {dbEx.exercise_type === 'strength' && (
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-[10px] text-zinc-600 w-6 text-center">#</span>
                          <span className="text-[10px] text-zinc-600 w-16 text-center">Weight</span>
                          <span className="text-[10px] text-zinc-600 w-14 text-center">Reps</span>
                        </div>
                      )}
                      {dbEx.sets.map((s) => (
                        <div key={s.id} className={cn(
                          'flex items-center gap-2 py-2 border-b border-zinc-800/50 last:border-0 text-sm',
                          !s.is_completed && 'opacity-40'
                        )}>
                          {dbEx.exercise_type === 'strength' && (
                            <>
                              <span className="text-zinc-500 w-6 text-center text-xs">{s.set_number}</span>
                              <span className="w-16 text-center font-medium text-white">
                                {s.actual_weight != null ? `${s.actual_weight} lbs` : '—'}
                              </span>
                              <span className="w-14 text-center text-zinc-300">
                                {s.actual_reps != null ? `${s.actual_reps}` : '—'}
                              </span>
                              {s.is_completed && <CheckCircle2 className="h-4 w-4 text-emerald-500 ml-auto" />}
                            </>
                          )}
                          {dbEx.exercise_type === 'intervals' && (
                            <>
                              <span className="text-zinc-500 text-xs">Round {s.set_number}</span>
                              <span className="text-white font-medium ml-2">
                                {s.time_seconds != null ? formatTime(s.time_seconds) : '—'}
                              </span>
                              {s.is_completed && <CheckCircle2 className="h-4 w-4 text-emerald-500 ml-auto" />}
                            </>
                          )}
                          {(dbEx.exercise_type === 'amrap' || dbEx.exercise_type === 'circuit') && (
                            <>
                              {s.actual_reps != null && (
                                <span className="text-white font-medium">
                                  {dbEx.exercise_type === 'amrap' ? `${s.actual_reps} rounds` : `${s.actual_reps}× rounds`}
                                </span>
                              )}
                              {s.time_seconds != null && (
                                <span className="text-zinc-300 ml-2">{formatTime(s.time_seconds)}</span>
                              )}
                              {s.notes && <span className="text-zinc-400 text-xs ml-2 truncate">{s.notes}</span>}
                            </>
                          )}
                          {(dbEx.exercise_type === 'cardio' || dbEx.exercise_type === 'optional') && (
                            <>
                              {s.time_seconds != null && (
                                <span className="text-white font-medium">{formatTime(s.time_seconds)}</span>
                              )}
                              {s.is_completed && <CheckCircle2 className="h-4 w-4 text-emerald-500 ml-auto" />}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-600">No data recorded</p>
                  )}
                </Card>
              );
            })
          )}
        </div>
      );
    }

    // Not started yet — preview + start button (only available for today or past dates)
    if (!workoutStarted) {
      const isPastUnlogged = isViewingPast && !alreadyCompleted;
      return (
        <div className="space-y-4">
          {dateNavBlock}

          {isPastUnlogged && (
            <div className="flex items-center gap-2 bg-amber-950/20 border border-amber-800/30 rounded-xl px-4 py-3 text-sm text-amber-400">
              <span>⚠</span>
              <span>This workout was not logged. You can still log it retroactively.</span>
            </div>
          )}

          {/* Exercise preview */}
          <Card>
            <CardHeader>
              <CardTitle>{selectedTrainingDate === getToday() ? "Today's Workout" : "Workout Preview"}</CardTitle>
            </CardHeader>
            <div className="space-y-2">
              {todayProgramDay.exercises.map((ex, i) => (
                <div key={i} className="flex items-start gap-3 py-2 border-b border-zinc-800/60 last:border-0">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-zinc-800 text-xs text-zinc-400 shrink-0 mt-0.5">
                    {i + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white">{ex.name}</div>
                    {ex.type === 'strength' && (
                      <div className="text-xs text-zinc-500 mt-0.5">
                        {((isPhase2 ? ex.phase2Sets : ex.phase1Sets) ?? ex.sets ?? []).length} sets
                        {ex.milestoneMatch && (
                          <span className="ml-2 text-amber-500/70">1RM tracked</span>
                        )}
                      </div>
                    )}
                    {ex.type === 'amrap' && (
                      <div className="text-xs text-zinc-500 mt-0.5">{ex.amrapMinutes} min AMRAP</div>
                    )}
                    {ex.type === 'intervals' && (
                      <div className="text-xs text-zinc-500 mt-0.5">
                        {ex.intervalRounds?.[0]}–{ex.intervalRounds?.[1]} × {ex.intervalDistanceMeters}m
                      </div>
                    )}
                    {(ex.type === 'cardio' || ex.type === 'optional') && getDurationStr(ex) && (
                      <div className="text-xs text-zinc-500 mt-0.5">{getDurationStr(ex)}</div>
                    )}
                    {ex.notes && <div className="text-xs text-zinc-600 mt-0.5 truncate">{ex.notes}</div>}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={startWorkout}
              className="mt-5 w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-xl font-bold text-lg min-h-[60px] transition-colors"
            >
              <Play className="h-6 w-6" />
              {isPastUnlogged ? 'Log Retroactively' : 'Start Workout'}
            </button>
          </Card>
        </div>
      );
    }

    // Active workout tracker
    return (
      <div className="space-y-4">
        {dateNavBlock}

        {/* Save indicator */}
        <div className="flex items-center justify-end h-5">
          {isSaving && (
            <span className="flex items-center gap-1.5 text-xs text-zinc-500">
              <div className="w-3 h-3 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
              Saving…
            </span>
          )}
          {!isSaving && lastSavedAt && (
            <span className="text-xs text-emerald-600">✓ Saved</span>
          )}
        </div>

        {/* Exercise blocks */}
        {exercises.map((ex, idx) => renderExerciseBlock(ex, idx))}

        {/* Complete button */}
        <button
          onClick={completeWorkout}
          disabled={completingWorkout}
          className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white py-4 rounded-xl font-bold text-lg min-h-[60px] transition-colors mt-2"
        >
          <Trophy className="h-6 w-6" />
          {completingWorkout ? 'Saving...' : 'Complete Workout'}
        </button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Tab: PROGRAM
  // ---------------------------------------------------------------------------

  function renderProgramTab() {
    if (!settings || !programInfo) {
      return (
        <Card>
          <p className="text-zinc-400 text-sm">Set a program start date in the Today tab to see your program overview.</p>
        </Card>
      );
    }

    const today = getToday();

    // Build a map of date -> workout for completed workouts
    // We need a range of 8 weeks
    const startDate = new Date(settings.start_date + 'T00:00:00');

    // Fetch completed workouts for grid (use historyWorkouts — also fetch all)
    // We'll use historyWorkouts if available, but we need to ensure it's loaded
    const completedDates = new Set(historyWorkouts.map((w) => w.date));

    // Stats
    const totalCompleted = historyWorkouts.length;
    const weeklyStats: { week: number; completed: number; total: number }[] = [];
    for (let w = 1; w <= 8; w++) {
      const workoutsInWeek = historyWorkouts.filter((hw) => hw.week_number === w);
      weeklyStats.push({ week: w, completed: workoutsInWeek.length, total: 6 }); // Day 7 is rest
    }

    // Streak
    let streak = 0;
    const d = new Date(today + 'T00:00:00');
    while (true) {
      const ds = d.toISOString().split('T')[0];
      const dayProgram = PROGRAM[(Math.floor((d.getTime() - startDate.getTime()) / 86400000) % 7)];
      if (dayProgram?.exercises[0]?.type === 'rest') {
        d.setDate(d.getDate() - 1);
        continue;
      }
      if (!completedDates.has(ds)) break;
      streak++;
      d.setDate(d.getDate() - 1);
    }

    return (
      <div className="space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="text-center">
            <div className="text-2xl font-bold text-white">{totalCompleted}</div>
            <div className="text-xs text-zinc-400 mt-1">Total Workouts</div>
          </Card>
          <Card className="text-center">
            <div className="text-2xl font-bold text-amber-400 flex items-center justify-center gap-1">
              <Flame className="h-5 w-5" />
              {streak}
            </div>
            <div className="text-xs text-zinc-400 mt-1">Day Streak</div>
          </Card>
          <Card className="text-center">
            <div className="text-2xl font-bold text-blue-400">W{programInfo.week}</div>
            <div className="text-xs text-zinc-400 mt-1">Current Week</div>
          </Card>
        </div>

        {/* 8-week grid */}
        <Card>
          <CardHeader>
            <CardTitle>8-Week Program</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left text-zinc-500 pb-2 pr-3 font-normal">Week</th>
                  {PROGRAM.map((day) => (
                    <th key={day.dayNumber} className="text-center text-zinc-500 pb-2 px-1 font-normal w-10">
                      D{day.dayNumber}
                    </th>
                  ))}
                  <th className="text-right text-zinc-500 pb-2 pl-2 font-normal whitespace-nowrap">Rate</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 8 }, (_, weekIdx) => {
                  const weekNum = weekIdx + 1;
                  const stat = weeklyStats[weekIdx];
                  return (
                    <tr key={weekNum} className={cn(weekNum === programInfo.week && 'bg-blue-950/20 rounded')}>
                      <td className={cn(
                        'py-2 pr-3 font-semibold whitespace-nowrap',
                        weekNum === programInfo.week ? 'text-blue-400' : 'text-zinc-400'
                      )}>
                        W{weekNum}
                        {weekNum <= 4 ? (
                          <span className="ml-1 text-zinc-600 font-normal">Build</span>
                        ) : (
                          <span className="ml-1 text-red-700 font-normal">Push</span>
                        )}
                      </td>
                      {PROGRAM.map((day) => {
                        const daysSinceStart = (weekIdx) * 7 + (day.dayNumber - 1);
                        const cellDate = new Date(startDate);
                        cellDate.setDate(cellDate.getDate() + daysSinceStart);
                        const cellDateStr = cellDate.toISOString().split('T')[0];
                        const isToday = cellDateStr === today;
                        const isCompleted = completedDates.has(cellDateStr);
                        const isPast = cellDateStr < today;
                        const isFuture = cellDateStr > today;
                        const isRest = day.exercises[0]?.type === 'rest';

                        return (
                          <td key={day.dayNumber} className="py-2 px-1 text-center">
                            <button
                              onClick={() => {
                                setSelectedTrainingDate(cellDateStr);
                                setActiveTab('today');
                              }}
                              className={cn(
                                'w-8 h-8 mx-auto rounded-lg flex items-center justify-center text-[11px] font-medium transition-colors cursor-pointer hover:ring-2 hover:ring-zinc-500',
                                isToday && !isCompleted && 'bg-blue-600 text-white ring-2 ring-blue-400',
                                isCompleted && 'bg-emerald-700/40 text-emerald-400',
                                isPast && !isCompleted && !isRest && 'bg-red-900/30 text-red-500',
                                isFuture && !isToday && 'bg-zinc-800/50 text-zinc-600',
                                isRest && !isCompleted && 'bg-zinc-800/30 text-zinc-600',
                              )}
                            >
                              {isCompleted ? '✓' : isRest ? '—' : day.dayNumber}
                            </button>
                          </td>
                        );
                      })}
                      <td className="py-2 pl-2 text-right text-zinc-400 whitespace-nowrap">
                        {stat.completed}/{stat.total}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Per-week completion bars */}
        <Card>
          <CardHeader>
            <CardTitle>Weekly Completion</CardTitle>
          </CardHeader>
          <div className="space-y-3">
            {weeklyStats.map((s) => {
              const pct = Math.round((s.completed / s.total) * 100);
              const barColor = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-zinc-700';
              return (
                <div key={s.week}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className={cn('text-zinc-300', s.week === programInfo.week && 'text-blue-400 font-semibold')}>
                      Week {s.week} {s.week <= 4 ? '(Build)' : '(Push)'}
                    </span>
                    <span className="text-zinc-400">{s.completed}/{s.total}</span>
                  </div>
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', barColor)}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Month Calendar */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                <Calendar className="h-4 w-4 inline mr-2 text-zinc-400" />
                {(() => {
                  const [yr, mo] = calendarMonth.split('-').map(Number);
                  return new Date(yr, mo - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
                })()}
              </CardTitle>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const [yr, mo] = calendarMonth.split('-').map(Number);
                    const d = new Date(yr, mo - 2, 1);
                    setCalendarMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
                  }}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    const d = new Date();
                    setCalendarMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
                  }}
                  className="text-xs text-zinc-400 hover:text-white px-2 py-1 rounded hover:bg-zinc-800 transition-colors"
                >
                  Today
                </button>
                <button
                  onClick={() => {
                    const [yr, mo] = calendarMonth.split('-').map(Number);
                    const d = new Date(yr, mo, 1);
                    setCalendarMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
                  }}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </CardHeader>
          {(() => {
            const [yr, mo] = calendarMonth.split('-').map(Number);
            const firstDay = new Date(yr, mo - 1, 1);
            const lastDay = new Date(yr, mo, 0);
            const daysInMonth = lastDay.getDate();
            // Week starts Monday (0=Mon…6=Sun)
            const startDow = (firstDay.getDay() + 6) % 7;

            const cells: (string | null)[] = [
              ...Array(startDow).fill(null),
              ...Array.from({ length: daysInMonth }, (_, i) => {
                const d = new Date(yr, mo - 1, i + 1);
                return d.toISOString().split('T')[0];
              }),
            ];
            // Pad to complete last row
            while (cells.length % 7 !== 0) cells.push(null);

            const dowLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

            return (
              <div>
                {/* Day-of-week headers */}
                <div className="grid grid-cols-7 mb-1">
                  {dowLabels.map((d, i) => (
                    <div key={i} className="text-center text-[10px] text-zinc-600 font-medium py-1">{d}</div>
                  ))}
                </div>
                {/* Calendar rows */}
                <div className="grid grid-cols-7 gap-y-1">
                  {cells.map((dateStr, i) => {
                    if (!dateStr) {
                      return <div key={i} />;
                    }
                    const dayNum = new Date(dateStr + 'T00:00:00').getDate();
                    const isToday = dateStr === today;
                    const isSelected = dateStr === selectedTrainingDate;
                    const isCompleted = completedDates.has(dateStr);
                    const isPast = dateStr < today;
                    const isFuture = dateStr > today;

                    // Program position for this date
                    const diff = Math.floor(
                      (new Date(dateStr + 'T00:00:00').getTime() - startDate.getTime()) / 86400000
                    );
                    const inProgram = diff >= 0 && diff < 56; // 8 weeks
                    const progWeek = inProgram ? Math.floor(diff / 7) + 1 : null;
                    const progDay = inProgram ? (diff % 7) + 1 : null;
                    const isRestDay = inProgram && PROGRAM[(diff % 7)]?.exercises[0]?.type === 'rest';

                    return (
                      <button
                        key={dateStr}
                        onClick={() => {
                          setSelectedTrainingDate(dateStr);
                          setActiveTab('today');
                        }}
                        className={cn(
                          'relative flex flex-col items-center rounded-lg py-1.5 px-0.5 transition-colors min-h-[52px] group',
                          isSelected && 'ring-2 ring-blue-400',
                          isToday && !isSelected && 'ring-1 ring-blue-600/60',
                          isCompleted && 'bg-emerald-900/20',
                          !isCompleted && isPast && inProgram && !isRestDay && 'bg-red-950/20',
                          !inProgram && 'opacity-30',
                          'hover:bg-zinc-800/60'
                        )}
                      >
                        <span className={cn(
                          'text-xs font-semibold leading-none',
                          isToday ? 'text-blue-400' : isCompleted ? 'text-emerald-400' : isPast && inProgram && !isRestDay ? 'text-red-500' : isFuture ? 'text-zinc-500' : 'text-zinc-300'
                        )}>
                          {dayNum}
                        </span>
                        {inProgram && (
                          <span className={cn(
                            'text-[9px] leading-none mt-0.5',
                            isRestDay ? 'text-zinc-600' : isCompleted ? 'text-emerald-600' : isPast ? 'text-red-800' : 'text-zinc-600'
                          )}>
                            {isRestDay ? 'rest' : `W${progWeek}D${progDay}`}
                          </span>
                        )}
                        {isCompleted && (
                          <span className="text-[10px] leading-none text-emerald-500 mt-0.5">✓</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </Card>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-emerald-700/40" /> Completed
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-blue-600" /> Today
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-red-900/30" /> Missed
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-zinc-800/50" /> Future
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Tab: HISTORY
  // ---------------------------------------------------------------------------

  function renderHistoryTab() {
    if (historyDetail) {
      const { workout, exercises: exs } = historyDetail;
      const startedAt = workout.started_at ? new Date(workout.started_at) : null;
      const completedAt = workout.completed_at ? new Date(workout.completed_at) : null;
      const durationMin = startedAt && completedAt
        ? Math.round((completedAt.getTime() - startedAt.getTime()) / 60000)
        : null;
      const programDay = PROGRAM[(workout.day_number - 1) % 7];

      return (
        <div className="space-y-4">
          <button
            onClick={() => setHistoryDetail(null)}
            className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors min-h-[44px]"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to History
          </button>

          <Card>
            <CardHeader>
              <CardTitle>
                {formatDate(workout.date)} — Week {workout.week_number}, {workout.day_name}
              </CardTitle>
            </CardHeader>
            <div className="flex flex-wrap gap-4 text-sm text-zinc-400 mb-2">
              <span className={cn(programDay?.color ?? 'text-zinc-400')}>{programDay?.focus}</span>
              {durationMin && <span>{durationMin} min</span>}
            </div>
          </Card>

          {exs.map((ex) => (
            <Card key={ex.id}>
              <CardHeader className="mb-2">
                <CardTitle className="text-base">{ex.exercise_name}</CardTitle>
              </CardHeader>
              {ex.sets.length > 0 ? (
                <div className="space-y-1">
                  {ex.sets.map((set) => (
                    <div key={set.id} className="flex items-center gap-3 text-sm py-1.5 border-b border-zinc-800/50 last:border-0">
                      <span className="text-zinc-500 w-10">Set {set.set_number}</span>
                      {set.actual_weight && (
                        <span className="text-white font-medium">{set.actual_weight} lbs</span>
                      )}
                      {set.actual_reps && (
                        <span className="text-zinc-300">× {set.actual_reps} reps</span>
                      )}
                      {set.time_seconds && (
                        <span className="text-zinc-300">{formatTime(set.time_seconds)}</span>
                      )}
                      {set.notes && (
                        <span className="text-zinc-500 text-xs ml-auto">{set.notes}</span>
                      )}
                      {set.is_completed && (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 ml-auto shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-zinc-600 text-sm">No sets logged.</p>
              )}
            </Card>
          ))}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Completed Workouts</CardTitle>
          </CardHeader>
          {historyWorkouts.length === 0 ? (
            <p className="text-zinc-500 text-sm py-4 text-center">No completed workouts yet.</p>
          ) : (
            <div className="divide-y divide-zinc-800/60">
              {historyWorkouts.map((w) => {
                const startedAt = w.started_at ? new Date(w.started_at) : null;
                const completedAt = w.completed_at ? new Date(w.completed_at) : null;
                const durationMin = startedAt && completedAt
                  ? Math.round((completedAt.getTime() - startedAt.getTime()) / 60000)
                  : null;
                const programDay = PROGRAM[(w.day_number - 1) % 7];

                return (
                  <button
                    key={w.id}
                    onClick={() => loadHistoryDetail(w)}
                    className="w-full flex items-center justify-between py-3.5 px-1 hover:bg-zinc-800/30 rounded-lg transition-colors min-h-[52px] text-left"
                  >
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-white">{formatDate(w.date)}</span>
                        <span className="text-xs text-zinc-500">W{w.week_number} D{w.day_number}</span>
                        {programDay && (
                          <span className={cn('text-xs font-medium', programDay.color)}>
                            {programDay.focus}
                          </span>
                        )}
                      </div>
                      {durationMin && (
                        <div className="text-xs text-zinc-500 mt-0.5">{durationMin} min</div>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-zinc-600 shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  const tabs: { key: TabKey; label: string; icon: typeof Dumbbell }[] = [
    { key: 'today', label: 'Today', icon: Zap },
    { key: 'program', label: 'Program', icon: Calendar },
    { key: 'history', label: 'History', icon: Trophy },
  ];

  return (
    <div className="space-y-5">
      {/* PR toasts */}
      {prToasts.length > 0 && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 space-y-2">
          {prToasts.map((msg, i) => (
            <div
              key={i}
              className="bg-amber-500 text-black px-5 py-2.5 rounded-xl font-bold text-sm shadow-xl text-center animate-bounce"
            >
              PR! {msg}
            </div>
          ))}
        </div>
      )}

      {/* Page header */}
      <h1 className="text-2xl font-bold text-white flex items-center gap-3">
        <Dumbbell className="h-7 w-7 text-blue-500" />
        Training
      </h1>

      {/* Tab bar */}
      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => {
                setActiveTab(t.key);
                if (t.key === 'history' || t.key === 'program') {
                  fetchHistory();
                }
              }}
              className={cn(
                'flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors flex-1 justify-center whitespace-nowrap min-h-[44px]',
                activeTab === t.key
                  ? 'bg-blue-600 text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'today' && renderTodayTab()}
      {activeTab === 'program' && renderProgramTab()}
      {activeTab === 'history' && renderHistoryTab()}
    </div>
  );
}
