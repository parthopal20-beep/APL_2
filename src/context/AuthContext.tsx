import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, realSupabase, isConfigured } from '../lib/supabase';
import { UserProfile } from '../types';
import { SupabaseService } from '../services/SupabaseService';
import { User as SupabaseUser } from '@supabase/supabase-js';

interface AuthContextType {
  user: UserProfile | null;
  authUser: SupabaseUser | null;
  loading: boolean;
  login: (id: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(() => {
    const cached = localStorage.getItem('cachedProfile');
    return cached ? JSON.parse(cached) : null;
  });
  const [authUser, setAuthUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let profileUnsub: any = null;

    async function initAuth() {
      if (!isConfigured) {
        setLoading(false);
        return;
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        setAuthUser(session?.user ?? null);
        
        if (session?.user) {
          await fetchAndListenProfile(session.user.id);
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.warn("getSession error:", err);
        setLoading(false);
      }

      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        const sUser = session?.user ?? null;
        setAuthUser(sUser);
        
        if (sUser) {
          await fetchAndListenProfile(sUser.id);
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          localStorage.removeItem('cachedProfile');
        }
        setLoading(false);
      });

      return () => {
        subscription.unsubscribe();
        if (profileUnsub) profileUnsub.unsubscribe();
      };
    }

    const cleanup = initAuth();

    async function fetchAndListenProfile(uid: string) {
      if (profileUnsub) profileUnsub.unsubscribe();

      try {
        const profile = await SupabaseService.getOne('users', uid);
        if (profile) {
          handleProfileUpdate(profile);
        } else {
           setLoading(false);
        }
      } catch (err) {
        setLoading(false);
      }

      profileUnsub = SupabaseService.subscribe('users', (data: any[]) => {
        const myProfile = data.find(p => p.id === uid);
        if (myProfile) handleProfileUpdate(myProfile);
      });
    }

    function handleProfileUpdate(userData: UserProfile) {
      if (userData.status && userData.status !== 'ACTIVE') {
        supabase.auth.signOut();
        setUser(null);
        localStorage.removeItem('cachedProfile');
      } else {
        setUser(userData);
        localStorage.setItem('cachedProfile', JSON.stringify(userData));
      }
      setLoading(false);
    }
  }, []);

  const login = async (id: string, pass: string) => {
    if (!id) throw new Error('দয়া করে সঠিক ইউজার আইডি দিন (Please enter a valid User ID)');
    const sanitizedId = String(id || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
    const email = `u_${sanitizedId}@apl-system.com`;
    
    try {
      let { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });

      if (error) {
        const msg = error.message.toLowerCase();
        
        // Admin Bootstrap logic for first-time setup
        if ((sanitizedId === 'admin' || sanitizedId === 'administrator') && 
            (msg.includes('invalid login credentials') || msg.includes('user not found'))) {
          
          console.log("Attempting to bootstrap fresh admin account...");
          const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email,
            password: pass,
            options: { data: { role: 'ADMIN' } }
          });

          if (signUpError) {
             if (signUpError.message.toLowerCase().includes('already registered')) {
               throw new Error('ভুল পাসওয়ার্ড। দয়া করে সঠিক পাসওয়ার্ড দিন।');
             }
             throw signUpError;
          }
          data = signUpData;
        } else {
          if (msg.includes('email not confirmed')) {
            throw new Error('আপনার Supabase প্রজেক্টে "Confirm Email" সেটিংসটি অফ (Disable) করতে হবে অথবা ইমেল কনফার্ম করতে হবে।');
          }
          if (msg.includes('invalid login credentials')) {
            throw new Error('ইউজার আইডি বা পাসওয়ার্ড ভুল।');
          }
          throw error;
        }
      }

      if (!data.user) throw new Error('Authentication failed');

      let profile = await SupabaseService.getOne('users', data.user.id);
      
      // Create profile if it's the admin and doesn't exist in the database yet
      if (!profile && sanitizedId === 'admin') {
        profile = {
          id: data.user.id,
          name: 'Administrator',
          role: 'ADMIN',
          jobTitle: 'System Admin',
          paymentBase: 'DAILY_FIXED',
          rate: 0,
          status: 'ACTIVE',
          language: 'en',
          email,
          activeSessions: [],
          lastActive: new Date().toISOString()
        } as UserProfile;
        await SupabaseService.upsert('users', data.user.id, profile);
      }

      if (!profile) {
        await supabase.auth.signOut();
        throw new Error('ইউজার প্রোফাইল ডাটাবেসে পাওয়া যায়নি। অ্যাডমিনের সাথে যোগাযোগ করুন।');
      }

      if (profile.status !== 'ACTIVE') {
        await supabase.auth.signOut();
        throw new Error('আপনার অ্যাকাউন্টটি বর্তমানে নিষ্ক্রিয় (Inactive) আছে।');
      }

      setUser(profile);
      localStorage.setItem('cachedProfile', JSON.stringify(profile));
    } catch (err: any) {
      console.error('Login Error:', err);
      throw err;
    }
  };

  const logout = async () => {
    setUser(null);
    localStorage.removeItem('cachedProfile');
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, authUser, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
