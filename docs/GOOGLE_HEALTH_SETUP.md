# Connect Fitbit (Google Health)

Fitbit’s old website API turns off on **2 November 2026**. This dashboard reads your Fitbit through **Google Health** instead. You do this once. After that, the site pulls yesterday and today every morning and emails you a short report.

You need the Google account that your Fitbit uses, access to this site’s Vercel project, and access to the Supabase project. Plan on sitting down with both the computer and your phone.

The live site is `https://personal-dashboard-brown.vercel.app`.

## What you will end up with

- A **Connect Fitbit** button on the Fitness page.
- Steps, sleep, calories burned, weight, body fat, and resting heart rate filled in for yesterday and today.
- Workouts copied into Training, without creating a second copy if the sync runs again.
- A daily email. The automatic run is **08:30 UTC** every day (4:30 AM Atlantic standard time, 5:30 AM Atlantic daylight time).

Food, drinks, notes, stretching, and the evening-walk tick are left alone.

---

## 1. Link Fitbit to Google Health on your phone

Do this before the website step. Google cannot see Fitbit data until the phone app is linked.

1. Install **Google Health** from the App Store or Google Play.
2. Open it and tap **Sign in with Google**.
3. Choose the Google account you want this dashboard to use.
4. If it offers to move an existing Fitbit account, follow those prompts until the app shows your steps.

Wear the tracker, or turn on Mobile Track, so there is some recent data to test with.

## 2. Create a Google Cloud project

1. Open [Google Cloud Console](https://console.cloud.google.com/) while signed in as that same Google account.
2. At the top, open the project picker and choose **New project**.
3. Name it something you will recognize, such as `Personal Dashboard Health`. Create it, then make sure that project is selected.

## 3. Turn on the Google Health API

1. Open [Google Health API](https://console.cloud.google.com/apis/library/health.googleapis.com) (the project from step 2 must be selected).
2. Click **Enable**.

## 4. Set up the consent screen

This is the page Google shows when you click Connect. For one person, keep it small.

1. Open [Google Auth platform → Audience](https://console.cloud.google.com/auth/audience).
2. If Google asks you to configure the consent screen, choose **External**. External is the right choice for a normal Gmail account. Internal only works for a paid Google Workspace company.
3. App name: `Personal Dashboard`. You can use your own email for the support email.
4. Save and continue until you are back on the Audience page. Publishing status should say **Testing**.
5. Under **Test users**, click **Add users** and add the Gmail address you used in the Google Health app. Save.

### The 7-day expiry, and how to avoid it

While the app stays in **Testing**, Google’s refresh token dies after **7 days**. The morning sync then stops until you open Fitness and connect again. That is a poor fit for a daily email.

For a single personal user, do this instead:

1. Stay under 100 users (it is just you). Google’s Health setup does **not** require the paid security review until you go past 100 people.
2. On the Audience page, click **Publish app**. Confirm it. Status changes from Testing to **In production**.
3. Leave yourself on the test-user list if the page still has one. An unverified app can still be limited to those addresses.
4. The first time you connect, Google will say it has not verified the app. That warning is expected. Click **Advanced**, then **Go to Personal Dashboard (unsafe)**. It is your own app.
5. After that, the connection keeps working. Google only drops it if you revoke it, or if the dashboard does not use it for about six months. The daily sync counts as use.

If you would rather not publish, leave it in Testing and click **Connect Fitbit** again every week. The Fitness page shows a warning when the connection is about to expire.

## 5. Add the four permissions

1. Open [Google Auth platform → Data Access](https://console.cloud.google.com/auth/scopes).
2. Click **Add or remove scopes**.
3. In the filter box, search for `Google Health`.
4. Tick these four, and only these four. They are read-only. The dashboard never writes data back to Fitbit.

| What you tick | Why |
| --- | --- |
| `.../auth/googlehealth.activity_and_fitness.readonly` | Steps, calories burned, workouts |
| `.../auth/googlehealth.sleep.readonly` | Hours asleep |
| `.../auth/googlehealth.health_metrics_and_measurements.readonly` | Weight, body fat, resting heart rate |
| `.../auth/googlehealth.settings.readonly` | Your time zone, so “yesterday” is your yesterday |

The full scope text always starts with `https://www.googleapis.com/auth/googlehealth.`.

5. Click **Update**, then **Save**.

## 6. Create the Web client

1. Open [Credentials](https://console.cloud.google.com/apis/credentials).
2. **Create credentials** → **OAuth client ID**.
3. Application type: **Web application**.
4. Name: `Personal Dashboard`.
5. Under **Authorized JavaScript origins**, add:

```
https://personal-dashboard-brown.vercel.app
```

6. Under **Authorized redirect URIs**, add this exact address. No trailing slash, no extra path:

```
https://personal-dashboard-brown.vercel.app/api/google-health/callback
```

7. Create it. Copy the **Client ID** and the **Client secret** into a note. You will paste them into Vercel in a moment. You can download the JSON too, but do not commit that file to git.

## 7. Run the database migration

1. Open your Supabase project → **SQL Editor** → **New query**.
2. Paste the whole file `supabase/migration-v14-google-health.sql` from this repo.
3. Run it. It is safe to run more than once.
4. It adds a resting-heart-rate column, a place to remember imported workouts, a locked token table, and a small “last synced” row the Fitness page is allowed to read.

The token table has row security turned on and **no** access policy. The website’s public key cannot read it. Only the secret service key, used by the server, can.

## 8. Add environment variables in Vercel

Open the Vercel project → **Settings** → **Environment Variables**. Add these for Production (and Preview if you use preview URLs). Then **redeploy**. A new variable does nothing until the next deploy.

| Name | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Client ID from step 6 |
| `GOOGLE_CLIENT_SECRET` | Client secret from step 6 |
| `GOOGLE_HEALTH_REDIRECT_URI` | `https://personal-dashboard-brown.vercel.app/api/google-health/callback` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` secret |
| `CRON_SECRET` | A long random password you make up. Vercel sends it to the daily job. |
| `FITBIT_REPORT_EMAIL` | Where the daily email should go. Several addresses are fine, separated by commas. |
| `RESEND_API_KEY` | Already used by the finance report. Reuse it. |
| `FITBIT_TIMEZONE` | Optional. Example: `America/Halifax`. Used only if Google settings cannot be read. |
| `FITBIT_REPORT_FROM` | Optional. Defaults to `Pearson Dashboard <reports@frameworksinc.ca>`, the same sender as the finance report. The domain must already be verified in Resend. |

You already have `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Leave those as they are.

Do **not** put the service role key or the Google secret in any variable whose name starts with `NEXT_PUBLIC_`. Those are visible in the browser.

`GOOGLE_HEALTH_REDIRECT_URI` must be character-for-character the same as the redirect URI in Google Cloud. If you leave it blank, the server uses the production address above, which matches this site.

## 9. Connect

1. Wait until the redeploy finishes.
2. Sign in to the dashboard.
3. Open **Fitness**.
4. Click **Connect Fitbit**.
5. Read the short list, then **Continue to Google**.
6. Sign in as the test user if asked. If you see the unverified-app warning, use **Advanced** → continue.
7. Leave the health permissions ticked and continue.
8. You land back on Fitness. Click **Sync now**.

Yesterday and today should fill in. Training should show any workouts from those two days, marked Fitbit. The line under the title should say **Last synced from Fitbit** with a time. The daily email goes to `FITBIT_REPORT_EMAIL`.

The automatic job is already in `vercel.json`. On the Hobby plan it runs once a day, at 08:30 UTC (4:30 AM Halifax, Atlantic standard time), and only on the production deployment. **Sync now** is there so you do not have to wait for the morning.

## If something fails

- **“not linked”** — finish step 1 in the Google Health app, with the same Google account, then connect again.
- **“permission not granted”** on the Fitness page — connect again and leave that permission ticked. The sync still saves whatever you did allow.
- **Sync says the Google connection expired** — you are still in Testing mode, or you revoked access. Publish the app (step 4) and connect again.
- **No steps yet** — the watch has not synced. Open the Google Health app near the tracker and wait a few minutes, then Sync now.
- **Email not sent** — `RESEND_API_KEY` or `FITBIT_REPORT_EMAIL` is missing, or the From address is not a domain Resend has verified.
- **Cron returns Unauthorized** — `CRON_SECRET` in Vercel is missing or the deploy is older than the variable. Redeploy after setting it.

## What the sync does, and what it skips

It asks Google Health for **yesterday and today** only, in your time zone. Weight and body fat are the exception: each sync rewrites the last 14 days, including today, using the latest sample per day in Halifax time, from every source on the Google Health account.

| Dashboard field | Google Health data |
| --- | --- |
| Steps | Daily rollup of `steps` (`countSum`) |
| Calories burned | Daily rollup of `total-calories` (`kcalSum`). This is Fitbit’s full burn, including the calories you use at rest, which is the number Fitbit shows as calories out. |
| Sleep hours | Main sleep `minutesAsleep`, on the morning you woke up, converted to hours. Naps are left out when a main sleep exists. |
| Weight | Latest `weight` sample each day, from any source (Fitbit or a third-party scale). Grams are converted to pounds. |
| Body fat | Latest `body-fat` percentage each day, from any source. |
| Resting heart rate | `daily-resting-heart-rate` beats per minute. Not a live pulse. It can be missing until the watch has enough data. |
| Workouts | Exercise sessions. Runs, walks, CrossFit-style sessions, and anything with “HYROX” in the name are mapped to those types. Other real workouts are saved as Gym. A second sync updates the same row instead of adding another. |
| Workout tick | Turned on for a day that received a workout. It is never turned back off, so a workout you logged by hand stays ticked. |

These are not imported, on purpose:

- Visceral fat (Google Health has overall body fat, not visceral fat)
- Calories eaten, protein, fiber, drinks, notes, mobility, stretching, evening walk
- Blood oxygen, heart-rate variability, active zone minutes, ECG
- Max heart rate on a workout (the exercise summary has an average, not a max)
- Chores and similar logs (cleaning, gardening, fishing, and the like)
- Steps, sleep, heart rate, and workouts that came only from an outside app. Those stay on Google and Fitbit sources. Weight and body fat do include third-party scales.

A workout deleted in Fitbit stays in Training. Delete it there if you do not want it.

If the watch syncs late, that day’s numbers show up the next morning, because the job always rewrites yesterday.

Tokens live only in Supabase, reachable with the service role key. The browser never sees them. The access token is refreshed when a sync finds it expired or about to expire. If Google sends a new refresh token, that new one is stored.
