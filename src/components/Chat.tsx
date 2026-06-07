import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { translations } from '../context/i18n';
import { Send, Image as ImageIcon, Loader2, Mic, Square, Play, Pause, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { ChatMessage } from '../types';
import { format } from 'date-fns';
import { cn } from '../lib/utils';
import { SupabaseService } from '../services/SupabaseService';

export default function Chat() {
  const { user } = useAuth();
  const { t } = useLanguage();
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    // Initial fetch
    SupabaseService.list('messages', [], 100, { column: 'timestamp', ascending: true }).then(setMessages);

    // Real-time subscription
    const sub = SupabaseService.subscribe('messages', (data) => {
      setMessages(data.sort((a: any, b: any) => a.timestamp.localeCompare(b.timestamp)));
      if (!showSearch) {
        setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    });

    return () => { sub.unsubscribe(); };
  }, [showSearch]);

  const filteredMessages = React.useMemo(() => {
    return messages.filter(msg => {
      if (!searchQuery) return true;
      const contentMatch = msg.text?.toLowerCase().includes(searchQuery.toLowerCase());
      const senderMatch = msg.senderName?.toLowerCase().includes(searchQuery.toLowerCase());
      return contentMatch || senderMatch;
    });
  }, [messages, searchQuery]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await uploadAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Recording error:", err);
      toast.error("Please allow microphone access to send voice messages. / ভয়েস মেসেজ পাঠানোর জন্য দয়া করে মাইক্রোফোন ব্যবহারের অনুমতি দিন।");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const uploadAudio = async (blob: Blob) => {
    if (!user) return;
    setIsSending(true);
    try {
      const fileName = `${Date.now()}.webm`;
      const url = await SupabaseService.uploadFile('chat', `audio/${fileName}`, blob);

      const msgData = {
        senderId: user.id,
        senderName: user.name,
        audioUrl: url,
        timestamp: new Date().toISOString()
      };
      await SupabaseService.create('messages', msgData);
    } catch (err) {
      console.error("Audio upload error:", err);
    } finally {
      setIsSending(false);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || !user || isSending) return;

    setIsSending(true);
    const msgData = {
      senderId: user.id,
      senderName: user.name,
      text: inputText,
      timestamp: new Date().toISOString()
    };
    try {
      await SupabaseService.create('messages', msgData);
      setInputText('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSending(false);
    }
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsSending(true);
    try {
      const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
      const url = await SupabaseService.uploadFile('chat', `photos/${fileName}`, file);

      const msgData = {
        senderId: user.id,
        senderName: user.name,
        photoUrl: url,
        timestamp: new Date().toISOString()
      };
      await SupabaseService.create('messages', msgData);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSending(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full bg-bg-app">
      <div className="bg-white px-6 py-3 border-b flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="text-[10px] font-black uppercase tracking-widest text-text-secondary">
          {filteredMessages.length} Messages
        </div>
        <div className="flex items-center gap-2">
          {showSearch && (
            <motion.div 
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 200, opacity: 1 }}
              className="relative"
            >
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-text-secondary" />
              <input 
                autoFocus
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-7 pr-3 py-1.5 bg-bg-app border border-app-border rounded-lg text-xs font-medium focus:outline-none"
              />
            </motion.div>
          )}
          <button 
            onClick={() => {
              setShowSearch(!showSearch);
              if (showSearch) setSearchQuery('');
            }}
            className={cn("p-2 rounded-lg transition-colors", showSearch ? "bg-accent-blue text-white" : "text-text-secondary hover:bg-bg-app")}
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {filteredMessages.map((msg, idx) => {
          const isMe = msg.senderId === user?.id;
          return (
            <div key={`${msg.id || 'no-id'}-${idx}`} className={cn("flex flex-col", isMe ? "items-end" : "items-start")}>
              <span className="text-[10px] font-bold text-text-secondary mb-1 px-1 uppercase tracking-widest opacity-50">
                {msg.senderName} • {msg.timestamp ? format(new Date((msg.timestamp as any)?.toDate?.() || msg.timestamp), 'hh:mm a') : '...'}
              </span>
              <div className={cn(
                "max-w-[85%] p-4 rounded-2xl shadow-sm",
                isMe ? "bg-accent-blue text-white rounded-tr-none" : "bg-white text-text-primary rounded-tl-none border border-app-border"
              )}>
                {msg.photoUrl && (
                  <img src={msg.photoUrl} className="rounded-xl mb-3 max-h-72 w-full object-cover" alt="Uploaded" />
                )}
                {msg.audioUrl && (
                  <audio controls className="w-full h-10 mb-2">
                    <source src={msg.audioUrl} type="audio/webm" />
                    Your browser does not support the audio element.
                  </audio>
                )}
                {msg.text && <p className="text-sm font-medium leading-relaxed">{msg.text}</p>}
              </div>
            </div>
          );
        })}
        <div ref={scrollRef} />
      </div>

      <div className="bg-white p-6 border-t border-app-border pb-10">
        <form onSubmit={handleSend} className="flex flex-col gap-3">
          {isRecording && (
            <div className="flex items-center justify-between bg-accent-red/5 p-3 rounded-xl border border-accent-red/20 mb-2 animate-pulse">
              <div className="flex items-center gap-2 text-accent-red font-bold text-xs uppercase italic">
                <div className="w-2 h-2 bg-accent-red rounded-full animate-ping" />
                Recording Voice... {formatTime(recordingTime)}
              </div>
              <button 
                type="button" 
                onClick={stopRecording}
                className="bg-accent-red text-white p-2 rounded-lg"
              >
                <Square className="h-4 w-4" />
              </button>
            </div>
          )}
          
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={isRecording}
              onClick={() => fileInputRef.current?.click()}
              className="p-3 text-text-secondary hover:text-accent-blue transition-colors bg-bg-app rounded-xl disabled:opacity-30"
            >
              <ImageIcon className="h-5 w-5" />
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handlePhotoSelect}
              className="hidden"
              accept="image/*"
            />
            
            <button
              type="button"
              disabled={isSending}
              onClick={isRecording ? stopRecording : startRecording}
              className={cn(
                "p-3 rounded-xl transition-all active:scale-95",
                isRecording ? "bg-accent-red text-white" : "bg-bg-app text-text-secondary hover:text-accent-green"
              )}
            >
              <Mic className="h-5 w-5" />
            </button>

            <input
              type="text"
              value={inputText}
              disabled={isRecording}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={t.text + "..."}
              className="flex-1 h-12 px-4 bg-bg-app border border-app-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-blue/10 transition-all font-medium text-sm disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isSending || (!inputText.trim()) || isRecording}
              className="bg-accent-blue text-white p-3 rounded-xl disabled:opacity-50 active:scale-90 transition-all shadow-lg shadow-accent-blue/20"
            >
              {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
