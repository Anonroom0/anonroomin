# Anonroom

Anonroom is an anonymous social app: group chats, a public confessions feed, anonymous Q&A threads, and 1:1 DMs — all without requiring a visible identity. React 18 + Vite on the frontend, Supabase (Postgres, Auth, Edge Functions, Storage) on the backend.

> **UI note:** the app is mid-way through a visual redesign (dark + light liquid-glass, Apple-inspired). See [`UI_UPGRADE_PROGRESS.md`](./UI_UPGRADE_PROGRESS.md) for what's done and what's next. No feature or logic described below is affected by that redesign.

## Core features

- **Groups & group chat** — real-time group chat rooms, joinable via `/g/<slug>`, with reactions, media attachments, swipeable message actions, and admin-configurable "channel mode" (broadcast-only) groups.
- **Confessions feed** — a public, anonymous story-style feed (`/confessions`) with its own visual "story shapes" and sharing.
- **Anonymous Q&A** — ask/answer threads (`/q/<id>`) reachable without logging in.
- **Direct messages** — 1:1 DMs with read receipts, typing/online presence, media, and swipe actions.
- **Stories** — ephemeral story posts with a dedicated viewer, tutorial overlay, and shareable story-image generation (used for confessions and questions too).
- **Profiles & search** — editable profiles, avatar handling, and user search.
- **Push notifications** — web push via a service worker (`public/sw.js`) and a Supabase Edge Function (`send-push`).
- **Admin panel** — a fully standalone page (`administrator.anonroom.in` / `/admin`) for managing groups, users, and moderation, sharing the same login session as the main site via a cross-subdomain cookie.
- **Anonymous visitor tracking** — a lightweight cookie/localStorage visitor ID so unauthenticated visitors (confessions/Q&A readers) still get a consistent identity for rate-limiting and metadata, without forcing a login.
- **Optional location capture** — a small dismissible banner (never a blocking gate) that can attach approximate location to visitor metadata if the visitor opts in.
- **Group subdomains** — a real group subdomain (`groupname.anonroom.in`) redirects to the canonical `anonroom.in/g/<slug>` path rather than serving its own content.

## Tech stack

- **Frontend:** React 18, React Router, Vite
- **Backend:** Supabase (Postgres + RLS, Auth, Storage, Edge Functions)
- **Edge Functions:** `admin-notify`, `admin-get-user-email`, `capture-profile-metadata`, `instagram-scrape`, `send-push`
- **Hosting:** Vercel (`vercel.json` handles the multi-subdomain routing/rewrites)

## Project structure

```
src/
  pages/        top-level screens (Home, GroupChat, DirectMessages, ConfessionsFeed, ...)
  components/
    shared/      reusable primitives (GlassPanel, LiquidAvatar, SendButton, GlassToggle, ...)
    stories/     story viewer/bar
    questions/   Q&A cards, creation modals, share sheet
    notifications/
  lib/           Supabase client, auth context, routing helpers, haptics/sound, theming
  styles/        tokens.css (design tokens) + animations.css (all motion)
supabase/
  migrations/    SQL schema/RLS migrations
  functions/     Edge Functions
```

## Local setup

1. `npm install`
2. Copy your Supabase project URL/anon key into a `.env` file as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. `npm run dev` — runs the main app. The admin panel is a separate Vite entry (`admin.html`); build it with `npm run build` and open `/admin.html`, or via the `administrator.` subdomain rewrite in production.

## Design system

`src/styles/tokens.css` and `src/styles/animations.css` are the single source of truth for color, glass material, corner radii, and motion — components consume them via CSS variables and shared classNames rather than hardcoding values. See `UI_UPGRADE_PROGRESS.md` for the current token spec.
