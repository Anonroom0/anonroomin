/**
 * ============================================================================
 * AUTHENTICATION CONTEXT PROVIDER
 * ============================================================================
 * This file acts as the global state manager for the user's session and profile.
 * It listens to Supabase auth events and automatically fetches the user's 
 * public profile (including `is_admin`, `username`, and `avatar_url`) so it 
 * is instantly available to all components without prop drilling.
 *
 * It also fetches and manages the caller's notification_settings row, which
 * is optional-by-row (a user may not have one yet) — a missing row is
 * treated as the table's own defaults client-side rather than triggering an
 * insert, so reads never block on a write. Consumers get notificationSettings
 * plus updateNotificationSettings() for optimistic upserts, and
 * refreshProfile() so components like EditProfile.jsx can re-sync profile
 * data after a save without forcing a full page reload.
 * ============================================================================
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import supabase from './supabaseClient';

const AuthContext = createContext();

// Mirrors the column defaults on public.notification_settings — used
// client-side whenever a user doesn't have a row yet, so the rest of the
// app can always read a consistent shape from context.
const DEFAULT_NOTIFICATION_SETTINGS = {
  dm_enabled: true,
  groups_enabled: true,
  mentions_enabled: true,
  confessions_enabled: true,
  promotional_enabled: false,
};

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [notificationSettings, setNotificationSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    // Tracks whichever user id we've already kicked a profile fetch off for,
    // so a redundant auth event for the *same* user (Supabase fires an
    // immediate INITIAL_SESSION event on subscribe, then may follow up with
    // SIGNED_IN/TOKEN_REFRESHED for that same session) doesn't re-trigger
    // fetchProfile/fetchNotificationSettings a second or third time. Each of
    // those duplicate calls was its own pair of network round-trips plus a
    // state update, which is what made screens depending on `profile`
    // visibly "reload" more than once.
    let lastHandledUserId = null;

    // A single subscription covers both the initial session AND all
    // subsequent login/logout/refresh events — supabase-js v2 fires this
    // callback immediately with the current session when you subscribe, so
    // a separate supabase.auth.getSession() call up front is redundant and
    // was the other half of the double-fetch.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (!isMounted) return;
      setSession(currentSession);

      const uid = currentSession?.user?.id || null;
      if (uid) {
        if (uid !== lastHandledUserId) {
          lastHandledUserId = uid;
          fetchProfile(uid);
        } else {
          // Same user we already fetched — just make sure we're not stuck
          // showing a loading state.
          setLoading(false);
        }
      } else {
        lastHandledUserId = null;
        setProfile(null);
        setNotificationSettings(null);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // 3. Fetch the custom profile data linked to the auth UUID
  async function fetchProfile(userId) {
    try {
      // .maybeSingle() (not .single()) — a brand-new auth user whose
      // profiles row hasn't landed yet is a normal "no row" case, not an
      // error. .single() forces PostgREST's Accept: vnd.pgrst.object+json
      // handling, which answers a 0-row result with a 406 instead of just
      // returning null; .maybeSingle() asks for the same single object but
      // resolves 0 rows as { data: null, error: null } instead of throwing,
      // so there's no PGRST116 special-case needed here.
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;

      setProfile(data || null);

      // Only chase notification settings once we know the profile fetch
      // itself didn't throw — keeps this an "after success" step rather
      // than a parallel, independently-failable one.
      await fetchNotificationSettings(userId);
    } catch (error) {
      console.error('Error fetching user profile context:', error.message);
    } finally {
      setLoading(false);
    }
  }

  // 3b. Fetch the caller's notification_settings row. A missing row is not
  // an error state for this app — it just means the user hasn't customized
  // anything yet (or their profile-insert trigger hasn't run yet), so we
  // fall back to the table's defaults client-side. See fetchProfile() above
  // for why this uses .maybeSingle() instead of .single(): the latter is
  // what was turning an ordinary "no row yet" into a logged 406.
  async function fetchNotificationSettings(userId) {
    try {
      const { data, error } = await supabase
        .from('notification_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;

      setNotificationSettings(data || { user_id: userId, ...DEFAULT_NOTIFICATION_SETTINGS });
    } catch (error) {
      console.error('Error fetching notification settings:', error.message);
      // Even on an unexpected error, leave the caller with a usable default
      // shape rather than null, since most consumers will destructure
      // fields off of it directly.
      setNotificationSettings({ user_id: userId, ...DEFAULT_NOTIFICATION_SETTINGS });
    }
  }

  // 4. Re-run the profile fetch for whoever's currently signed in — lets
  // components like EditProfile.jsx pull fresh data after a save without
  // forcing a full page reload.
  async function refreshProfile() {
    if (!session?.user) return;
    await fetchProfile(session.user.id);
  }

  // 5. Upsert a partial patch of notification settings. Optimistically
  // updates local state first so toggle UIs feel instant, then writes
  // through to Supabase; on failure the previous state is restored so the
  // UI doesn't silently drift from the database.
  async function updateNotificationSettings(partial) {
    if (!session?.user) return;

    const userId = session.user.id;
    const previous = notificationSettings || { user_id: userId, ...DEFAULT_NOTIFICATION_SETTINGS };
    const next = { ...DEFAULT_NOTIFICATION_SETTINGS, ...previous, ...partial, user_id: userId };

    setNotificationSettings(next);

    try {
      const { data, error } = await supabase
        .from('notification_settings')
        .upsert(next, { onConflict: 'user_id' })
        .select()
        .single();

      if (error) throw error;

      setNotificationSettings(data);
    } catch (error) {
      console.error('Error updating notification settings:', error.message);
      // Roll back to the pre-update state on failure.
      setNotificationSettings(previous);
    }
  }

  // Provide the session, profile, notification settings, and loading state
  // globally, plus the refresh/update actions.
  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        loading,
        notificationSettings,
        updateNotificationSettings,
        refreshProfile,
      }}
    >
      {!loading && children}
    </AuthContext.Provider>
  );
}

// Custom hook for easy access inside components
export function useAuth() {
  return useContext(AuthContext);
}
