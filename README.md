================================================================================
ANONROOM v2 — AI BUILD PROMPT PACK
================================================================================
Based on: anonroomin-main.zip (React 18 + Vite SPA, Supabase backend) and your
task notes (refactor, remove forced location gate, notifications, anonymous
Q&A, reactions, confession photos, glassmorphism UI overhaul).

HOW TO USE THIS FILE
--------------------
This pack rebuilds the app one file at a time across 45 prompts, run in order.
For EVERY prompt below:
  1. Open a brand-new AI chat session (no prior context).
  2. Paste PART B (MASTER CONTEXT PROMPT) first.
  3. Paste that prompt's text.
  4. Attach the files listed at the end of the prompt under "ATTACH:".
     - "current" means the ORIGINAL file from anonroomin-main.zip.
     - "edited version" means the OUTPUT of an earlier prompt in this pack —
       attach whatever that earlier session gave you back.
  5. Ask for the complete final file content only, save it at the path in
     the prompt's title.
The prompts are already ordered so every "ATTACH" dependency was created by
an earlier prompt number. Nothing needs to be run out of order.

================================================================================
PART A — TARGET FILE TREE
================================================================================
anonroomin-main/
├── .gitignore                                              (unchanged)
├── README.md                                                (unchanged)
├── index.html                                                (unchanged)
├── package.json                                              (unchanged — no new npm deps needed)
├── package-lock.json                                         (unchanged)
├── vercel.json                                               (unchanged)
├── vite.config.js                                            (unchanged)
├── public/
│   └── sw.js                                                 [EDIT]   #4
├── supabase/
│   ├── migrations/
│   │   └── 0001_anonroom_v2.sql                              [CREATE] #1
│   ├── functions/
│   │   ├── capture-profile-metadata/index.ts                 (unchanged)
│   │   ├── instagram-scrape/index.ts                          (unchanged)
│   │   ├── send-push/index.ts                                 [CREATE] #2
│   │   └── admin-notify/index.ts                              [CREATE] #3
│   └── otp-email-template.html                                (unchanged)
└── src/
    ├── main.jsx                                               [EDIT]   #45
    ├── App.jsx                                                [EDIT]   #44
    ├── styles/
    │   ├── tokens.css                                         [EDIT]   #5
    │   └── animations.css                                     [CREATE] #6
    ├── lib/
    │   ├── supabaseClient.js                                   (unchanged)
    │   ├── authContext.jsx                                    [EDIT]   #10
    │   ├── subdomain.js                                       [EDIT]   #9
    │   ├── rateLimit.js                                        (unchanged)
    │   ├── toast.js                                             (unchanged)
    │   ├── soundManager.js                                    [CREATE] #7
    │   ├── visitorId.js                                       [CREATE] #8
    │   ├── pushNotifications.js                               [CREATE] #11
    │   ├── reactions.js                                       [CREATE] #12
    │   └── storyImageGenerator.js                             [CREATE] #13
    ├── components/
    │   ├── ToastContainer.jsx                                 [EDIT]   #14
    │   ├── shared/
    │   │   ├── GlassPanel.jsx                                 [CREATE] #15
    │   │   ├── LiquidAvatar.jsx                               [CREATE] #16
    │   │   ├── GlassToggle.jsx                                [CREATE] #17
    │   │   ├── MessageSkeleton.jsx                            [CREATE] #18
    │   │   ├── MediaBubble.jsx                                [CREATE] #19
    │   │   ├── InstagramCard.jsx                              [CREATE] #20
    │   │   ├── AttachmentSheet.jsx                            [CREATE] #21
    │   │   ├── SwipeableMessage.jsx                           [CREATE] #22
    │   │   ├── SendButton.jsx                                 [CREATE] #23
    │   │   ├── ReactionBar.jsx                                [CREATE] #24
    │   │   └── ConfessionBubble.jsx                           [CREATE] #25
    │   ├── notifications/
    │   │   └── NotificationSettingsPanel.jsx                  [CREATE] #26
    │   ├── stories/
    │   │   ├── StoriesBar.jsx                                 [CREATE] #27
    │   │   └── StoryViewer.jsx                                [CREATE] #28
    │   └── questions/
    │       ├── ShareStorySheet.jsx                            [CREATE] #29
    │       ├── CreateQuestionModal.jsx                        [CREATE] #30
    │       └── QuestionCard.jsx                               [CREATE] #31
    └── pages/
        ├── QuestionThread.jsx                                 [CREATE] #32
        ├── ConfessionsFeed.jsx                                [CREATE] #33
        ├── Home.jsx                                           [EDIT]   #34
        ├── GroupChat.jsx                                      [EDIT]   #35
        ├── DirectMessages.jsx                                 [EDIT]   #36
        ├── AuthModal.jsx                                      [EDIT]   #37
        ├── EditProfile.jsx                                    [EDIT]   #38
        ├── EmojiGifPicker.jsx                                 [EDIT]   #39
        ├── GroupCard.jsx                                      [EDIT]   #40
        ├── MediaViewer.jsx                                    [EDIT]   #41
        ├── ProfileCard.jsx                                    [EDIT]   #42
        └── SearchUsers.jsx                                    [EDIT]   #43

Run order = prompt number order (1 → 45). It is NOT alphabetical or
folder-by-folder — it's dependency order (schema → backend → styles → libs →
shared components → feature components → pages → app shell).

================================================================================
PART B — MASTER CONTEXT PROMPT (paste before EVERY prompt below, every time)
================================================================================
You are working on ANONROOM, a live web app at anonroom.in — React 18 + Vite
SPA, plain JS/JSX (no TypeScript on the frontend), no Tailwind, no UI kit, no
CSS-in-JS. Groups live on their own subdomain (slug.anonroom.in); DMs and the
new anonymous-question pages live on the root domain at path routes. Routing
is 100% custom — react-router-dom is an installed-but-unused dependency; real
routing happens via src/lib/subdomain.js (parses hostname + pathname) plus
local React state in src/pages/Home.jsx and src/App.jsx. Do not introduce
react-router usage or any other new npm dependency unless a prompt explicitly
says to.

Backend is Supabase: Postgres with RLS, Supabase Auth, Supabase Storage
(bucket 'media'), Supabase Realtime (postgres_changes channels), and Deno
Edge Functions in supabase/functions/.

STYLING: two files own the entire visual system — src/styles/tokens.css
(CSS variables for color/glass-material/radii) and src/styles/animations.css
(every @keyframes + reusable animation utility class in the app). Components
style themselves with plain inline style objects referencing var(--token),
plus classNames into these two files for animation/utility classes. Never add
a CSS module, styled-components, or Tailwind.

DESIGN TOKENS (defined by tokens.css — reuse them, never hardcode hex):
  --ink #0C0D10 (base bg) · --ink-2 #15161B (elevated surface)
  --paper #F4F3F0 (primary text) · --dim #8B8B96 (secondary text)
  --ember #FF6B35 (the ONE primary-action color per screen — send / active
    tab / create CTA fill only) · --signal #2FD8C4 (live/online/delivered
    states only) · --glass-white rgba(255,255,255,0.07) (panel fill)
  --glass-border rgba(255,255,255,0.10)
Blur: backdrop-filter: blur(20px) saturate(115%). Shadow (fixed, no idle
change): 0 6px 18px rgba(0,0,0,0.35). Radius: 20px cards/rows, 28px
sheets/modals, 50% avatars/FAB. Ember and Signal never gradient together —
flat, separate fills only. The full motion spec (press states, spring
curves, digit-roll counters, bubble entrances, typing dots, FAB radial menu,
pull-to-refresh droplet, toggle droplet-slide) lives in animations.css —
call its classes, don't re-derive the physics or invent new keyframes for
things it already covers.

SOUND: src/lib/soundManager.js synthesizes short, dry, mechanical UI sounds
with the Web Audio API (no mp3 assets — every sound is code). Call its
exported play*() functions at the interaction points a prompt names — never
inline new AudioContext code elsewhere.

DATA MODEL: profiles, groups, rooms, group_messages, group_read_receipts,
dm_threads, dm_messages, dm_read_receipts, media, visitor_metadata,
push_subscriptions, confessions, questions, question_replies, reactions,
notification_settings. Treat supabase/migrations/0001_anonroom_v2.sql as
ground truth for exact columns whenever it's attached to a prompt.

CONVENTIONS: functional components + hooks only; a JSDoc-style banner
comment (/** ===... */) at the top of every file explaining its role, in the
same tone as the project's existing files; default export for the file's
main component, named exports for any small subcomponents that legitimately
live in the same file; the existing src/lib/authContext.jsx is the only
global-state mechanism — no new context/store libraries; keep every existing
exported function/prop/table/column name unless a prompt explicitly renames
it (sibling files import it by that exact name).

This file is one of 45 in a full rebuild — you do not have the other 44
files' code unless they're attached below. Where this prompt references a
helper, component, hook, or table from another file in the tree, trust that
it exists exactly as named and import/query it accordingly — do not stub it
out, rename it, or invent a different shape for it. Output the COMPLETE,
final, production-ready content of the ONE file this prompt asks for — no
diffs, no snippets, no "// ...rest unchanged", no TODOs, and remove nothing
that isn't explicitly called out as removed. Where the spec leaves a real
judgment call open, make a reasonable choice and leave a one-line code
comment explaining it.

================================================================================
PART C — PER-FILE PROMPTS (45 total — run in this exact order)
================================================================================

──────────────────────────────────────────────────────────────────────────────
PROMPT 1 / 45 — CREATE supabase/migrations/0001_anonroom_v2.sql
──────────────────────────────────────────────────────────────────────────────
Write one idempotent Postgres migration (CREATE TABLE IF NOT EXISTS, CREATE OR
REPLACE FUNCTION, DROP TRIGGER IF EXISTS + CREATE TRIGGER, DROP POLICY IF
EXISTS + CREATE POLICY) that adds:

• confessions — id uuid pk default gen_random_uuid(); author_id uuid null
  references profiles(id); is_anon boolean default true; text text;
  photo_url text null; group_id uuid null references groups(id);
  source_message_id uuid null references group_messages(id) (set only when a
  group confession auto-syncs here); visibility text check in
  ('public','group'); created_at timestamptz default now(). Index on
  (group_id, created_at desc) and a partial index on created_at desc where
  group_id is null (the public feed).

• questions — id uuid pk default gen_random_uuid(); author_id uuid not null
  references profiles(id); question_type text check in
  ('personal','general'); text text not null; created_at timestamptz default
  now(). Index on (author_id, created_at desc).

• question_replies — id uuid pk default gen_random_uuid(); question_id uuid
  not null references questions(id) on delete cascade; replier_id uuid null
  references profiles(id); visitor_id text null (cookie-based anon identity
  for unauthenticated repliers — never surfaced in the UI, used only for
  abuse mitigation); reply_text text not null; is_anon boolean default true;
  created_at timestamptz default now(). Index on (question_id, created_at).

• reactions — id uuid pk default gen_random_uuid(); target_type text check in
  ('group_message','dm_message','confession'); target_id uuid not null;
  user_id uuid not null references profiles(id); emoji text not null;
  created_at timestamptz default now(); UNIQUE (target_type, target_id,
  user_id) — a user changes their reaction by UPDATEing this row, not
  inserting a second one; deleting the row removes their reaction. Index on
  (target_type, target_id).

• notification_settings — user_id uuid primary key references profiles(id);
  dm_enabled boolean default true; groups_enabled boolean default true;
  mentions_enabled boolean default true; confessions_enabled boolean default
  true; promotional_enabled boolean default false; updated_at timestamptz
  default now().

• Trigger function sync_group_confession_to_confessions(): AFTER INSERT ON
  group_messages FOR EACH ROW WHEN (NEW.is_confession = true) — inserts a
  mirrored row into confessions (group_id, source_message_id = NEW.id,
  author_id = case when NEW.is_anon then null else NEW.sender_id end,
  is_anon = NEW.is_anon, text = NEW.text, photo_url = NEW.media_url,
  visibility = 'group').

• Trigger function notify_on_relevant_insert(): AFTER INSERT ON
  group_messages, dm_messages, confessions FOR EACH ROW — calls the pg_net
  extension's net.http_post() to the project's deployed 'send-push' edge
  function URL, passing {target_type, target_id: NEW.id, actor_id}. Read the
  function URL and a service-role bearer token from Postgres settings (e.g.
  current_setting('app.settings.edge_function_url', true) and
  current_setting('app.settings.service_role_key', true)) rather than
  hardcoding them — leave a clearly commented block showing how to set those
  with ALTER DATABASE ... SET, since the actual project ref/keys are
  environment-specific.

• RLS: enable RLS on all five new tables. SELECT: public-visibility
  confessions and all questions/question_replies readable by anyone incl.
  anon role; group-visibility confessions readable only by group members
  (mirror however group_messages' existing SELECT policy scopes membership);
  reactions readable by anyone who could read the target row. INSERT:
  confessions/questions/reactions require auth.uid() = the owner column;
  question_replies must ALSO allow the anon role to insert (visitor_id
  present, replier_id null) — write a policy that permits this without
  requiring auth.uid(). UPDATE/DELETE: owner or an admin profile
  (profiles.is_admin = true) only. Comment each policy's reasoning inline.

ATTACH: none — but if you have Supabase dashboard access, first export and
paste the current `profiles`, `groups`, and `group_messages` table
definitions so column names/types (sender_id, is_confession, media_url,
is_anon, etc.) line up exactly with what this migration assumes.

──────────────────────────────────────────────────────────────────────────────
PROMPT 2 / 45 — CREATE supabase/functions/send-push/index.ts
──────────────────────────────────────────────────────────────────────────────
Deno Edge Function invoked by the DB trigger (or by admin-notify) with a JSON
body: { target_type: 'group_message'|'dm_message'|'confession'|'admin',
target_id, actor_id, title?, body?, url? }.

• Look up the actual row (by target_type/target_id) via the Supabase service
  role client to resolve: group_message → all group members except actor_id,
  filtered to notification_settings.groups_enabled = true (or
  mentions_enabled = true if actor's text @mentions them — do a simple
  substring check against each member's username); dm_message → the other
  thread participant, filtered to dm_enabled = true; confession → group
  members (if group_id set) or all users with confessions_enabled = true (if
  public), excluding actor_id; admin → every push_subscriptions row whose
  user has promotional_enabled = true.
• For each resolved recipient, send a Web Push message to every row of
  theirs in push_subscriptions using VAPID keys from Deno.env
  (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT) — use the 'npm:web-push'
  Deno-npm-compat import if available in this project's Deno version,
  otherwise implement raw VAPID JWT signing + the Web Push protocol via
  fetch. Payload shape must match what public/sw.js expects: {title, body,
  icon, url}.
• On a 404/410 response from a push endpoint, delete that push_subscriptions
  row (expired subscription cleanup).
• Return JSON { sent: number, skipped: number }.

ATTACH: public/sw.js (current), supabase/migrations/0001_anonroom_v2.sql (output
of prompt 1).

──────────────────────────────────────────────────────────────────────────────
PROMPT 3 / 45 — CREATE supabase/functions/admin-notify/index.ts
──────────────────────────────────────────────────────────────────────────────
Deno Edge Function, POST only, body { title, body, url? }.
• Verify the caller's Supabase JWT (from the Authorization header) belongs to
  a profiles row with is_admin = true — query by the JWT's `sub` claim,
  reject with 403 otherwise.
• Fan out exactly like send-push's target_type: 'admin' branch — either by
  importing/duplicating that logic, or by server-to-server fetch()-ing the
  deployed send-push function with a service-role bearer header and body
  { target_type: 'admin', title, body, url }.
• This is a bare backend endpoint for now — no UI calls it yet; a future
  admin panel prompt will wire a button to it.

ATTACH: supabase/functions/send-push/index.ts (output of prompt 2).

──────────────────────────────────────────────────────────────────────────────
PROMPT 4 / 45 — EDIT public/sw.js
──────────────────────────────────────────────────────────────────────────────
Additive edit only — keep every existing addEventListener signature and the
current default-icon fallback behavior.
• In the 'push' handler, read data.url from the incoming payload and store it
  on the notification's `data` field (data.url ?? '/') instead of the
  currently-hardcoded {dateOfArrival, primaryKey} stub.
• In 'notificationclick', use event.notification.data.url (fallback '/') as
  the target instead of the hardcoded '/' — match an already-open client by
  that url first, else clients.openWindow(url).
• If data.icon is provided in the push payload, use it instead of the
  default '/vite.svg'; same for data.badge.

ATTACH: public/sw.js (current), supabase/functions/send-push/index.ts (output
of prompt 2, for the exact payload field names to match).

──────────────────────────────────────────────────────────────────────────────
PROMPT 5 / 45 — EDIT src/styles/tokens.css
──────────────────────────────────────────────────────────────────────────────
Replace the current Apple-iOS-liquid light/dark token system with the new
dark-only glassmorphism system from the master context (Ink / Ink-2 / Paper /
Dim / Ember / Signal / Glass White / Glass Border). Remove the entire
@media (prefers-color-scheme: dark) block — :root becomes the single source
of truth (dark-only design now).
KEEP every still-applicable structural rule, just recolored where it
references an old token name: the html/body/#root 100%-height chain,
box-sizing reset, overscroll-behavior: none, .custom-scrollbar rules
(recolor thumb to rgba(139,139,150,0.3), i.e. --dim at low opacity),
.app-viewport dvh rule, .safe-bottom, the .mobile-chat-page slideInFromRight
keyframe (keep the motion, it's already color-neutral).
ADD: .glass-panel (background var(--glass-white); border 1px solid
var(--glass-border); backdrop-filter: blur(20px) saturate(115%); border-radius
20px; box-shadow 0 6px 18px rgba(0,0,0,0.35)); .glass-sheet (identical but
border-radius 28px); .glass-panel::after / .glass-sheet::after grain overlay
— a tiled SVG fractal-noise data-URI background-image at 2% opacity,
mix-blend-mode: overlay, pointer-events: none, position: absolute, inset: 0
(inline the noise as an SVG data-URI directly in the CSS, no external image
file). Add reusable tokens --radius-card: 20px; --radius-sheet: 28px;
--radius-round: 50%;.

ATTACH: src/App.jsx (current, for the var(--bg)/var(--ink) references you
must not orphan), src/pages/Home.jsx (current, for the same reason), src/styles/tokens.css (current, full file).

──────────────────────────────────────────────────────────────────────────────
PROMPT 6 / 45 — CREATE src/styles/animations.css
──────────────────────────────────────────────────────────────────────────────
Author every keyframe + trigger class from the master context's motion spec
as reusable, parameterless CSS classes (JS only toggles classNames / mounts
elements — no JS animation libraries, no inline @keyframes elsewhere in the
app from now on). This file will be imported once from src/main.jsx.
Required classes, matching the EXACT timings/easings given:
  .chat-row (press-down: scale 0.98 + glass-fill brighten to
  rgba(255,255,255,0.10), 100ms ease-out; release: spring back to 1.0,
  cubic-bezier(0.34,1.56,0.64,1), 220ms)
  .digit-roll (old digit slides up+out −100% 120ms ease-out while new slides
  in from below — build with a wrapping span + CSS transform, triggered by
  a key/class change)
  .avatar-status-pulse (single-execution: scale 1.0→1.08→1.0, ring opacity
  1→0.4→1, 400ms — must NOT loop; caller adds/removes the class per event)
  .send-btn-tap (compress 0.9 scale 90ms, spring to 1.05 then settle 1.0,
  260ms total spring)
  .send-btn-success-morph (icon crossfade helper: opacity swap 150ms)
  .bubble-enter (translateY(8px)+opacity:0 → translateY(0)+opacity:1, 200ms
  ease-out) and .bubble-enter-outgoing (same + scale(0.95→1) from the right)
  .typing-dot (scale 1.0→1.4→1.0 per dot, nth-child(1..3) staggered via
  animation-delay 0/150ms/300ms, 900ms loop — the one intentionally looping
  animation)
  .tab-icon-switch (scale 1.0→1.15→1.0 spring 200ms) and .tab-indicator-dot
  (opacity 0→1, 120ms, no slide)
  .fab-tap (compress 0.88 100ms ease-in, expand past 1.0 to 1.08, settle 1.0,
  spring 240ms) and .fab-radial-item (staggered via a --i custom property:
  animation-delay calc(var(--i) * 40ms), translate-out + fade-in, 180ms)
  .pull-refresh-droplet (scaleY oscillates 0.9↔1.1 twice, 600ms, then
  collapses to 0 height, 200ms ease-in)
  .sheet-enter / .sheet-exit (translateY(100%)↔0, spring, 280ms) and
  .backdrop-fade (opacity 0↔0.5)
  .toggle-knob-droplet (spring slide 220ms, mid-slide compress to 0.85
  scaleX then back to 1.0)
Add a comment block at the top listing which future component/file is
expected to use each class (GroupChat.jsx → .chat-row/.bubble-enter, FAB in
ConfessionsFeed.jsx → .fab-tap/.fab-radial-item, etc.) so later prompts can
find the right class name without guessing.

ATTACH: none.

──────────────────────────────────────────────────────────────────────────────
PROMPT 7 / 45 — CREATE src/lib/soundManager.js
──────────────────────────────────────────────────────────────────────────────
Web Audio API module. Lazily create a single shared AudioContext on first
play*() call (must be triggered from a real user gesture the first time, per
browser autoplay policy — don't construct it at module load time).
Export: playSend() (dry, low tactile click, ~60ms — short filtered noise
burst through a lowpass + fast gain envelope), playReceive() (slightly
higher soft single tick, ~80ms — short sine/triangle blip), playTabSwitch()
(near-silent low thud, ~40ms), playRefreshComplete() (short two-tone rise —
two quick clicks in succession, ~100ms total, not a chime), playError()
(single flat low buzz, no pitch bend, ~90ms). Every sound is synthesized
purely with OscillatorNode/AudioBufferSourceNode + GainNode envelopes — no
external audio files, no reverb/swoosh — "short, dry, and mechanical" per
spec.
Also export isMuted() / setMuted(bool) — persist to localStorage under key
'anonroom_sound_muted'; every play*() function must no-op if muted.

ATTACH: none.

──────────────────────────────────────────────────────────────────────────────
PROMPT 8 / 45 — CREATE src/lib/visitorId.js
──────────────────────────────────────────────────────────────────────────────
Extract the cookie + localStorage "anonymous visitor id" logic currently
duplicated inline in App.jsx's LocationGate (getCookieDomain / setCookie /
getCookie / the visitorId + isNewVisitor block) into standalone exports:
getCookieDomain(), getCookie(name), setCookie(name, value, days = 365),
getOrCreateVisitorId() — reads the cookie, falls back to localStorage, falls
back to crypto.randomUUID(), writes the result back to BOTH cookie and
localStorage, and returns it. Preserve the exact current domain-scoping
behavior (".anonroom.in" on any hostname containing "anonroom.in"; bare
hostname on localhost/IPv4). This will be called from the rewritten App.jsx
(prompt 44) and from the anonymous question-reply flow in QuestionThread.jsx
(prompt 32).

ATTACH: src/App.jsx (current, full file — this is the source of the logic
you're extracting).

──────────────────────────────────────────────────────────────────────────────
PROMPT 9 / 45 — EDIT src/lib/subdomain.js
──────────────────────────────────────────────────────────────────────────────
Additive only — do not change any existing exported function's behavior or
signature.
Add: getQuestionIdFromPath() (mirrors getDmUsernameFromPath's shape but only
matches a path of exactly one segment prefixed conceptually as /q/<id> — i.e.
implement it as its own single-segment-under-/q/ parser: check
window.location.pathname starts with '/q/' and return the remainder, decoded,
or null); buildQuestionPath(id) => `/q/${encodeURIComponent(id)}`;
getConfessionsFeedPath() => '/confessions'; isConfessionsFeedPath() => true
when window.location.pathname replaces to exactly 'confessions'.

ATTACH: src/lib/subdomain.js (current, full file).

──────────────────────────────────────────────────────────────────────────────
PROMPT 10 / 45 — EDIT src/lib/authContext.jsx
──────────────────────────────────────────────────────────────────────────────
Keep the existing session/profile/loading contract 100% intact — every
current consumer must keep working unmodified.
Add: after fetchProfile succeeds, also fetch the caller's notification_settings
row (SELECT by user_id = userId); if none exists, treat it as the table's
defaults client-side (don't block on an insert). Expose `notificationSettings`
from context, plus an async `updateNotificationSettings(partial)` that
upserts { user_id: session.user.id, ...current, ...partial } to Supabase and
optimistically updates local state. Also expose `refreshProfile()` — re-runs
fetchProfile(session.user.id) for the current session so EditProfile.jsx can
refresh after a save without a full page reload.

ATTACH: src/lib/authContext.jsx (current, full file), supabase/migrations/0001_anonroom_v2.sql
(output of prompt 1, for the notification_settings column names).

──────────────────────────────────────────────────────────────────────────────
PROMPT 11 / 45 — CREATE src/lib/pushNotifications.js
──────────────────────────────────────────────────────────────────────────────
Extract and unify the push-subscribe logic currently duplicated inline in
Home.jsx's first-run prompt (~lines 420-450) and EditProfile.jsx's toggle
(~lines 265-315) into:
getPushStatus() — async, returns 'unsupported' | 'default' | 'denied' |
'subscribed' | 'unsubscribed' by checking 'serviceWorker' in navigator,
'PushManager' in window, Notification.permission, and
(await navigator.serviceWorker.ready).pushManager.getSubscription().
subscribeToPush(userId) — requests Notification permission, subscribes via
registration.pushManager.subscribe with applicationServerKey from
import.meta.env.VITE_VAPID_PUBLIC_KEY, and inserts the resulting subscription
into push_subscriptions keyed to userId — use the exact same row shape the
current inline code already inserts (don't change the schema assumption).
unsubscribeFromPush(userId) — unsubscribes the browser subscription and
deletes the matching push_subscriptions row.
Home.jsx's first-run prompt, EditProfile.jsx's row, and the new
NotificationSettingsPanel.jsx (prompt 26) will all import from here instead
of duplicating this logic.

ATTACH: src/pages/Home.jsx (current, focus on lines ~420-450), src/pages/EditProfile.jsx
(current, focus on lines ~265-315).

──────────────────────────────────────────────────────────────────────────────
PROMPT 12 / 45 — CREATE src/lib/reactions.js
──────────────────────────────────────────────────────────────────────────────
toggleReaction({targetType, targetId, userId, emoji}) — upsert against the
(target_type, target_id, user_id) unique constraint: if a row already exists
with the SAME emoji, delete it (un-react); if it exists with a DIFFERENT
emoji, update it to the new emoji (1 user, 1 reaction, changeable); if none
exists, insert it.
fetchReactionSummary(targetType, targetId) — returns an array of {emoji,
count, reactedByMe} aggregated from the reactions table for that target
(reactedByMe compares against the current session's user id).
subscribeToReactions(targetType, targetId, onChange) —
supabase.channel(`reactions:${targetType}:${targetId}`) subscribed to
postgres_changes on the reactions table filtered to that target (insert,
update, delete), calling onChange() on any event so callers re-fetch the
summary — mirror the channel-setup/cleanup pattern already used in
GroupChat.jsx's realtime subscription.

ATTACH: supabase/migrations/0001_anonroom_v2.sql (output of prompt 1),
src/pages/GroupChat.jsx (current, focus on the channel-subscription code
around line 755, purely as a pattern reference).

──────────────────────────────────────────────────────────────────────────────
PROMPT 13 / 45 — CREATE src/lib/storyImageGenerator.js
──────────────────────────────────────────────────────────────────────────────
Canvas-based generator (offscreen <canvas>, 1080×1920 portrait — standard
IG/NGL story dimensions): generateQuestionStoryImage({questionText,
questionType, replyUrl, template}) => Promise<Blob> (image/png via
canvas.toBlob).
Export a TEMPLATES array of at least 3 distinct layout ids (e.g.
'bold-center', 'sticky-note', 'gradient-card') — each must meaningfully vary
composition (card position/size, text sizing, where the reply-URL caption
sits), not just recolor the same layout. Every template uses ONLY the
design-token colors from the master context (--ink background, a --glass-
white rounded card housing the question text, a --ember pill reading "Reply
anonymously →", --paper text, --dim caption) so shared images look
recognizably "Anonroom" regardless of template.
Export shareStoryImage(blob, {title}) — tries navigator.share({files: [new
File([blob], 'anonroom-question.png', {type:'image/png'})], title}) first
(native share sheet); if the Web Share API or file-sharing isn't supported,
fall back to triggering a plain browser download of the PNG (create an <a>
with a blob: URL and click it).

ATTACH: none (self-contained canvas code — just reuse the color tokens from
the master context above, don't attach tokens.css).

──────────────────────────────────────────────────────────────────────────────
PROMPT 14 / 45 — EDIT src/components/ToastContainer.jsx
──────────────────────────────────────────────────────────────────────────────
Restyle every inline style to the new glass token system: --ink-2 surface via
the .glass-panel class, --paper text, --ember for a success/action accent,
--signal only if a toast represents a live/delivered state. Keep 100% of the
existing toast queueing/dismiss/exported API unchanged — src/lib/toast.js
calls into this file exactly as it does today.

ATTACH: src/components/ToastContainer.jsx (current, full file), src/lib/toast.js
(current, unchanged, for the API contract), src/styles/tokens.css (output of
prompt 5).

──────────────────────────────────────────────────────────────────────────────
PROMPT 15 / 45 — CREATE src/components/shared/GlassPanel.jsx
──────────────────────────────────────────────────────────────────────────────
Generic wrapper: <GlassPanel variant="card"|"sheet" onClose? children />.
variant="card" renders a plain .glass-panel div. variant="sheet" additionally
renders a backdrop (.backdrop-fade) and animates in/out with .sheet-enter /
.sheet-exit; when onClose is provided, support 1:1 drag-to-dismiss (pointer
events, translateY tracks the finger with NO easing while dragging — only
spring back to open or animate to closed based on release velocity/distance,
per the modal spec in the master context).
This becomes the base wrapper for every modal/sheet built or edited from
here on (NotificationSettingsPanel, ShareStorySheet, CreateQuestionModal,
EditProfile, AuthModal, GroupCard, ProfileCard, MediaViewer, EmojiGifPicker)
— keep its public API minimal and generic since 8+ files will depend on it.

ATTACH: src/styles/animations.css (output of prompt 6), src/styles/tokens.css
(output of prompt 5).

──────────────────────────────────────────────────────────────────────────────
PROMPT 16 / 45 — CREATE src/components/shared/LiquidAvatar.jsx
──────────────────────────────────────────────────────────────────────────────
Consolidate the four near-duplicate avatar components (LiquidAvatar in
Home.jsx & SearchUsers.jsx, GroupLiquidAvatar in GroupChat.jsx,
DMLiquidAvatar in DirectMessages.jsx, LiquidProfileAvatar in ProfileCard.jsx)
into one: <LiquidAvatar identity={{avatar_url, name, is_admin}} size={48}
kind="user"|"group" isAnon isOnline justReceivedMessage />.
Render the image/initials-fallback the way the most complete existing
version already does (preserve the is_admin gold-ring / is_anon masked
treatment if any current version has it). Add the new status ring: static
conic border in --signal when isOnline, solid --dim gray ring when offline
(no rotation, no shimmer, per spec). When justReceivedMessage transitions to
true, add the .avatar-status-pulse class for exactly one animation cycle
(the parent is responsible for flipping the prop back off after ~400ms).

ATTACH: src/pages/Home.jsx (current, LiquidAvatar def ~228-265), src/pages/GroupChat.jsx
(current, GroupLiquidAvatar def), src/pages/DirectMessages.jsx (current,
DMLiquidAvatar def), src/pages/ProfileCard.jsx (current, LiquidProfileAvatar
def), src/styles/animations.css (output of prompt 6).

──────────────────────────────────────────────────────────────────────────────
PROMPT 17 / 45 — CREATE src/components/shared/GlassToggle.jsx
──────────────────────────────────────────────────────────────────────────────
Consolidate the duplicate AppleToggle components (AuthModal.jsx,
EditProfile.jsx) into one <GlassToggle checked onChange disabled? />. Track
color swaps var(--ink-2) → var(--ember) INSTANTLY on state change (no
transition on the track color itself — instant color swap reads as more
responsive per spec). Knob slides with spring easing (220ms) using the
.toggle-knob-droplet class from animations.css, briefly compressing to 0.85
scaleX mid-slide. Used by every settings row from here forward, including
NotificationSettingsPanel's 5 toggles (prompt 26).

ATTACH: src/pages/AuthModal.jsx (current, AppleToggle def ~282-311), src/pages/EditProfile.jsx
(current, AppleToggle def ~134-159), src/styles/animations.css (output of
prompt 6).

──────────────────────────────────────────────────────────────────────────────
PROMPT 18 / 45 — CREATE src/components/shared/MessageSkeleton.jsx
──────────────────────────────────────────────────────────────────────────────
Consolidate the duplicate skeleton loaders (MessageSkeleton in GroupChat.jsx
& DirectMessages.jsx, ListSkeletonLoader in Home.jsx, SearchSkeletonLoader in
SearchUsers.jsx, GroupCardSkeleton in GroupCard.jsx, ProfileCardSkeleton in
ProfileCard.jsx) into one: <MessageSkeleton variant="message"|"list-row"|
"search-row"|"card" count={3} />. Build the shimmer from --glass-white bands
sweeping via a simple CSS animation (add this one shimmer keyframe here,
scoped locally to this component, since it's cosmetic-only and not part of
the interaction motion spec in animations.css). For each variant, use the
most detailed existing markup as the shape baseline and just re-skin it to
glass tokens — don't simplify layouts that currently convey real structure
(e.g. avatar circle + two text lines).

ATTACH: src/pages/GroupChat.jsx (current, MessageSkeleton def), src/pages/Home.jsx
(current, ListSkeletonLoader def), src/pages/SearchUsers.jsx (current,
SearchSkeletonLoader def), src/pages/GroupCard.jsx (current, GroupCardSkeleton
def), src/pages/ProfileCard.jsx (current, ProfileCardSkeleton def).

──────────────────────────────────────────────────────────────────────────────
PROMPT 19 / 45 — CREATE src/components/shared/MediaBubble.jsx
──────────────────────────────────────────────────────────────────────────────
Consolidate the duplicate AudioBubble + VideoBubble components (each exists
near-identically in both GroupChat.jsx and DirectMessages.jsx) into two named
exports from this ONE file: `export function AudioBubble({src, isOwn})` and
`export function VideoBubble({src})`. Preserve both components' existing
waveform-rendering/playback-control behavior exactly; only restyle: bubble
fill var(--glass-white) when isOwn is false, an --ember-tinted glass fill
when isOwn is true.

ATTACH: src/pages/GroupChat.jsx (current, AudioBubble/VideoBubble defs
~338-423), src/pages/DirectMessages.jsx (current, AudioBubble/VideoBubble
defs ~372-457).

──────────────────────────────────────────────────────────────────────────────
PROMPT 20 / 45 — CREATE src/components/shared/InstagramCard.jsx
──────────────────────────────────────────────────────────────────────────────
Consolidate the duplicate InstagramCard component (renders a scraped
Instagram profile/post attachment inside a message bubble, powered by
supabase/functions/instagram-scrape) from GroupChat.jsx and
DirectMessages.jsx into one shared version. Keep its exact current data
shape/props (whatever fields instagram-scrape's response provides) —
restyle only, to glass tokens.

ATTACH: src/pages/GroupChat.jsx (current, InstagramCard def ~424-457), src/pages/DirectMessages.jsx
(current, InstagramCard def ~458-491), supabase/functions/instagram-scrape/index.ts
(current, unchanged, for the response shape).

──────────────────────────────────────────────────────────────────────────────
PROMPT 21 / 45 — CREATE src/components/shared/AttachmentSheet.jsx
──────────────────────────────────────────────────────────────────────────────
Consolidate the duplicate AttachmentSheet (GroupChat.jsx's version has an
extra onPickConfession row that DirectMessages.jsx's lacks) into one:
<AttachmentSheet open onClose onOpenCamera onPickInstagram onPickConfession?
onPickPhoto? />. Render the onPickConfession row ONLY when that prop is
passed, so DirectMessages.jsx (which omits it) simply doesn't show it.
Add a new onPickPhoto row (gallery-only photo picker: a hidden
<input type="file" accept="image/*"> — deliberately WITHOUT a `capture`
attribute so mobile browsers open the photo gallery/library rather than
jumping to the camera — clicking this sheet row programmatically clicks that
input) for the new "attach a photo to a confession" requirement; render it
only when onPickPhoto is passed. Build on <GlassPanel variant="sheet">.

ATTACH: src/pages/GroupChat.jsx (current, AttachmentSheet def ~457-476), src/pages/DirectMessages.jsx
(current, AttachmentSheet def ~491-509), src/components/shared/GlassPanel.jsx
(output of prompt 15).

──────────────────────────────────────────────────────────────────────────────
PROMPT 22 / 45 — CREATE src/components/shared/SwipeableMessage.jsx
──────────────────────────────────────────────────────────────────────────────
Consolidate the duplicate SwipeableMessage (swipe-to-reply gesture wrapper)
from GroupChat.jsx and DirectMessages.jsx into one shared version with
identical touch/pointer-drag math — this is a straight de-duplication, no
new behavior.

ATTACH: src/pages/GroupChat.jsx (current, SwipeableMessage def ~571-599), src/pages/DirectMessages.jsx
(current, SwipeableMessage def ~598-640).

──────────────────────────────────────────────────────────────────────────────
PROMPT 23 / 45 — CREATE src/components/shared/SendButton.jsx
──────────────────────────────────────────────────────────────────────────────
Consolidate the duplicate SendButton (GroupChat.jsx, DirectMessages.jsx) into
one: <SendButton canSend sending cooldownPercent onClick />. Implement the
full spec exactly: idle = flat --ember fill, no shadow bloom; tap compresses
to 0.9 scale (90ms) then springs to 1.05 then settles 1.0 (260ms total, use
.send-btn-tap); on successful send, icon crossfades arrow→checkmark (150ms,
use .send-btn-success-morph) then the checkmark fades out after a 600ms hold
as the message bubble appears; disabled (canSend=false) drops opacity to
0.35 instantly, no animation. Use animations.css classes rather than
inventing new keyframes here.

ATTACH: src/pages/GroupChat.jsx (current, SendButton def ~599-629), src/pages/DirectMessages.jsx
(current, SendButton def ~640-678), src/styles/animations.css (output of
prompt 6).

──────────────────────────────────────────────────────────────────────────────
PROMPT 24 / 45 — CREATE src/components/shared/ReactionBar.jsx
──────────────────────────────────────────────────────────────────────────────
<ReactionBar targetType="group_message"|"dm_message"|"confession" targetId
userId />. On mount: fetchReactionSummary + subscribeToReactions from
src/lib/reactions.js; render existing reaction pills (emoji + count,
--ember-tinted border when reactedByMe). Tapping an existing pill calls
toggleReaction with that emoji. A trailing "+" pill opens a small quick-emoji
tray (a .glass-panel popover, 6–8 common emoji in a row) positioned above the
tap point, matching a Telegram/Instagram press-and-hold reaction tray; a
"more…" affordance inside that tray opens <EmojiGifPicker mode="emoji-only"/>
for the full set (note: EmojiGifPicker's `mode` prop is added later, by
prompt 39 — assume it already exists as named, per the master context's
rule). Must work identically for group messages, DM messages, and public
confessions (the "also available to public confessions" requirement) — same
component, just parameterized by targetType.

ATTACH: src/lib/reactions.js (output of prompt 12), src/pages/EmojiGifPicker.jsx
(current, for its existing emoji-grid markup to reuse the visual language
of), src/styles/animations.css (output of prompt 6).

──────────────────────────────────────────────────────────────────────────────
PROMPT 25 / 45 — CREATE src/components/shared/ConfessionBubble.jsx
──────────────────────────────────────────────────────────────────────────────
New NGL-style confession bubble, shared by GroupChat.jsx (inline in a group
thread), ConfessionsFeed.jsx (public feed), and StoryViewer.jsx (full-screen
story body): <ConfessionBubble confession={{id, text, photo_url, is_anon,
created_at, group}} onReply? size="inline"|"feed"|"story" />.
Always horizontally centered (never left/right-aligned like a normal
message). A differently-colored header strip (--ember at low opacity, label
"Confession" + relative timestamp) sits above a rectangular --glass-white
body (20px radius) with a reserved image area (aspect-ratio 4:5, object-fit:
cover, rendered only when photo_url is present) below the text. Bottom row:
a reply affordance (calls onReply) + an embedded <ReactionBar
targetType="confession" targetId={confession.id} userId/>.
size="story" fills more of the screen and auto-hides the reply/react chrome
until the viewer taps once (IG/NGL story convention — StoryViewer, prompt
28, relies on this).

ATTACH: src/pages/GroupChat.jsx (current, existing confession-rendering
markup ~line 1187 and ~1305-1387, to preserve any behavior already there),
src/components/shared/ReactionBar.jsx (output of prompt 24).

──────────────────────────────────────────────────────────────────────────────
PROMPT 26 / 45 — CREATE src/components/notifications/NotificationSettingsPanel.jsx
──────────────────────────────────────────────────────────────────────────────
<NotificationSettingsPanel /> — reads notificationSettings and
updateNotificationSettings from useAuth() (src/lib/authContext.jsx). Renders
a <GlassPanel variant="sheet"> containing, at the top, a master "Enable push
notifications" <GlassToggle> driven by src/lib/pushNotifications.js's
getPushStatus()/subscribeToPush()/unsubscribeFromPush(); below it, 5 more
<GlassToggle> rows — Direct Messages, Groups, Mentions, Confessions,
Promotional — each with a one-line description, bound to
notificationSettings.{dm,groups,mentions,confessions,promotional}_enabled.
The 5 category toggles are visually greyed/inert unless push is actually
subscribed (matches "additional settings layered on top of the base push
toggle"). This will be opened from EditProfile.jsx's Notifications section
(prompt 38, replacing its current single toggle).

ATTACH: src/lib/authContext.jsx (output of prompt 10), src/lib/pushNotifications.js
(output of prompt 11), src/components/shared/GlassPanel.jsx (output of
prompt 15), src/components/shared/GlassToggle.jsx (output of prompt 17).

──────────────────────────────────────────────────────────────────────────────
PROMPT 27 / 45 — CREATE src/components/stories/StoriesBar.jsx
──────────────────────────────────────────────────────────────────────────────
Horizontal-scroll row rendered on Home.jsx just below the search bar:
<StoriesBar groups userId onOpenStory={(channels, startIndex) => {}} />.
For each group the user belongs to, determine whether it has any confessions
row with group_id = g.id and created_at > now() - interval '24 hours'
(simple Supabase select, batched into one query across all the user's group
ids rather than N queries). Groups WITH new confessions render their circle
avatar with a static --signal conic-gradient ring; groups without render a
plain --dim gray ring. Tapping a highlighted circle calls onOpenStory with an
ordered channel array and the tapped group's index as startIndex.
Channel array order (StoryViewer, prompt 28, depends on this order): every
group-with-new-confessions in the bar's left-to-right order, THEN the
virtual channel 'public-confessions', THEN the virtual channel
'public-questions'.

ATTACH: src/pages/Home.jsx (current, full file — for where in the layout
this mounts and what `groups`/`userId` shape is already available), supabase/migrations/0001_anonroom_v2.sql
(output of prompt 1).

──────────────────────────────────────────────────────────────────────────────
PROMPT 28 / 45 — CREATE src/components/stories/StoryViewer.jsx
──────────────────────────────────────────────────────────────────────────────
Full-screen story viewer: <StoryViewer channels startIndex onClose userId />
where `channels` is the array StoriesBar (prompt 27) built.
Header (Instagram-style): back button; channel logo + name (a group's
logo/name for a group channel; the literal labels "Public Confessions" /
"Public Questions" for the two virtual channels); a 3-dot menu whose only
item is "Share" (for a group/public-confession item, copies a deep link built
from a shareable-confession URL — see ConfessionsFeed's focusConfessionId
pattern in prompt 33; for a public-question item, opens the same share flow
QuestionThread/ShareStorySheet use).
Body: for a group channel, cycle through that group's confessions from the
last 24h via <ConfessionBubble size="story"/>, including any attached photo;
tap right/left half of the screen to move within the channel; advance to the
next channel in the array on swipe-left at the channel's end (skip any
channel that resolves to zero items entirely — don't show an empty story).
'public-confessions' channel: same treatment over confessions where
group_id IS NULL, newest first.
'public-questions' channel: same chrome/cadence, but the bottom action reads
"Answer" instead of "Reply" — tapping opens a lightweight inline composer
that inserts into question_replies (same anonymous-capable insert QuestionThread.jsx
performs) rather than group_messages.
Bottom bar for ALL channel types: reply/answer text input + an embedded
<ReactionBar targetType="confession" .../> (a group-channel reply posts a
normal group_messages row — "reply are sent normally in groups" — while
reacting always posts to reactions with target_type='confession' against
that item's confessions.id). Auto-hide the header/bottom chrome after a beat
of no interaction; a single tap on the body reveals it again.

ATTACH: src/components/shared/ConfessionBubble.jsx (output of prompt 25), src/components/shared/ReactionBar.jsx
(output of prompt 24), src/lib/reactions.js (output of prompt 12), supabase/migrations/0001_anonroom_v2.sql
(output of prompt 1).

──────────────────────────────────────────────────────────────────────────────
PROMPT 29 / 45 — CREATE src/components/questions/ShareStorySheet.jsx
──────────────────────────────────────────────────────────────────────────────
<ShareStorySheet open onClose question /> — a <GlassPanel variant="sheet">
showing a live preview (rendered via src/lib/storyImageGenerator.js) with a
horizontal template picker letting the user swipe/tap through the exported
TEMPLATES before sharing; a "Share to Story" button calling
shareStoryImage(); a plain "Copy Link" row that copies
`https://anonroom.in${buildQuestionPath(question.id)}` to the clipboard (use
navigator.clipboard.writeText, with a toast confirmation via src/lib/toast.js).

ATTACH: src/lib/storyImageGenerator.js (output of prompt 13), src/lib/subdomain.js
(output of prompt 9), src/components/shared/GlassPanel.jsx (output of
prompt 15), src/lib/toast.js (current, unchanged).

──────────────────────────────────────────────────────────────────────────────
PROMPT 30 / 45 — CREATE src/components/questions/CreateQuestionModal.jsx
──────────────────────────────────────────────────────────────────────────────
<CreateQuestionModal open onClose onCreated={(question) => {}} /> — a
<GlassPanel variant="sheet"> with two prominent buttons at the top
("Personal" / "General", setting question_type before the form is usable), a
textarea for the question text, and a <SendButton>-styled "Create" action
that inserts into questions (author_id = current session user) and calls
onCreated with the new row (id included, so the caller can build the
/q/<id> link immediately). On successful creation, automatically open
<ShareStorySheet question={newQuestion} /> so the user can share it right
away — matches "sharing feature on sharing it creates an instagram story
like layout".

ATTACH: src/lib/authContext.jsx (output of prompt 10), src/components/shared/GlassPanel.jsx
(output of prompt 15), src/components/shared/SendButton.jsx (output of
prompt 23), src/components/questions/ShareStorySheet.jsx (output of
prompt 29).

──────────────────────────────────────────────────────────────────────────────
PROMPT 31 / 45 — CREATE src/components/questions/QuestionCard.jsx
──────────────────────────────────────────────────────────────────────────────
<QuestionCard question onOpen onShare /> — a list row for Home.jsx's "Ask Me"
subtab: truncated question text, a type badge (Personal/General), a reply
count (COUNT of question_replies for that question_id), relative timestamp.
Tap calls onOpen (which the caller wires to a chat-style reply view — "below
each question have chat interface like group which shows reply like group",
i.e. visually similar to opening a GroupChat thread). Long-press or a kebab
icon calls onShare (wired by the caller to <ShareStorySheet>).

ATTACH: src/pages/Home.jsx (current, for the surrounding list styling this
row needs to match), src/components/shared/MessageSkeleton.jsx (output of
prompt 18, so the loading state for a list of these matches variant="list-row").

──────────────────────────────────────────────────────────────────────────────
PROMPT 32 / 45 — CREATE src/pages/QuestionThread.jsx
──────────────────────────────────────────────────────────────────────────────
<QuestionThread questionId /> — the standalone page mounted at
anonroom.in/q/<id> for BOTH authenticated and unauthenticated visitors
(App.jsx, prompt 44, mounts this OUTSIDE any auth gate).
Fetch the question by id; show its text/type in a header card. Below it, a
GroupChat-style scrollable, realtime-subscribed (same postgres_changes
pattern GroupChat.jsx uses) list of question_replies rendered as centered,
always-anonymous-looking bubbles (never reveal replier identity in the UI
regardless of is_anon's stored value — display parity with NGL).
Reply composer at the bottom works whether or not the visitor is logged in:
if useAuth().session exists, set replier_id; if not, call
getOrCreateVisitorId() from src/lib/visitorId.js and set visitor_id instead
— never prompt an anonymous visitor to sign in to reply.
If the current viewer IS the question's author (session.user.id ===
question.author_id), also show a small "Add to confessions" action (on the
header and/or composer) that inserts a row into confessions (visibility
'public', group_id null, text from the composer) alongside a reply — matches
"confession addition on the question, public, not necessarily in a group".

ATTACH: src/pages/GroupChat.jsx (current, for the realtime-list + composer
pattern to mirror), src/lib/visitorId.js (output of prompt 8), src/lib/authContext.jsx
(output of prompt 10), src/lib/subdomain.js (output of prompt 9), src/components/shared/SendButton.jsx
(output of prompt 23).

──────────────────────────────────────────────────────────────────────────────
PROMPT 33 / 45 — CREATE src/pages/ConfessionsFeed.jsx
──────────────────────────────────────────────────────────────────────────────
<ConfessionsFeed focusConfessionId? /> — the public feed at
anonroom.in/confessions (also reused as the body content for Home.jsx's
public-confessions story channel) of confessions where group_id IS NULL,
newest first, each rendered via <ConfessionBubble size="feed"/>,
realtime-subscribed for new inserts.
A floating "+" FAB (using the .fab-tap / .fab-radial-item animation classes)
opens a lightweight composer (text + an optional gallery photo via
<AttachmentSheet onPickPhoto/>) that inserts a new public confession —
author_id always null, is_anon always true ("confessions are always
anonymous now").
Support the `focusConfessionId` prop/URL-param: on mount, if set, scroll that
specific card into view and briefly highlight it (generalize whatever
scroll-to-message approach GroupChat.jsx's confession-jump button already
uses) — this is what makes a confession "sharable like message sharing,
autoscrolls to that".

ATTACH: src/components/shared/ConfessionBubble.jsx (output of prompt 25), src/components/shared/AttachmentSheet.jsx
(output of prompt 21), src/pages/GroupChat.jsx (current, existing
confession-jump/scroll approach ~lines 1000-1010 and 1305-1387), src/styles/animations.css
(output of prompt 6).

──────────────────────────────────────────────────────────────────────────────
PROMPT 34 / 45 — EDIT src/pages/Home.jsx
──────────────────────────────────────────────────────────────────────────────
Restyle entirely to glass tokens; keep all existing group/DM list
data-fetching and read-receipt logic working exactly as today.
Add <StoriesBar/> directly below the search bar, wiring its onOpenStory to
mount <StoryViewer/> full-screen.
Split the main list area with a segmented-control ("Chats" | "Ask Me") in the
sub-header. "Chats" = the existing groups/DMs list, unchanged data logic,
just restyled. "Ask Me" = two prominent buttons at the top for creating a
Personal vs a General question (each opens <CreateQuestionModal/>
pre-selected to that type), then a list of the current user's own
<QuestionCard/> rows below, tapping one opens an inline
<QuestionThread questionId=.../>-style view in the same "opens like a group
chat" pattern the spec asks for.
Replace the current first-run push-notification prompt's implementation with
src/lib/pushNotifications.js instead of its inline logic; its copy must no
longer say or imply anything about location — that concern now lives
entirely in App.jsx's new opt-in banner (prompt 44).
Delete Home.jsx's own now-redundant local LiquidAvatar / ListSkeletonLoader
definitions in favor of the shared components; delete or reimagine
LiquidBackgroundEffects for the new dark-glass aesthetic (drop it if it was
tied to the old iOS-blue palette and doesn't translate).
Do not remove any working data-fetching, routing-trigger, or read-receipt
logic — only the visual layer and the specific flows named above change.

ATTACH: src/pages/Home.jsx (current, full file), src/components/shared/LiquidAvatar.jsx,
src/components/shared/MessageSkeleton.jsx, src/components/shared/GlassPanel.jsx,
src/components/shared/GlassToggle.jsx (all four = outputs of prompts 15-18),
src/components/stories/StoriesBar.jsx (prompt 27), src/components/stories/StoryViewer.jsx
(prompt 28), src/components/questions/QuestionCard.jsx (prompt 31), src/components/questions/CreateQuestionModal.jsx
(prompt 30), src/pages/QuestionThread.jsx (prompt 32), src/lib/pushNotifications.js
(prompt 11), src/lib/authContext.jsx (prompt 10).

──────────────────────────────────────────────────────────────────────────────
PROMPT 35 / 45 — EDIT src/pages/GroupChat.jsx
──────────────────────────────────────────────────────────────────────────────
Restyle entirely to glass tokens. Delete the local duplicate subcomponents
(GlobalKeyframes, MessageSkeleton, GroupLiquidAvatar, AudioBubble,
VideoBubble, InstagramCard, AttachmentSheet, SwipeableMessage, SendButton) in
favor of importing the shared/ versions. KEEP ConfessionModal local (it's the
"type your confession" compose form, not a display bubble — it's
group-specific) but restyle it and extend it to support attaching a gallery
photo via <AttachmentSheet onPickPhoto/>'s flow, writing to the confession
message's media_url/photo path.
Render confession messages via <ConfessionBubble size="inline"/> instead of
the current inline is_confession styling — always centered, never
left/right-aligned like a normal message.
Remove the floating bottom-right "pin" button entirely (handlePinClick / the
round button around line 1306). Replace it with a "Confessions" chip/button
placed directly below the main header that scrolls to the previous
confession, reusing the existing confessionNavIndex logic — just relocated
and restyled, not reimplemented.
Add <ReactionBar targetType="group_message" targetId={message.id}/> to every
regular message bubble, and, on confession bubbles, target the MIRRORED
confessions table row (target_type="confession") — since the DB trigger
(prompt 1) gives the mirrored row a different id than the source
group_messages row, resolve that mapping (e.g. by refetching/joining
confessions where source_message_id = message.id, or by having the
confession-insert flow read back the new confessions.id directly instead of
guessing it).
Keep 100% of existing realtime subscription, read-receipt, swipe-to-reply,
and rate-limiting logic intact.

ATTACH: src/pages/GroupChat.jsx (current, full file), every file in
src/components/shared/ (outputs of prompts 15-25), src/lib/reactions.js
(prompt 12), src/styles/animations.css (prompt 6).

──────────────────────────────────────────────────────────────────────────────
PROMPT 36 / 45 — EDIT src/pages/DirectMessages.jsx
──────────────────────────────────────────────────────────────────────────────
Same treatment as GroupChat.jsx (prompt 35) minus anything confession-related
(DMs have no confessions): restyle entirely to glass tokens; delete the local
duplicate GlobalKeyframes / MessageSkeleton / DMLiquidAvatar / AudioBubble /
VideoBubble / InstagramCard / AttachmentSheet / SwipeableMessage / SendButton
in favor of the shared/ imports; add <ReactionBar targetType="dm_message"
targetId={message.id}/> to every message bubble.
Keep 100% of existing thread-list, realtime, read-receipt, and rate-limiting
logic intact.

ATTACH: src/pages/DirectMessages.jsx (current, full file), every file in
src/components/shared/ (outputs of prompts 15-25), src/lib/reactions.js
(prompt 12).

──────────────────────────────────────────────────────────────────────────────
PROMPT 37 / 45 — EDIT src/pages/AuthModal.jsx
──────────────────────────────────────────────────────────────────────────────
Restyle entirely to glass tokens; replace the local AppleToggle with the
shared <GlassToggle/>; replace any local GlobalKeyframes-style inline
<style> keyframes with animations.css classes. Keep 100% of existing
sign-in/sign-up/OTP validation and submit logic untouched — visual layer
only.

ATTACH: src/pages/AuthModal.jsx (current, full file), src/components/shared/GlassToggle.jsx
(prompt 17), src/styles/tokens.css (prompt 5), src/styles/animations.css
(prompt 6).

──────────────────────────────────────────────────────────────────────────────
PROMPT 38 / 45 — EDIT src/pages/EditProfile.jsx
──────────────────────────────────────────────────────────────────────────────
Restyle entirely to glass tokens (LiquidInput and every profile field);
replace the local AppleToggle with the shared <GlassToggle/>. Replace the
current single inline push-notification toggle block (~lines 265-315) with
one row that opens <NotificationSettingsPanel/> instead of handling subscribe
logic directly — NotificationSettingsPanel now owns that entirely via
src/lib/pushNotifications.js. Keep 100% of existing profile-field
editing/save logic untouched.

ATTACH: src/pages/EditProfile.jsx (current, full file), src/components/shared/GlassToggle.jsx
(prompt 17), src/components/notifications/NotificationSettingsPanel.jsx
(prompt 26), src/lib/pushNotifications.js (prompt 11).

──────────────────────────────────────────────────────────────────────────────
PROMPT 39 / 45 — EDIT src/pages/EmojiGifPicker.jsx
──────────────────────────────────────────────────────────────────────────────
Restyle entirely to glass tokens. Add a new prop `mode="full"|"emoji-only"`
(default "full", so every current call site's behavior is unchanged when the
prop is omitted); when mode="emoji-only", hide the Giphy tab/grid entirely
and render just the emoji grid, sized to work well as the "more…" popover
destination opened from <ReactionBar/>'s quick-tray (prompt 24 already calls
this with mode="emoji-only" — this prompt is what makes that prop real).

ATTACH: src/pages/EmojiGifPicker.jsx (current, full file), src/components/shared/ReactionBar.jsx
(prompt 24, for exactly how it invokes this component).

──────────────────────────────────────────────────────────────────────────────
PROMPT 40 / 45 — EDIT src/pages/GroupCard.jsx
──────────────────────────────────────────────────────────────────────────────
Restyle entirely to glass tokens, using the shared <LiquidAvatar kind="group"/>
and <MessageSkeleton variant="card"/> instead of the local
LiquidGroupAvatar/GroupCardSkeleton (delete those local copies). Add a Share
action (same 3-dot-menu convention as StoryViewer, prompt 28) that copies the
group's anonroom.in subdomain link to the clipboard. Keep all existing
read-only group-info display logic untouched.

ATTACH: src/pages/GroupCard.jsx (current, full file), src/components/shared/LiquidAvatar.jsx
(prompt 16), src/components/shared/MessageSkeleton.jsx (prompt 18).

──────────────────────────────────────────────────────────────────────────────
PROMPT 41 / 45 — EDIT src/pages/MediaViewer.jsx
──────────────────────────────────────────────────────────────────────────────
Restyle entirely to glass tokens; replace any local GlobalKeyframes-style
inline keyframes with animations.css classes. Keep all existing
pinch/zoom/swipe media-viewing logic untouched.

ATTACH: src/pages/MediaViewer.jsx (current, full file), src/styles/animations.css
(prompt 6).

──────────────────────────────────────────────────────────────────────────────
PROMPT 42 / 45 — EDIT src/pages/ProfileCard.jsx
──────────────────────────────────────────────────────────────────────────────
Restyle entirely to glass tokens, using the shared <LiquidAvatar kind="user"/>
and <MessageSkeleton variant="card"/> instead of the local
LiquidProfileAvatar/ProfileCardSkeleton (delete those local copies). Keep all
existing profile-viewing / "message this user" launch logic untouched.

ATTACH: src/pages/ProfileCard.jsx (current, full file), src/components/shared/LiquidAvatar.jsx
(prompt 16), src/components/shared/MessageSkeleton.jsx (prompt 18).

──────────────────────────────────────────────────────────────────────────────
PROMPT 43 / 45 — EDIT src/pages/SearchUsers.jsx
──────────────────────────────────────────────────────────────────────────────
Restyle entirely to glass tokens, using the shared <LiquidAvatar kind="user"/>
and <MessageSkeleton variant="search-row"/> instead of the local
LiquidAvatar/SearchSkeletonLoader (delete those local copies). Keep all
existing search/debounce logic untouched.

ATTACH: src/pages/SearchUsers.jsx (current, full file), src/components/shared/LiquidAvatar.jsx
(prompt 16), src/components/shared/MessageSkeleton.jsx (prompt 18).

──────────────────────────────────────────────────────────────────────────────
PROMPT 44 / 45 — EDIT src/App.jsx
──────────────────────────────────────────────────────────────────────────────
Remove LocationGate's BLOCKING behavior entirely: delete the 'checking' and
'denied' full-screen takeover states and the forced
navigator.geolocation.getCurrentPosition() call on mount. The app must render
<Home/> (or the new /q/ and /confessions routes below) immediately regardless
of location permission.
Replace it with a small, dismissible, non-blocking glass-panel banner
("Enable location for a better experience" / "Allow" / "Not now") that ONLY
calls getCurrentPosition() when the user taps "Allow"; "Not now" just hides
the banner and persists that dismissal in localStorage so it doesn't re-nag
every load. When location IS granted (now or later), still write the same
'anonroom_location_verified' cookie and visitor_metadata insert as before,
but via src/lib/visitorId.js's getOrCreateVisitorId() instead of the current
inline duplicate cookie/visitor-id logic.
Keep the existing subdomain→root cross-domain cookie-sharing concept, but
make it non-blocking too: DELETE the code path that redirects a subdomain
visitor back to root purely to request location — a group subdomain must
render its content immediately regardless of location state now.
Add routing branches using src/lib/subdomain.js's new
getQuestionIdFromPath()/isConfessionsFeedPath(): a /q/<id> URL renders
<QuestionThread questionId={id}/>, and /confessions renders
<ConfessionsFeed/> — BOTH mounted OUTSIDE of AuthProvider's requirement for a
logged-in session and outside the location banner, since unauthenticated
visitors must be able to view/reply immediately.
Keep the pinch-zoom-prevention useEffect and the <ToastContainer/> mount
exactly as they are today.

ATTACH: src/App.jsx (current, full file), src/lib/visitorId.js (prompt 8), src/lib/subdomain.js
(prompt 9), src/pages/QuestionThread.jsx (prompt 32), src/pages/ConfessionsFeed.jsx
(prompt 33), src/pages/Home.jsx (output of prompt 34).

──────────────────────────────────────────────────────────────────────────────
PROMPT 45 / 45 — EDIT src/main.jsx
──────────────────────────────────────────────────────────────────────────────
Add the animations.css import (src/styles/animations.css, output of prompt 6)
alongside the existing tokens.css import, so every animation utility class is
globally available.
Optionally add a navigator.serviceWorker 'message' listener so that if
public/sw.js's notificationclick handler ever posts a message back to an
already-open client (an enhancement, not required), the app could route
client-side instead of a full navigation — if you add this, also note in a
comment that public/sw.js would need a matching postMessage call in its
focused-client branch to actually use it; if you'd rather not speculate,
leave a one-line comment marking where this would hook in instead and skip
the listener.
No other changes — keep the service-worker registration block, the
double-tap-zoom guard, and the StrictMode render exactly as they are today.

ATTACH: src/main.jsx (current, full file), src/styles/animations.css
(output of prompt 6), public/sw.js (output of prompt 4).

================================================================================
NOTES / SCOPE CAVEATS (read once, applies to the whole pack)
================================================================================
• New env vars you'll need to set before prompts 2, 3, 11, and 13's consumers
  work end-to-end: VITE_VAPID_PUBLIC_KEY (client), VAPID_PUBLIC_KEY /
  VAPID_PRIVATE_KEY / VAPID_SUBJECT (Edge Function secrets). Generate a VAPID
  keypair once (e.g. `npx web-push generate-vapid-keys`) and store both
  halves — no prompt in this pack generates the keypair itself.
• Prompt 1's DB→Edge-Function trigger requires the `pg_net` Postgres
  extension enabled on your Supabase project (Database → Extensions).
• `backdrop-filter` is heavy on low-end mobile GPUs — if you notice jank
  after prompt 5/6 land, consider a `@supports not (backdrop-filter: blur(1px))`
  fallback to a flat --ink-2 fill; no prompt above asks for this by default,
  add it only if you hit real perf issues.
• "Photo only, no files" for confessions is enforced purely by omitting the
  `capture` attribute and setting accept="image/*" on the file input in
  prompt 21 — this opens the OS photo picker/gallery on mobile, not the raw
  file system, on every major mobile browser as of this writing; verify on
  your actual target devices since browser behavior here isn't formally
  standardized.
• This pack does not include an admin UI button wired to admin-notify
  (prompt 3) — the function exists and is ready to call, but no prompt above
  builds the screen that calls it. Add a 46th prompt yourself
  (src/pages/AdminPanel.jsx, admin-only route) if you want that screen.
