const APPLE_MIME_TYPES = [
  'audio/mp4',
  'audio/aac',
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
] as const;

const CHROME_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
  'audio/aac',
] as const;

/** iPhone browsers (including Chrome) use WebKit and record audio/mp4. */
export function prefersAppleRecorder(userAgent: string): boolean {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true;
  return /Safari/i.test(userAgent) && !/Chrome|CriOS|Edg|OPR|Firefox|FxiOS/i.test(userAgent);
}

export function preferredRecorderMime(input: {
  userAgent: string;
  isSupported: (type: string) => boolean;
}): string {
  const order = prefersAppleRecorder(input.userAgent) ? APPLE_MIME_TYPES : CHROME_MIME_TYPES;
  return order.find((type) => input.isSupported(type)) ?? '';
}

/**
 * WebM and Ogg stay valid when timesliced. iPhone Safari's audio/mp4
 * recording has to be one file, or the upload is empty or unreadable.
 */
export function recorderTimesliceMs(mime: string): number | undefined {
  if (/webm|ogg/i.test(mime)) return 1000;
  return undefined;
}

export function audioFileName(mime: string): string {
  const type = mime.toLowerCase();
  if (type.includes('webm')) return 'meal.webm';
  if (type.includes('ogg')) return 'meal.ogg';
  if (type.includes('wav')) return 'meal.wav';
  if (type.includes('mpeg') || type.includes('mp3')) return 'meal.mp3';
  return 'meal.m4a';
}
