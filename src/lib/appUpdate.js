/**
 * In-app self-update flow for the Capacitor Android build.
 *
 * Previously "Download updated version" just did `window.open(apkUrl)`,
 * which handed the URL to the system browser (Chrome) — the user left
 * the app, downloaded the APK there, then had to dig it out of their
 * Downloads app to install it.
 *
 * This instead downloads the APK to the app's own cache directory
 * (with progress) using @capacitor/filesystem, then hands the local
 * file straight to the system package installer via
 * @capacitor-community/file-opener — no browser tab ever opens. The
 * final "Install" confirmation screen is shown by Android itself (it's
 * required for any APK not installed through the Play Store) and is
 * expected; it is not the app leaving to Chrome.
 */

import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileOpener } from '@capacitor-community/file-opener';
import { Capacitor } from '@capacitor/core';

const APK_FILENAME = 'anonroom-update.apk';

/**
 * @param {string} apkUrl
 * @param {{ onProgress?: (fraction: number) => void }} [options]
 */
export async function downloadAndInstallUpdate(apkUrl, { onProgress } = {}) {
  if (!apkUrl) throw new Error('No download URL for the update.');

  // Web/dev preview has no package installer to hand off to — fall back
  // to the old behavior rather than pretending this works.
  if (!Capacitor.isNativePlatform()) {
    window.open(apkUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  let progressHandle;
  if (onProgress) {
    progressHandle = await Filesystem.addListener('progress', (state) => {
      if (state?.contentLength) {
        onProgress(Math.min(1, state.bytes / state.contentLength));
      }
    });
  }

  try {
    // Remove any half-finished download from a previous attempt so we
    // never hand the installer a stale/corrupt APK.
    try {
      await Filesystem.deleteFile({ path: APK_FILENAME, directory: Directory.Cache });
    } catch {
      // Fine — probably didn't exist yet.
    }

    await Filesystem.downloadFile({
      url: apkUrl,
      path: APK_FILENAME,
      directory: Directory.Cache,
      progress: true,
    });

    const { uri } = await Filesystem.getUri({
      path: APK_FILENAME,
      directory: Directory.Cache,
    });

    // Hands off to Android's package installer UI. That confirmation
    // screen — and, the first time, the "allow installs from this app"
    // settings prompt — is the OS, not a browser.
    await FileOpener.open({
      filePath: uri,
      contentType: 'application/vnd.android.package-archive',
      openWithDefault: true,
    });
  } finally {
    await progressHandle?.remove();
  }
}
