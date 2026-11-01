export const BUSINESSES = [
  { id: 'frameworks', label: 'Frameworks', inbox: 'info@frameworksinc.ca' },
  { id: 'mmp', label: 'MMP', inbox: 'mmpenvironmental@gmail.com' },
  { id: 'f4e', label: 'Frameworks for Everyone', inbox: 'frameworksforeveryone@gmail.com' },
  { id: 'personal', label: 'Personal', inbox: 'mpearso09@gmail.com' },
] as const;

export type BusinessId = (typeof BUSINESSES)[number]['id'];

export type ActionItem = {
  id: string;
  business: BusinessId;
  source_inbox: string;
  title: string;
  summary: string | null;
  created_at: string;
};

export function businessById(id: string) {
  return BUSINESSES.find((business) => business.id === id) ?? null;
}

export function actionAge(createdAt: string, now = Date.now()): string {
  const then = new Date(createdAt).getTime();
  if (!Number.isFinite(then)) return '';
  const elapsed = Math.max(0, now - then);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (elapsed < 45_000) return 'just now';
  if (elapsed < hour) {
    const minutes = Math.max(1, Math.round(elapsed / minute));
    return `${minutes} min`;
  }
  if (elapsed < day) {
    const hours = Math.max(1, Math.round(elapsed / hour));
    return `${hours} hr`;
  }
  const days = Math.max(1, Math.round(elapsed / day));
  return days === 1 ? '1 day' : `${days} days`;
}

export type ActionGroup = {
  id: BusinessId;
  label: string;
  inbox: string;
  items: ActionItem[];
};

/** Open items in business order. Empty businesses stay, so the phone layout does not jump. */
export function groupActionItems(items: ActionItem[]): ActionGroup[] {
  return BUSINESSES.map((business) => ({
    id: business.id,
    label: business.label,
    inbox: business.inbox,
    items: items
      .filter((item) => item.business === business.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at)),
  }));
}
