import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { translations } from '../context/i18n';
import { Loader2, LogIn, Globe, Smartphone } from 'lucide-react';
import { motion } from 'motion/react';
import { isConfigured, getUseLocalFallback, setUseLocalFallback } from '../lib/supabase';

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
    <div className="min-h-screen flex items-center justify-center bg-bg-app p-6 font-sans">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm bg-white rounded-[32px] shadow-sm border border-app-border p-8 sm:p-10 space-y-6 sm:space-y-8"
      >
        <div className="text-center space-y-4 relative">
          <div className="w-16 h-16 bg-accent-blue rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-accent-blue/20">
             <Smartphone className="h-8 w-8 text-white" />
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl font-black tracking-tight text-text-primary uppercase">
              {t.appName}
            </h1>
            <p className="text-text-secondary text-sm font-medium uppercase tracking-widest opacity-60 italic">{t.login}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest px-1">
              {t.userId}
            </label>
            <input
              type="text"
              value={id}
              onChange={(e) => setId(e.target.value)}
              className="w-full h-14 px-5 rounded-2xl bg-bg-app border border-app-border focus:ring-2 focus:ring-accent-blue/10 outline-none transition-all font-bold text-lg placeholder:text-text-secondary/20"
              placeholder="ID"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest px-1">
              {t.password}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-14 px-5 rounded-2xl bg-bg-app border border-app-border focus:ring-2 focus:ring-accent-blue/10 outline-none transition-all font-bold text-lg placeholder:text-text-secondary/20"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <p className="text-accent-red text-xs font-bold text-center animate-shake uppercase tracking-wider">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-16 bg-accent-blue text-white rounded-2xl font-black text-lg shadow-xl shadow-accent-blue/20 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 mt-4"
          >
            {isSubmitting ? (
              <Loader2 className="animate-spin h-6 w-6" />
            ) : (
              <>
                <LogIn className="h-6 w-6" />
                {t.login}
              </>
            )}
          </button>
        </form>

        <div className="pt-4 flex justify-center">
          <button
            onClick={() => setLanguage(language === 'en' ? 'bn' : 'en')}
            className="flex items-center gap-2 text-text-secondary hover:text-accent-blue transition-colors font-bold text-xs uppercase tracking-widest"
          >
            <Globe className="h-4 w-4" />
            {language === 'en' ? 'বাংলা' : 'English'}
          </button>
        </div>

        <div className="pt-4 border-t border-dashed border-app-border/60 text-center space-y-2">
          <p 
            className="text-[9px] font-black tracking-widest text-text-secondary uppercase opacity-50 cursor-pointer hover:text-accent-blue transition-colors"
            onClick={() => {
              const current = getUseLocalFallback();
              setUseLocalFallback(!current);
              alert(`Fallback Mode: ${!current ? 'ON' : 'OFF'}`);
            }}
          >
            Database Routing & Security
          </p>
          <div className="flex flex-col items-center justify-center space-y-1 text-[9px] font-bold text-text-secondary/70">
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
              <span>Supabase Auth: Active (ID/Pass Protected)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-accent-blue animate-pulse"></div>
              <span>CockroachDB Logs: Active (Auto-wipe 10th)</span>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
