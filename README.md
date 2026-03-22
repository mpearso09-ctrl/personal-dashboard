# Personal Dashboard

Full-stack fitness and finance tracking dashboard built with Next.js, Supabase, Tailwind CSS, and Recharts.

## Features

### Fitness Tracker ("Iron69")
- Daily entry form: calories, macros, steps, sleep, workout tracking
- Weekly weigh-ins and body fat tracking
- Challenge phase tracking (e.g., 69-day challenge)
- Trend charts for weight, body fat, calorie deficit
- Scorecard showing target hit rates
- Color-coded metrics vs goals

### Finance Tracker
- **Weekly Budget**: Track spending across 5 categories vs $14,000/mo budget
- **Daily Cash Flow**: Track personal + business accounts
- **Reimbursements**: Track business expenses paid personally
- **Net Worth**: Monthly asset/liability snapshots with trend chart
- **Investment Portfolio**: Track holdings across 4 tiers with allocation charts

### Auth & Security
- Email/password authentication via Supabase
- Row Level Security — each user only sees their own data
- Separate fitness tracking per user

## Setup

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your **Project URL** and **anon public key** from Settings > API

### 2. Run the Database Migration

1. Open the SQL Editor in your Supabase dashboard
2. Paste the contents of `supabase/migration.sql` and run it
3. This creates all tables with Row Level Security enabled

### 3. Create User Accounts

In your Supabase dashboard, go to **Authentication > Users** and create two accounts:
- Your account (email + password)
- Your partner's account (email + password)

### 4. Set Environment Variables

Copy the example env file and fill in your values:

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 5. Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in.

### 6. Deploy to Vercel

1. Push this repo to GitHub
2. Import the repo in [Vercel](https://vercel.com)
3. Add the two environment variables in Vercel's project settings:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy

## Tech Stack

- **Next.js 14+** (App Router, TypeScript)
- **Supabase** (PostgreSQL database + Auth)
- **@supabase/ssr** (cookie-based auth)
- **Tailwind CSS** (styling)
- **Recharts** (charts & visualizations)
- **Lucide React** (icons)

## Project Structure

```
src/
├── app/
│   ├── (app)/              # Authenticated app routes
│   │   ├── dashboard/      # Overview page
│   │   ├── fitness/        # Fitness tracking
│   │   ├── finances/       # Finance tracking
│   │   └── settings/       # Goals & preferences
│   ├── login/              # Login page
│   └── api/auth/callback/  # Supabase auth callback
├── components/
│   ├── ui/                 # Reusable UI components
│   ├── auth-provider.tsx   # Auth context
│   ├── sidebar.tsx         # Navigation
│   └── theme-provider.tsx  # Dark/light mode
├── lib/
│   ├── supabase-browser.ts # Browser Supabase client
│   ├── supabase-server.ts  # Server Supabase client
│   ├── types.ts            # TypeScript interfaces
│   └── utils.ts            # Helper functions
└── middleware.ts            # Auth middleware
```
