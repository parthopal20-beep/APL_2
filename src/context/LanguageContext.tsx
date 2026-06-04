import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations, Language } from './i18n';
import { useAuth } from './AuthContext';
import { SupabaseService } from '../services/SupabaseService';

interface LanguageContextType {
  language: Language;
  t: typeof translations.en;
  setLanguage: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [language, setLang] = useState<Language>('en');

  useEffect(() => {
    if (user?.language) {
      setLang(user.language);
    }
  }, [user]);

  const setLanguage = async (lang: Language) => {
    setLang(lang);
    if (user) {
      await SupabaseService.update('users', user.id, { language: lang });
    }
  };

  const t = translations[language];

  return (
    <LanguageContext.Provider value={{ language, t, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within LanguageProvider');
  return context;
}
