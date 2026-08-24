# Anonroom.in — Diagnosis & File-by-File Fix Prompts

## Part 1 — What's actually happening (read this first)

**1. The location-permission redirect loop**
`App.jsx` decides "has this visitor already granted location?" by reading `localStorage.getItem('anonroom_location_verified')`. **localStorage is per-origin** — `anonroom.in` and `general.anonroom.in` are *different origins* and never share localStorage. So: subdomain checks its own (empty) localStorage → redirects to root → root has its own flag already set from a past visit → bounces straight back to the subdomain → subdomain checks its own (still empty) localStorage again → redirects to root again → loop.
Your own `supabaseClient.js` already solved this exact problem correctly for login sessions, by storing the auth token in a cookie with `domain=.anonroom.in` (shared by every subdomain). The location flag needs the same treatment: a cookie, not localStorage.

**2. DM image upload doing nothing when picked from "Files"**
The `<input type="file" hidden>` in both `DirectMessages.jsx` and `GroupChat.jsx` uses the `hidden` attribute, which is `display:none`. On Android Chrome there's a well-known bug where a `display:none` file input's `change` event fails to fire when the result comes back from an external picker (Google Files / gallery app going through the Storage Access Framework), because the tab backgrounds while the picker is open. Camera capture returns fast enough that it usually still works; gallery/Files picks are slower and hit the bug. The fix is to never set the file input to `display:none` — hide it visually instead (1px, clipped, opacity 0, but still "displayed").

**3. Media viewer cropping on desktop**
The image sits inside a `display:flex` container. Flex items default to `min-width: auto`, which means the browser sizes the flex item to the image's *natural* pixel width before applying `max-width: 100%`, so wide images can get clipped by the container instead of shrinking. Needs `minWidth: 0` (and `minHeight: 0`) on the flex wrapper.

**4. Anonymous toggle showing in DMs**
It was added generically and ended up in the DM header too. DMs are already 1:1 and identity is already known to both people, so it should only exist in `GroupChat.jsx`.

**5. Raw Supabase/db errors shown via `alert()`**
`alert(error.message)` leaks raw Postgres/Supabase error text in an ugly native browser popup. Every one of these needs to become a generic, friendly in-app toast — never the raw `error.message`.

**6. Silent/rude rate-limit behavior**
When `cooldownPercent > 0`, send handlers just `return` — no feedback. Needs a toast: "Please wait a few seconds before sending another message." The cooldown timing itself (`rateLimit.js`, 3s) is untouched, as requested.

## Part 2 — Answers to your open questions, before you use these
- `is_anon` already exists on both `group_messages` and `dm_messages` — no DB change needed for that.
- `visitor_metadata` table already exists — no DB change needed for that either.
- Push notifications (VAPID keys + a server/Edge Function to actually send them) are a separate, bigger build — **not** included in these prompts. Say the word separately and I'll scope that as its own set of file prompts (it needs a new Supabase Edge Function + a `push_subscriptions` table, which is backend work, not a single-file frontend patch).
- No DB schema changes are required for anything below.

## Part 3 — How to use this
Below are **9 self-contained prompts**, one per file. Each one works in a brand-new AI chat with zero prior context — paste the prompt, then paste (or attach) the current content of that one file, and you'll get the complete fixed file back. Two of the nine are brand-new files (they don't exist yet — just paste the prompt, no file needed, and create the returned file at the given path).

Do them in this order: **1 → 2 → 3**, then the rest in any order (1–3 create the shared toast system the others depend on).

---

## PROMPT 1 (NEW FILE) — `src/lib/toast.js`

```
You are creating one new file for a React 18 + Vite web app called Anonroom. The app has no global state library and no React Context for UI notifications yet — I need a tiny, dependency-free toast/notification utility module.

Create the file at src/lib/toast.js with this exact public API (other files in my app already assume this exact contract, so do not change the names or signature):

- export function showToast(message, type = 'error')
  - type is one of: 'error' | 'success' | 'info'
  - It generates a unique id (use crypto.randomUUID() if available, otherwise a fallback like Date.now() + Math.random())
  - It dispatches a CustomEvent on `window` named exactly 'anonroom:toast' with `detail: { id, message, type }`
  - It does not render anything itself — a separate <ToastContainer /> component (already built separately) listens for this event and renders the UI. This file is pure logic, no JSX, no React import needed.

Also export a helper:
- export function friendlyDbError(fallback = "Something went wrong. Please try again.")
  - Returns that fallback string. (This exists so every call site can do showToast(friendlyDbError()) instead of ever showing a raw Supabase/Postgres error.message to the user — raw DB error text must never reach the UI.)

Keep the file small, plain JS, well-commented, no external dependencies. Give me the complete file, not a snippet.
```

---

## PROMPT 2 (NEW FILE) — `src/components/ToastContainer.jsx`

```
You are creating one new file for a React 18 + Vite web app called Anonroom. It uses no CSS framework — all styling in the codebase is inline style objects using CSS variables already defined in src/styles/tokens.css, in an iOS-glassmorphism look (blurred translucent panels, rounded pill shapes, spring-like transitions). Example variables you can rely on existing: --bg, --ink, --dim, --blue, --red, --glass, --glass-strong, --glass-border.

Create src/components/ToastContainer.jsx as a self-contained React component with this exact behavior:

1. On mount, it adds a window event listener for a CustomEvent named 'anonroom:toast'. The event's `detail` is `{ id, message, type }` where type is 'error' | 'success' | 'info'.
2. It keeps an array of active toasts in useState. Each incoming event appends a new toast to the array.
3. Each toast auto-dismisses (removed from the array) after 3500ms via setTimeout, cleaned up properly if the component unmounts.
4. Tapping/clicking a toast dismisses it immediately.
5. Render: a fixed-position stack, anchored to the top-center of the screen, respecting the safe area (use `env(safe-area-inset-top)` in the top offset so it doesn't sit under a phone's notch/status bar). Stack multiple toasts vertically with a small gap, most recent at the top.
6. z-index must be at least 10000 (higher than this app's full-screen media lightbox, which uses z-index 9999) so toasts are always visible above everything else, including modals.
7. Visual style per type:
   - error: reddish tint using var(--red) for text/icon accent, on the app's translucent dark glass background
   - success: a green tint accent, same glass background
   - info: use var(--blue) as the accent, same glass background
   - All variants: rounded pill/rounded-rect shape, backdrop blur, subtle shadow, white/var(--ink) message text, small icon or colored dot on the left matching the type, comfortable padding, readable on both light and dark content behind it.
8. Add a simple CSS keyframe (inline <style> tag inside the component, same pattern the rest of this codebase uses) for a slide-down-and-fade-in entrance animation, and fade-out on removal.
9. Component takes no props and needs no provider/context — it's meant to be mounted exactly once near the root of the app (in App.jsx) and works purely off the global 'anonroom:toast' window event.

Give me the complete file, fully self-contained, no external icon libraries, no cut-off.
```

---

## PROMPT 3 — `src/App.jsx`

```
This is App.jsx from a React 18 + Vite web app called Anonroom (uses Supabase). I'm pasting the current file below. It has three real bugs to fix. Do not rewrite things that aren't part of these fixes, and do not remove or change the AuthProvider/Home structure beyond what's described. Return the complete file, no cut-off, no placeholders like "...rest unchanged".

BUG 1 — Infinite redirect loop between the root domain and subdomains.
This app runs on a root domain (anonroom.in) and per-group subdomains (e.g. general.anonroom.in). The component below, LocationGate, is meant to: ask for geolocation permission + capture visitor metadata ONCE on the root domain, remember that with a flag, and if a subdomain is opened directly without that flag, bounce the user to the root domain to get permission, then bounce them back.
The bug: it currently stores the "verified" flag in `localStorage`, which is scoped per-origin — a subdomain and the root domain never share the same localStorage, so the subdomain never actually "sees" that verification happened on the root domain, and it redirects back and forth forever.
The fix: store the verification flag (and the visitor id) as a COOKIE with an explicit shared domain, the exact same pattern this project already uses elsewhere for auth (see src/lib/supabaseClient.js in this codebase, which computes: if hostname includes 'anonroom.in' → cookieDomain = '.anonroom.in'; else if hostname is 'localhost' or a bare IPv4 → cookieDomain = hostname itself). Reproduce that same domain-detection logic here (don't import from supabaseClient.js, just duplicate the small helper inline in App.jsx so this file stays self-contained) and use `document.cookie` (path=/, the computed domain, max-age of 1 year, SameSite=Lax, Secure) instead of localStorage for BOTH `anonroom_location_verified` and `anonroom_visitor_id`. Read them with a small getCookie(name) helper. Keep writing to localStorage too as a harmless bonus (doesn't hurt), but the SOURCE OF TRUTH for "is this visitor verified" must be the cookie so it's shared across every subdomain and the root domain automatically.
Also add a loop guard: before redirecting from a subdomain to the root domain, check `sessionStorage.getItem('anonroom_redirect_attempted')`. If it's already 'true', do NOT redirect again — instead treat this the same as the 'denied' state (show the existing "Location Access Required" UI) so a broken edge case (e.g. cookies blocked) fails safely instead of looping forever. Set that sessionStorage flag to 'true' right before performing the redirect.

BUG 2 — Pinch-to-zoom is still possible on the home screen (and everywhere) despite the viewport meta tag disabling it.
`user-scalable=no` in the viewport meta tag (in index.html, not shown here) is ignored by some browsers (notably iOS Safari) for accessibility reasons, so pinch-zoom can still happen. Add a JS-level safety net in this file: in a useEffect at the top level of the App component (runs once on mount), add two listeners on `document`:
  - 'gesturestart' (Safari-specific pinch gesture event) → e.preventDefault()
  - 'touchmove' → if `e.touches.length > 1` (multi-touch, i.e. a pinch), call e.preventDefault(); this listener must be registered with `{ passive: false }` or preventDefault won't work.
Clean both listeners up on unmount. This must apply globally (including the home screen), so it belongs in App.jsx, not in a specific page.

BUG 3 — No global toast system mounted yet.
Import ToastContainer from './components/ToastContainer' and render <ToastContainer /> once, near the top of the JSX tree returned by the top-level App component (e.g. as a sibling to AuthProvider's children, so it's always mounted regardless of LocationGate's status — actually mount it OUTSIDE/ABOVE LocationGate entirely, at the very top of App's return, so toasts can still show even during the "Verifying Region..." or "denied" screens).

Give me the complete, updated App.jsx.

Here is the current file:

[PASTE THE CURRENT src/App.jsx HERE]
```

---

## PROMPT 4 — `src/main.jsx`

```
This is main.jsx from a React 18 + Vite web app called Anonroom. I'm pasting the current file below. Make exactly one addition, nothing else changes:

Add a global double-tap-to-zoom prevention safeguard. Some mobile browsers still allow zooming via a rapid double-tap even when pinch-zoom is otherwise blocked elsewhere in the app. Before the ReactDOM.createRoot(...).render(...) call, add a small vanilla-JS guard: track the timestamp of the last 'touchend' event on `document` (module-level variable, e.g. `let lastTouchEnd = 0`), and on every 'touchend' event, if the time since the previous touchend is less than 300ms, call `event.preventDefault()`; then update `lastTouchEnd` to the current timestamp. Register this listener with `{ passive: false }`.

Do not touch the existing service worker registration code or the React render call — keep everything else exactly as-is. Give me the complete updated file.

Here is the current file:

[PASTE THE CURRENT src/main.jsx HERE]
```

---

## PROMPT 5 — `src/pages/DirectMessages.jsx`

```
This is DirectMessages.jsx from a React 18 + Vite + Supabase web app called Anonroom (1:1 direct messages page). It's a large file — I'm pasting the whole current file below. Make ONLY the following fixes, and preserve every other feature/behavior exactly as it is (reply-to, mentions, media picker/GIF picker, message selection/delete, cooldown ring, etc). Return the COMPLETE file with nothing cut off or replaced with "...".

FIX 1 — File picker from Gallery/Files does nothing (works fine only when capturing directly from the camera).
The `<input ref={fileInputRef} type="file" hidden onChange={handleAttachmentSelected} />` uses the `hidden` HTML attribute, which sets `display:none`. On Android Chrome there is a known bug where a display:none file input's change event does not reliably fire when the file comes back from an external app (Gallery/Files/Storage-Access-Framework), because the tab is backgrounded while that picker is open — camera capture is fast enough to usually dodge it, gallery picks are not. Fix: remove the `hidden` attribute and instead visually hide the input with an inline style that keeps it "displayed" (so the browser still delivers the change event) but invisible and out of the way, e.g.: position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0, opacity: 0, pointerEvents: 'none'. Do not add an `accept` or `capture` attribute — the input must keep offering both camera and gallery/Files, and camera capture must keep working exactly as it does now.

FIX 2 — Remove the Anonymous mode toggle from this page entirely.
DMs are already 1:1 and both people already know who they're talking to, so the anonymous toggle doesn't belong here (it's only meant to exist in group chats). Remove the toggle button from the header. Remove the `isAnonMode` state and the `setIsAnonMode` toggle handler. In every place this file currently sends `is_anon: isAnonMode` when inserting into `dm_messages` (in handleSend, handleAttachmentSelected, handleMediaPicked, and anywhere else it appears), change it to always send `is_anon: false`. Do not touch the `is_anon` column/read logic used for rendering messages (a DM thread could still theoretically contain historical anon messages) — only remove the ability to toggle it on send from this page.

FIX 3 — Never show raw database/upload errors to the user; use the app's toast system instead of alert().
This file currently does things like `alert(error.message)` and stores raw Supabase error text in `dbErrorDetails` for display. Replace every one of these:
  - Add this import near the top: `import { showToast, friendlyDbError } from '../lib/toast';`
  - Replace every `alert(error.message)` / `alert('Upload failed.')` / `alert(...)` call with `showToast(friendlyDbError(), 'error')` for generic failures, or a short specific friendly message via `showToast('...', 'error')` where a more specific, still-non-technical message makes sense (e.g. "Couldn't send that image. Please try again.").
  - Remove any state/UI that displays raw `error.message` or `insertError.message` text to the user (e.g. `dbErrorDetails` if it's rendered anywhere in the JSX) — the raw message must never reach the DOM. It's fine to still `console.error(error)` for developer debugging, that's not user-visible.
  - Everywhere `dbErrorDetails` was being set, replace it with a `showToast(friendlyDbError(), 'error')` call instead (and you can remove the `dbErrorDetails` state entirely if nothing else depends on it).

FIX 4 — Friendly rate-limit feedback.
Right now, when `cooldownPercent > 0` and the user tries to send a message or attachment, the handler just silently `return`s. Add `showToast("Please wait a few seconds before sending another message.", 'info')` right before that early return, in handleSend, handleAttachmentSelected, and handleMediaPicked (wherever the `cooldownPercent > 0` guard currently causes a silent no-op). Do not change the cooldown duration or the cooldown ring visuals — only add the toast feedback.

Give me the complete, fixed file.

Here is the current file:

[PASTE THE CURRENT src/pages/DirectMessages.jsx HERE]
```

---

## PROMPT 6 — `src/pages/GroupChat.jsx`

```
This is GroupChat.jsx from a React 18 + Vite + Supabase web app called Anonroom (group chat page). It's a large file — I'm pasting the whole current file below. Make ONLY the following fixes, and preserve every other feature exactly as-is (the Anonymous mode toggle in the header MUST stay — that one is correct and intentional for group chats, do not remove it). Return the COMPLETE file, nothing cut off or replaced with "...".

FIX 1 — Preventively fix the same file-input bug that broke image sending in DMs, before it happens here too.
Find `<input ref={fileInputRef} type="file" hidden onChange={handleAttachmentSelected} />`. The `hidden` attribute sets `display:none`, which on Android Chrome can cause the file input's change event to silently fail to fire for files picked via Gallery/Files (as opposed to the camera) because the tab backgrounds while that picker is open. Replace the `hidden` attribute with an inline style that visually hides the input while keeping it "displayed" (so change events still fire reliably): position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0, opacity: 0, pointerEvents: 'none'. Do not add `accept` or `capture` attributes. Camera capture must keep working exactly as it does now, and normal gallery/Files picking must now also work.

FIX 2 — Never show raw database/upload errors to the user; use the app's toast system instead of alert().
This file currently does things like `alert(error.message)` and `alert('Upload failed.')`. 
  - Add this import near the top: `import { showToast, friendlyDbError } from '../lib/toast';`
  - Replace every `alert(...)` call that shows a raw Supabase/db error or a generic failure with `showToast(friendlyDbError(), 'error')`, or a short specific friendly message via `showToast('...', 'error')` for cases like a failed upload (e.g. "Couldn't send that image. Please try again.") — never the raw `error.message`.
  - It's fine to keep `console.error(error)` for developer debugging; that's not user-visible.

FIX 3 — Friendly rate-limit feedback.
Wherever a send/upload handler currently silently `return`s early because `cooldownPercent > 0` (e.g. in handleSend, handleAttachmentSelected, handleMediaPicked), add `showToast("Please wait a few seconds before sending another message.", 'info')` right before that early return. Do not change the cooldown duration (3s) or the cooldown ring visuals — only add the toast feedback.

Give me the complete, fixed file.

Here is the current file:

[PASTE THE CURRENT src/pages/GroupChat.jsx HERE]
```

---

## PROMPT 7 — `src/pages/MediaViewer.jsx`

```
This is MediaViewer.jsx from a React 18 + Vite web app called Anonroom — a full-screen image/file lightbox component. I'm pasting the whole current file below. There is exactly one bug to fix: on desktop, wide images get their left/right edges cropped/cut off instead of shrinking to fit the viewport.

Root cause: the image sits inside a `display: 'flex', alignItems: 'center', justifyContent: 'center'` container. Flex items default to `min-width: auto`, which means the browser lets the item size itself to the image's natural intrinsic pixel width BEFORE the image's own `maxWidth: '100%'` gets a chance to constrain it against the container — so a wide image can overflow/clip instead of shrinking.

Fix: on the "CONTENT RENDERING" wrapper div (the one with `onClick={handleContentClick}` that contains the `<img>`/`<iframe>`), add `minWidth: 0` and `minHeight: 0` to its inline style object, alongside its existing properties. Do not change anything else — not the animation values, not the close button, not the iframe fallback for non-image files, not the image's own maxWidth/maxHeight/objectFit values. This is a one-property-added fix (well, two: minWidth and minHeight), nothing structural should change.

Give me the complete, fixed file.

Here is the current file:

[PASTE THE CURRENT src/pages/MediaViewer.jsx HERE]
```

---

## PROMPT 8 — `src/pages/EditProfile.jsx`

```
This is EditProfile.jsx from a React 18 + Vite + Supabase web app called Anonroom. I'm pasting the whole current file below. Make ONLY this fix, preserve everything else exactly as-is:

Never show raw database errors to the user via alert(). This file currently uses `alert(...)` somewhere to surface a failure (e.g. saving profile changes). 
  - Add this import near the top: `import { showToast, friendlyDbError } from '../lib/toast';`
  - Replace every `alert(...)` call that reports an error with `showToast(friendlyDbError(), 'error')`, or a short specific friendly message via `showToast('...', 'error')` where more specific non-technical wording makes sense (e.g. "Couldn't save your changes. Please try again.").
  - If there's a success alert (e.g. "Profile updated"), replace it with `showToast('Profile updated.', 'success')` instead of alert() too, for consistency — success messages shouldn't use native alert() either.
  - It's fine to keep `console.error(error)` for developer debugging; raw error text must just never reach the visible UI or a native alert() popup.

Give me the complete, fixed file.

Here is the current file:

[PASTE THE CURRENT src/pages/EditProfile.jsx HERE]
```

---

## PROMPT 9 — `src/pages/GroupCard.jsx`

```
This is GroupCard.jsx from a React 18 + Vite + Supabase web app called Anonroom — a card/modal that previews a group before joining/opening it. I'm pasting the whole current file below. Make ONLY this fix, preserve everything else exactly as-is:

There's a `useState` called `error`, and when fetching the group by slug fails, it currently does `setError(error.message)` — storing and then rendering the RAW Supabase/Postgres error text directly in the UI (`<p ...>{error}</p>`). This must never show raw db error text to the user.
  - Add this import near the top: `import { showToast, friendlyDbError } from '../lib/toast';`
  - When the Supabase query returns an `error` (the `{ data, error }` destructure in the fetch), instead of `setError(error.message)`, do BOTH: `showToast(friendlyDbError(), 'error')` AND `setError("Something went wrong loading this group.")` (a friendly, non-technical fallback string) so the inline `<p>{error}</p>` in the card still shows something sensible without ever containing raw db error text.
  - Keep the existing "Group not found." case exactly as it is (that one is already a friendly, intentional message — leave it untouched, don't route it through the toast).
  - It's fine to keep `console.error(error)` somewhere for developer debugging if you want, but the raw message must not reach `setError` or the rendered UI.

Give me the complete, fixed file.

Here is the current file:

[PASTE THE CURRENT src/pages/GroupCard.jsx HERE]
```

---

## Quick checklist after you're done
- [ ] Prompt 1 → new `src/lib/toast.js`
- [ ] Prompt 2 → new `src/components/ToastContainer.jsx`
- [ ] Prompt 3 → `src/App.jsx` (loop fix, pinch-zoom, mounts ToastContainer)
- [ ] Prompt 4 → `src/main.jsx` (double-tap zoom guard)
- [ ] Prompt 5 → `src/pages/DirectMessages.jsx` (file picker fix, anon toggle removed, toasts)
- [ ] Prompt 6 → `src/pages/GroupChat.jsx` (file picker hardened, toasts — anon toggle stays)
- [ ] Prompt 7 → `src/pages/MediaViewer.jsx` (desktop crop fix)
- [ ] Prompt 8 → `src/pages/EditProfile.jsx` (toasts)
- [ ] Prompt 9 → `src/pages/GroupCard.jsx` (masked error)

No Supabase schema/table changes are needed for any of the above.
