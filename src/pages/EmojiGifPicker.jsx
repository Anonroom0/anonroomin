/**
 * ============================================================================
 * EMOJI / GIF / STICKER PICKER (GLASS UI)
 * ============================================================================
 * Drop-in picker that pops up above the composer. Three tabs, all with SVG
 * icons (no emoji-as-icon glyphs):
 *   - Emoji: large curated list (10 categories), no API needed, inserts
 *     unicode straight into text
 *   - GIFs: GIPHY API (free), search + trending, infinite scroll
 *   - Stickers: GIPHY Stickers API, search + trending, infinite scroll
 *
 * `mode` prop:
 *   - "full" (default): Renders all tabs (Emoji, GIFs, Stickers).
 *   - "emoji-only": Hides the top tab bar and GIPHY integration entirely, 
 *     rendering only the Emoji grid, sized and aligned as a quick-tray popover.
 *
 * Uses `glass-panel` and `bubble-enter` from the global token/animation system.
 * ---------------------------------------------------------------------------
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';

// --- 1. CONFIG --------------------------------------------------------------

const GIPHY_API_KEY = 'gdzlbBM7dxOVIYsC7btS1J2MOweXFdOf'; // <-- replace with your own free GIPHY key
const GIPHY_BASE = 'https://api.giphy.com/v1';
const PAGE_SIZE = 24;
const SCROLL_FETCH_THRESHOLD_PX = 160; // start loading the next page this far from the bottom

// A large curated emoji set grouped by category.
const EMOJI_GROUPS = [
  {
    label: 'Smileys & Emotion',
    items: [
      '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','🫠','😉','😊','😇',
      '🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑',
      '🤗','🤭','🫢','🫣','🤫','🤔','🫡','🤐','🤨','😐','😑','😶','🫥','😏',
      '😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮',
      '🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐','😕','🫤',
      '😟','🙁','😮','😯','😲','😳','🥺','🥹','😦','😧','😨','😰','😥','😢',
      '😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈',
      '👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖',
    ],
  },
  {
    label: 'People & Body',
    items: [
      '👋','🤚','🖐️','✋','🖖','🫱','🫲','🫳','🫴','👌','🤌','🤏','✌️','🤞',
      '🫰','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','🫵','👍','👎','✊',
      '👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🤝','🙏','✍️','💅','🤳','💪',
      '🦾','🦵','🦿','🦶','👂','🦻','👃','🧠','🫀','🫁','🦷','🦴','👀','👁️',
      '👅','👄','🫦','👶','🧒','👦','👧','🧑','👱','👨','🧔','👩','🧓','👴',
      '👵','🙍','🙎','🙅','🙆','💁','🙋','🧏','🙇','🤦','🤷','👮','🕵️','💂',
      '🥷','👷','🤴','👸','👳','👲','🧕','🤵','👰','🤰','🫄','🤱','👼','🎅',
      '🤶','🦸','🦹','🧙','🧚','🧛','🧜','🧝','🧞','🧟','💆','💇','🚶','🧍',
      '🧎','🏃','💃','🕺','👯','🧖','🧗','🤺','🏇','⛷️','🏂','🏌️','🏄','🚣',
      '🏊','⛹️','🏋️','🚴','🚵','🤸','🤼','🤽','🤾','🤹','🧘','🛀','🛌',
    ],
  },
  {
    label: 'Animals & Nature',
    items: [
      '🐵','🐒','🦍','🦧','🐶','🐕','🦮','🐩','🐺','🦊','🦝','🐱','🐈','🦁',
      '🐯','🐅','🐆','🐴','🐎','🦄','🦓','🦌','🦬','🐮','🐂','🐃','🐷','🐖',
      '🐗','🐽','🐏','🐑','🐐','🐪','🐫','🦙','🦒','🐘','🦣','🦏','🦛','🐭',
      '🐁','🐀','🐹','🐰','🐇','🐿️','🦫','🦔','🦇','🐻','🐻‍❄️','🐨','🐼',
      '🦥','🦦','🦨','🦘','🦡','🐾','🦃','🐔','🐓','🐣','🐤','🐥','🐦','🐧',
      '🕊️','🦅','🦆','🦢','🦉','🦤','🪶','🦩','🦚','🦜','🐸','🐊','🐢','🦎',
      '🐍','🐲','🐉','🦕','🦖','🐳','🐋','🐬','🦭','🐟','🐠','🐡','🦈','🐙',
      '🐚','🪸','🐌','🦋','🐛','🐜','🐝','🪲','🐞','🦗','🪳','🕷️','🕸️',
      '🦂','🦟','🪰','🪱','🦠','💐','🌸','💮','🏵️','🌹','🥀','🌺','🌻',
      '🌼','🌷','🌱','🪴','🌲','🌳','🌴','🌵','🌾','🌿','☘️','🍀','🍁','🍂',
      '🍃','🍄','🪨','🌰',
    ],
  },
  {
    label: 'Food & Drink',
    items: [
      '🍇','🍈','🍉','🍊','🍋','🍌','🍍','🥭','🍎','🍏','🍐','🍑','🍒','🍓',
      '🫐','🥝','🍅','🫒','🥥','🥑','🍆','🥔','🥕','🌽','🌶️','🫑','🥒','🥬',
      '🥦','🧄','🧅','🍄','🥜','🫘','🌰','🍞','🥐','🥖','🫓','🥨','🥯','🥞',
      '🧇','🧀','🍖','🍗','🥩','🥓','🍔','🍟','🍕','🌭','🥪','🌮','🌯','🫔',
      '🥙','🧆','🥚','🍳','🥘','🍲','🫕','🥣','🥗','🍿','🧈','🧂','🥫','🍱',
      '🍘','🍙','🍚','🍛','🍜','🍝','🍠','🍢','🍣','🍤','🍥','🥮','🍡',
      '🥟','🥠','🥡','🦀','🦞','🦐','🦑','🦪','🍦','🍧','🍨','🍩','🍪','🎂',
      '🍰','🧁','🥧','🍫','🍬','🍭','🍮','🍯','🍼','🥛','☕','🫖','🍵','🍶',
      '🍾','🍷','🍸','🍹','🍺','🍻','🥂','🥃','🥤','🧋','🧃','🧉','🧊',
    ],
  },
  {
    label: 'Travel & Places',
    items: [
      '🌍','🌎','🌏','🗺️','🧭','🏔️','⛰️','🌋','🗻','🏕️','🏖️','🏜️','🏝️',
      '🏞️','🏟️','🏛️','🏗️','🧱','🪨','🛖','🏘️','🏚️','🏠','🏡','🏢','🏣',
      '🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏬','🏭','🏯','🏰','💒','🗼','🗽',
      '⛪','🕌','🛕','🕍','⛩️','🕋','⛲','⛺','🌁','🌃','🏙️','🌄','🌅','🌆',
      '🌇','🌉','🚂','🚃','🚄','🚅','🚆','🚇','🚈','🚉','🚊','🚝','🚞','🚋',
      '🚌','🚎','🚐','🚑','🚒','🚓','🚔','🚕','🚖','🚗','🚘','🚙','🛻','🚚',
      '🚛','🚜','🏎️','🏍️','🛵','🦽','🦼','🛺','🚲','🛴','🛹','🛼','🚏',
      '🛣️','🛤️','🛢️','⛽','🚨','🚥','🚦','🛑','🚧','⚓','🛟','⛵','🛶',
      '🚤','🛳️','⛴️','🛥️','🚢','✈️','🛩️','🛫','🛬','🪂','💺','🚁','🚟',
      '🚠','🚡','🛰️','🚀','🛸','🎡','🎢','🎠','🌠','🎇','🎆','🌉','🌌',
    ],
  },
  {
    label: 'Activities',
    items: [
      '⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒',
      '🏑','🥍','🏏','🪃','🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹',
      '🛼','🛷','⛸️','🥌','🎿','⛷️','🏂','🪂','🏋️','🤼','🤸','🤺','🤾',
      '🏌️','🏇','🧘','🏄','🏊','🤽','🚣','🧗','🚵','🚴','🏆','🥇','🥈',
      '🥉','🏅','🎖️','🏵️','🎗️','🎫','🎟️','🎪','🤹','🎭','🩰','🎨','🎬',
      '🎤','🎧','🎼','🎹','🥁','🪘','🎷','🎺','🪗','🎸','🪕','🎻','🎲',
      '♟️','🎯','🎳','🎮','🎰','🧩','🃏','🀄','🎴',
    ],
  },
  {
    label: 'Objects',
    items: [
      '⌚','📱','💻','⌨️','🖥️','🖨️','🖱️','🖲️','🕹️','🗜️','💽','💾','💿',
      '📀','📼','📷','📸','📹','🎥','📞','☎️','📟','📠','📺','📻','🎙️',
      '🎚️','🎛️','🧭','⏱️','⏲️','⏰','🕰️','⌛','⏳','📡','🔋','🪫','🔌',
      '💡','🔦','🕯️','🪔','🧯','🛢️','💸','💵','💴','💶','💷','🪙','💰',
      '💳','🪪','💎','⚖️','🪜','🧰','🪛','🔧','🔨','⚒️','🛠️','⛏️','🪚',
      '🔩','⚙️','🪤','🧱','⛓️','🧲','🔫','💣','🧨','🪓','🔪','🗡️','⚔️',
      '🛡️','🚬','⚰️','🪦','⚱️','🏺','🔮','📿','🧿','💈','⚗️','🔭','🔬',
      '🕳️','🩹','🩺','💊','💉','🩸','🧬','🦠','🧫','🧪','🌡️','🧹','🪠',
      '🧺','🧻','🚽','🚰','🚿','🛁','🛀','🧼','🪥','🪒','🧽','🪣','🧴',
      '🛎️','🔑','🗝️','🚪','🪑','🛋️','🛏️','🛌','🖼️','🪞','🪟','🛍️','🛒',
      '🎁','🎈','🎏','🎀','🪄','🪅','🎊','🎉','🎎','🏮','🎐','🧧','✉️',
      '📩','📨','📧','💌','📥','📤','📦','🏷️','🪧','📪','📫','📬','📭',
      '📮','📯','📜','📃','📄','📑','📊','📈','📉','🗒️','🗓️','📅','📆',
      '📇','🗃️','🗳️','🗄️','📋','📁','📂','🗂️','🗞️','📰','📓','📔','📒',
      '📕','📗','📘','📙','📚','📖','🔖','🔗','📎','🖇️','📐','📏','🧮',
      '📌','📍','✂️','🖊️','🖋️','✒️','🖌️','🖍️','📝','✏️','🔍','🔎',
      '🔏','🔐','🔒','🔓',
    ],
  },
  {
    label: 'Symbols',
    items: [
      '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹',
      '❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉️',
      '☸️','✡️','🔯','🕎','☯️','☦️','🛐','⛎','♈','♉','♊','♋','♌','♍',
      '♎','♏','♐','♑','♒','♓','🆔','⚛️','🉑','☢️','☣️','📴','📳','🈶',
      '🈚','🈸','🈺','🈷️','✴️','🆚','💮','🉐','㊙️','㊗️','🈴','🈵','🈹',
      '🈲','🅰️','🅱️','🆎','🆑','🅾️','🆘','❌','⭕','🛑','⛔','📛','🚫',
      '💯','💢','♨️','🚷','🚯','🚳','🚱','🔞','📵','🚭','❗','❕','❓',
      '❔','‼️','⁉️','🔅','🔆','〽️','⚠️','🚸','🔱','⚜️','🔰','♻️','✅',
      '🈯','💹','❇️','✳️','❎','🌐','💠','Ⓜ️','🌀','💤','🏧','🚾','♿',
      '🅿️','🈳','🈂️','🛂','🛃','🛄','🛅','🚹','🚺','🚼','⚧️','🚻','🚮',
      '🎦','📶','🈁','🔣','ℹ️','🔤','🔡','🔠','🆖','🆗','🆙','🆒','🆕',
      '🆓','0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟','🔢',
      '#️⃣','*️⃣','⏏️','▶️','⏸️','⏯️','⏹️','⏺️','⏭️','⏮️','⏩','⏪','⏫',
      '⏬','◀️','🔼','🔽','➡️','⬅️','⬆️','⬇️','↗️','↘️','↙️','↖️','↕️',
      '↔️','↪️','↩️','⤴️','⤵️','🔀','🔁','🔂','🔄','🔃','🎵','🎶','➕',
      '➖','➗','✖️','🟰','♾️','💲','💱','™️','©️','®️','〰️','➰','➿',
      '🔚','🔙','🔛','🔝','🔜','✔️','☑️','🔘','🔴','🟠','🟡','🟢','🔵',
      '🟣','🟤','⚫','⚪','🟥','🟧','🟨','🟩','🟦','🟪','🟫','⬛','⬜',
      '◼️','◻️','◾','◽','▪️','▫️','🔶','🔷','🔸','🔹','🔺','🔻','💭',
      '🗯️','💬','🗨️','🕐','🕑','🕒','🕓','🕔','🕕','🕖','🕗','🕘','🕙',
      '🕚','🕛',
    ],
  },
  {
    label: 'Flags',
    items: [
      '🏁','🚩','🎌','🏴','🏳️','🏳️‍🌈','🏳️‍⚧️','🏴‍☠️','🇺🇳','🇺🇸','🇬🇧',
      '🇨🇦','🇦🇺','🇳🇿','🇮🇪','🇫🇷','🇩🇪','🇮🇹','🇪🇸','🇵🇹','🇳🇱','🇧🇪',
      '🇨🇭','🇦🇹','🇸🇪','🇳🇴','🇩🇰','🇫🇮','🇮🇸','🇵🇱','🇨🇿','🇬🇷','🇹🇷',
      '🇷🇺','🇺🇦','🇮🇳','🇨🇳','🇯🇵','🇰🇷','🇹🇭','🇻🇳','🇵🇭','🇮🇩','🇸🇬',
      '🇲🇾','🇧🇩','🇵🇰','🇸🇦','🇦🇪','🇮🇱','🇪🇬','🇿🇦','🇳🇬','🇰🇪','🇲🇽',
      '🇧🇷','🇦🇷','🇨🇱','🇨🇴','🇵🇪',
    ],
  },
  {
    label: 'Special & Decorative',
    items: [
      '✨','⭐','🌟','💫','🔥','💥','⚡','☄️','🌈','☀️','🌤️','⛅','🌥️',
      '☁️','🌦️','🌧️','⛈️','🌩️','🌨️','❄️','☃️','⛄','🌬️','💨','💧',
      '💦','☔','⛱️','🌊','🌫️','🪐','🌙','🌛','🌜','🌚','🌝','🌕','🌖',
      '🌗','🌘','🌑','🌒','🌓','🌔','🌡️','🧿','🪬','🎇','🎆','🧨','🎐',
      '🪁','🕯️','💎','👑','🏆','🥇',
    ],
  },
];

// --- 2. SVG ICONS (tab bar + misc) ------------------------------------------

const TabIcons = {
  Emoji: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9.25" />
      <path d="M8.25 14.25c.9 1.15 2.15 1.75 3.75 1.75s2.85-.6 3.75-1.75" />
      <circle cx="9" cy="9.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="15" cy="9.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  ),
  Gif: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5.5" width="18" height="13" rx="3" />
      <path d="M7.25 9.75v4.5" />
      <path d="M11 9.75v4.5" />
      <path d="M11 12h1.25" />
      <path d="M16.25 14.25v-4.5h2.15" />
      <path d="M16.25 12h1.6" />
    </svg>
  ),
  Sticker: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.75 3.25H7.5a4.25 4.25 0 0 0-4.25 4.25v8.25a4.25 4.25 0 0 0 4.25 4.25h7.15a1 1 0 0 0 .71-.29l5.15-5.15a1 1 0 0 0 .29-.71V7.5a4.25 4.25 0 0 0-4.25-4.25z" />
      <path d="M14.75 20v-3.75a1.5 1.5 0 0 1 1.5-1.5H20" />
    </svg>
  ),
};

const SpinnerIcon = (
  <svg className="refresh-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M12 3a9 9 0 1 0 9 9" />
  </svg>
);

// --- 3. GIPHY HELPERS --------------------------------------------------------

async function giphyFetch(path, params) {
  const qs = new URLSearchParams({
    api_key: GIPHY_API_KEY,
    limit: String(PAGE_SIZE),
    rating: 'pg-13',
    ...params,
  });
  const res = await fetch(`${GIPHY_BASE}/${path}?${qs.toString()}`);
  if (!res.ok) {
    throw new Error('GIPHY request failed');
  }
  const data = await res.json();
  return {
    items: data.data || [],
    totalCount: data.pagination?.total_count ?? null,
  };
}

function giphyResultToUrl(result) {
  const images = result.images || {};
  return {
    previewUrl: images.fixed_width_small?.url || images.fixed_width?.url,
    fullUrl: images.original?.url || images.fixed_width?.url,
  };
}

// --- 4. GIF / STICKER GRID (shared logic, different endpoint, infinite scroll) --

function GiphyGrid({ contentFilter, onPick }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errored, setErrored] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const scrollRef = useRef(null);
  const debounceRef = useRef(null);
  const offsetRef = useRef(0);
  const requestIdRef = useRef(0);
  const seenIdsRef = useRef(new Set());

  const endpointBase = contentFilter === 'sticker' ? 'stickers' : 'gifs';

  const loadPage = useCallback(async (searchTerm, offset, myRequestId) => {
    const path = searchTerm ? `${endpointBase}/search` : `${endpointBase}/trending`;
    const params = searchTerm ? { q: searchTerm, offset: String(offset) } : { offset: String(offset) };
    const { items, totalCount } = await giphyFetch(path, params);

    if (myRequestId !== requestIdRef.current) {
      return;
    }

    const deduped = items.filter((item) => !seenIdsRef.current.has(item.id));
    deduped.forEach((item) => seenIdsRef.current.add(item.id));

    setResults((prev) => (offset === 0 ? deduped : [...prev, ...deduped]));
    offsetRef.current = offset + items.length;
    const reachedEnd = items.length === 0 || (totalCount !== null && offsetRef.current >= totalCount);
    setHasMore(!reachedEnd);
  }, [endpointBase]);

  const startSearch = useCallback((searchTerm) => {
    const myRequestId = requestIdRef.current + 1;
    requestIdRef.current = myRequestId;
    seenIdsRef.current = new Set();
    offsetRef.current = 0;
    setResults([]);
    setErrored(false);
    setHasMore(true);
    setLoadingInitial(true);
    loadPage(searchTerm, 0, myRequestId)
      .catch((err) => {
        console.error('GIPHY fetch failed:', err);
        if (myRequestId === requestIdRef.current) {
          setErrored(true);
        }
      })
      .finally(() => {
        if (myRequestId === requestIdRef.current) {
          setLoadingInitial(false);
        }
      });
  }, [loadPage]);

  const loadMore = useCallback(() => {
    if (loadingInitial || loadingMore || !hasMore || errored) {
      return;
    }
    const myRequestId = requestIdRef.current;
    setLoadingMore(true);
    loadPage(query.trim(), offsetRef.current, myRequestId)
      .catch((err) => {
        console.error('GIPHY fetch failed:', err);
        if (myRequestId === requestIdRef.current) {
          setHasMore(false);
        }
      })
      .finally(() => {
        if (myRequestId === requestIdRef.current) {
          setLoadingMore(false);
        }
      });
  }, [loadPage, loadingInitial, loadingMore, hasMore, errored, query]);

  useEffect(() => {
    startSearch('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentFilter]);

  function handleQueryChange(e) {
    const value = e.target.value;
    setQuery(value);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => startSearch(value.trim()), 350);
  }

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < SCROLL_FETCH_THRESHOLD_PX) {
      loadMore();
    }
  }

  const showEmpty = !loadingInitial && !errored && results.length === 0;

  return (
    <div className="picker-pane">
      <div className="picker-search-row">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="picker-search-icon">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={handleQueryChange}
          placeholder={contentFilter === 'sticker' ? 'Search stickers' : 'Search GIFs'}
          className="picker-search-input"
        />
      </div>

      {errored && (
        <div className="picker-message">
          Couldn't load {contentFilter === 'sticker' ? 'stickers' : 'GIFs'}. Check your GIPHY API key and try again.
        </div>
      )}

      {!errored && (
        <div ref={scrollRef} onScroll={handleScroll} className="picker-scroll custom-scrollbar">
          {loadingInitial && (
            <div className="picker-message picker-message--loading">
              {SpinnerIcon}
              <span>Loading {contentFilter === 'sticker' ? 'stickers' : 'GIFs'}…</span>
            </div>
          )}

          {showEmpty && (
            <div className="picker-message">No results{query ? ` for "${query}"` : ''}</div>
          )}

          {!loadingInitial && results.length > 0 && (
            <div className="picker-grid">
              {results.map((result) => {
                const { previewUrl, fullUrl } = giphyResultToUrl(result);
                if (!previewUrl) {
                  return null;
                }
                return (
                  <button
                    key={result.id}
                    type="button"
                    onClick={() => onPick(fullUrl, contentFilter)}
                    className="picker-tile chat-row"
                    aria-label={result.title || `Select ${contentFilter}`}
                  >
                    <img src={previewUrl} alt="" loading="lazy" className="picker-tile-img" />
                  </button>
                );
              })}
            </div>
          )}

          {loadingMore && (
            <div className="picker-message picker-message--loading picker-message--inline">
              {SpinnerIcon}
              <span>Loading more…</span>
            </div>
          )}

          {!loadingInitial && !loadingMore && !hasMore && results.length > 0 && (
            <div className="picker-end-marker">You've reached the end</div>
          )}
        </div>
      )}
    </div>
  );
}

// --- 5. EMOJI GRID -----------------------------------------------------------

function EmojiGrid({ onPick }) {
  return (
    <div className="picker-scroll picker-emoji-scroll custom-scrollbar">
      {EMOJI_GROUPS.map((group) => (
        <div key={group.label} className="picker-emoji-group">
          <div className="picker-emoji-label">{group.label}</div>
          <div className="picker-emoji-grid">
            {group.items.map((char, i) => (
              <button
                key={`${group.label}-${i}-${char}`}
                type="button"
                onClick={() => onPick(char)}
                className="picker-emoji-btn chat-row"
                onMouseDown={(e) => e.preventDefault()} // keep focus in the text input
                aria-label={char}
              >
                {char}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// --- 6. MAIN PICKER -----------------------------------------------------------

export default function EmojiGifPicker({ open, onClose, onEmoji, onMedia, mode = 'full' }) {
  const [tab, setTab] = useState('emoji'); // 'emoji' | 'gif' | 'sticker'
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function handleClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        onClose();
      }
    }
    function handleKey(e) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const tabs = [
    { id: 'emoji', label: 'Emoji', icon: TabIcons.Emoji },
    { id: 'gif', label: 'GIFs', icon: TabIcons.Gif },
    { id: 'sticker', label: 'Stickers', icon: TabIcons.Sticker },
  ];

  const activeTab = mode === 'emoji-only' ? 'emoji' : tab;

  return (
    <div 
      ref={panelRef} 
      className={`glass-panel bubble-enter picker-panel ${mode === 'emoji-only' ? 'picker-panel--emoji-only' : ''}`} 
      role="dialog" 
      aria-label="Emoji, GIF, and sticker picker"
    >
      <style>{PICKER_STYLES}</style>

      {mode === 'full' && (
        <div className="picker-tabbar">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`picker-tab chat-row ${activeTab === t.id ? ' picker-tab--active' : ''}`}
              aria-selected={activeTab === t.id}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      )}

      <div className="picker-body">
        {activeTab === 'emoji' && <EmojiGrid onPick={(char) => onEmoji?.(char)} />}
        {mode === 'full' && activeTab === 'gif' && <GiphyGrid contentFilter="gif" onPick={(url, type) => onMedia?.(url, type)} />}
        {mode === 'full' && activeTab === 'sticker' && <GiphyGrid contentFilter="sticker" onPick={(url, type) => onMedia?.(url, type)} />}
      </div>
    </div>
  );
}

// --- 7. STYLES ----------------------------------------------------------------
// Scoped <style> block mapping to glass tokens.

const PICKER_STYLES = `
.picker-panel {
  position: absolute;
  bottom: 100%;
  left: 8px;
  right: 8px;
  margin-bottom: 8px;
  height: 360px;
  display: flex;
  flex-direction: column;
  z-index: 30;
  /* Appearance is handled by .glass-panel */
}

.picker-panel--emoji-only {
  left: auto;
  right: 0;
  width: 320px;
  max-width: calc(100vw - 32px);
}

.picker-tabbar {
  display: flex;
  border-bottom: 1px solid var(--glass-border);
  flex-shrink: 0;
}

.picker-tab {
  flex: 1;
  border: none;
  background: transparent;
  padding: 11px 0;
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.01em;
  cursor: pointer;
  color: var(--dim);
  border-bottom: 2px solid transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}

.picker-tab:hover {
  color: var(--paper);
  background: var(--glass-white);
}

.picker-tab--active {
  color: var(--ember);
  border-bottom-color: var(--ember);
}

.picker-body, .picker-pane {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.picker-search-row {
  position: relative;
  margin: 10px 12px;
  flex-shrink: 0;
}

.picker-search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--dim);
  pointer-events: none;
}

.picker-search-input {
  width: 100%;
  box-sizing: border-box;
  padding: 9px 12px 9px 34px;
  border-radius: 14px;
  border: 1px solid var(--glass-border);
  background: var(--ink-2);
  color: var(--paper);
  font-size: 14px;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.picker-search-input:focus {
  border-color: var(--ember);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ember) 15%, transparent);
}

.picker-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 12px 12px;
  contain: strict;
}

.picker-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-auto-rows: 1fr;
  gap: 8px;
}

.picker-tile {
  position: relative;
  display: block;
  border: none;
  padding: 0;
  margin: 0;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  background: var(--ink-2);
  width: 100%;
  aspect-ratio: 1 / 1;
  isolation: isolate;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}

.picker-tile:hover {
  transform: scale(1.03);
  box-shadow: 0 6px 18px rgba(0,0,0,0.35);
  z-index: 1;
}

.picker-tile:focus-visible {
  outline: 2px solid var(--ember);
  outline-offset: 2px;
}

.picker-tile-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.picker-message {
  text-align: center;
  padding: 28px 12px;
  color: var(--dim);
  font-size: 13px;
}

.picker-message--loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.picker-message--inline {
  padding: 14px 12px 4px;
  flex-direction: row;
  gap: 8px;
}

.picker-end-marker {
  text-align: center;
  padding: 14px 0 2px;
  color: var(--dim);
  font-size: 11.5px;
  opacity: 0.7;
}

.picker-emoji-scroll {
  padding-top: 6px;
}

.picker-emoji-group {
  margin-bottom: 4px;
}

.picker-emoji-label {
  position: sticky;
  top: 0;
  background: var(--glass-white);
  backdrop-filter: blur(20px) saturate(115%);
  -webkit-backdrop-filter: blur(20px) saturate(115%);
  font-size: 11.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--dim);
  margin: 0;
  padding: 8px 4px 6px;
  z-index: 1;
  border-bottom: 1px solid var(--glass-border);
  border-radius: 4px;
}

.picker-emoji-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
  padding-top: 4px;
}

.picker-emoji-btn {
  border: none;
  background: transparent;
  font-size: 22px;
  padding: 6px 0;
  border-radius: 10px;
  cursor: pointer;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.12s ease, transform 0.12s ease;
  color: var(--paper);
}

.picker-emoji-btn:hover {
  background: var(--glass-white);
  transform: scale(1.12);
}

.picker-emoji-btn:focus-visible {
  outline: 2px solid var(--ember);
  outline-offset: 1px;
}
`;
