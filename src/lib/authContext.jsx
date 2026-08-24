/**
 * ============================================================================
 * AUTHENTICATION CONTEXT PROVIDER
 * ============================================================================
 * This file acts as the global state manager for the user's session and profile.
 * It listens to Supabase auth events and automatically fetches the user's 
 * public profile (including `is_admin`, `username`, and `avatar_url`) so it 
 * is instantly available to all components without prop drilling.
 * ============================================================================
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import supabase from './supabaseClient';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
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
    } catch (error) {
      console.error('Error fetching user profile context:', error.message);
    } finally {
      setLoading(false);
    }
  }

  // Provide the session, profile, and loading state globally
  return (
    <AuthContext.Provider value={{ session, profile, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

// Custom hook for easy access inside components
export function useAuth() {
  return useContext(AuthContext);
}
