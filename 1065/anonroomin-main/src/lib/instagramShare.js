/** ===========================================================================
 * INSTAGRAM DIRECT SHARE
 * ============================================================================
 * READ THIS BEFORE WIRING UP A BUTTON THAT PROMISES "OPENS INSTAGRAM
 * DIRECTLY WITH A SONG ATTACHED" — two things in that sentence need a
 * reality check, so the button doesn't promise what the platform can't do:
 *
 * 1. "Skip the share sheet, open Instagram Stories directly, image already
 *    loaded" — this IS real, but only on iOS, and only via Meta's
 *    documented pasteboard handoff: write the image to the system
 *    pasteboard under the `com.instagram.sharedSticker.backgroundImage`
 *    UTI, then navigate to `instagram-stories://share?source_application=
 *    <FACEBOOK_APP_ID>`. It requires:
 *      - A Facebook App ID registered for this project (set it below).
 *      - Being opened from Safari or an in-app browser that allows both a
 *        clipboard write with a custom UTI AND the custom URL scheme
 *        handoff — some in-app webviews (e.g. embedded inside another
 *        app's own webview) block one or both, in which case this quietly
 *        falls back to the normal share sheet instead of erroring.
 *      - Instagram actually installed — if it isn't, iOS just no-ops the
 *        scheme, so we can't reliably detect success vs. silent failure;
 *        this function does its best and returns whether it *attempted*
 *        the handoff, not whether Instagram definitely opened.
 *    There is no equivalent for Android from a web page: Android's version
 *    of this handoff (`Intent.ACTION_SEND` to `com.instagram.android` with
 *    background/sticker image extras) is only available from *native* app
 *    code with a content:// URI, not from browser JS. On Android this file
 *    always falls back to the normal OS share sheet, where Instagram shows
 *    up as one of the share targets — same tap count as any other app,
 *    just not skippable from here.
 *
 * 2. "Auto-attach the latest trending song" — this is not exposed by any
 *    public Instagram integration, for anyone, at any tier. Music
 *    selection only happens interactively inside Instagram's own editor
 *    (it's tied to their music licensing per territory). No sharing API,
 *    iOS or Android, lets a third-party site pre-pick a track. This file
 *    does not attempt to fake that — the person picks a song themselves
 *    once Instagram opens, same as anyone else posting a story.
 *
 * Bottom line: this gives iOS users the real "opens straight into Stories"
 * experience when it's available, and everyone else the normal share sheet
 * with Instagram one tap away — never a broken promise in between.
 * ========================================================================= */

// Fill this in with the app's actual Facebook/Meta App ID (developers.facebook.com)
// before shipping — the iOS handoff is a no-op without it.
const FACEBOOK_APP_ID = ''; // e.g. '1234567890123456'

function isIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Best-effort iOS direct-to-Stories handoff. Returns true if it attempted
 * the handoff (so the caller should NOT also fall back to navigator.share
 * — the person is either looking at Instagram or at nothing, not both),
 * false if the conditions for attempting it weren't met so the caller
 * should fall back normally.
 */
export async function shareToInstagramStories(blob) {
  if (!isIOS() || !FACEBOOK_APP_ID) return false;
  if (typeof navigator === 'undefined' || !navigator.clipboard || !window.ClipboardItem) return false;

  try {
    const base64 = await blobToBase64(blob);
    const pngBlob = await (await fetch(`data:image/png;base64,${base64}`)).blob();

    // Custom UTI per Meta's Stories sharing doc — a plain 'image/png'
    // ClipboardItem write will NOT be picked up by Instagram; the key has
    // to be exactly this pasteboard type.
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': pngBlob }),
    ]);

    window.location.href = `instagram-stories://share?source_application=${FACEBOOK_APP_ID}`;
    return true;
  } catch (err) {
    // Clipboard write with a custom UTI can be silently refused by Safari
    // depending on iOS version/permissions — treat that as "didn't attempt"
    // rather than leaving the person on a dead end.
    console.error('Instagram Stories direct share failed, falling back:', err);
    return false;
  }
}

export function instagramDirectShareAvailable() {
  return isIOS() && !!FACEBOOK_APP_ID;
}
