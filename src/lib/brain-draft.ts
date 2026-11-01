import { generateText } from 'ai';
import { businessById } from './action-items.ts';

/** Same Gateway default the food log uses. Override with AI_GATEWAY_MODEL. */
export const DEFAULT_GATEWAY_MODEL = 'google/gemini-3.5-flash-lite';

export type DraftSource = {
  title: string;
  summary: string | null;
  business: string;
  sourceInbox: string | null;
};

export function gatewayModel(): string {
  const configured = process.env.AI_GATEWAY_MODEL?.trim();
  if (configured && configured.includes('/')) return configured;
  return DEFAULT_GATEWAY_MODEL;
}

/**
 * Suggested reply only. The route that calls this has no mail client and no
 * send tool. The text is shown in a copy box on the Brain page.
 */
export function replyDraftMessages(item: DraftSource): { system: string; prompt: string } {
  const business = businessById(item.business)?.label ?? item.business;
  const title = item.title.trim().slice(0, 300);
  const summary = (item.summary ?? '').trim().slice(0, 4000);
  const inbox = (item.sourceInbox ?? '').trim().slice(0, 200);
  return {
    system: [
      'You write a short email reply for Mike to copy into Gmail himself.',
      'Use only the subject and summary. Do not invent facts, dates, prices, or promises.',
      'If the summary is thin, write a brief acknowledgement and ask for the one missing detail.',
      'Plain text. No markdown. No subject line.',
      'You cannot send email. Do not say the message was sent. Do not include a link.',
    ].join(' '),
    prompt: `Business: ${business}\nInbox: ${inbox}\nSubject: ${title}\nSummary:\n${summary || '(none)'}`,
  };
}

export async function draftReply(item: DraftSource): Promise<string> {
  const messages = replyDraftMessages(item);
  const result = await generateText({
    model: gatewayModel() as typeof DEFAULT_GATEWAY_MODEL,
    system: messages.system,
    prompt: messages.prompt,
  });
  const text = result.text.trim();
  if (!text) throw new Error('The draft came back empty.');
  return text.slice(0, 6000);
}

export function draftErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : '';
  if (/credit card|billing|insufficient|quota/i.test(message)) {
    return 'The reply model is unavailable right now. Try again in a little while.';
  }
  if (/AI_GATEWAY_API_KEY|OIDC|authentication|unauthorized|api key/i.test(message)) {
    return 'Replies need the Vercel AI Gateway. On Vercel that is automatic. Locally, set AI_GATEWAY_API_KEY.';
  }
  return 'Could not draft a reply. Try again in a moment.';
}
