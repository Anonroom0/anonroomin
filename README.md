# anonroom.in

A Telegram-style multi-group chat app with direct messages, media sharing,
and per-group subdomains (`groupname.anonroom.in`). Built with Vite,
React, and Supabase (Postgres + Auth + Realtime + Storage). Any user can
read and (once signed up) post in public groups; a single admin account
approves new-group requests and creates groups from an inbox of direct
messages sent to it. The UI follows a liquid glassmorphism style — white
and gray glass surfaces, near-black text, and a single blue accent.

## Local setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment variables**

   Copy `.env.example` to `.env.local` and fill in your Supabase project's
   URL and anon key (Project Settings → API in the Supabase dashboard):

   ```bash
   cp .env.example .env.local
   ```

3. **Run the database schema**

   Open the Supabase SQL editor and run `supabase/schema.sql` to create
   the `profiles`, `groups`, `group_messages`, `dm_threads`, and
   `dm_messages` tables, their RLS policies, and the rate-limit triggers.

4. **Set up the OTP email template**

   In the Supabase dashboard, go to Authentication → Email Templates →
   Confirm signup, and paste in the contents of
   `supabase/otp-email-template.html`.

5. **Create the storage bucket**

   In Storage, create a new public bucket named `media`. Uploads use the
   path convention `{user_id}/{timestamp}-{filename}`.

6. **Flag the admin account**

   Have the admin (vansh) sign up once through the normal OTP flow using
   `akvnshkur1@gmail.com`. Then, in the SQL editor, run:

   ```sql
   update profiles set is_admin = true where email = 'akvnshkur1@gmail.com';
   ```

7. **Start the dev server**

   ```bash
   npm run dev
   ```

### Testing group pages locally

Subdomain routing (`groupname.anonroom.in`) needs real subdomains to
resolve normally, which isn't available on `localhost`. For local
development, `src/lib/subdomain.js` also accepts a `?group=slug` query
param as a fallback — e.g. `http://localhost:5173/?group=general` will
render `GroupChat.jsx` for the `general` group just as
`general.anonroom.in` would in production.

## Deployment note

Production routing depends on a wildcard DNS record, `*.anonroom.in`,
pointed at your hosting provider, so that every subdomain resolves to
the same deployed SPA build and serves the same `index.html`. The app
then decides what to render client-side based on `window.location.hostname`
(see `src/lib/subdomain.js`). Confirm your host (Vercel, Netlify,
Cloudflare Pages, etc.) supports wildcard custom domains before deploying.

## Project structure

- `index.html` — Vite HTML entry point
- `vite.config.js` — Vite configuration
- `package.json` — dependencies and scripts
- `.env.example` — required environment variables
- `README.md` — this file
- `supabase/schema.sql` — full database schema, RLS policies, and rate-limit triggers
- `supabase/otp-email-template.html` — signup OTP email template
- `src/main.jsx` — mounts the app and providers
- `src/App.jsx` — router and subdomain-based Home/GroupChat switch
- `src/lib/supabaseClient.js` — Supabase client instance
- `src/lib/subdomain.js` — hostname-to-group-slug resolution
- `src/lib/authContext.jsx` — auth/session state and `useAuth()` hook
- `src/lib/rateLimit.js` — client-side message cooldown helper
- `src/styles/tokens.css` — shared glassmorphism design tokens
- `src/pages/AuthModal.jsx` — sign in / sign up / OTP verification
- `src/pages/Home.jsx` — tab shell: Chats, Groups, Search, Profile
- `src/pages/GroupChat.jsx` — chat UI for a single group
- `src/pages/DirectMessages.jsx` — DM inbox and thread view
- `src/pages/ProfileCard.jsx` — user profile overlay
- `src/pages/SearchUsers.jsx` — username search
- `src/pages/AdminInbox.jsx` — admin-only group-request inbox and group creation
- `src/pages/MediaViewer.jsx` — full-screen media viewer
