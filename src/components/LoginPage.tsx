import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { translations } from '../context/i18n';
import { Loader2, LogIn, Globe, Smartphone, ExternalLink } from 'lucide-react';
import { motion } from 'motion/react';
import { isConfigured } from '../lib/supabase';

export default function LoginPage() {
  const { login } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !password) return;
    
    setIsSubmitting(true);
    setError('');
    
    try {
      await login(id, password);
    } catch (err: any) {
      console.error(err);
      setError(err.message || `${translations.en.invalidCredentials} / ${translations.bn.invalidCredentials}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0c111d] p-6 font-sans relative overflow-hidden">
      {/* Animated background already in App.tsx wrapper for this specific context would be nice, but LoginPage is top-level. 
          I'll add specific blobs here as well for the full effect. */}
      <div className="blob-container">
        <div className="blob w-96 h-96 bg-accent-blue/20 top-[-10%] left-[-10%]" />
        <div className="blob w-80 h-80 bg-accent-indigo/10 bottom-[10%] right-[-5%]" style={{ animationDelay: '-5s' }} />
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm card-glass rounded-[40px] p-8 sm:p-10 space-y-6 relative z-10 border border-white/10"
      >
        <div className="text-center space-y-6 relative">
          <motion.div 
            initial={{ rotate: -10, scale: 0.8 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ type: 'spring', damping: 12 }}
            className="w-20 h-20 bg-gradient-to-tr from-accent-blue to-accent-indigo rounded-3xl flex items-center justify-center mx-auto shadow-2xl shadow-accent-blue/30 relative"
          >
             <div className="absolute inset-0 bg-white/20 rounded-3xl blur-sm"></div>
             <Smartphone className="h-10 w-10 text-white relative z-10" />
          </motion.div>
          <div className="space-y-1">
            <h1 className="text-4xl font-black tracking-tighter text-white uppercase italic">
              <span className="text-accent-blue">G</span>LOBAL <span className="text-accent-indigo">L</span>OGISTICS
            </h1>
            <p className="text-accent-cyan text-[11px] font-black uppercase tracking-[0.3em] opacity-80">SMART LOGS v4.0</p>
          </div>
        </div>

        <div className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-3">
              <label className="text-[11px] font-black text-slate-200 uppercase tracking-widest px-2 flex justify-between">
                <span>User ID / পিন বা আইডি</span>
                <span className="text-accent-blue opacity-50 font-normal">Admin? Use "admin"</span>
              </label>
              <div className="relative group">
                <input
                  type="text"
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  className="w-full h-14 px-6 rounded-2xl bg-white/10 border border-white/20 focus:border-accent-blue focus:ring-4 focus:ring-accent-blue/10 outline-none transition-all font-bold text-white placeholder:text-slate-500 shadow-inner"
                  placeholder="Enter ID"
                  required
                />
                <div className="absolute inset-0 rounded-2xl bg-accent-blue/5 opacity-0 group-focus-within:opacity-100 pointer-events-none transition-opacity"></div>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[11px] font-black text-slate-200 uppercase tracking-widest px-2">
                {t.password}
              </label>
              <div className="relative group">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-14 px-6 rounded-2xl bg-white/10 border border-white/20 focus:border-accent-blue focus:ring-4 focus:ring-accent-blue/10 outline-none transition-all font-bold text-white placeholder:text-slate-500 shadow-inner"
                  placeholder="••••••••"
                  required
                />
                <div className="absolute inset-0 rounded-2xl bg-accent-blue/5 opacity-0 group-focus-within:opacity-100 pointer-events-none transition-opacity"></div>
              </div>
            </div>

            {error && (
              <motion.p 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-accent-red text-[10px] font-bold text-center animate-shake uppercase tracking-wider bg-accent-red/10 py-2 rounded-lg border border-accent-red/20"
              >
                {error}
              </motion.p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-16 bg-gradient-to-r from-accent-blue to-accent-indigo text-white rounded-2xl font-black text-lg shadow-2xl shadow-accent-blue/20 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-3 mt-4 border border-white/10"
            >
              {isSubmitting ? (
                <Loader2 className="animate-spin h-6 w-6" />
              ) : (
                <>
                  <LogIn className="h-6 w-6" />
                  <span className="uppercase tracking-widest">{t.login}</span>
                </>
              )}
            </button>
          </form>
        </div>


        <div className="pt-4 flex flex-col items-center gap-4">
          <button
            onClick={() => setLanguage(language === 'en' ? 'bn' : 'en')}
            className="flex items-center gap-2 text-slate-200 hover:text-accent-blue transition-colors font-black text-[10px] uppercase tracking-[0.2em]"
          >
            <Globe className="h-4 w-4" />
            {language === 'en' ? 'বাংলা' : 'English'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
