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

    // 1. Fetch initial active session
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      if (isMounted) {
        setSession(initialSession);
        if (initialSession?.user) {
          fetchProfile(initialSession.user.id);
        } else {
          setLoading(false);
        }
      }
    });

    // 2. Listen for login/logout events dynamically
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (isMounted) {
        setSession(currentSession);
        if (currentSession?.user) {
          fetchProfile(currentSession.user.id);
        } else {
          setProfile(null);
          setNotificationSettings(null);
          setLoading(false);
        }
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
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
        
      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      
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

  // 3b. Fetch the caller's notification_settings row. A missing row
  // (PGRST116, .single() found 0 rows) is not an error state for this app —
  // it just means the user hasn't customized anything yet, so we fall back
  // to the table's defaults client-side instead of inserting a row here.
  async function fetchNotificationSettings(userId) {
    try {
      const { data, error } = await supabase
        .from('notification_settings')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

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
