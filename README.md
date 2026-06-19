# Credit Management

Credit Management is a Next.js 16 + Supabase application for jewellery credit operations. It supports role-based access, customer management, bill entry, payment allocation, reporting, and spreadsheet-based bulk uploads.

## Stack

- Next.js 16 App Router
- TypeScript
- Tailwind CSS v4
- Supabase Auth + Postgres
- Recharts for reports
- SheetJS `xlsx` for bulk upload

## Environment Setup

1. Copy `.env.local.example` to `.env.local`.
2. Fill in these values from your Supabase project:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

3. Install dependencies:

```bash
npm install
```

4. Start the app:

```bash
npm run dev
```

The app runs at `http://localhost:3000`.

## Supabase Setup

Run the SQL files in your Supabase SQL Editor in this order:

1. `sql/001_init.sql`
2. `sql/002_auth_setup.sql`
3. `sql/003_payment_allocation_engine.sql`

What they do:

- `001_init.sql` creates the business tables, indexes, due-date trigger, and RLS policies.
- `002_auth_setup.sql` syncs Supabase Auth users into `public.users`.
- `003_payment_allocation_engine.sql` installs the payment allocation RPC used by manual and bulk payment entry.

## Create The First Admin User

New users are created as `viewer` by default.

To create the first admin:

1. Start the app locally.
2. Sign up through `/signup` with the email address you want to use as the administrator.
3. Open the Supabase SQL Editor.
4. Run this statement, replacing the email:

```sql
update public.users
set role = 'admin'
where email = 'admin@example.com';
```

5. Sign out and sign back in.

After that, the admin can promote other users from the `Manage Users` page.

## Running The App

Development:

```bash
npm run dev
```

Lint:

```bash
npm run lint
```

Production build:

```bash
npm run build
```

## Deployment To Vercel

This app only needs the public Supabase URL and anon key at runtime. Do not add the Supabase service role key to Vercel for this app.

### Before You Deploy

1. Make sure the production Supabase project already has the SQL from `sql/001_init.sql`, `sql/002_auth_setup.sql`, and `sql/003_payment_allocation_engine.sql` applied.
2. Decide which Supabase project is your production data store.
3. Copy these values from that production Supabase project:
	- `Project URL`
	- `anon public key`

### Step-By-Step Vercel Deployment

1. Push this repository to GitHub, GitLab, or Bitbucket.
2. Go to Vercel and click `Add New...` -> `Project`.
3. Import the repository.
4. Keep the framework preset as `Next.js`.
5. In Vercel project settings, add these environment variables for `Production` and `Preview`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-production-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-production-anon-key
```

6. Click `Deploy`.
7. After the first deployment finishes, open the production URL Vercel gives you.

### Supabase Auth Configuration For Vercel

After Vercel gives you a real URL, open Supabase for the same production project and update Auth settings:

1. Go to `Authentication` -> `URL Configuration`.
2. Set `Site URL` to your primary Vercel production URL, for example:

```text
https://your-app.vercel.app
```

3. Add redirect URLs for:

```text
http://localhost:3000
https://your-app.vercel.app
https://your-app-git-main-your-team.vercel.app
```

If you later attach a custom domain, add that too and make it the `Site URL`.

### Connect Vercel To This Supabase Project's Production Credentials

If you already have a Supabase production project:

1. Open that project in Supabase.
2. Copy its `Project URL` and `anon public key`.
3. In Vercel, open the project settings.
4. Go to `Environment Variables`.
5. Replace the existing values with the production project values.
6. Redeploy the application.

That is the only application-level connection required. All server-side authorization still relies on Supabase Auth and the RLS policies installed in the SQL migrations.

### First Production Admin

After deploying:

1. Open the production app.
2. Sign up with the intended admin email.
3. In the production Supabase SQL Editor, run:

```sql
update public.users
set role = 'admin'
where email = 'admin@example.com';
```

4. Sign out and back in on the production site.

## Notes

- Reports are read-only for all authenticated users.
- Customer, bill, payment, bulk upload, and user-management mutations re-check authorization server-side.
- CSV export routes are authenticated server-side and do not rely only on the UI.
