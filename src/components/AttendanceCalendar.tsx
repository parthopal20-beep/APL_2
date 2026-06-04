import React, { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, addMonths, subMonths, isAfter } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, DollarSign, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { SupabaseService } from '../services/SupabaseService';
import { AttendanceRecord } from '../types';

interface AttendanceCalendarProps {
  userId: string;
  userName: string;
  paydays?: any[];
}

export default function AttendanceCalendar({ userId, userName, paydays = [] }: AttendanceCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRecords() {
      setLoading(true);
      try {
        const start = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
        const end = format(endOfMonth(currentMonth), 'yyyy-MM-dd');
        
        // Fetch logic via SupabaseService.list with filters
        const response = await SupabaseService.list('attendance', [
          { column: 'userId', value: userId },
          { column: 'date', value: start, operator: 'gte' },
          { column: 'date', value: end, operator: 'lte' }
        ]);
        setRecords(response);
      } catch (err) {
        console.error("Failed to fetch calendar records:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchRecords();
  }, [userId, currentMonth]);

  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth)
  });

  const getStatus = (day: Date) => {
    const record = records.find(r => r.date === format(day, 'yyyy-MM-dd'));
    const isFuture = isAfter(day, new Date()) && !isToday(day);
    
    if (isFuture) return null;
    if (!record) return 'ABSENT'; // ❌
    if (record.checkInTime && !record.checkOutTime) return 'PARTIAL'; // ✅
    if (record.checkInTime && record.checkOutTime) return 'COMPLETE'; // 💲
    return 'ABSENT';
  };

  return (
    <div className="bg-white rounded-[32px] border border-app-border overflow-hidden shadow-sm animate-in fade-in zoom-in duration-300">
      <div className="p-6 bg-bg-app border-b border-app-border flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-accent-blue" />
            Attendance: {userName}
          </h3>
          <p className="text-[10px] text-text-secondary font-bold uppercase tracking-widest">
            {format(currentMonth, 'MMMM yyyy')}
          </p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="p-2 hover:bg-white rounded-xl border border-app-border/50 shadow-sm active:scale-95 transition-all text-text-secondary"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button 
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="p-2 hover:bg-white rounded-xl border border-app-border/50 shadow-sm active:scale-95 transition-all text-text-secondary"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-7 mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="text-center text-[8px] font-black text-text-secondary uppercase tracking-widest py-2">
              {d}
            </div>
          ))}
        </div>
        
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: startOfMonth(currentMonth).getDay() }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}
          
          {days.map(day => {
            const status = getStatus(day);
            const isPayday = paydays.some(p => p.date === format(day, 'yyyy-MM-dd'));

            return (
              <div 
                key={day.toString()}
                className={cn(
                  "aspect-square flex flex-col items-center justify-center rounded-2xl border border-transparent transition-all relative",
                  isToday(day) ? "bg-accent-blue/5 border-accent-blue/20" : "bg-bg-app/30",
                  isPayday && "bg-accent-green/10 border-accent-green/30"
                )}
              >
                <span className={cn(
                  "text-[9px] font-black mb-1",
                  isToday(day) ? "text-accent-blue" : "text-slate-400"
                )}>
                  {format(day, 'd')}
                </span>
                
                <div className="h-5 flex items-center justify-center relative w-full mt-1">
                  {status === 'COMPLETE' && <span className="text-sm">💲</span>}
                  {status === 'PARTIAL' && <span className="text-sm">✅</span>}
                  {status === 'ABSENT' && !isAfter(day, new Date()) && <span className="text-sm">❌</span>}
                  
                  {isPayday && (
                    <div className="absolute -top-7 -right-1 text-[11px] animate-bounce bg-white/80 rounded-full shadow-sm p-0.5 z-10">
                      💰
                    </div>
                  )}
                </div>
                
                {isToday(day) && (
                  <div className="absolute top-1 right-1 w-1 h-1 bg-accent-blue rounded-full" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="p-4 bg-bg-app/50 border-t border-app-border grid grid-cols-2 gap-2">
        <div className="flex items-center gap-2 px-2 py-1.5 bg-white rounded-xl border border-app-border/50">
          <span className="text-xs">💲</span>
          <span className="text-[7px] font-black uppercase text-text-secondary">Done</span>
        </div>
        <div className="flex items-center gap-2 px-2 py-1.5 bg-white rounded-xl border border-app-border/50">
          <span className="text-xs">💰</span>
          <span className="text-[7px] font-black uppercase text-accent-green">Salary Day</span>
        </div>
        <div className="flex items-center gap-2 px-2 py-1.5 bg-white rounded-xl border border-app-border/50">
          <span className="text-xs">✅</span>
          <span className="text-[7px] font-black uppercase text-text-secondary">Missing CO</span>
        </div>
        <div className="flex items-center gap-2 px-2 py-1.5 bg-white rounded-xl border border-app-border/50">
          <span className="text-xs">❌</span>
          <span className="text-[7px] font-black uppercase text-text-secondary">Absent</span>
        </div>
      </div>
    </div>
  );
}
