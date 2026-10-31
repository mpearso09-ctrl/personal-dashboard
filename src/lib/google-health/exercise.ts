import type { SessionType } from '@/lib/types';

/** Activities that are not workouts. They are not imported and do not tick the workout flag. */
const SKIP = new Set([
  'CLEANING',
  'GARDENING',
  'HOUSEHOLD_CHORES',
  'FISHING',
  'HUNTING',
  'CARPENTRY',
  'PAINTING',
  'MOWING_LAWN',
  'WEEDING',
  'HOEING',
  'SHOVELING',
  'BILLIARDS',
  'MUSICAL_PERFORMANCE',
  'MEDITATE',
]);

const RUN = new Set([
  'RUNNING',
  'TRAIL_RUN',
  'TREADMILL',
  'INCLINE_RUN',
  'TRACK_AND_FIELD',
]);

const WALK = new Set([
  'WALKING',
  'POWER_WALKING',
  'NORDIC_WALKING',
  'TREADMILL_WALK',
  'INCLINE_WALK',
  'STROLLER_WALK',
  'HIKING',
  'RUCKING',
  'BACKPACKING',
]);

const CROSSFIT = new Set([
  'CROSSFIT',
  'HIIT',
  'BOOTCAMP',
  'CIRCUIT_TRAINING',
  'CROSS_TRAINING',
  'TABATA_WORKOUT',
  'INTERVAL_WORKOUT',
  'BOXING',
  'KICKBOXING',
  'MARTIAL_ARTS',
  'MUAY_THAI',
]);

export type MappedSession = {
  type: SessionType;
  subtype: string | null;
};

/**
 * Map a Google Health exercise type onto the dashboard's session types.
 * Returns null when the activity should be ignored.
 * Anything that is a real workout but not a run, walk, CrossFit-style session,
 * or HYROX lands in gym so it still shows up in Training.
 */
export function mapExercise(exerciseType: string | undefined, displayName: string | undefined): MappedSession | null {
  const type = (exerciseType ?? '').toUpperCase();
  const name = `${type} ${displayName ?? ''}`.toUpperCase();
  if (name.includes('HYROX')) return { type: 'hyrox', subtype: null };
  if (!type || SKIP.has(type)) return null;
  if (RUN.has(type)) return { type: 'run', subtype: 'distance' };
  if (WALK.has(type)) return { type: 'walk', subtype: null };
  if (CROSSFIT.has(type)) return { type: 'crossfit', subtype: 'class' };
  return { type: 'gym', subtype: null };
}

export function exerciseLabel(exerciseType: string | undefined, displayName: string | undefined): string {
  const name = displayName?.trim();
  if (name) return name;
  if (!exerciseType) return 'Workout';
  return exerciseType
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
