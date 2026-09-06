/** ===========================================================================
 * NOTIFICATION SETTINGS PANEL
 * ============================================================================
 * <NotificationSettingsPanel onClose />
 *
 * A <GlassPanel variant="sheet"> containing:
 *   1. A master "Enable push notifications" toggle, driven directly by
 *      src/lib/pushNotifications.js (getPushStatus / subscribeToPush /
 *      unsubscribeFromPush) — this is real browser subscription state, not
 *      a database column, so it's tracked with local state that's probed
 *      on mount rather than read off notificationSettings.
 *   2. Five category toggles — Direct Messages, Groups, Mentions,
 *      Confessions, Promotional — each bound to the matching
 *      notificationSettings.{key}_enabled field via useAuth(), updated
 *      through updateNotificationSettings() for the same optimistic-then-
 *      persist behavior every other consumer of that context gets.
 *
 * The five category toggles are visually greyed/inert (GlassToggle's own
 * `disabled` prop, which also drops opacity) whenever push isn't actually
 * subscribed — they're additional settings layered on top of the base push
 * toggle, so they can't mean anything until push itself is on.
 *
 * This will be opened from EditProfile.jsx's Notifications section,
 * replacing its previous single toggle — that wiring is out of scope here;
 * this file only renders the panel itself given an onClose to pass through
 * to GlassPanel.
 *
 * Dependencies: React, src/lib/authContext.jsx, src/lib/pushNotifications.js,
 * src/components/shared/GlassPanel.jsx, src/components/shared/GlassToggle.jsx
 * ========================================================================= */

import React, { useEffect, useState } from 'react';
import { useAuth } from '../../lib/authContext';
import { getPushStatus, subscribeToPush, unsubscribeFromPush } from '../../lib/pushNotifications';
import GlassPanel from '../shared/GlassPanel';
import GlassToggle from '../shared/GlassToggle';

// Category rows: key matches the notification_settings column prefix
// (e.g. 'dm' -> dm_enabled), plus the label/description shown in the UI.
const CATEGORY_ROWS = [
  {
    key: 'dm',
    label: 'Direct Messages',
    description: 'Get notified when someone sends you a private message.',
  },
  {
    key: 'groups',
    label: 'Groups',
    description: 'Get notified about new activity in groups you belong to.',
  },
  {
    key: 'mentions',
    label: 'Mentions',
    description: 'Get notified when someone @mentions you.',
  },
  {
    key: 'confessions',
    label: 'Confessions',
    description: 'Get notified about new confessions in your groups.',
  },
  {
    key: 'promotional',
    label: 'Promotional',
    description: 'Occasional news and updates about AnonRoom.',
  },
];

export default function NotificationSettingsPanel({ onClose }) {
  const { session, notificationSettings, updateNotificationSettings } = useAuth();
  const userId = session?.user?.id;

  // Real browser/OS push-subscription state — separate from the database
  // row, since a user could have confessions_enabled=true in the db while
  // never having granted the browser permission at all.
  const [pushStatus, setPushStatus] = useState('default'); // 'unsupported'|'default'|'denied'|'subscribed'|'unsubscribed'
  const [pushBusy, setPushBusy] = useState(false);
  const [checkingPush, setCheckingPush] = useState(true);

  useEffect(() => {
    let isMounted = true;
    getPushStatus()
      .then((status) => {
        if (isMounted) setPushStatus(status);
      })
      .finally(() => {
        if (isMounted) setCheckingPush(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const pushEnabled = pushStatus === 'subscribed';
  const pushUnsupported = pushStatus === 'unsupported';
  const pushDenied = pushStatus === 'denied';

  async function handlePushToggle(nextChecked) {
    if (!userId || pushBusy || pushUnsupported) return;
    setPushBusy(true);

    try {
      if (nextChecked) {
        const success = await subscribeToPush(userId);
        setPushStatus(success ? 'subscribed' : await getPushStatus());
      } else {
        await unsubscribeFromPush(userId);
        setPushStatus('unsubscribed');
      }
    } catch (err) {
      console.error('Failed to update push subscription:', err);
      // Re-probe actual state rather than assuming the toggle's intent
      // succeeded, since subscribe/unsubscribe can partially fail.
      setPushStatus(await getPushStatus());
    } finally {
      setPushBusy(false);
    }
  }

  function handleCategoryToggle(key, nextChecked) {
    updateNotificationSettings({ [`${key}_enabled`]: nextChecked });
  }

  const settings = notificationSettings || {};

  return (
    <GlassPanel variant="sheet" onClose={onClose}>
      <div style={{ padding: '4px 20px 28px' }}>
        <h2
          style={{
            margin: '0 0 4px',
            fontSize: 20,
            fontWeight: 800,
            color: 'var(--paper)',
          }}
        >
          Notifications
        </h2>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--dim)' }}>
          Choose what AnonRoom can notify you about.
        </p>

        {/* Master push toggle */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            padding: '14px 16px',
            borderRadius: 20,
            background: 'var(--glass-white)',
            border: '1px solid var(--glass-border)',
            marginBottom: 20,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--paper)', marginBottom: 4 }}>
              Enable push notifications
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--dim)', lineHeight: 1.4 }}>
              {pushUnsupported
                ? 'Push notifications are not supported on this device or browser.'
                : pushDenied
                ? 'Notifications are blocked for this site in your browser settings.'
                : 'Turn this on first to receive any notification below.'}
            </div>
          </div>
          <GlassToggle
            checked={pushEnabled}
            onChange={handlePushToggle}
            disabled={checkingPush || pushBusy || pushUnsupported || pushDenied}
          />
        </div>

        {/* Category toggles — inert until push is actually subscribed */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {CATEGORY_ROWS.map((row, i) => (
            <div
              key={row.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                padding: '14px 4px',
                borderBottom: i < CATEGORY_ROWS.length - 1 ? '1px solid var(--glass-border)' : 'none',
                opacity: pushEnabled ? 1 : 0.45,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--paper)', marginBottom: 3 }}>
                  {row.label}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--dim)', lineHeight: 1.4 }}>
                  {row.description}
                </div>
              </div>
              <GlassToggle
                checked={!!settings[`${row.key}_enabled`]}
                onChange={(next) => handleCategoryToggle(row.key, next)}
                disabled={!pushEnabled}
              />
            </div>
          ))}
        </div>
      </div>
    </GlassPanel>
  );
}