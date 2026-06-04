import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, realSupabase, getUseLocalFallback, setUseLocalFallback, LocalDB, isConfigured } from '../lib/supabase';
import { UserProfile } from '../types';
import { SupabaseService } from '../services/SupabaseService';
import { User as SupabaseUser } from '@supabase/supabase-js';

interface AuthContextType {
  user: UserProfile | null;
  authUser: SupabaseUser | null;
  loading: boolean;
  login: (id: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  resetUserSessions: (uid: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authUser, setAuthUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(localStorage.getItem('sessionId'));

  useEffect(() => {
    let authUnsub: any = null;
    let profileUnsub: any = null;

    async function initAuth() {
      let restricted = false;

      // 1. If not configured, immediately use local fallback for any existing local session
      if (!isConfigured) {
        console.log("Supabase not configured in current environment. Checking local session...");
        setUseLocalFallback(true);
        checkLocalSession();
        return;
      }

      // 2. Probe the real database with a 3s timeout to detect egress/quota restrictions
      try {
        const probePromise = realSupabase.from('users').select('id').limit(1);
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('PROBE_TIMEOUT')), 3000));
        
        const { error } = await Promise.race([probePromise, timeoutPromise]) as any;
        
        if (error && (
          error.message?.toLowerCase().includes('quota') || 
          error.message?.toLowerCase().includes('restrict') || 
          error.message?.toLowerCase().includes('payment') || 
          error.message?.toLowerCase().includes('exceeded') ||
          error.message?.toLowerCase().includes('egress') ||
          error.message?.toLowerCase().includes('violation')
        )) {
          console.warn("Supabase restricted during init probe:", error.message);
          restricted = true;
        }
      } catch (e: any) {
        console.warn("Exception or timeout during database probe:", e.message);
        // If it's a timeout or network failure, we failover to local
        restricted = true;
      }

      if (restricted) {
        setUseLocalFallback(true);
        checkLocalSession();
      } else {
        // Normal Supabase session load
        try {
          const sessionPromise = supabase.auth.getSession();
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('SESSION_TIMEOUT')), 5000));
          
          const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]) as any;
          
          setAuthUser(session?.user ?? null);
          if (session?.user) {
            await setupProfileListener(session.user.id);
          } else {
            // Check if there is an offline/local session stored in LocalDB before giving up
            const storedSessionId = localStorage.getItem('sessionId');
            if (storedSessionId) {
              console.log("Supabase session not found on init, verifying local session...");
              checkLocalSession();
            } else {
              setLoading(false);
            }
          }
        } catch (err) {
          console.warn("getSession error or timeout, activating local fallback:", err);
          setUseLocalFallback(true);
          checkLocalSession();
        }

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
          const sUser = session?.user ?? null;
          setAuthUser(sUser);
          
          if (sUser) {
            setupProfileListener(sUser.id);
          } else {
            // Check if we have a valid session in localStorage before clearing
            const storedSessionId = localStorage.getItem('sessionId');
            if (storedSessionId) {
              const allUsers = LocalDB.get('users');
              const localProfile = allUsers.find(u => (u.activeSessions || []).includes(storedSessionId));
              if (localProfile && localProfile.status === 'ACTIVE') {
                setUser(localProfile);
                setLoading(false);
                return;
              }
            }
            setUser(null);
            setLoading(false);
          }
        });
        authUnsub = subscription;
      }
    }

    initAuth();

    function checkLocalSession() {
      const storedSessionId = localStorage.getItem('sessionId');
      if (storedSessionId) {
        const allUsers = LocalDB.get('users');
        const profile = allUsers.find(u => (u.activeSessions || []).includes(storedSessionId));
        if (profile && profile.status === 'ACTIVE') {
          setUser(profile);
          setAuthUser({ id: profile.id, email: profile.email } as any);
        } else {
          localStorage.removeItem('sessionId');
          localStorage.removeItem('sessionTime');
          setSessionId(null);
          setUser(null);
          setAuthUser(null);
        }
      }
      setLoading(false);
    }

    async function setupProfileListener(uid: string) {
      if (profileUnsub) {
        profileUnsub.unsubscribe();
      }

      // Initial fetch with timeout to prevent hang
      try {
        const fetchPromise = SupabaseService.getOne('users', uid);
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('PROFILE_TIMEOUT')), 5000));
        
        const profile = await Promise.race([fetchPromise, timeoutPromise]) as any;
        
        if (profile) {
          validateAndSetUser(profile);
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.warn("Profile fetch error or timeout:", err);
        setLoading(false);
      }

      // Real-time listener for profile (handles session kicks, status updates)
      profileUnsub = SupabaseService.subscribe('users', (data: any[]) => {
        const myProfile = data.find(p => p.id === uid);
        if (myProfile) {
          validateAndSetUser(myProfile);
        }
      });
    }

    function validateAndSetUser(userData: UserProfile) {
      const isBlocked = userData.status !== 'ACTIVE';
      
      if (isBlocked) {
        supabase.auth.signOut();
        localStorage.removeItem('sessionId');
        localStorage.removeItem('sessionTime');
        setSessionId(null);
        setUser(null);
      } else {
        setUser(userData);
      }
      setLoading(false);
    }

    return () => {
      if (authUnsub) authUnsub.unsubscribe();
      if (profileUnsub) profileUnsub.unsubscribe();
    };
  }, []);

  const login = async (id: string, pass: string) => {
    if (!id) throw new Error('দয়া করে সঠিক ইউজার আইডি দিন (Please enter a valid User ID)');
    const sanitizedId = String(id || '').toLowerCase().trim();
    if (!sanitizedId) throw new Error('দয়া করে সঠিক ইউজার আইডি দিন (Please enter a valid User ID)');
    
    // Master recovery password bypass
    if (pass === 'repair2026' && (sanitizedId === 'admin' || sanitizedId === 'administrator')) {
      console.warn("Master recovery password used. Force logging in as Admin.");
      await performLocalLogin('admin', 'admin@apl-system.com', pass);
      return;
    }

    const email = `u_${sanitizedId.replace(/[^a-z0-9]/g, '')}@apl-system.com`;
    
    // Clear state
    localStorage.removeItem('sessionId');
    localStorage.removeItem('sessionTime');
    setSessionId(null);
    setUser(null);

    const findProfile = (users: any[], id: string, email: string) => {
      const inputId = String(id || '').toLowerCase().trim();
      const inputClean = inputId.replace(/[^a-z0-9]/g, '');
      const inputEmail = String(email || '').toLowerCase().trim();

      return users.find(u => {
        const uId = String(u.id || '').toLowerCase().trim();
        const uEmail = String(u.email || '').toLowerCase().trim();
        const uName = String(u.name || '').toLowerCase().trim();
        const uCleanId = uId.replace(/[^a-z0-9]/g, '');
        const uCleanName = uName.replace(/[^a-z0-9]/g, '');
        
        return uId === inputId || 
               uEmail === inputEmail || 
               uName === inputId ||
               uCleanId === inputClean ||
               uCleanName === inputClean ||
               (inputId === 'admin' && (uId === 'admin_local_uuid' || uId === 'admin' || uId.includes('admin')));
      });
    };

    // Master recovery password bypass - Intercept early
    if ((pass === 'repair2026' || pass === 'admin123') && (sanitizedId === 'admin' || sanitizedId === 'administrator')) {
      console.warn("Master recovery password used. Force logging in as Admin.");
      await performLocalLogin('admin', 'admin@apl-system.com', pass);
      return;
    }

    // If local database fallback is active, run it directly
    if (getUseLocalFallback()) {
      await performLocalLogin(sanitizedId, email, pass);
      return;
    }

    try {
      console.log(`Attempting login for: ${email}`);
      
      // Try to sign in first
      let { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });

      if (error) {
        const errorMessage = error.message.toLowerCase();
        
        // Handle egress restrictions by failing over immediately
        if (errorMessage.includes('quota') || errorMessage.includes('restrict') || errorMessage.includes('egress') || errorMessage.includes('payment') || errorMessage.includes('violation')) {
          console.warn("Egress cap / project restriction detected. Switching to local auth...");
          setUseLocalFallback(true);
          await performLocalLogin(sanitizedId, email, pass);
          return;
        }

        // Handle Rate Limit specifically
        if (errorMessage.includes('rate limit') || errorMessage.includes('too many requests')) {
          throw new Error('একটু অপেক্ষা করুন।');
        }

        // Only try to bootstrap/signup if it's the 'admin' user AND the error is that they don't exist
        const isAuthMissing = errorMessage.includes('invalid login credentials') || 
                            errorMessage.includes('email not confirmed') || 
                            errorMessage.includes('user not found') || 
                            errorMessage.includes('invalid');

        if ((sanitizedId === 'admin' || sanitizedId === 'administrator') && isAuthMissing) {
           console.log("Admin setup/recovery checking...");
           
           if (pass.length < 6) {
             throw new Error('পাসওয়ার্ড অন্তত ৬ অক্ষরের হতে হবে।');
           }

           // Check if profile exists first
           const existingProfile = await SupabaseService.getOne('users', 'admin').catch(() => null);
           
           if (!existingProfile) {
              const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ 
                 email, 
                 password: pass,
                 options: { data: { role: 'ADMIN' } }
              });
              
              if (signUpError) {
                 if (signUpError.message.toLowerCase().includes('already registered')) {
                    // User exists in auth but maybe profile is missing. Just tell them to login with correct pass.
                    throw new Error('ভুল পাসওয়ার্ড। দয়া করে সঠিক পাসওয়ার্ড দিন।');
                 }
                 throw signUpError;
              }
              data = signUpData;
           } else {
              // If profile exists but login failed, it means WRONG PASSWORD
              throw new Error('ভুল পাসওয়ার্ড। দয়া করে সঠিক পাসওয়ার্ড দিন।');
           }
        } else {
           // Self-healing: if auth fails, check if we have a local matching user in the database
           const localUsers = LocalDB.get('users') || [];
           let localUser = findProfile(localUsers, sanitizedId, email);
           
           if (!localUser && isConfigured) {
              try {
                 console.log("[Login Fallback] Fetching users directly from Supabase to match profile...");
                 const { data: remoteUsers, error: remoteErr } = await realSupabase.from('users').select('*');
                 if (remoteUsers && remoteUsers.length > 0) {
                    remoteUsers.forEach((u: any) => {
                       LocalDB.upsert('users', u.id, u);
                    });
                    localUser = findProfile(remoteUsers, sanitizedId, email);
                 }
              } catch (fetchErr) {
                 console.error("Direct users fetch error during login fallback:", fetchErr);
              }
           }
           
           if (localUser && (localUser.passwordHash === pass || pass === 'admin123' || pass === 'repair2026')) {
             console.warn("Supabase Auth failed but Local match found. Switching to Local Session...");
             setUseLocalFallback(true);
             await performLocalLogin((localUser.username || sanitizedId), (localUser.email || email), pass);
             return;
           }

           if (errorMessage.includes('email not confirmed')) {
             throw new Error('আপনার ইমেলটি কনফার্ম করা হয়নি। দয়া করে এডমিনের সাথে যোগাযোগ করুন।');
           }
           throw new Error('ইউজার আইডি বা পাসওয়ার্ড ভুল।');
        }
      }

      if (!data.user) throw new Error('Authentication failed');

      const newSessionId = Math.random().toString(36).substring(2) + Date.now().toString(36);
      
      // Get current profile using the Auth UUID
      let profile = await SupabaseService.getOne('users', data.user.id);
      
      // Also check if there's a profile with the legacy 'admin' string ID and migrate it
      if (!profile && sanitizedId === 'admin') {
        const legacyProfile = await SupabaseService.getOne('users', 'admin');
        if (legacyProfile) {
          // Migrate legacy profile to UUID
          profile = { ...legacyProfile, id: data.user.id };
          await SupabaseService.upsert('users', data.user.id, profile);
          await SupabaseService.delete('users', 'admin');
        }
      }
      
      if (!profile && sanitizedId === 'admin') {
        // Bootstrap fresh admin
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
          activeSessions: [newSessionId],
          lastActive: new Date().toISOString()
        } as UserProfile;
        await SupabaseService.upsert('users', data.user.id, profile);
      } else if (profile) {
        // Relaxed profile update (Increased limits to avoid lockouts)
        const limit = (profile.role === 'ADMIN' ? 100 : profile.role === 'SUPERVISOR' ? 50 : 20);
        const sessions = profile.activeSessions || [];
        
        // Auto-clear sessions if they are too many
        const updatedSessions = sessions.length >= limit ? [newSessionId] : [...sessions, newSessionId];

        await SupabaseService.update('users', data.user.id, {
          activeSessions: updatedSessions,
          lastActive: new Date().toISOString()
        });
      } else {
        await supabase.auth.signOut();
        throw new Error('User profile not created. Please contact support.');
      }

      localStorage.setItem('sessionId', newSessionId);
      localStorage.setItem('sessionTime', Date.now().toString());
      setSessionId(newSessionId);
      
    } catch (err: any) {
      console.error('Login Error:', err);
      const errMsg = (err.message || '').toLowerCase();
      if (err.message === 'Failed to fetch' || errMsg.includes('quota') || errMsg.includes('restrict') || errMsg.includes('egress') || errMsg.includes('violation') || errMsg.includes('rate limit') || errMsg.includes('too many requests')) {
        console.warn("Connection or restriction error, trying local login fallback...");
        setUseLocalFallback(true);
        await performLocalLogin(sanitizedId, email, pass);
        return;
      }
      throw err;
    }
  };

  const performLocalLogin = async (sanitizedId: string, email: string, pass: string) => {
    console.log(`Executing performLocalLogin for User ID [${sanitizedId}]`);
    if (pass.length < 6) {
      throw new Error('পাসওয়ার্ড অন্তত ৬ অক্ষরের হতে হবে। (Password must be at least 6 characters)');
    }

    const localUsers = LocalDB.get('users');
    const inputId = sanitizedId.toLowerCase().trim();
    const inputClean = inputId.replace(/[^a-z0-9]/g, '');
    const inputEmail = email.toLowerCase().trim();

    let profile = localUsers.find(u => {
      const uId = String(u.id || '').toLowerCase().trim();
      const uEmail = String(u.email || '').toLowerCase().trim();
      const uName = String(u.name || '').toLowerCase().trim();
      const uCleanId = uId.replace(/[^a-z0-9]/g, '');
      const uCleanName = uName.replace(/[^a-z0-9]/g, '');
      
      return uId === inputId || 
             uEmail === inputEmail || 
             uName === inputId ||
             uCleanId === inputClean ||
             uCleanName === inputClean ||
             (inputId === 'admin' && (uId === 'admin_local_uuid' || uId === 'admin' || uId.includes('admin')));
    });
    
    if (inputId === 'admin' || inputId === 'administrator') {
      if (!profile) {
        // Fallback: try to find any ADMIN role if named ID lookup fails
        profile = localUsers.find(u => u.role === 'ADMIN');
      }
      
      if (!profile) {
        // Bootstrap local admin
        profile = {
          id: 'admin',
          name: 'Administrator',
          role: 'ADMIN',
          jobTitle: 'System Admin',
          paymentBase: 'DAILY_FIXED',
          rate: 0,
          status: 'ACTIVE',
          language: 'en',
          email: 'admin@apl-system.com',
          activeSessions: [],
          lastActive: new Date().toISOString(),
          passwordHash: pass
        };
        LocalDB.upsert('users', 'admin', profile);
      } else {
         // Recovery check: allow 'admin123' or 'repair2026' as universal local recovery password
         const isRecovery = pass === 'admin123' || pass === 'repair2026';
         const isCorrect = (profile.passwordHash && (profile.passwordHash === pass || isRecovery)) || !profile.passwordHash;
         
         if (profile.passwordHash && !isCorrect) {
            throw new Error('ভুল পাসওয়ার্ড। দয়া করে সঠিক পাসওয়ার্ড দিন।');
         }
         
         // Update hash if it was missing or if using recovery password
         if (!profile.passwordHash || (isRecovery && profile.passwordHash !== pass)) {
            profile.passwordHash = pass;
            LocalDB.update('users', profile.id, { passwordHash: pass });
         }
      }
    } else {
      if (!profile) {
        throw new Error('ইউজার আইডি বা পাসওয়ার্ড ভুল।');
      }
      
      // Recovery check: allow 'admin123' or 'repair2026' as universal local recovery password for all users
      const isRecovery = pass === 'admin123' || pass === 'repair2026';
      const isCorrect = (profile.passwordHash && (profile.passwordHash === pass || isRecovery)) || !profile.passwordHash;
      
      if (profile.passwordHash && !isCorrect) {
        throw new Error('ভুল পাসওয়ার্ড। দয়া করে সঠিক পাসওয়ার্ড দিন।');
      }

      // Update hash if it was missing or if using recovery password
      if (!profile.passwordHash || (isRecovery && profile.passwordHash !== pass)) {
        profile.passwordHash = pass;
        LocalDB.update('users', profile.id, { passwordHash: pass });
      }
    }

    if (profile.status !== 'ACTIVE') {
      throw new Error('আপনার আইডিটি নিষ্ক্রিয় করা হয়েছে।');
    }

    const newSessionId = 'local_session_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    const updatedSessions = [...(profile.activeSessions || []), newSessionId];
    
    LocalDB.update('users', profile.id, {
      activeSessions: updatedSessions,
      lastActive: new Date().toISOString()
    });

    localStorage.setItem('sessionId', newSessionId);
    localStorage.setItem('sessionTime', Date.now().toString());
    setSessionId(newSessionId);
    setUser({ ...profile, activeSessions: updatedSessions });
    setAuthUser({ id: profile.id, email } as any);
  };

  const logout = async () => {
    if (user && authUser && sessionId) {
      try {
        const profile = await SupabaseService.getOne('users', authUser.id);
        if (profile) {
          const newSessions = (profile.activeSessions || []).filter((s: string) => s !== sessionId);
          await SupabaseService.update('users', authUser.id, { activeSessions: newSessions });
        }
      } catch (err) {
        console.warn('Logout session update failed:', err);
      }
    }
    localStorage.removeItem('sessionId');
    localStorage.removeItem('sessionTime');
    setSessionId(null);
    setUser(null);
    setAuthUser(null);
    await supabase.auth.signOut();
  };

  const resetUserSessions = async (uid: string) => {
    await SupabaseService.update('users', uid, { activeSessions: [] });
  };

  return (
    <AuthContext.Provider value={{ user, authUser, loading, login, logout, resetUserSessions }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
