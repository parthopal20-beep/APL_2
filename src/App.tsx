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
import { cn } from './lib/utils';

function AppContent() {
  const { user, loading } = useAuth();
  const { language } = useLanguage();

  React.useEffect(() => {
    // Legacy checkAndAutomateCockroachWipe removed in favor of on-demand 15th/1st purge
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
      <div className="flex flex-col items-center justify-center min-h-screen bg-bg-app p-8 text-center space-y-6 relative overflow-hidden">
        <div className="blob-container">
          <div className="blob w-96 h-96 bg-accent-blue/10 top-[-10%] left-[-10%]" />
          <div className="blob w-80 h-80 bg-accent-indigo/5 bottom-[10%] right-[-5%]" style={{ animationDelay: '-5s' }} />
        </div>
        <div className="relative">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-r-2 border-accent-blue shadow-lg"></div>
          <div className="absolute inset-0 flex items-center justify-center">
             <div className="w-2 h-2 rounded-full bg-accent-blue animate-ping"></div>
          </div>
        </div>
        
        {loadTimeout && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 relative z-10">
            <p className="text-xs font-bold text-slate-500 tracking-widest uppercase">Connecting to Secure Server... / সার্ভারে সংযোগ করা হচ্ছে...</p>
            <button 
              onClick={() => window.location.reload()}
              className="px-8 py-3 bg-white border border-slate-200 rounded-2xl text-[10px] font-black text-slate-900 uppercase tracking-widest active:scale-95 transition-all shadow-md"
            >
              Force Refresh / রিফ্রেশ করুন
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
    <div className={cn(
      "min-h-screen bg-bg-app flex flex-col mx-auto relative selection:bg-accent-blue/30 overflow-x-hidden",
      user?.role === 'ADMIN' ? "max-w-7xl" : "max-w-md border-x border-slate-200"
    )}>
      <div className="blob-container">
        <div className="blob w-[500px] h-[500px] bg-accent-blue/5 top-[-10%] left-[-10%]" />
        <div className="blob w-[400px] h-[400px] bg-accent-indigo/5 bottom-[-10%] right-[-5%]" style={{ animationDelay: '-7s' }} />
        <div className="blob w-[300px] h-[300px] bg-accent-cyan/10 top-[40%] right-[10%]" style={{ animationDelay: '-3s' }} />
      </div>

      <Toaster 
        position="top-center" 
        expand={true} 
        richColors 
        toastOptions={{
          style: {
            background: 'white',
            border: '1px solid #e2e8f0',
            color: '#0f172a',
            borderRadius: '1.25rem',
            boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)'
          }
        }}
      />
      
      <main className="flex-1 overflow-y-auto w-full h-full flex flex-col relative z-10">
        <AnimatePresence mode="wait">
          <motion.div 
            key={user?.id + (user?.role === 'ADMIN' ? 'admin' : 'emp')}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="flex-1 flex flex-col"
          >
            {(user?.role === 'ADMIN' || user?.role === 'SUPERVISOR') ? <AdminDashboard /> : <EmployeeDashboard />}
          </motion.div>
        </AnimatePresence>
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
