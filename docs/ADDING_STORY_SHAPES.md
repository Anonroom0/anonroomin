# Adding new Story Shapes

The Share-to-Story card designs (Glass, Brutalist, Postcard, Capsule, etc.)
live as plain data in **`src/lib/storyStylePresets.js`**, in the
`BODY_SHAPES` array. There are 30 today; this is how to add more — by hand,
or by handing the prompt below to any AI.

## Files to give the AI

Give it these two files as-is:

1. **`src/lib/storyStylePresets.js`** — so it can see the existing 30
   shapes' exact format and not repeat an `id`.
2. **`src/lib/storyImageGenerator.js`** — so it can see `drawBodyCard()`,
   `resolveFill()`, and `applyBorder()`, which is the full list of what a
   shape is actually allowed to use (see field reference below).

## The prompt

```
Here are storyStylePresets.js and storyImageGenerator.js from my app.

Add 10 new entries to the BODY_SHAPES array in storyStylePresets.js.
Each one needs a unique id (kebab-case, not already used), a short name,
and should look genuinely different from the existing 30 — a new
radius/fill/border/decoration combo, not just a recolor of one that
already exists.

Only use fill/border/decoration values that drawBodyCard, resolveFill,
and applyBorder in storyImageGenerator.js already handle (see the field
reference in docs/ADDING_STORY_SHAPES.md). If you want a decoration or
fill/border kind that doesn't exist yet, also give me the exact
drawBodyCard/applyBorder code to add for it, following the same pattern
as the existing ones (sideTab, cornerTag, dashed, split, etc.) — same
canvas primitives (roundedRectPath, ctx.save/restore, clip to the card's
own path before drawing anything that shouldn't spill past its corners).

Output only the new BODY_SHAPES array entries, plus any new
storyImageGenerator.js code required, each in its own code block.
```

## Field reference (what a shape object can contain)

```js
{
  id: 'kebab-case-id',       // required, unique
  name: 'Display Name',      // required, shown in the picker
  radius: 0-200,              // corner radius in px (200+ clamps to a true pill)
  fill: 'glass' | 'ink-2' | 'paper' | 'none' | 'gradient-header' | 'radial-glow' | 'split',
  border: 'none' | 'glass' | 'ember-thin' | 'ember-thick' | 'glow' | 'double' | 'dashed' | 'ink-thick' | 'paper-thick',
  shadow: true | false,       // drop shadow under the card
  darkText: true | false,     // ink-colored text instead of paper (use with light fills like 'paper')
  fontFamily: 'system' | 'serif' | 'mono',  // omit for system
  rotate: -6 to 6,             // optional slight tilt, in degrees
  // optional decoration flags — at most one or two per shape:
  stacked, ribbon, taped, blockHeader, textOnly, confetti,
  sideTab, underline, cornerTag, ringAccent,
}
```

`fill`/`border`/decoration values not in that list will silently do
nothing at render time (they're just ignored), so a shape using an unknown
value won't crash — it'll just render as a plain card, which is the signal
something needs adding to `storyImageGenerator.js` first.

## Where the result goes

Paste the new entries into `BODY_SHAPES` in `src/lib/storyStylePresets.js`
(anywhere in the array — order doesn't matter). If the AI also gave you
new `drawBodyCard`/`applyBorder`/`resolveFill` code, add that to
`src/lib/storyImageGenerator.js` in the matching `if (bodyPreset.xxx)` /
`if (borderKind === 'xxx')` chain, following the pattern of the existing
branches. That's it — no other file needs to change; `Size` (`BODY_SCALES`)
and the picker UI (`ShareStorySheet.jsx`) both already work with any number
of shapes automatically.
