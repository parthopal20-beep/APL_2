import React, { useState, useEffect } from 'react';
import { 
  GoogleSheetsService, 
  GoogleUser 
} from '../services/GoogleSheetsService';
import { 
  Database, 
  CloudCheck, 
  CloudLightning, 
  CloudSnow, 
  RefreshCw, 
  CheckCircle, 
  AlertTriangle, 
  ArrowUpRight, 
  ExternalLink,
  ChevronRight,
  Sparkles,
  Info
} from 'lucide-react';
import { toast } from 'sonner';
import { LocalDB } from '../lib/supabase';
import { motion } from 'motion/react';

export default function GoogleSheetsSyncManager() {
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });
  const [recordsCount, setRecordsCount] = useState(0);
  const [authError, setAuthError] = useState<string | null>(null);

  // Load current auth and records count
  useEffect(() => {
    // Determine number of records in local database
    const localRecords = LocalDB.get('attendance');
    setRecordsCount(localRecords.length);

    // Get spreadsheetId if cached
    const storedId = GoogleSheetsService.getStoredSpreadsheetId();
    if (storedId) {
      setSpreadsheetId(storedId);
    }

    // Subscribe to Google auth state changes
    const unsub = GoogleSheetsService.onAuthChange((user, token) => {
      setGoogleUser(user);
      setAccessToken(token);
      setIsInitializing(false);

      if (user && token && !storedId) {
        // Auto-search for existing spreadsheet in user's drive on login
        GoogleSheetsService.findExistingSpreadsheet().then(id => {
          if (id) {
            setSpreadsheetId(id);
            GoogleSheetsService.storeSpreadsheetId(id);
            toast.success("পছন্দসই গুগল শিটটি খুঁজে পাওয়া গিয়েছে! (Spreadsheet discovered in Google Drive)");
          }
        });
      }
    });

    return () => unsub();
  }, []);

  const handleSignIn = async () => {
    try {
      setAuthError(null);
      const { user, token } = await GoogleSheetsService.signInWithGoogle();
      setGoogleUser(user);
      setAccessToken(token);
      toast.success("সফলভাবে গুগল অ্যাকাউন্ট সংযুক্ত করা হয়েছে! (Connected to Google Services)");
      
      // Auto-search Drive on manual login
      const foundId = await GoogleSheetsService.findExistingSpreadsheet();
      if (foundId) {
        setSpreadsheetId(foundId);
        GoogleSheetsService.storeSpreadsheetId(foundId);
      }
    } catch (e: any) {
      const errorMsg = e.message || "Google Authentication failed.";
      setAuthError(errorMsg);
      toast.error(errorMsg);
    }
  };

  const handleSignOut = async () => {
    if (window.confirm("ডিভাইস থেকে গুগল অ্যাকাউন্ট ডিসকানেক্ট করতে চান? (Do you want to disconnect Google Sheets?)")) {
      await GoogleSheetsService.logout();
      setGoogleUser(null);
      setAccessToken(null);
      setSpreadsheetId(null);
      toast.success("গুগল অ্যাকাউন্ট ডিসকানেক্ট করা হয়েছে। (Disconnected)");
    }
  };

  const handleCreateSpreadsheet = async () => {
    try {
      toast.info("গুগল ড্রাইভ-এ নতুন স্প্রেডশীট ফাইল তৈরি করা হচ্ছে... অনুগ্রহ করে অপেক্ষা করুন...");
      const id = await GoogleSheetsService.createSpreadsheet();
      setSpreadsheetId(id);
      toast.success("সফলভাবে নতুন এটেনডেন্স স্প্রেডশীট ফাইলটি তৈরি করা হয়েছে! (Spreadsheet created successfully)");
    } catch (e: any) {
      toast.error(e.message || "Failed to create Google Sheet.");
    }
  };

  const handleSyncData = async () => {
    if (!spreadsheetId) {
      toast.warning("দয়া করে প্রথমে এটেনডেন্স স্প্রেডশীট কানেক্ট করুন। (Please link/create a spreadsheet first)");
      return;
    }

    setIsSyncing(true);
    setSyncProgress({ current: 0, total: recordsCount });
    toast.info("গুগল শিটে ডেটা সিঙ্ক করা হচ্ছে... উইন্ডো বন্ধ করবেন না। (Syncing records directly to Google Sheets...)");

    try {
      const syncedCount = await GoogleSheetsService.syncAllLocalData(
        spreadsheetId,
        (current, total) => {
          setSyncProgress({ current, total });
        }
      );
      
      toast.success(`সফলভাবে ${syncedCount} টি এটেনডেন্স রেকর্ড গুগল স্প্রেডশীটে ব্যাকআপ রাখা হয়েছে!`);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Synchronization paused/failed due to connection interruption.");
    } finally {
      setIsSyncing(false);
    }
  };

  if (isInitializing) {
    return (
      <div className="p-12 text-center">
        <RefreshCw className="h-8 w-8 text-slate-400 animate-spin mx-auto mb-2" />
        <p className="text-xs text-text-secondary font-black uppercase">সংযুক্তি চেক করা হচ্ছে...</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start font-sans">
      
      {/* Configuration & Integration Console */}
      <div className="lg:col-span-8 bg-white rounded-[2.5rem] p-6 lg:p-8 border border-app-border shadow-sm space-y-6">
        
        {/* Connection Widget */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-[2rem] border border-brand-charcoal/5 bg-slate-50/50">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-800 shrink-0">
              <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-6 w-6">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
              </svg>
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">
                {googleUser ? "গুগল ড্রাইভ ও শিট সংযুক্ত আছে" : "গুগল ড্রাইভ সংযুক্ত করুন"}
              </h3>
              <p className="text-xs text-text-secondary font-medium">
                {googleUser ? `স্বাক্ষরিত অ্যাকাউন্ট: ${googleUser.email}` : "সম্পূর্ণ সিকিউর পদ্ধতিতে সরাসরি গুগল শিট ডেটাবেজে ব্যাকআপ নিতে সাইন ইন করুন।"}
              </p>
            </div>
          </div>
          
          {googleUser ? (
            <button 
              onClick={handleSignOut}
              className="px-5 py-3 bg-red-50 hover:bg-red-100 text-accent-red font-black text-xs uppercase tracking-widest rounded-xl transition-colors active:scale-95"
            >
              Disconnect
            </button>
          ) : (
            <button 
              onClick={handleSignIn}
              className="px-6 py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-2"
            >
              Sign in with Google
            </button>
          )}
        </div>

        {authError && (
          <div className="p-6 bg-red-50/70 border-2 border-red-200/60 rounded-[2rem] space-y-4 animate-in fade-in slide-in-from-top-1 duration-300">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-accent-red shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-black text-red-900">গুগল অথেনটিকেশন ব্যর্থ হয়েছে (Google Auth Failed)</h4>
                <p className="text-xs text-red-700 font-bold mt-1 uppercase tracking-tight">{authError}</p>
              </div>
            </div>

            <div className="pt-3 border-t border-red-200/50 space-y-2.5">
              <p className="text-xs font-black text-red-950 uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="h-4.5 w-4.5 text-accent-blue" />
                কীভাবে সমস্যার সমাধান করবেন? (How to Resolve)
              </p>
              
              <div className="space-y-2 text-[11px] text-red-800 font-semibold leading-relaxed pl-5 list-decimal">
                <div className="relative">
                  <span className="absolute -left-5 top-0 font-bold text-accent-blue">১.</span>
                  <strong>নতুন ট্যাবে ওপেন করুন (Open in New Tab):</strong> আপনি যদি এআই স্টুডিও ইন্টিগ্রেটেড আইফ্রেমে থাকেন, তবে ব্রাউজার সিকিউরিটি অথেনটিকেশন পপআপ বা কুকি ব্লক করতে পারে। এই উইন্ডোর উপরের ডান কোণায় থাকা 
                  <span className="bg-white/80 border border-slate-200 rounded px-1.5 py-0.5 mx-1 font-mono text-[9px] font-black inline-flex items-center gap-1 text-slate-800">
                    Open in new window <ExternalLink className="h-2.5 w-2.5" />
                  </span> 
                  আইকনে ক্লিক করে নতুন ট্যাবে অ্যাপটি খুলুন এবং সাইন-ইন সম্পন্ন করুন।
                </div>
                
                <div className="relative">
                  <span className="absolute -left-5 top-0 font-bold text-accent-blue">২.</span>
                  <strong>পপআপ ব্লক ডিজেবল করুন (Allow Popups):</strong> ব্রাউজারের অ্যাড্রেস বারের ডান পাশে লাল রঙের পপআপ ব্লকড আইকনটি চেক করে <strong>"Always allow pop-ups"</strong> নির্বাচন করুন।
                </div>
              </div>
            </div>
          </div>
        )}

        {googleUser && (
          <div className="space-y-4 animate-in fade-in duration-300">
            {/* Sheet Linkage Section */}
            <div className="p-6 rounded-[2rem] border border-app-border space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h4 className="text-sm font-black text-slate-900">গুগল স্প্রেডশীট ফাইল লিঙ্ক (File Linkage)</h4>
                  <p className="text-[11px] text-text-secondary font-medium md:max-w-md">
                    এপ্লিক্যাশনের সমস্ত এটেনডেন্স রেকর্ড এই স্প্রেডশীট ফাইলের আলাদা আলাদা মাসের ট্যাবে (যেমন: June 2026) অটোমেটিক্যালি সেভ হবে।
                  </p>
                </div>
                
                {!spreadsheetId ? (
                  <button 
                    onClick={handleCreateSpreadsheet}
                    className="px-5 py-3 bg-accent-blue text-white hover:bg-accent-blue/90 font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-accent-blue/20 active:scale-95 flex items-center gap-2 shrink-0"
                  >
                    <Sparkles className="h-4 w-4" /> Create New Log Book
                  </button>
                ) : (
                  <a 
                    href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`} 
                    target="_blank" 
                    rel="noreferrer"
                    className="px-5 py-3 bg-emerald-600 text-white hover:bg-emerald-700 font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-emerald-500/10 active:scale-95 flex items-center gap-1.5 shrink-0"
                  >
                    Open Google Sheet <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>

              {spreadsheetId && (
                <div className="p-4 bg-emerald-50/35 border border-emerald-100/60 rounded-2xl flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-[9px] uppercase font-black text-emerald-800 tracking-wider">Sheet Integrated ID</span>
                    <p className="text-xs font-mono text-slate-800 font-bold truncate max-w-sm md:max-w-md">{spreadsheetId}</p>
                  </div>
                  <div className="text-[11px] font-black text-emerald-700 bg-emerald-100/65 px-2.5 py-1 rounded-full flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-ping"></span> Active Connected
                  </div>
                </div>
              )}
            </div>

            {/* Sync Console Widget */}
            {spreadsheetId && (
              <div className="p-6 rounded-[2rem] border border-app-border bg-slate-50/20 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-black text-slate-900">ডিপো এটেনডেন্স ডেটা সিঙ্ক করুন (Execute Database Synchronization)</h4>
                    <p className="text-[11px] text-text-secondary font-medium">
                      বর্তমানে ব্রাউজারে মোট <strong>{recordsCount} টি</strong> এটেনডেন্স রেকর্ড মজুত আছে যা নিরাপদ ব্যাকআপের জন্য শিটে পাঠানো যাবে।
                    </p>
                  </div>

                  <button 
                    onClick={handleSyncData}
                    disabled={isSyncing || recordsCount === 0}
                    className="px-6 py-4 bg-slate-900 hover:bg-slate-800 text-white disabled:bg-slate-100 disabled:text-slate-400 font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
                  >
                    {isSyncing ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Database className="h-4 w-4" />
                    )}
                    শিটে ডাটা সিঙ্ক করুন (Sync to Sheet)
                  </button>
                </div>

                {isSyncing && (
                  <div className="space-y-2 pt-2">
                    <div className="flex justify-between items-center text-[11px] font-black uppercase text-slate-700">
                      <span>সিঙ্কিং প্রোগ্রেস (Backup In Progress)</span>
                      <span>{syncProgress.current} / {syncProgress.total} ({Math.round((syncProgress.current / syncProgress.total) * 100) || 0}%)</span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-emerald-600 transition-all duration-300" 
                        style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Side Help & System Architecture Rules Card */}
      <div className="lg:col-span-4 space-y-6">
        <div className="bg-slate-900 text-white rounded-[2.5rem] p-6 lg:p-8 space-y-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-bl-[100px] -mr-8 -mt-8" />
          
          <h3 className="text-lg font-black uppercase tracking-tight">কিভাবে কাজ করে? (Architecture Guidance)</h3>
          
          <div className="space-y-4 text-slate-300 text-xs">
            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-white/10 text-white flex items-center justify-center font-black shrink-0">1</span>
              <div>
                <p className="font-bold text-white mb-0.5">১০০% ফ্রি ও লাইফটাইম ব্যাকআপ</p>
                <p className="leading-relaxed">কোন এক্সটার্নাল ডাটাবেজের লিমিট বা মেমোরি ফুরিয়ে যাবার ভয় থাকে না। আপনার গুগল জিমেইল ড্রাইভ ও সিট অ্যাকাউন্ট থেকেই সমস্ত এটেনডেন্স লোড হবে।</p>
              </div>
            </div>

            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-white/10 text-white flex items-center justify-center font-black shrink-0">2</span>
              <div>
                <p className="font-bold text-white mb-0.5">মাসিক সিট তৈরি (Monthly Seperated Tabs)</p>
                <p className="leading-relaxed">স্প্রেডশীটে প্রতি মাসের জন্য একটি করে নতুন ট্যাব অটোমেটিক তৈরি হবে যেমন "June 2026", "July 2026" ইত্যাদি। এতে আলাদা ডাউনলোড করার প্রয়োজনই থাকবে না।</p>
              </div>
            </div>

            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-white/10 text-white flex items-center justify-center font-black shrink-0">3</span>
              <div>
                <p className="font-bold text-white mb-0.5">রিয়েল-টাইম ওভাররাইড প্রোটেকশন</p>
                <p className="leading-relaxed">একই আইডি বা ডুপ্লিকেট চেকিন ডাটা ডেট বাই ডেট আপডেট করতে ডুপ্লিকেট কলাম ওভাররাইড করে একদম নির্ভুল এন্ট্রি সিট রাখে।</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-amber-50/50 border border-amber-200/60 rounded-3xl p-6 flex gap-3">
          <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <h5 className="font-black text-amber-800">ফটোগ্রাফি ও ফাইল সাইজ</h5>
            <p className="text-amber-700 leading-relaxed font-semibold">
              এমপ্লয়ীদের তোলা চেক-ইন ফটো শুধুমাত্র কোকরোচ লোকাল ক্যাশে সেভ থাকে আর ব্যাকআপ রেকর্ডে মিডিয়া প্রোফাইল লিংক সিঙ্ক হয়ে যায় যাতে গুগল সিট ফাইলের সাইজ একদম লাইট থাকে।
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}
