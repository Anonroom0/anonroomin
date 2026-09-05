// ============================================================================
// bot-engine (v2)
// ============================================================================
// Powers admin-configured chat bots — see 0006_bots_rewrite.sql, AdminPanel's
// Bots tab, and public/replies/FORMAT.md. No AI/generation: every reply is a
// line picked from static "keyword : reply" files the admin maintains under
// public/replies/<behavior>/{male,female}.txt.
//
// Two entry points, both POSTed to by Postgres triggers/cron (see the
// migration):
//   POST /bot-engine/reactive  { message_id, channel_type: 'group'|'dm', channel_id }
//     -> after any real (non-bot) message. Every active bot attached to that
//        channel (via bot_groups for a group, or dm_threads.bot_id for a DM)
//        is checked: was it @mentioned, was the message a reply to one of
//        its own messages, or does the text match one of its behaviors'
//        keyword:reply lines? The single BEST-ranked keyword match wins
//        (longest/most specific keyword); mention/reply-to with no keyword
//        match falls back to a random line so the bot never goes silent
//        when directly addressed.
//   POST /bot-engine/tick      {}
//     -> called every minute by pg_cron. Self-chat bots post on their own
//        once their randomized interval has elapsed.
//
// "Realism" touches: a bot never repeats its immediately-previous line, and
// posts after a short simulated typing delay (proportional to reply length)
// with a realtime "typing" broadcast beforehand, instead of replying
// instantly. Bots are otherwise indistinguishable from a normal user's
// message in the UI — no bot tag is rendered client-side.
//
// SITE_URL must be set as a function secret (the deployed site's origin,
// e.g. https://anonroom.in) so this can fetch the .txt reply-pack files
// from the live public/ folder — they are NOT bundled into this function.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SITE_URL = (Deno.env.get('SITE_URL') || 'https://anonroom.in').replace(/\/$/, '');

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ---------------------------------------------------------------------------
// Reply-pack loading & parsing
// ---------------------------------------------------------------------------
// File format (public/replies/<behavior>/male.txt or female.txt):
//   keyword1, keyword2 : reply text goes here
//   another keyword : a different reply
//   * : a fallback / self-chat-only line with no trigger keyword
// Blank lines and lines starting with # are ignored. Split on the FIRST
// colon only, so a reply is free to contain further colons.

type ReplyLine = { keywords: string[]; reply: string };
type BehaviorPack = { male: ReplyLine[]; female: ReplyLine[] };

const packCache = new Map<string, { pack: BehaviorPack; at: number }>();
const CACHE_TTL_MS = 60_000;

function parseReplyFile(text: string): ReplyLine[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'))
    .map((line) => {
      const idx = line.indexOf(':');
      if (idx === -1) return null; // malformed line, no colon — skip it
      const kwPart = line.slice(0, idx).trim().toLowerCase();
      const reply = line.slice(idx + 1).trim();
      if (!reply) return null;
      const keywords = kwPart === '*' || kwPart === ''
        ? []
        : kwPart.split(',').map((k) => k.trim()).filter(Boolean);
      return { keywords, reply };
    })
    .filter((l): l is ReplyLine => l !== null);
}

async function fetchTextFile(path: string): Promise<string> {
  try {
    const res = await fetch(`${SITE_URL}${path}`);
    if (!res.ok) return '';
    return await res.text();
  } catch {
    return '';
  }
}

async function loadBehaviorPack(behavior: string): Promise<BehaviorPack> {
  const cached = packCache.get(behavior);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.pack;

  const [maleText, femaleText] = await Promise.all([
    fetchTextFile(`/replies/${behavior}/male.txt`),
    fetchTextFile(`/replies/${behavior}/female.txt`),
  ]);
  const pack: BehaviorPack = { male: parseReplyFile(maleText), female: parseReplyFile(femaleText) };
  packCache.set(behavior, { pack, at: Date.now() });
  return pack;
}

function pickRandom<T>(arr: T[]): T | null {
  if (!arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

// Word-boundary aware substring match, so "hi" doesn't fire on "this".
// Falls back to plain substring for multi-word phrases (spaces already act
// as natural boundaries there).
function keywordMatches(keyword: string, lowerText: string): boolean {
  if (!keyword) return false;
  if (keyword.includes(' ')) return lowerText.includes(keyword);
  const re = new RegExp(`(^|[^a-z0-9])${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`, 'i');
  return re.test(` ${lowerText} `);
}

// Ranks every candidate line across all of a bot's selected behaviors
// against the incoming message text. Score = length of the single longest
// matching keyword (more specific/longer phrases outrank generic ones).
// Wildcard ('*') lines never match here — they're self-chat/fallback only.
async function rankBestReply(
  behaviors: string[],
  gender: 'male' | 'female',
  messageText: string
): Promise<{ reply: string; score: number } | null> {
  const lower = (messageText || '').toLowerCase();
  if (!lower) return null;

  let best: { reply: string; score: number } | null = null;
  for (const behavior of behaviors) {
    const pack = await loadBehaviorPack(behavior);
    const lines = gender === 'female' ? pack.female : pack.male;
    for (const line of lines) {
      for (const kw of line.keywords) {
        if (keywordMatches(kw, lower)) {
          const score = kw.length;
          if (!best || score > best.score) best = { reply: line.reply, score };
        }
      }
    }
  }
  return best;
}

// Any line (including wildcard '*' ones) from any of the bot's behaviors,
// picked uniformly at random — used for self-chat and for mention/reply-to
// triggers that didn't also match a keyword. Avoids immediately repeating
// the bot's last line when an alternative exists.
async function pickFallbackReply(behaviors: string[], gender: 'male' | 'female', avoid?: string | null): Promise<string | null> {
  const all: string[] = [];
  for (const behavior of behaviors) {
    const pack = await loadBehaviorPack(behavior);
    const lines = gender === 'female' ? pack.female : pack.male;
    const fromThisGender = lines.map((l) => l.reply);
    const otherLines = gender === 'female' ? pack.male : pack.female;
    all.push(...fromThisGender, ...(fromThisGender.length ? [] : otherLines.map((l) => l.reply)));
  }
  if (!all.length) return null;
  const pool = avoid ? all.filter((r) => r !== avoid) : all;
  return pickRandom(pool.length ? pool : all);
}

// ---------------------------------------------------------------------------
// Realism: simulated typing delay + broadcast
// ---------------------------------------------------------------------------

function typingDelayMs(text: string): number {
  const base = 700 + Math.random() * 600;
  const perChar = 35 + Math.random() * 15;
  return Math.min(base + text.length * perChar, 6000);
}

async function broadcastTyping(channelTopic: string, name: string) {
  try {
    const channel = supabase.channel(channelTopic);
    await channel.subscribe();
    await channel.send({ type: 'broadcast', event: 'typing', payload: { name } });
    setTimeout(() => supabase.removeChannel(channel), 8000);
  } catch {
    // Non-critical — a missed typing indicator shouldn't block the reply.
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Posting
// ---------------------------------------------------------------------------

async function postBotMessage(
  bot: any,
  channelType: 'group' | 'dm',
  channelId: string,
  text: string,
  replyToId: string | null
) {
  const topic = channelType === 'group' ? `group_messages:${channelId}` : `dm_messages:${channelId}`;
  await broadcastTyping(topic, bot.name);
  await sleep(typingDelayMs(text));

  if (channelType === 'group') {
    await supabase.from('group_messages').insert({
      group_id: channelId,
      user_id: null,
      sender_name: bot.name,
      text,
      reply_to_id: replyToId,
      is_bot: true,
      bot_id: bot.id,
      bot_avatar_url: bot.avatar_url,
    });
  } else {
    await supabase.from('dm_messages').insert({
      thread_id: channelId,
      sender_id: null,
      text,
      reply_to_id: replyToId,
      is_anon: false,
      is_bot: true,
      bot_id: bot.id,
      bot_avatar_url: bot.avatar_url,
    });
  }

  await supabase.from('bots').update({ last_posted_at: new Date().toISOString(), last_reply_text: text }).eq('id', bot.id);
}

// ---------------------------------------------------------------------------
// /reactive
// ---------------------------------------------------------------------------

async function getActiveBotsForChannel(channelType: 'group' | 'dm', channelId: string): Promise<any[]> {
  if (channelType === 'group') {
    const { data: links } = await supabase.from('bot_groups').select('bot_id').eq('group_id', channelId);
    const botIds = (links || []).map((l) => l.bot_id);
    if (!botIds.length) return [];
    const { data: bots } = await supabase.from('bots').select('*').in('id', botIds).eq('active', true);
    return bots || [];
  }

  const { data: thread } = await supabase.from('dm_threads').select('bot_id').eq('id', channelId).maybeSingle();
  if (!thread?.bot_id) return [];
  const { data: bot } = await supabase.from('bots').select('*').eq('id', thread.bot_id).eq('active', true).eq('dm_enabled', true).maybeSingle();
  return bot ? [bot] : [];
}

async function handleReactive(body: { message_id: string; channel_type: 'group' | 'dm'; channel_id: string }) {
  const { message_id, channel_type, channel_id } = body;
  const table = channel_type === 'group' ? 'group_messages' : 'dm_messages';

  const { data: message } = await supabase.from(table).select('*').eq('id', message_id).maybeSingle();
  if (!message) return;

  const bots = await getActiveBotsForChannel(channel_type, channel_id);
  if (!bots.length) return;

  let repliedBotId: string | null = null;
  if (message.reply_to_id) {
    const { data: parent } = await supabase.from(table).select('bot_id').eq('id', message.reply_to_id).maybeSingle();
    repliedBotId = parent?.bot_id ?? null;
  }

  const text = message.text || '';
  const lowerText = text.toLowerCase();

  for (const bot of bots) {
    const wasRepliedTo = repliedBotId === bot.id;
    const wasMentioned = lowerText.includes(`@${bot.name.toLowerCase()}`);
    const behaviors = bot.behaviors || [];
    if (!behaviors.length) continue;

    const ranked = await rankBestReply(behaviors, bot.gender, text);

    let reply: string | null = null;
    if (ranked) {
      reply = ranked.reply;
    } else if (wasMentioned || wasRepliedTo) {
      reply = await pickFallbackReply(behaviors, bot.gender, bot.last_reply_text);
    }
    if (!reply) continue;

    await postBotMessage(bot, channel_type, channel_id, reply, wasRepliedTo || wasMentioned ? message.id : null);
  }
}

// ---------------------------------------------------------------------------
// /tick  (self-chat, group-only)
// ---------------------------------------------------------------------------

async function handleTick() {
  const { data: bots } = await supabase.from('bots').select('*').eq('mode', 'self_chat').eq('active', true);
  if (!bots?.length) return;

  const now = Date.now();

  for (const bot of bots) {
    const lastAt = bot.last_posted_at ? new Date(bot.last_posted_at).getTime() : 0;
    const dueInMs =
      (Math.floor(Math.random() * (bot.max_interval_seconds - bot.min_interval_seconds + 1)) + bot.min_interval_seconds) * 1000;
    if (now - lastAt < dueInMs) continue;

    const { data: groupLinks } = await supabase.from('bot_groups').select('group_id').eq('bot_id', bot.id);
    const groupIds = (groupLinks || []).map((g) => g.group_id);
    if (!groupIds.length) continue;
    const groupId = pickRandom(groupIds);
    if (!groupId) continue;

    const behaviors = bot.behaviors || [];
    if (!behaviors.length) continue;

    if (bot.self_chat_style === 'bots_only') {
      const { data: sameGroupLinks } = await supabase.from('bot_groups').select('bot_id').eq('group_id', groupId);
      const candidateIds = (sameGroupLinks || []).map((l) => l.bot_id).filter((id) => id !== bot.id);
      let partner: { id: string } | null = null;
      if (candidateIds.length) {
        const { data: partners } = await supabase.from('bots').select('id').in('id', candidateIds).eq('mode', 'self_chat').eq('active', true);
        partner = pickRandom(partners || []);
      }

      const reply = await pickFallbackReply(behaviors, bot.gender, bot.last_reply_text);
      if (!reply) continue;

      let replyToId: string | null = null;
      if (partner) {
        const { data: lastMsg } = await supabase
          .from('group_messages')
          .select('id')
          .eq('group_id', groupId)
          .eq('bot_id', partner.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        replyToId = lastMsg?.id ?? null;
      }

      await postBotMessage(bot, 'group', groupId, reply, replyToId);
    } else {
      const reply = await pickFallbackReply(behaviors, bot.gender, bot.last_reply_text);
      if (!reply) continue;
      await postBotMessage(bot, 'group', groupId, reply, null);
    }
  }
}

// ---------------------------------------------------------------------------
// HTTP entry point
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const action = url.pathname.split('/').filter(Boolean).pop(); // 'reactive' | 'tick'
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};

    if (action === 'reactive') {
      await handleReactive(body);
    } else if (action === 'tick') {
      await handleTick();
    } else {
      return new Response(JSON.stringify({ error: 'unknown action' }), { status: 404 });
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('bot-engine error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
