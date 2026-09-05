# Chat Bots v2 — setup

This **replaces** the earlier bots feature (0005_bots.sql). Apply on top of
that — don't skip it, `0006_bots_rewrite.sql` alters what it created.

## What changed from v1
- Bots can now be assigned to **multiple groups** (`bot_groups` join table)
  instead of one `group_id` column.
- Bots can now be **DMed** — toggle "Allow direct messages" in the admin
  panel. Any place in the app that already opens a DM by user id (e.g. a
  profile card's "Message" button) works with a bot's id transparently —
  bots resolve through the exact same `dm_threads`/`dm_messages` tables.
- Reply-pack format changed to **`keyword : reply`** pairs, one per line,
  instead of a separate keywords list + reply pool. When a message matches
  more than one keyword, the engine picks the **most specific match** (the
  longest matching keyword), so you don't need to manually rank anything —
  just write good, specific keywords.
- Both reactive AND self-chat bots now always respond to @mentions, replies,
  and keyword matches — that filtering bug from v1 (self-chat bots ignoring
  direct replies) is fixed.
- No more visible "BOT" tag — bot messages render exactly like a normal
  user's.
- Bots now pause for a short simulated typing delay (and broadcast a live
  "X is typing…" indicator) before posting, instead of replying instantly.
- A bot won't repeat its immediately-previous line back to back.

## Files
- `0006_bots_rewrite.sql` — run after `0005_bots.sql`.
- `bot-engine/` — replaces the whole function. Redeploy:
  ```
  supabase functions deploy bot-engine
  ```
- `AdminPanel.jsx`, `GroupChat.jsx`, `DirectMessages.jsx` — replace your existing files.
- `replies/FORMAT.md` — updated spec, replaces the old one in `public/replies/`.
- `replies/behaviors.json` — unchanged from v1; keep as-is if you already have it, or add it if you're starting fresh.

## Rewriting your reply files
If you already wrote any `.txt` files under the old v1 format
(`keywords.txt` + `male.txt`/`female.txt`), they need converting to the new
single-file format. Old:
```
keywords.txt:  idiot, stupid
male.txt:      Whatever, I don't even care.
               Say that again, I dare you.
```
New (`male.txt` only, `keywords.txt` deleted):
```
idiot, stupid : Whatever, I don't even care.
idiot, stupid : Say that again, I dare you.
```
Full spec, including the `*` wildcard line for self-chat/fallback lines, is
in `replies/FORMAT.md`.

## One-time setup (same as v1, repeated for completeness)
1. Run `0005_bots.sql` then `0006_bots_rewrite.sql`.
2. `supabase secrets set SITE_URL=https://anonroom.in`
3. `supabase functions deploy bot-engine`
4. Confirm `app.settings.edge_function_url` / `app.settings.service_role_key` are already set on your DB (they should be, from the original push-notification migration) — nothing new to configure there.
5. Enable `pg_cron` under Database → Extensions if you want self-chat bots.
6. Write your reply packs under `public/replies/<behavior>/{male,female}.txt`, redeploy your site.
7. Admin Panel → Bots tab → create bots, assign groups, toggle DM if wanted.

## On bot discovery for DMs
The backend fully supports bot DMs now, but there's currently no dedicated
"browse bots to DM" screen in the app — a user needs *some* existing path
that hands a bot's id to `DirectMessages`'s `openThreadWithUserId` the same
way it would a real user's id (e.g. a future "Bots" list in `Home.jsx`, or
sharing a bot's id via a deep link). That UI wasn't something I could safely
add without more of `Home.jsx` in front of me — happy to build it in a
follow-up once you point me at how you'd like bots surfaced (a dedicated
tab, inside group member lists, etc.).
