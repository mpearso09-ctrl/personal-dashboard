import Link from 'next/link';

const ERRORS: Record<string, string> = {
  config: 'Google is not set up on the server yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel, then redeploy. The setup guide is docs/GOOGLE_HEALTH_SETUP.md.',
  denied: 'Google access was cancelled. Nothing was saved. You can try again when you are ready.',
  missing: 'Google did not grant any health permissions. Connect again and leave Steps, Sleep, and Health measurements turned on.',
  not_linked: 'That Google account is not linked to Google Health yet. Open the Google Health app, sign in with the same Google account, finish the Fitbit move if it asks, then come back and connect again.',
  state: 'The connect attempt expired or did not match. Start again from this page.',
  token: 'Google did not return a usable connection. Start again from this page. If it keeps happening, publish the Google app (see the setup guide) and connect once more.',
  save: 'The connection was approved, but the dashboard could not store it. Run supabase/migration-v14-google-health.sql in Supabase, and set SUPABASE_SERVICE_ROLE_KEY in Vercel.',
};

export default async function ConnectFitbitPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = error ? ERRORS[error] ?? 'Something went wrong connecting Fitbit. Try again.' : null;

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-bold text-white">Connect Fitbit</h1>
      <p className="text-sm text-zinc-400">
        This reads your Fitbit data through Google Health and fills yesterday and today on the Fitness page.
        It does not change calories eaten, protein, fiber, drinks, notes, stretching, or evening walks.
      </p>

      {message && (
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-200 px-4 py-3 rounded-xl text-sm">{message}</div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3 text-sm text-zinc-300">
        <p className="text-white font-medium">Google will ask to see:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Activity and fitness — steps, calories burned, and workouts</li>
          <li>Sleep — hours asleep</li>
          <li>Health measurements — weight, body fat, and resting heart rate</li>
          <li>Settings — your time zone, so yesterday and today land on the right day</li>
        </ul>
        <p>Nothing is written back to Fitbit. You can stop this later from your Google Account permissions.</p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 text-sm text-zinc-300 space-y-2">
        <p className="text-white font-medium">Before you continue</p>
        <p>Open the Google Health app on your phone and sign in with the Google account that has your Fitbit. If the app asks you to move a Fitbit account over, finish that first.</p>
      </div>

      <a href="/api/google-health/connect" className="inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-500">
        Continue to Google
      </a>
      <div>
        <Link href="/fitness" className="text-sm text-zinc-400 hover:text-white">Back to Fitness</Link>
      </div>
    </div>
  );
}
