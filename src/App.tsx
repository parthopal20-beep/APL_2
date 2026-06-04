/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { Toaster, toast } from 'sonner';
import LoginPage from './components/LoginPage';
import AdminDashboard from './components/AdminDashboard';
import EmployeeDashboard from './components/EmployeeDashboard';
import { SupabaseService } from './services/SupabaseService';
import { APP_VERSION } from './version';
import { motion, AnimatePresence } from 'motion/react';
import { checkAndAutomateCockroachWipe } from './lib/supabase';

function AppContent() {
  const { user, loading } = useAuth();
  const { language } = useLanguage();

  React.useEffect(() => {
    try {
      checkAndAutomateCockroachWipe();
    } catch (e) {
      console.error("CockroachDB automatic checking failed:", e);
    }
  }, []);

  React.useEffect(() => {
    const handleOnline = () => toast.success('You are back online / আপনি এখন অনলাইনে আছেন।', { id: 'online-status' });
    const handleOffline = () => toast.error('You are offline. Some features may not work. / আপনি অফলাইনে আছেন। কিছু ফিচার কাজ নাও করতে পারে।', { id: 'online-status', duration: Infinity });

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const [loadTimeout, setLoadTimeout] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (loading) setLoadTimeout(true);
    }, 10000); // 10s
    return () => clearTimeout(timer);
  }, [loading]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-bg-app p-8 text-center space-y-6">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-blue"></div>
        {loadTimeout && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <p className="text-xs font-bold text-slate-500">Connecting to server... / সংযোগ করা হচ্ছে...</p>
            <button 
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-white border border-app-border rounded-xl text-[10px] font-black uppercase tracking-widest active:bg-bg-app shadow-sm"
            >
              Refresh App / রিফ্রেশ করুন
            </button>
          </motion.div>
        )}
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-bg-app flex flex-col max-w-md mx-auto relative border-x border-app-border">
      <Toaster position="top-center" expand={true} richColors />
      
      <main className="flex-1 overflow-y-auto w-full h-full flex flex-col">
        {(user?.role === 'ADMIN' || user?.role === 'SUPERVISOR') ? <AdminDashboard /> : <EmployeeDashboard />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <AppContent />
      </LanguageProvider>
    </AuthProvider>
  );
}
