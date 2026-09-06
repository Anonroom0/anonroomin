# Bot reply pack format (v2)

Each **behavior** (e.g. `angry`, `sweet`, `bad`, `sarcastic`) is a folder
under `public/replies/`, containing two plain-text files:

```
public/replies/
  behaviors.json          <- catalog the admin panel reads to list behaviors
  FORMAT.md                <- this file
  angry/
    male.txt
    female.txt
  sweet/
    male.txt
    female.txt
  ... one folder per behavior ...
```

These are plain static files served from the `public/` folder — no build
step reads them, so you can add/edit them at any time. The bot engine
caches each file for 60 seconds, so changes go live within a minute of
deploying, no redeploy of the bot engine itself needed.

## Line format: `keyword : reply`

Every line is one trigger + one reply, separated by a colon:

```
idiot, stupid : Whatever, I don't even care.
shut up : Say that again, I dare you.
whatever, don't care : Bro really typed that with his whole chest 💀
```

- **Left of the colon**: one or more trigger keywords/phrases, comma
  separated. Case-insensitive. Single words match on word boundaries (so
  `hi` won't fire on "this"); multi-word phrases match as a substring.
- **Right of the colon**: the exact reply text the bot will post.
- Only the **first** colon on the line is treated as the separator, so your
  reply text can safely contain its own colons.
- Blank lines and lines starting with `#` are ignored.

### Wildcard lines

Use `*` (or leave the left side empty) for a line with no trigger keyword —
these are never used to answer an incoming message, but are available as
generic filler for **self-chat** and for replying when a bot is
**@mentioned or replied to** but nothing else matched:

```
* : lol true
* : idk man, kind of a weird day
* : fr fr
```

### How matching works

When a real message comes in, the engine checks every keyword across all of
a bot's selected behaviors (for its configured gender) and picks the
**single best match** — the longest/most specific keyword wins if more than
one line matches, so a phrase like `shut up` will be preferred over a
shorter, more generic word if both happen to be present. There's exactly
one reply per triggering message, not one per matched keyword.

If a bot is @mentioned or replied to directly but no keyword matches
anything it said, it still replies — falling back to a random line (wildcard
or not) from one of its behaviors, so it never goes silent when someone
talks to it directly.

- Aim for 15–30+ lines per file so replies don't feel repetitive.
- If one gender's file is empty/missing for a behavior, the engine falls
  back to the other gender's lines rather than staying silent.
- A bot never repeats its own immediately-previous line back to back, when
  an alternative is available.

## Adding a new behavior

1. Add a folder: `public/replies/<your-slug>/`
2. Add `male.txt` and `female.txt` inside it, following the format above.
3. Add an entry to `behaviors.json` (id, label, emoji) so it shows up as a
   selectable checkbox in the admin panel's bot editor.

No code changes or redeploys of the bot engine itself are needed — it reads
the folder by slug at request time.
