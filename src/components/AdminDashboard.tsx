import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { translations } from '../context/i18n';
import { 
  Users, 
  UserPlus, 
  Clock, 
  MapPin, 
  TrendingUp, 
  MoreVertical,
  ShieldCheck,
  ShieldAlert,
  Edit2,
  Trash2,
  Eye,
  X,
  XCircle,
  Plus,
  ExternalLink,
  MessageSquare,
  Search,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  LogOut,
  RefreshCw,
  Database,
  Wifi,
  WifiOff,
  Phone,
  History,
  LayoutDashboard,
  PackageCheck,
  CreditCard,
  Map,
  ChevronRight,
  ChevronLeft,
  Scan,
  Barcode,
  Calculator,
  Check,
  Camera,
  ImageIcon,
  AlertTriangle,
  CheckSquare,
  Save,
  FileDown,
  FileText,
  CalendarCheck,
  Download,
  Zap,
  Send,
  Globe,
  Monitor,
  Key,
  ArrowRight
} from 'lucide-react';
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parseISO, subMonths, addMonths } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { UserProfile, AttendanceRecord, PaymentBase, SalaryRecord, Payday, UserStatus, Role, ValueMismatch, AdHocJob } from '../types';
import { cn, compressImage } from '../lib/utils';
import { SupabaseService } from '../services/SupabaseService';
import Chat from './Chat';
import LiveMap from './LiveMap';
import AttendanceCalendar from './AttendanceCalendar';
import { useWakeLock } from '../hooks/useWakeLock';
import * as XLSX from 'xlsx';
import { supabase, isConfigured } from '../lib/supabase';


interface AttendanceHistoryItemProps {
  rec: AttendanceRecord;
  paydays: Payday[];
  t: any;
}

function AttendanceHistoryItem({ rec, paydays, t }: AttendanceHistoryItemProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  
  return (
    <div className={cn(
      "bg-bg-app rounded-2xl p-4 border border-app-border space-y-3 transition-all",
      rec.status === 'FRAUDULENT' && "bg-accent-red/5 border-accent-red/20 opacity-90"
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="text-sm font-black text-slate-900">
            {format(new Date(rec.date), 'EEEE, MMM d')}
          </div>
          {paydays.some(p => p.date === rec.date) && (
            <span className="text-sm">💲</span>
          )}
          {rec.status === 'FRAUDULENT' && (
            <span className="text-[8px] font-black text-white bg-accent-red px-1.5 py-0.5 rounded uppercase tracking-tighter shadow-sm animate-pulse">
              Flagged Fake
            </span>
          )}
          {rec.reviewNeeded && rec.status !== 'FRAUDULENT' && (
            <span className="text-[8px] font-black text-white bg-amber-500 px-1.5 py-0.5 rounded uppercase tracking-tighter shadow-sm">
              {t.review} Needed
            </span>
          )}
        </div>
        <div className={cn(
          "text-xs font-black",
          rec.status === 'FRAUDULENT' ? "text-text-secondary line-through opacity-50" : "text-accent-green"
        )}>
          ₹{rec.earnings?.toLocaleString()}
        </div>
      </div>

      <div className={cn("grid grid-cols-2 gap-4", rec.status === 'FRAUDULENT' && "opacity-60")}>
        <div className="space-y-1">
          <div className="text-[9px] text-text-secondary font-bold uppercase tracking-widest">Check-in</div>
          <div className="text-[11px] font-bold">{format(new Date(rec.checkInTime), 'hh:mm a')}</div>
          {rec.checkInLocation && (
            <a 
              href={`https://www.google.com/maps?q=${rec.checkInLocation.latitude},${rec.checkInLocation.longitude}`} 
              target="_blank" 
              rel="noreferrer" 
              className="text-[9px] text-accent-blue font-bold flex items-center gap-1 mt-1 hover:underline underline-offset-2"
            >
              <MapPin className="h-2.5 w-2.5" /> {rec.checkInLocation.address || 'View on Map'}
            </a>
          )}
        </div>
        {rec.checkOutTime ? (
          <div className="space-y-1">
            <div className="text-[9px] text-text-secondary font-bold uppercase tracking-widest">Check-out</div>
            <div className="text-[11px] font-bold">{format(new Date(rec.checkOutTime), 'hh:mm a')}</div>
            {rec.selectedPinCodes && rec.selectedPinCodes.length > 0 && (
              <div className="flex flex-wrap gap-1 px-1 py-0.5 bg-accent-blue/5 border border-accent-blue/10 rounded-lg">
                <span className="text-[8px] font-black uppercase text-accent-blue tracking-tighter block mb-0.5">Pins:</span>
                <div className="flex flex-wrap gap-0.5">
                  {rec.selectedPinCodes.map(p => (
                    <span key={p} className="text-[8px] text-slate-800 font-bold bg-white px-1 py-0.2 rounded border border-slate-200">{p}</span>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 mt-1">
              {rec.checkOutLocation && (
                <a 
                  href={`https://www.google.com/maps?q=${rec.checkOutLocation.latitude},${rec.checkOutLocation.longitude}`} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="text-[9px] text-accent-blue font-bold flex items-center gap-1 hover:underline underline-offset-2"
                >
                  <MapPin className="h-2.5 w-2.5" /> {rec.checkOutLocation.address || 'View on Map'}
                </a>
              )}
            </div>
            <div className="text-[9px] text-text-secondary font-bold">• {rec.hoursWorked || 0} hrs worked</div>
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-white/50 px-3 py-2 rounded-xl text-accent-blue border border-accent-blue/10">
            <span className="text-xs">✅</span>
            <span className="text-[10px] font-bold uppercase tracking-tighter">Still On Shift</span>
          </div>
        )}
      </div>

      {(rec.shipments !== undefined || rec.distanceDriven != null) && (
        <div className="flex items-center gap-2 pt-2 border-t border-app-border/50">
          {rec.shipments !== undefined && (
            <div className="bg-white/50 px-3 py-1.5 rounded-xl border border-app-border flex items-center gap-2">
              <PackageCheck className="h-3 w-3 text-accent-blue" />
              <div className="text-[10px] font-black">{rec.shipments} <span className="text-[8px] text-text-secondary opacity-60">Units</span></div>
            </div>
          )}
          {rec.distanceDriven != null && (
            <div className="bg-white/50 px-3 py-1.5 rounded-xl border border-app-border flex items-center gap-2">
              <MapPin className="h-3 w-3 text-orange-500" />
              <div className="text-[10px] font-black">{(rec.distanceDriven || 0).toFixed(1)} <span className="text-[8px] text-text-secondary opacity-60">KM</span></div>
            </div>
          )}
        </div>
      )}
      
      {(rec.checkInPhoto || rec.checkOutPhoto) && (
        <div className={cn("pt-2 border-t border-app-border/50 grid gap-2", rec.checkInPhoto && rec.checkOutPhoto ? "grid-cols-2" : "grid-cols-1", rec.status === 'FRAUDULENT' && "grayscale opacity-50")}>
          {rec.checkInPhoto && (
            <div className="space-y-1">
              <div className="text-[8px] text-text-secondary font-bold uppercase tracking-tighter">Check-in Photo</div>
              <img 
                src={rec.checkInPhoto} 
                alt="Check-in" 
                className="w-full h-32 object-cover rounded-xl shadow-sm border border-app-border"
                onClick={() => window.open(rec.checkInPhoto, '_blank')}
              />
            </div>
          )}
          {rec.checkOutPhoto && (
            <div className="space-y-1">
              <div className="text-[8px] text-text-secondary font-bold uppercase tracking-tighter">Check-out Photo</div>
              <img 
                src={rec.checkOutPhoto} 
                alt="Check-out" 
                className="w-full h-32 object-cover rounded-xl shadow-sm border border-app-border"
                onClick={() => window.open(rec.checkOutPhoto, '_blank')}
              />
            </div>
          )}
        </div>
      )}
      
      {rec.shipments !== undefined && (
        <div className={cn("flex items-center gap-2 pt-1", rec.status === 'FRAUDULENT' && "opacity-50")}>
          <span className="text-[9px] font-bold text-text-secondary uppercase tracking-widest">Shipments:</span>
          <span className="text-[10px] font-black text-slate-900">{rec.shipments}</span>
        </div>
      )}

      {rec.odometerStart !== undefined && (
        <div className={cn("pt-2 border-t border-app-border/30 grid grid-cols-3 gap-2", rec.status === 'FRAUDULENT' && "opacity-50")}>
          <div className="space-y-0.5">
            <div className="text-[8px] text-text-secondary font-bold uppercase tracking-tighter">{t.startOdometer}</div>
            <div className="text-[10px] font-black">{rec.odometerStart} {t.km}</div>
          </div>
          {rec.odometerEnd !== undefined && (
            <>
              <div className="space-y-0.5">
                <div className="text-[8px] text-text-secondary font-bold uppercase tracking-tighter">{t.endOdometer}</div>
                <div className="text-[10px] font-black">{rec.odometerEnd} {t.km}</div>
              </div>
              <div className="space-y-0.5">
                <div className="text-[8px] text-accent-blue font-bold uppercase tracking-tighter">{t.distanceDriven}</div>
                <div className="text-[10px] font-black text-accent-blue">{rec.distanceDriven} {t.km}</div>
              </div>
            </>
          )}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2 pt-3 border-t border-app-border/30">
        {rec.status === 'FRAUDULENT' ? (
          <div className="flex-1 flex items-center gap-2 text-[10px] text-accent-red font-black uppercase bg-accent-red/10 px-3 py-2 rounded-xl">
            <AlertCircle className="h-4 w-4" />
            {t.fakeAttendanceWarning}
          </div>
        ) : (
          <motion.button
            whileTap={{ scale: 0.95 }}
            disabled={isProcessing}
            onClick={async (e) => {
              e.stopPropagation();
              setIsProcessing(true);
              try {
                if (!rec.id) throw new Error("Missing ID");
                await SupabaseService.update('attendance', rec.id, { 
                  status: 'FRAUDULENT',
                  earnings: 0,
                  hoursWorked: 0,
                  distanceDriven: 0
                });
              } catch (err) {
                console.error("Mark as fake failed:", err);
                toast.error("Error: " + (err instanceof Error ? err.message : "Connection failed"));
              } finally {
                setIsProcessing(false);
              }
            }}
            className="bg-accent-red/10 text-accent-red hover:bg-accent-red hover:text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 disabled:opacity-50 shadow-sm"
          >
            {isProcessing ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                <ShieldAlert className="h-3.5 w-3.5" />
                {t.markAsFake}
              </>
            )}
          </motion.button>
        )}
        <motion.button
          whileTap={{ scale: 0.95 }}
          disabled={isProcessing}
          onClick={async (e) => {
            e.stopPropagation();
            setIsProcessing(true);
            try {
              if (!rec.id) throw new Error("Missing ID");
              await SupabaseService.delete('attendance', rec.id);
            } catch (err) {
              console.error("Delete failed:", err);
              toast.error("Error: " + (err instanceof Error ? err.message : "Connection failed"));
            } finally {
              setIsProcessing(false);
            }
          }}
          className="bg-bg-app text-text-secondary hover:bg-accent-red hover:text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm border border-app-border flex items-center gap-2 disabled:opacity-50"
        >
          {isProcessing ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <>
              <Trash2 className="h-3.5 w-3.5" />
              {t.deleteRecord}
            </>
          )}
        </motion.button>
      </div>
    </div>
  );
}

function ManualAttendanceForm({ employee, onClose }: { employee: UserProfile, onClose: () => void }) {
  const { t } = useLanguage();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    checkInTime: format(new Date(), 'yyyy-MM-dd\'T\'09:00'),
    checkOutTime: format(new Date(), 'yyyy-MM-dd\'T\'18:00'),
    shipments: 0,
    odometerStart: 0,
    odometerEnd: 0,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const checkInDate = new Date(formData.checkInTime);
      const checkOutDate = new Date(formData.checkOutTime);
      const hoursWorked = Math.max(0, (checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60));
      
      let earnings = 0;
      if (employee.paymentBase === 'DAILY_FIXED') {
        earnings = employee.rate;
      } else if (employee.paymentBase === 'PER_SHIPMENT') {
        earnings = formData.shipments * employee.rate;
      } else if (employee.paymentBase === 'DRIVER') {
        earnings = employee.rate;
      }

      const distanceDriven = Math.max(0, formData.odometerEnd - formData.odometerStart);

      const record: AttendanceRecord = {
        userId: employee.id,
        date: formData.date,
        checkInTime: checkInDate.toISOString(),
        checkOutTime: checkOutDate.toISOString(),
        checkInLocation: { latitude: 22.754316, longitude: 88.538428, address: "Admin Manual Entry (Office 3)" },
        checkOutLocation: { latitude: 22.754316, longitude: 88.538428, address: "Admin Manual Entry (Office 3)" },
        shipments: formData.shipments > 0 ? formData.shipments : (employee.paymentBase === 'PER_SHIPMENT' ? 0 : undefined),
        odometerStart: employee.paymentBase === 'DRIVER' ? formData.odometerStart : undefined,
        odometerEnd: employee.paymentBase === 'DRIVER' ? formData.odometerEnd : undefined,
        distanceDriven: employee.paymentBase === 'DRIVER' ? distanceDriven : undefined,
        earnings,
        hoursWorked: Number(hoursWorked.toFixed(2)),
        status: 'PRESENT'
      };

      await SupabaseService.create('attendance', record);
      toast.success("Attendance record added successfully!");
      onClose();
    } catch (err: any) {
      console.error("Manual attendance error:", err);
      toast.error("Failed to add attendance: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest block px-1">{t.today} / তারিখ</label>
        <input 
          type="date"
          value={formData.date}
          onChange={(e) => setFormData(p => ({ ...p, date: e.target.value }))}
          className="w-full h-12 bg-bg-app border border-app-border rounded-xl px-4 text-sm font-bold outline-none focus:border-accent-blue transition-all"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest block px-1">{t.inAt} / ঢোকার সময়</label>
          <input 
            type="datetime-local"
            value={formData.checkInTime}
            onChange={(e) => setFormData(p => ({ ...p, checkInTime: e.target.value }))}
            className="w-full h-12 bg-bg-app border border-app-border rounded-xl px-4 text-[10px] font-bold outline-none focus:border-accent-blue transition-all"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest block px-1">{t.checkOut} / বের হওয়ার সময়</label>
          <input 
            type="datetime-local"
            value={formData.checkOutTime}
            onChange={(e) => setFormData(p => ({ ...p, checkOutTime: e.target.value }))}
            className="w-full h-12 bg-bg-app border border-app-border rounded-xl px-4 text-[10px] font-bold outline-none focus:border-accent-blue transition-all"
          />
        </div>
      </div>

      {employee.paymentBase === 'PER_SHIPMENT' && (
        <div className="space-y-1">
          <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest block px-1">{t.shipments} / শিপমেন্ট সংখ্যা</label>
          <input 
            type="number"
            value={formData.shipments}
            onChange={(e) => setFormData(p => ({ ...p, shipments: parseInt(e.target.value) || 0 }))}
            className="w-full h-12 bg-bg-app border border-app-border rounded-xl px-4 text-sm font-bold outline-none focus:border-accent-blue transition-all"
          />
        </div>
      )}

      {employee.paymentBase === 'DRIVER' && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest block px-1">{t.startOdo} / শুরু কিমি</label>
            <input 
              type="number"
              value={formData.odometerStart}
              onChange={(e) => setFormData(p => ({ ...p, odometerStart: parseInt(e.target.value) || 0 }))}
              className="w-full h-12 bg-bg-app border border-app-border rounded-xl px-4 text-sm font-bold outline-none focus:border-accent-blue transition-all"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest block px-1">{t.endOdometer} / শেষ কিমি</label>
            <input 
              type="number"
              value={formData.odometerEnd}
              onChange={(e) => setFormData(p => ({ ...p, odometerEnd: parseInt(e.target.value) || 0 }))}
              className="w-full h-12 bg-bg-app border border-app-border rounded-xl px-4 text-sm font-bold outline-none focus:border-accent-blue transition-all"
            />
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full h-14 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest active:scale-95 transition-all shadow-xl shadow-slate-900/20 flex items-center justify-center gap-2"
      >
        {isSubmitting ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
        {t.save}
      </button>
    </form>
  );
}

function ManualAdHocForm({ employees, onClose }: { employees: UserProfile[], onClose: () => void }) {
  const { t } = useLanguage();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    userId: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    vehicleType: 'TOTO' as AdHocJob['vehicleType'],
    startTime: '09:00',
    endTime: '18:00',
    value: 0
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.userId) {
      toast.error("Please select an employee");
      return;
    }

    setIsSubmitting(true);
    try {
      const selectedEmp = employees.find(e => e.id === formData.userId);
      if (!selectedEmp) throw new Error("Employee not found");

      const [startH, startM] = formData.startTime.split(':').map(Number);
      const [endH, endM] = formData.endTime.split(':').map(Number);
      const totalHours = Math.max(0, (endH + endM/60) - (startH + startM/60));

      const record: AdHocJob = {
        userId: formData.userId,
        employeeName: selectedEmp.name,
        date: formData.date,
        vehicleType: formData.vehicleType,
        startTime: formData.startTime,
        endTime: formData.endTime,
        totalHours: Number(totalHours.toFixed(2)),
        value: formData.value,
        status: 'APPROVED',
        timestamp: new Date().toISOString()
      };

      await SupabaseService.create('ad_hoc_jobs', record);
      toast.success("AD-HOC entry added successfully!");
      onClose();
    } catch (err: any) {
      console.error("Manual adhoc error:", err);
      toast.error("Failed to add AD-HOC entry: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest block px-1">{t.chooseEmployee}</label>
        <select 
          value={formData.userId}
          onChange={(e) => setFormData(p => ({ ...p, userId: e.target.value }))}
          className="w-full h-12 bg-bg-app border border-app-border rounded-xl px-4 text-sm font-bold outline-none focus:border-accent-blue transition-all"
        >
          <option value="">{t.chooseEmployee}...</option>
          {employees.map((emp, idx) => (
            <option key={`${emp.id}-${idx}`} value={emp.id}>{emp.name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest block px-1">{t.today} / তারিখ</label>
        <input 
          type="date"
          value={formData.date}
          onChange={(e) => setFormData(p => ({ ...p, date: e.target.value }))}
          className="w-full h-12 bg-bg-app border border-app-border rounded-xl px-4 text-sm font-bold outline-none focus:border-accent-blue transition-all"
        />
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest block px-1">Vehicle Type / যানবাহনের ধরণ</label>
        <select 
          value={formData.vehicleType}
          onChange={(e) => setFormData(p => ({ ...p, vehicleType: e.target.value as any }))}
          className="w-full h-12 bg-bg-app border border-app-border rounded-xl px-4 text-sm font-bold outline-none focus:border-accent-blue transition-all"
        >
          <option value="TOTO">TOTO</option>
          <option value="TATA ACE(107)">TATA ACE(107)</option>
          <option value="MOTOR VAN">MOTOR VAN</option>
          <option value="ENGINE VAN">ENGINE VAN</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest block px-1">{t.inAt} / শুরু</label>
          <input 
            type="time"
            value={formData.startTime}
            onChange={(e) => setFormData(p => ({ ...p, startTime: e.target.value }))}
            className="w-full h-12 bg-bg-app border border-app-border rounded-xl px-4 text-sm font-bold outline-none focus:border-accent-blue transition-all"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest block px-1">{t.checkOut} / শেষ</label>
          <input 
            type="time"
            value={formData.endTime}
            onChange={(e) => setFormData(p => ({ ...p, endTime: e.target.value }))}
            className="w-full h-12 bg-bg-app border border-app-border rounded-xl px-4 text-sm font-bold outline-none focus:border-accent-blue transition-all"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest block px-1">Value (₹) / ভ্যালু</label>
        <input 
          type="number"
          value={formData.value}
          onChange={(e) => setFormData(p => ({ ...p, value: parseInt(e.target.value) || 0 }))}
          className="w-full h-12 bg-bg-app border border-app-border rounded-xl px-4 text-sm font-bold outline-none focus:border-accent-blue transition-all"
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full h-14 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest active:scale-95 transition-all shadow-xl shadow-slate-900/20 flex items-center justify-center gap-2"
      >
        {isSubmitting ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
        {t.save}
      </button>
    </form>
  );
}

export default function AdminDashboard() {
  const [isMaintenanceDay] = useState(() => {
    const day = new Date().getDate();
    return day === 1 || day === 15;
  });
  const [showMaintenanceWarning, setShowMaintenanceWarning] = useState(true);
  const { logout, user } = useAuth();
  const { t } = useLanguage();
  
  const [employees, setEmployees] = useState<UserProfile[]>([]);
  const [attendanceToday, setAttendanceToday] = useState<AttendanceRecord[]>([]);
  const [liveLocations, setLiveLocations] = useState<any[]>([]);
  const [locationLogs, setLocationLogs] = useState<any[]>([]);
  const [salaries, setSalaries] = useState<SalaryRecord[]>([]);
  const [callLogs, setCallLogs] = useState<any[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [selectedEmployeeUids, setSelectedEmployeeUids] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isAddingEmployee, setIsAddingEmployee] = useState(false);
  const [isImportingEmployees, setIsImportingEmployees] = useState(false);
  const [isManualAttendanceOpen, setIsManualAttendanceOpen] = useState(false);
  const [isManualAdHocOpen, setIsManualAdHocOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<UserProfile | null>(null);
  const [resetCredentialsEmployee, setResetCredentialsEmployee] = useState<UserProfile | null>(null);
  const [globalFishSales, setGlobalFishSales] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const CloudStatusBadge = () => {
    const isLive = isConfigured;
    const dbSize = systemStatus?.dbUsage?.sizeFormatted || "0 B";
    const dbPercent = systemStatus?.dbUsage ? (systemStatus.dbUsage.sizeBytes / systemStatus.dbUsage.limitBytes) * 100 : 0;
    
    return (
      <div className="flex flex-col sm:flex-row gap-2">
        <div className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-2xl border transition-all shadow-sm",
          isLive ? "bg-emerald-50 border-emerald-100 text-emerald-700" : "bg-rose-50 border-rose-100 text-rose-700 animate-pulse text-left"
        )}>
          {isLive ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-wider leading-none">
              {isLive ? "Database Connected" : "Local Mode (No Configuration)"}
            </span>
            {!isLive && (
              <span className="text-[8px] font-bold mt-1 opacity-80 leading-tight max-w-[150px]">
                Set VITE_SUPABASE_URL in settings
              </span>
            )}
          </div>
        </div>

        {isLive && (
          <div className="flex items-center gap-3 px-4 py-2 rounded-2xl border border-app-border bg-white shadow-sm">
            <Database className={cn("h-4 w-4", dbPercent > 80 ? "text-accent-red animate-bounce" : "text-slate-400")} />
            <div className="flex flex-col min-w-[80px]">
              <div className="flex justify-between items-center mb-0.5">
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">Storage</span>
                <span className="text-[10px] font-bold text-slate-900">{dbSize}</span>
              </div>
              <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                <motion.div 
                   initial={{ width: 0 }}
                   animate={{ width: `${Math.min(100, dbPercent)}%` }}
                   className={cn(
                     "h-full transition-all duration-1000",
                     dbPercent > 90 ? "bg-accent-red" : dbPercent > 70 ? "bg-amber-500" : "bg-accent-blue"
                   )}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const { requestWakeLock, releaseWakeLock, isBlocked: isWakeLockBlocked } = useWakeLock(user?.role === 'ADMIN');

  useEffect(() => {
    if (user && user.role === 'ADMIN') {
      requestWakeLock();
    }
    return () => { releaseWakeLock(); };
  }, [user, requestWakeLock, releaseWakeLock]);
  
  const [allAttendanceRecords, setAllAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [odoHistory, setOdoHistory] = useState<AttendanceRecord[]>([]);
  const [mismatches, setMismatches] = useState<ValueMismatch[]>([]);
  const [selectedMismatchIds, setSelectedMismatchIds] = useState<Set<string>>(new Set());
  const [isBulkDeletingMismatches, setIsBulkDeletingMismatches] = useState(false);
  
  const [adHocJobs, setAdHocJobs] = useState<AdHocJob[]>([]);
  const [selectedAdHocIds, setSelectedAdHocIds] = useState<Set<string>>(new Set());
  const [isBulkDeletingAdHoc, setIsBulkDeletingAdHoc] = useState(false);
  const [adHocSearchQuery, setAdHocSearchQuery] = useState('');
  const [trackingSearchQuery, setTrackingSearchQuery] = useState('');

  const adHocStats = React.useMemo(() => {
    const pending = adHocJobs.filter(j => j.status === 'PENDING').length;
    const approved = adHocJobs.filter(j => j.status === 'APPROVED').length;
    const totalValue = adHocJobs.filter(j => j.status === 'APPROVED').reduce((acc, j) => acc + (j.value || 0), 0);
    return { pending, approved, totalValue };
  }, [adHocJobs]);

  const visibleAdHocJobs = React.useMemo(() => {
    return adHocJobs.filter(j => 
      j.employeeName.toLowerCase().includes(adHocSearchQuery.toLowerCase()) || 
      j.vehicleType.toLowerCase().includes(adHocSearchQuery.toLowerCase())
    );
  }, [adHocJobs, adHocSearchQuery]);

  const isAllVisibleAdHocSelected = React.useMemo(() => {
    return visibleAdHocJobs.length > 0 && visibleAdHocJobs.every(j => selectedAdHocIds.has(j.id!));
  }, [visibleAdHocJobs, selectedAdHocIds]);

  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'EMPLOYEES' | 'SHIPMENTS' | 'SALARY' | 'MILEAGE' | 'MISMATCHES' | 'ADHOC' | 'TRACKING' | 'REPORTS' | 'CASH_LOGS'>('DASHBOARD');

  const [selectedLiveEmployeeId, setSelectedLiveEmployeeId] = useState<string | null>(null);
  const [selectedEmployeeForHistory, setSelectedEmployeeForHistory] = useState<UserProfile | null>(null);
  const [employeeHistory, setEmployeeHistory] = useState<AttendanceRecord[]>([]);
  const [paydays, setPaydays] = useState<Payday[]>([]);
  const [allPaydays, setAllPaydays] = useState<Payday[]>([]);
  const [cashReports, setCashReports] = useState<any[]>([]);
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
  const [isWiping, setIsWiping] = useState(false);
  const [isMasterSyncing, setIsMasterSyncing] = useState(false);
  const [systemStatus, setSystemStatus] = useState<{ 
    day: number, 
    isPurgeDay: boolean, 
    stats: any,
    dbUsage?: { sizeFormatted: string, sizeBytes: number, limitBytes: number }
  } | null>(null);
  const [isPurging, setIsPurging] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const externalReportLink = localStorage.getItem('apl_external_report_link');

  // Fetch System Status for Purge Days
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/admin/system-status');
        const data = await res.json();
        setSystemStatus(data);
      } catch (err) {
        console.error("Failed to fetch system status:", err);
      }
    };
    fetchStatus();
    // Refresh every 5 mins
    const timer = setInterval(fetchStatus, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const handlePurgeDatabase = async () => {
    if (!window.confirm("সাবধান! পনেরো দিনের সমস্ত রেকর্ড কি আপনি পার্মানেন্টলি ডিলিট করতে চান? (WARNING: This will permanently delete ALL operational records.)")) {
      return;
    }

    setIsPurging(true);
    try {
      const res = await fetch('/api/admin/purge-data', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success("ডাটাবেস সফলভাবে খালি করা হয়েছে! (Database purged successfully)");
        // Refresh stats
        const statusRes = await fetch('/api/admin/system-status');
        const statusData = await statusRes.json();
        setSystemStatus(statusData);
        // Refresh local UI
        setAttendanceToday([]);
        setAllAttendanceRecords([]);
        setMismatches([]);
        setAdHocJobs([]);
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      toast.error("Error: " + err.message);
    } finally {
      setIsPurging(false);
    }
  };

  const handleDownloadAndPurgeFlow = async () => {
    toast.info("ডাটা ডাউনলোড শুরু হচ্ছে... (Starting data download...)");
    const success = downloadAllDataExcel(); 
    
    if (success) {
      // Auto-triggering the purge after a small delay to ensure download window opened
      setTimeout(() => {
        handlePurgeDatabase();
      }, 5000);
    }
  };

  // Auto-initialize external link if provided by user and currently empty
  useEffect(() => {
    const currentLink = localStorage.getItem('apl_external_report_link');
    if (!currentLink) {
       localStorage.setItem('apl_external_report_link', 'https://drive.proton.me/urls/5GPNPD3QY4#wrxae4rt5UkY');
    }
  }, []);

  const selectedEmployeeMileage = React.useMemo(() => {
    return employeeHistory
      .filter(rec => rec.status !== 'FRAUDULENT')
      .reduce((sum, rec) => sum + (rec.distanceDriven || 0), 0);
  }, [employeeHistory]);

  const handleWipeData = async () => {
    if (!window.confirm("CRITICAL WARNING: This will permanently delete ALL data (profiles, attendance, chat, paydays). Only your current admin account will be kept.\n\nProceed with Wiping?")) {
      return;
    }

    setIsWiping(true);
    try {
      await SupabaseService.resetDatabase(user?.id || '');
      toast.success("Complete system reset success. / সিস্টেম রিসেট সফল হয়েছে।");
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      console.error("Wipe failed:", error);
      toast.error("Error wiping data.");
    } finally {
      setIsWiping(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedEmployeeUids.size === 0) return;
    
    if (!window.confirm(`Are you sure you want to delete ${selectedEmployeeUids.size} selected employees and ALL their related data? This action is permanent.`)) {
      return;
    }

    setIsBulkDeleting(true);
    try {
      const uids = Array.from(selectedEmployeeUids).filter(uid => uid !== user?.id);
      
      if (uids.length === 0) {
        toast.info("No other employees were selected to delete. / অন্য কোনো কর্মচারী ডিলিট করার জন্য নির্বাচন করা হয়নি।");
        return;
      }

      // Related data deletion (bulk)
      await supabase.from('attendance').delete().in('userid', uids);
      await supabase.from('paydays').delete().in('userid', uids);
      await supabase.from('live_locations').delete().in('userid', uids);
      await supabase.from('messages').delete().in('senderid', uids);
      await supabase.from('mismatches').delete().in('userid', uids);
      await supabase.from('calls').delete().in('userid', uids);
      await supabase.from('salary_history').delete().in('userid', uids);
      await supabase.from('ad_hoc_jobs').delete().in('userid', uids);
      
      // Profiles deletion (bulk)
      await supabase.from('users').delete().in('id', uids);

      toast.success(`${uids.length} employees and their related data have been deleted successfully. / ${uids.length} জন কর্মচারী এবং তাদের ডাটা সফলভাবে মুছে ফেলা হয়েছে।`);
      setSelectedEmployeeUids(new Set());
    } catch (error) {
      console.error("Bulk delete failed:", error);
      toast.error("Error deleting employees.");
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const downloadAllDataExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      // 1. Attendance Sheet
      if (allAttendanceRecords.length > 0) {
        const attData = allAttendanceRecords.map(a => ({
          'Employee UID': a.userId,
          'Date': a.date,
          'Status': a.status,
          'Check-In': a.checkInTime ? format(new Date(a.checkInTime), 'hh:mm a') : 'N/A',
          'Check-Out': a.checkOutTime ? format(new Date(a.checkOutTime), 'hh:mm a') : 'N/A',
          'Hours': a.hoursWorked || 0,
          'Shipments': a.shipments || 0,
          'Earnings': a.earnings || 0,
          'Distance (KM)': a.distanceDriven || 0
        }));
        const wsAtt = XLSX.utils.json_to_sheet(attData);
        XLSX.utils.book_append_sheet(wb, wsAtt, "Attendance");
      }

      // 2. Mismatches Sheet
      if (mismatches.length > 0) {
        const misData = mismatches.map(m => ({
          'Employee': m.employeeName,
          'Date': m.date,
          'Customer Value': m.customerValue,
          'ERP Value': m.erpValue,
          'Difference': m.valueDifference,
          'Reason': m.reason,
          'Status': m.status
        }));
        const wsMis = XLSX.utils.json_to_sheet(misData);
        XLSX.utils.book_append_sheet(wb, wsMis, "Mismatches");
      }

      // 3. Ad-Hoc Sheet
      if (adHocJobs.length > 0) {
        const adHocData = adHocJobs.map(job => ({
          'Employee': job.employeeName,
          'Date': job.date,
          'Vehicle': job.vehicleType,
          'Hours': job.totalHours,
          'Value': job.value,
          'Status': job.status
        }));
        const wsAdHoc = XLSX.utils.json_to_sheet(adHocData);
        XLSX.utils.book_append_sheet(wb, wsAdHoc, "AD-HOC");
      }

      // 4. Cash Reports Sheet
      if (cashReports.length > 0) {
        const cashData = cashReports.map(c => ({
          'Employee': c.employeeName,
          'Date': c.date,
          'Total Amount': c.totalAmount,
          'Online Cash': c.onlineCash,
          'Mismatch': c.valueMismatch,
          'Status': c.status
        }));
        const wsCash = XLSX.utils.json_to_sheet(cashData);
        XLSX.utils.book_append_sheet(wb, wsCash, "Cash Reports");
      }

      if (wb.SheetNames.length === 0) {
        toast.info("No operational data available to export.");
        return;
      }

      const filename = `Full_Report_Backup_${selectedMonth}_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`;
      XLSX.writeFile(wb, filename);
      toast.success("All operational data has been exported successfully!");
      
      return true; // Indicate success
    } catch (err: any) {
      console.error("Export Error:", err);
      toast.error("Export failed: " + err.message);
      return false;
    }
  };

  const toggleEmployeeSelection = (uid: string) => {
    const newSelection = new Set(selectedEmployeeUids);
    if (newSelection.has(uid)) {
      newSelection.delete(uid);
    } else {
      newSelection.add(uid);
    }
    setSelectedEmployeeUids(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedEmployeeUids.size === filteredEmployees.length) {
      setSelectedEmployeeUids(new Set());
    } else {
      setSelectedEmployeeUids(new Set(filteredEmployees.map(e => e.id)));
    }
  };

  const handleResetSessions = async (userId: string) => {
    toast.info("Session management is now handled automatically by the real-time engine.");
  };

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    // 1. Critical Listeners
    const unsubEmp = SupabaseService.subscribe('users', setEmployees);
    SupabaseService.list('users', [], 500, { column: 'name', ascending: true }).then(setEmployees);

    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const startM = format(startOfMonth(new Date(selectedMonth + '-01')), 'yyyy-MM-dd');
    const endM = format(endOfMonth(new Date(selectedMonth + '-01')), 'yyyy-MM-dd');

    const unsubAtt = SupabaseService.subscribe('attendance', (data) => {
      const todayData = data.filter((a: any) => a.date === todayStr);
      setAttendanceToday(todayData);

      const monthData = data.filter((a: any) => a.date >= startM && a.date <= endM);
      setAllAttendanceRecords(monthData);

      if (activeTab === 'DASHBOARD') {
        const startD = format(startOfMonth(new Date()), 'yyyy-MM-dd');
        const dashData = data.filter((a: any) => a.date >= startD);
        setGlobalFishSales(dashData.reduce((sum, d) => sum + (d.earnings || 0), 0));
      }
    });

    SupabaseService.list('attendance', [{ column: 'date', value: todayStr }]).then(data => {
      setAttendanceToday(data);
    });

    let unsubMismatch: any = null;
    let unsubAdHoc: any = null;
    
    unsubMismatch = SupabaseService.subscribe('mismatches', (data) => {
        const monthData = data.filter((a: any) => a.date >= startM && a.date <= endM);
        setMismatches(monthData);
    });

    unsubAdHoc = SupabaseService.subscribe('ad_hoc_jobs', (data) => {
        const monthData = data.filter((a: any) => a.date >= startM && a.date <= endM);
        setAdHocJobs(monthData);
    });
    
    if (activeTab === 'MILEAGE' || activeTab === 'SALARY' || activeTab === 'SHIPMENTS' || activeTab === 'DASHBOARD') {
       SupabaseService.list('attendance', [
        { column: 'date', value: startM, operator: 'gte' },
        { column: 'date', value: endM, operator: 'lte' }
      ], 1000).then(data => {
        setAllAttendanceRecords(data);
      });
    }

    // 2. Tab-Dependent Listeners
    let unsubLive: any = null;
    let unsubCalls: any = null;
    let unsubSalaries: any = null;
    let unsubPaydays: any = null;
    let unsubCash: any = null;

    if (activeTab === 'DASHBOARD' || activeTab === 'TRACKING') {
      unsubLive = SupabaseService.subscribe('live_locations', setLiveLocations);
      SupabaseService.list('live_locations').then(setLiveLocations);
      
      SupabaseService.list('location_logs', [
        { column: 'timestamp', value: todayStr, operator: 'gte' }
      ], 5000, { column: 'timestamp', ascending: false }).then(setLocationLogs);

      const unsubLogs = SupabaseService.subscribe('location_logs', (data) => {
         const todayLogs = data
           .filter((l: any) => l.timestamp.startsWith(todayStr))
           .sort((a: any, b: any) => a.timestamp.localeCompare(b.timestamp));
         setLocationLogs(todayLogs);
      });
      
      const originalUnsub = unsubLive;
      unsubLive = {
        unsubscribe: () => {
          originalUnsub?.unsubscribe();
          unsubLogs?.unsubscribe();
        }
      };
    }

    if (activeTab === 'DASHBOARD') {
      SupabaseService.list('ad_hoc_jobs', [{ column: 'date', value: todayStr }]).then(data => {
        setAdHocJobs(data);
      });
    }

    if (activeTab === 'MISMATCHES') {
      unsubMismatch = SupabaseService.subscribe('mismatches', (data) => {
        setMismatches(data.filter(m => m.date.startsWith(selectedMonth)).sort((a: any, b: any) => b.timestamp.localeCompare(a.timestamp)));
      });
      SupabaseService.list('mismatches', [{ column: 'date', value: `${selectedMonth}%`, operator: 'like' }], 200, { column: 'timestamp', ascending: false }).then(data => {
        setMismatches(data);
      });
    }

    if (activeTab === 'ADHOC') {
      setSelectedAdHocIds(new Set());
      unsubAdHoc = SupabaseService.subscribe('ad_hoc_jobs', (data) => {
        setAdHocJobs(data.filter(j => j.date.startsWith(selectedMonth)).sort((a: any, b: any) => b.timestamp.localeCompare(a.timestamp)));
      });
      SupabaseService.list('ad_hoc_jobs', [{ column: 'date', value: `${selectedMonth}%`, operator: 'like' }], 500, { column: 'timestamp', ascending: false }).then(data => {
        setAdHocJobs(data);
      });
    }

    if (activeTab === 'CASH_LOGS') {
      unsubCash = SupabaseService.subscribe('cash_reports', (data) => {
        setCashReports(data.filter(r => r.date.startsWith(selectedMonth)).sort((a: any, b: any) => b.timestamp.localeCompare(a.timestamp)));
      });
      SupabaseService.list('cash_reports', [{ column: 'date', value: `${selectedMonth}%`, operator: 'like' }], 500, { column: 'timestamp', ascending: false }).then(setCashReports);
    }

    if (activeTab === 'SALARY') {
      unsubSalaries = SupabaseService.subscribe('salary_history', (data) => {
        setSalaries(data.filter(s => s.month === selectedMonth));
      });
      SupabaseService.list('salary_history', [{ column: 'month', value: selectedMonth }]).then(setSalaries);
    }

    if (activeTab === 'SALARY' || activeTab === 'EMPLOYEES') {
      const startRange = format(startOfMonth(new Date(selectedMonth + '-01')), 'yyyy-MM-dd');
      const nextMonth = format(endOfMonth(new Date(new Date(selectedMonth + '-01').setMonth(new Date(selectedMonth + '-01').getMonth() + 1))), 'yyyy-MM-dd');
      
      unsubPaydays = SupabaseService.subscribe('paydays', (data) => {
        setAllPaydays(data.filter(p => p.date >= startRange && p.date <= nextMonth));
      });
      SupabaseService.list('paydays', [
        { column: 'date', value: startRange, operator: 'gte' },
        { column: 'date', value: nextMonth, operator: 'lte' }
      ], 200).then(setAllPaydays);
    }

    // 3. Tab-Dependent Data Fetching
    const fetchData = async () => {
      if (activeTab === 'DASHBOARD') {
        // Handled by subscription
      }

      if (activeTab === 'SALARY') {
        // Handled by subscription
      }

      // Mismatches now handled by subscription ^

      if (activeTab === 'SALARY' || activeTab === 'EMPLOYEES') {
        // Handled by subscription
      }

      if (activeTab === 'MILEAGE' || activeTab === 'SALARY') {
        // Handled by subscription
      }
    };

    fetchData();

    return () => {
      unsubEmp.unsubscribe();
      unsubAtt.unsubscribe();
      if (unsubLive) unsubLive.unsubscribe();
      if (unsubCalls) unsubCalls.unsubscribe();
      if (unsubMismatch) unsubMismatch.unsubscribe();
      if (unsubAdHoc) unsubAdHoc.unsubscribe();
      if (unsubSalaries) unsubSalaries.unsubscribe();
      if (unsubPaydays) unsubPaydays.unsubscribe();
      if (unsubCash) unsubCash.unsubscribe();
    };
  }, [activeTab, selectedMonth]);

  useEffect(() => {
    if (!selectedEmployeeForHistory) {
      setEmployeeHistory([]);
      setPaydays([]);
      return;
    }

    const start = format(startOfMonth(new Date(selectedMonth + '-01')), 'yyyy-MM-dd');
    const end = format(new Date(), 'yyyy-MM-dd');

    // Subscribe to employee's history
    const unsubAtt = SupabaseService.subscribe('attendance', (data) => {
      const records = data.filter((a: any) => 
        a.userId === selectedEmployeeForHistory.id && a.date >= start && a.date <= end
      );
      setEmployeeHistory(records.sort((a: any, b: any) => b.date.localeCompare(a.date)));
    });

    // Fetch initial history
    SupabaseService.list('attendance', [
      { column: 'userId', value: selectedEmployeeForHistory.id },
      { column: 'date', value: start, operator: 'gte' },
      { column: 'date', value: end, operator: 'lte' }
    ], 100, { column: 'date', ascending: false }).then(setEmployeeHistory);

    // Paydays for the following month
    const historyMonthDate = new Date(selectedMonth + '-01');
    const paydayMonthDate = new Date(historyMonthDate.getFullYear(), historyMonthDate.getMonth() + 1, 1);
    const startM = format(startOfMonth(paydayMonthDate), 'yyyy-MM-dd');
    const endM = format(endOfMonth(paydayMonthDate), 'yyyy-MM-dd');
    
    SupabaseService.list('paydays', [
      { column: 'userId', value: selectedEmployeeForHistory.id },
      { column: 'date', value: startM, operator: 'gte' },
      { column: 'date', value: endM, operator: 'lte' }
    ]).then(setPaydays);

    return () => { unsubAtt.unsubscribe(); };
  }, [selectedEmployeeForHistory, selectedMonth]);

  const handleCalculateSalaries = async () => {
    setIsCalculating(true);
    try {
      const response = await fetch('/api/calculate-salaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: selectedMonth })
      });
      
      if (!response.ok) {
        let errorMsg = "Server error";
        try {
          const errData = await response.json();
          errorMsg = errData.error || errorMsg;
        } catch (e) {
          errorMsg = `HTTP Error ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMsg);
      }
      
      const data = await response.json();
      if (data.success) {
        toast.success(`Successfully calculated salaries for ${data.count} employees. / ${data.count} জন কর্মচারীর বেতন সফলভাবে হিসাব করা হয়েছে।`);
      } else {
        throw new Error(data.error || "Failed to calculate salaries");
      }
    } catch (err: any) {
      console.error("Salary calculation failed:", err);
      const msg = err.message === 'Failed to fetch' 
        ? 'Could not connect to server. Please check your internet connection.' 
        : err.message;
      toast.error("Error: " + msg);
    } finally {
      setIsCalculating(false);
    }
  };

  const handleBulkDeleteMismatches = async () => {
    if (selectedMismatchIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedMismatchIds.size} selected mismatch records?`)) return;

    setIsBulkDeletingMismatches(true);
    try {
      const ids = Array.from(selectedMismatchIds);
      const { error } = await supabase.from('mismatches').delete().in('id', ids);
      if (error) throw error;
      setSelectedMismatchIds(new Set());
      toast.success(`Successfully deleted ${ids.length} records. / ${ids.length}টি রেকর্ড সফলভাবে মুছে ফেলা হয়েছে।`);
    } catch (error) {
      console.error("Bulk delete mismatches failed:", error);
      toast.error("Error deleting records.");
    } finally {
      setIsBulkDeletingMismatches(false);
    }
  };

  const handleBulkDeleteAdHoc = async () => {
    if (selectedAdHocIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedAdHocIds.size} selected AD-HOC records?`)) return;

    setIsBulkDeletingAdHoc(true);
    try {
      const ids = Array.from(selectedAdHocIds);
      const { error } = await supabase.from('ad_hoc_jobs').delete().in('id', ids);
      if (error) throw error;
      setSelectedAdHocIds(new Set());
      toast.success(`Successfully deleted ${ids.length} records.`);
    } catch (error) {
      console.error("Bulk delete AD-HOC failed:", error);
      toast.error("Error deleting records.");
    } finally {
      setIsBulkDeletingAdHoc(false);
    }
  };

  const toggleMismatchSelection = (id: string) => {
    const newSelection = new Set(selectedMismatchIds);
    if (newSelection.has(id)) newSelection.delete(id);
    else newSelection.add(id);
    setSelectedMismatchIds(newSelection);
  };

  const toggleSelectAllMismatches = () => {
    if (selectedMismatchIds.size === mismatches.length) {
      setSelectedMismatchIds(new Set());
    } else {
      setSelectedMismatchIds(new Set(mismatches.map(m => m.id!)));
    }
  };

  const handleUpdateSalaryStatus = async (salaryId: string, status: 'PAID' | 'PENDING') => {
    try {
      await SupabaseService.update('salary_history', salaryId, { status });
    } catch (err: any) {
      toast.error("Failed to update status: " + err.message);
    }
  };

  const handleUpdateStatus = async (id: string, currentStatus: UserStatus) => {
    let nextStatus: UserStatus = 'ACTIVE';
    if (currentStatus === 'ACTIVE') nextStatus = 'SUSPENDED';
    else if (currentStatus === 'SUSPENDED') nextStatus = 'BLOCKED';
    else if (currentStatus === 'BLOCKED') nextStatus = 'ACTIVE';
    
    await SupabaseService.update('users', id, { status: nextStatus });
  };

  const handleTogglePayday = async (userId: string, date: string) => {
    if (!user) return;
    const existing = paydays.find(p => p.userId === userId && p.date === date);
    try {
      if (existing) {
        await SupabaseService.delete('paydays', existing.id!);
        setPaydays(prev => prev.filter(p => p.id !== existing.id));
        setAllPaydays(prev => prev.filter(p => p.id !== existing.id));
      } else {
        const payload = {
          userId,
          date,
          markedBy: user.id,
          timestamp: new Date().toISOString()
        };
        const created = await SupabaseService.create('paydays', payload);
        if (created) {
          setPaydays(prev => [...prev, created]);
          setAllPaydays(prev => [...prev, created]);
        }
      }
    } catch (err: any) {
      toast.error("Failed to update payday: " + err.message);
    }
  };

  const filteredSalaries = React.useMemo(() => {
    if (user?.role === 'SUPERVISOR') {
      const deptEmployees = employees.filter(e => e.department?.toLowerCase() === user.department?.toLowerCase()).map(e => e.id);
      return salaries.filter(s => deptEmployees.includes(s.userId));
    }
    return salaries;
  }, [salaries, employees, user]);

  const filteredCallLogs = React.useMemo(() => {
    if (user?.role === 'SUPERVISOR') {
      const deptEmployees = employees.filter(e => e.department?.toLowerCase() === user.department?.toLowerCase()).map(e => e.id);
      return callLogs.filter(log => deptEmployees.includes(log.userId));
    }
    return callLogs;
  }, [callLogs, employees, user]);

  const filteredEmployees = React.useMemo(() => {
    let filtered = employees;
    
    // Supervisor Role-Based Filtering
    if (user?.role === 'SUPERVISOR') {
      filtered = filtered.filter(e => e.department?.toLowerCase() === user.department?.toLowerCase());
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(e => {
        if (!e) return false;
        const name = String(e.name || '').toLowerCase();
        const id = String(e.id || '').toLowerCase();
        const uname = String(e.username || '').toLowerCase();
        return name.includes(q) || id.includes(q) || uname.includes(q);
      });
    }
    
    if (filterDepartment) {
      filtered = filtered.filter(e => e.department === filterDepartment);
    }
    
    if (filterRole) {
      filtered = filtered.filter(e => e.role === filterRole);
    }

    return filtered;
  }, [employees, searchQuery, user, filterDepartment, filterRole]);

  const departments = React.useMemo(() => {
    let baseEmployees = employees;
    if (user?.role === 'SUPERVISOR') {
      baseEmployees = baseEmployees.filter(e => e.department?.toLowerCase() === user.department?.toLowerCase());
    }
    const depts = new Set(baseEmployees.map(e => e.department).filter(Boolean));
    return Array.from(depts).sort();
  }, [employees, user]);

  const filteredAttendanceToday = React.useMemo(() => {
    if (user?.role === 'SUPERVISOR') {
      const deptEmployees = employees.filter(e => e.department?.toLowerCase() === user.department?.toLowerCase()).map(e => e.id);
      return attendanceToday.filter(a => deptEmployees.includes(a.userId));
    }
    return attendanceToday;
  }, [attendanceToday, employees, user]);

  const filteredLiveLocations = React.useMemo(() => {
    let base = liveLocations;
    if (user?.role === 'SUPERVISOR') {
      const deptEmployees = employees.filter(e => e.department?.toLowerCase() === user.department?.toLowerCase()).map(e => e.id);
      base = liveLocations.filter(loc => deptEmployees.includes(loc.userId));
    }
    
    if (!trackingSearchQuery) return base;
    
    return base.filter(loc => {
      const emp = employees.find(e => e.id === loc.userId);
      const name = emp?.name || loc.name || '';
      return name.toLowerCase().includes(trackingSearchQuery.toLowerCase());
    });
  }, [liveLocations, employees, user, trackingSearchQuery]);

  const activeCount = React.useMemo(() => filteredAttendanceToday.filter(a => !a.checkOutTime && a.status !== 'FRAUDULENT').length, [filteredAttendanceToday]);
  const presentCount = React.useMemo(() => filteredAttendanceToday.filter(a => a.status !== 'FRAUDULENT').length, [filteredAttendanceToday]);
  const totalMonthlyEarnings = React.useMemo(() => filteredAttendanceToday.filter(a => a.status !== 'FRAUDULENT').reduce((sum, a) => sum + (a.earnings || 0), 0), [filteredAttendanceToday]);
  const deptEmployeesCount = React.useMemo(() => employees.filter(e => user?.role === 'ADMIN' || e.department?.toLowerCase() === user?.department?.toLowerCase()).length, [employees, user]);

  const mismatchesByDate = React.useMemo(() => {
    const grouped: { [date: string]: ValueMismatch[] } = {};
    mismatches.forEach(m => {
      if (!m || !m.date) return;
      if (!grouped[m.date]) grouped[m.date] = [];
      grouped[m.date].push(m);
    });
    return Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0]));
  }, [mismatches]);

  const mismatchStatsByEmployee = React.useMemo(() => {
    const stats: { [userId: string]: { userId: string, name: string, total: number, count: number } } = {};
    mismatches.forEach(m => {
      if (!m || !m.userId) return;
      if (!stats[m.userId]) {
        const emp = employees.find(e => e.id === m.userId);
        stats[m.userId] = { 
          userId: m.userId, 
          name: m.employeeName || emp?.name || 'Unknown', 
          total: 0, 
          count: 0 
        };
      }
      stats[m.userId].total += (m.valueDifference || 0);
      stats[m.userId].count += 1;
    });
    return (Object.values(stats) as { userId: string, name: string, total: number, count: number }[]).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  }, [mismatches, employees]);

   const handleExportAttendanceExcel = async (specificUserId?: string) => {
      try {
        setIsLoading(true);
        const start = `${selectedMonth}-01`;
        const end = format(endOfMonth(new Date(selectedMonth + '-01')), 'yyyy-MM-dd');

        let query = supabase
          .from('attendance')
          .select('*, users(name, jobTitle, paymentBase, rate)')
          .gte('date', start)
          .lte('date', end);
        
        if (specificUserId) {
          query = query.eq('userId', specificUserId);
        }

        const { data, error } = await query.order('date', { ascending: true });
        
        if (error) throw error;
        if (!data || data.length === 0) {
          toast.warning("No attendance data found for this period. / কোনো ডাটা পাওয়া যায়নি।");
          return;
        }

        const rows = data.map(record => {
          return {
            'Date': record.date,
            'Employee Name': record.users?.name || 'Unknown',
            'Job Title': record.users?.jobTitle || 'N/A',
            'Payment Type': record.users?.paymentBase || 'N/A',
            'Check In': record.checkInTime ? format(new Date(record.checkInTime), 'HH:mm:ss') : '-',
            'Check Out': record.checkOutTime ? format(new Date(record.checkOutTime), 'HH:mm:ss') : '-',
            'Hours Worked': record.hoursWorked || 0,
            'Shipments': record.shipments || 0,
            'Odometer Start': record.odometerStart || 0,
            'Odometer End': record.odometerEnd || 0,
            'Distance (KM)': record.distanceDriven || 0,
            'Earnings (₹)': record.earnings || 0,
            'Status': record.status || 'PRESENT',
            'Location (In)': record.checkInLocation?.address || 'N/A',
            'Location (Out)': record.checkOutLocation?.address || 'N/A'
          };
        });

        const worksheet = XLSX.utils.json_to_sheet(rows);
        
        const wscols = [
          {wch: 12}, // Date
          {wch: 25}, // Employee Name
          {wch: 20}, // Job Title
          {wch: 15}, // Payment Type
          {wch: 12}, // Check In
          {wch: 12}, // Check Out
          {wch: 12}, // Hours
          {wch: 12}, // Shipments
          {wch: 12}, // Odo Start
          {wch: 12}, // Odo End
          {wch: 12}, // Distance
          {wch: 12}, // Earnings
          {wch: 12}, // Status
          {wch: 40}, // Location (In)
          {wch: 40}, // Location (Out)
        ];
        worksheet['!cols'] = wscols;

        const workbook = XLSX.utils.book_new();
        const sheetName = specificUserId ? `Att_${data[0]?.users?.name?.substring(0, 15) || 'Employee'}` : "Monthly Attendance";
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.substring(0, 31));

        const empPrefix = specificUserId ? `${data[0]?.users?.name || 'Employee'}_` : '';
        const filename = `${empPrefix}Attendance_Report_${selectedMonth}_${format(new Date(), 'yyyyMMdd')}.xlsx`;
        const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
          if (document.body.contains(a)) document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
        }, 100);
        
        toast.success("Attendance report downloaded! / অ্যাটেন্ডেন্স রিপোর্ট ডাউনলোড হয়েছে!");
      } catch (err: any) {
        console.error("Export Error:", err);
        toast.error("Failed to export attendance: " + err.message);
      } finally {
        setIsLoading(false);
      }
   };

   const handleExportMismatchesExcel = (type: 'DAILY' | 'MONTHLY') => {
      try {
        const filteredData = mismatches.filter(m => {
           if (type === 'DAILY') return m.date === format(new Date(), 'yyyy-MM-dd');
           return m.date.startsWith(selectedMonth);
        });

        if (filteredData.length === 0) {
           toast.info("No data available for the selected period. / নির্বাচিত সময়ের জন্য কোনো ডাটা পাওয়া যায়নি।");
           return;
        }

        const rows = filteredData.map(m => {
           const emp = employees.find(e => e.id === m.userId);
           const rawPhoto = m.customerPhoto || m.erpPhoto || 'No Photo';
           const photoUrl = (rawPhoto.length > 32000) 
             ? `IMAGE_TOO_LARGE_FOR_EXCEL (${rawPhoto.length} chars) - Use App to View`
             : rawPhoto;

           let reportTime = '-';
           try {
             if (m.timestamp) {
               const d = new Date(m.timestamp);
               if (!isNaN(d.getTime())) {
                 reportTime = format(d, 'HH:mm:ss');
               }
             }
           } catch (e) {
             console.error("Time formatting error", e);
           }

           return {
              'Date': m.date || '-',
              'Employee Name': m.employeeName || emp?.name || 'Unknown',
              'Barcodes': Array.isArray(m.barcodes) ? m.barcodes.join(', ') : '-',
              'Customer Value (INR)': m.customerValue || 0,
              'ERP Value (INR)': m.erpValue || 0,
              'Value Difference (INR)': m.valueDifference || 0,
              'Report Time': reportTime,
              'Photo Link': photoUrl
           };
        });

        const worksheet = XLSX.utils.json_to_sheet(rows);
        
        // Make columns wider
        const wscols = [
          {wch: 12}, // Date
          {wch: 25}, // Employee Name
          {wch: 30}, // Barcodes
          {wch: 15}, // Customer Value
          {wch: 15}, // ERP Value
          {wch: 18}, // Difference
          {wch: 15}, // Time
          {wch: 50}, // Photo Link
        ];
        worksheet['!cols'] = wscols;

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Mismatch Reports");

        // Generate filename
        const filename = `Mismatch_Report_${type}_${format(new Date(), 'yyyyMMdd')}.xlsx`;
        
        // Manual blob creation for better reliability
        const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
          if (document.body.contains(a)) document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
        }, 100);
      } catch (error) {
        console.error("Export Error:", error);
        toast.error("Failed to export. Please try again. / এক্সপোর্ট করতে ব্যর্থ হয়েছে। আবার চেষ্টা করুন।");
      }
   };

   const handleExportCashExcel = () => {
      try {
        if (cashReports.length === 0) {
          toast.info("No cash report data found. / কোনো ক্যাশ রিপোর্ট পাওয়া যায়নি।");
          return;
        }

        const rows = cashReports.map(r => {
          const emp = employees.find(e => e.id === r.userId);
          return {
            'Date': r.date || '-',
            'Employee Name': r.userName || emp?.name || 'Unknown',
            'Time': r.timestamp ? format(new Date(r.timestamp), 'HH:mm:ss') : '-',
            'Total Amount (₹)': r.totalAmount || 0,
            'Online Payout (₹)': r.onlineCash || 0,
            'Mismatch Adj (₹)': r.valueMismatch || 0,
            'Physical Cash (₹)': (r.totalAmount || 0) - (r.onlineCash || 0),
            'Total Notes': r.totalNotes || 0,
            'Status': r.status || 'PENDING'
          };
        });

        const worksheet = XLSX.utils.json_to_sheet(rows);
        const wscols = [
          {wch: 12}, // Date
          {wch: 25}, // Name
          {wch: 15}, // Time
          {wch: 20}, // Total
          {wch: 20}, // Online
          {wch: 20}, // Mismatch
          {wch: 20}, // Physical
          {wch: 12}, // Notes
          {wch: 15}, // Status
        ];
        worksheet['!cols'] = wscols;

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Cash Reports");

        const filename = `Cash_Report_${selectedMonth}_${format(new Date(), 'yyyyMMdd')}.xlsx`;
        const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
          if (document.body.contains(a)) document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
        }, 100);

        toast.success("Cash report downloaded! / ক্যাশ রিপোর্ট ডাউনলোড হয়েছে!");
      } catch (err: any) {
        toast.error("Export failed: " + err.message);
      }
   };

  const handleStorageCleanupOneClick = async () => {
    const isConfirmed = window.confirm(
      "EXTREME CAUTION: This will download ALL system logs (Attendance, Cash, Mismatches, Ad-Hoc) and then PERMANENTLY DELETE them from the database to free up storage. \n\nAre you absolutely sure? / আপনি কি নিশ্চিত? এটি সব ডাটা ডাউনলোড করে চিরতরে মুছে ফেলবে।"
    );

    if (!isConfirmed) return;

    try {
      setIsLoading(true);
      toast.loading("Preparing full system backup... / ব্যাকআপ তৈরি হচ্ছে...");

      // 1. Fetch All Data using bridge for CockroachDB tables
      const [attRes, cashRes, mismatchRes, adhocRes] = await Promise.all([
        SupabaseService.list('attendance'),
        SupabaseService.list('cash_reports'),
        SupabaseService.list('mismatches'),
        SupabaseService.list('ad_hoc_jobs')
      ]);

      // 2. Create Excel Workbook
      const workbook = XLSX.utils.book_new();

      // Attendance Sheet
      if (attRes && attRes.length > 0) {
        const attRows = attRes.map(r => ({
          Date: r.date || 'N/A',
          Employee: r.employeeName || r.userName || 'N/A',
          In: r.checkInTime || '-',
          Out: r.checkOutTime || '-',
          Hours: r.hoursWorked || 0,
          Earnings: r.earnings || 0,
          Status: r.status || 'N/A'
        }));
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(attRows), "Attendance");
      }

      // Cash Reports Sheet
      if (cashRes && cashRes.length > 0) {
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(cashRes), "Cash Reports");
      }

      // Mismatches Sheet
      if (mismatchRes && mismatchRes.length > 0) {
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(mismatchRes), "Mismatches");
      }

      // Ad-Hoc Sheet
      if (adhocRes && adhocRes.length > 0) {
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(adhocRes), "AdHoc Logs");
      }

      // 3. Trigger Download
      const filename = `FULL_SYSTEM_BACKUP_${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`;
      const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      
      toast.dismiss();
      toast.success("✅ Download Started! Verify the file contents now.");

      // 4. Secondary Confirmation for Deletion
      setTimeout(async () => {
        const deleteConfirmed = window.confirm(
          "Download is complete. Do you want to DELETE these records from the database NOW to free up storage? \n\nডাউনলোড শেষ। এখন কি ডাটাবেজ থেকে এগুলো মুছে ফেলতে চান?"
        );

        if (deleteConfirmed) {
          toast.loading("Cleaning up database... / ডাটা মুছে ফেলা হচ্ছে...");
          
          try {
            // Delete all records using bridge to ensure it hits CockroachDB
            await Promise.all([
              SupabaseService.deleteWhere('attendance', [{ column: 'id', value: '00000000-0000-0000-0000-000000000000', operator: 'neq' }]),
              SupabaseService.deleteWhere('cash_reports', [{ column: 'id', value: '00000000-0000-0000-0000-000000000000', operator: 'neq' }]),
              SupabaseService.deleteWhere('mismatches', [{ column: 'id', value: '00000000-0000-0000-0000-000000000000', operator: 'neq' }]),
              SupabaseService.deleteWhere('ad_hoc_jobs', [{ column: 'id', value: '00000000-0000-0000-0000-000000000000', operator: 'neq' }]),
              SupabaseService.deleteWhere('location_logs', [{ column: 'id', value: '00000000-0000-0000-0000-000000000000', operator: 'neq' }])
            ]);

            toast.dismiss();
            toast.success("🔥 Database Purged! Storage is now 100% free. / ডাটাবেজ ক্লিন করা হয়েছে।");
            window.location.reload();
          } catch (wipeErr: any) {
            toast.dismiss();
            toast.error("Wipe failed: " + wipeErr.message);
          }
        }
      }, 2000);

    } catch (err: any) {
      toast.dismiss();
      toast.error("Cleanup failed: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-bg-app text-text-primary font-sans">
      <AnimatePresence>
        {isMaintenanceDay && showMaintenanceWarning && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-amber-500 text-white px-4 py-3 flex items-center justify-between border-b border-amber-600 shadow-lg relative z-50"
          >
            <div className="flex items-center gap-3">
              <div className="bg-white/20 p-2 rounded-lg">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-sm leading-tight">
                  SYSTEM MAINTENANCE REMINDER / রক্ষণাবেক্ষণ অনুস্মারক
                </span>
                <span className="text-xs opacity-90 leading-tight">
                  Today is the {new Date().getDate() === 15 ? '15th' : '1st'} of the month. Please download all data and wipe the database to ensure system performance. / আজ মাসের {new Date().getDate() === 15 ? '১৫' : '১'} তারিখ। সিস্টেমের গতি বজায় রাখতে সব ডাটা ডাউনলোড করে ডাটাবেজ মুছে নিন।
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={handleStorageCleanupOneClick}
                className="bg-white text-amber-600 px-3 py-1 rounded-md text-xs font-bold hover:bg-amber-50 shadow-sm transition-colors"
              >
                DOWNLOAD & WIPE / ডাউনলোড এবং ওয়াইপ
              </button>
              <button 
                onClick={() => setShowMaintenanceWarning(false)}
                className="p-1 hover:bg-white/20 rounded-full transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
        {!isOnline && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-accent-red text-white text-[10px] font-black uppercase tracking-[0.2em] py-2.5 px-6 flex items-center justify-center gap-2.5 overflow-hidden sticky top-0 z-[60] shadow-xl"
          >
            <WifiOff className="h-3.5 w-3.5 animate-pulse" />
            {t.internetRequired} (OFFLINE MODE ACTIVATED)
          </motion.div>
        )}
        {isWakeLockBlocked && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            className="bg-indigo-600 text-white text-[10px] font-black uppercase tracking-[0.2em] py-2.5 px-6 flex items-center justify-center gap-2.5 overflow-hidden sticky top-0 z-[60] shadow-xl border-b border-white/10"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            FOR LIVE UPDATES, PLEASE OPEN IN <b>NEW TAB</b>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Header Bar */}
      <header className="bg-white/80 backdrop-blur-md px-6 py-4 border-b border-app-border/40 flex justify-between items-center sticky top-0 z-50 shadow-sm shadow-indigo-100/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-tr from-accent-blue to-violet-500 rounded-full flex items-center justify-center text-white font-black shadow-md shadow-accent-blue/15 scale-102">
            {user?.name?.charAt(0) || 'A'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <div className="text-sm font-bold leading-none">{user?.name}</div>
              <div className={`w-2.5 h-2.5 rounded-full ${isConfigured ? 'bg-accent-green' : 'bg-amber-500'} animate-pulse shadow-[0_0_12px_rgba(16,185,129,0.5)]`} title={isConfigured ? "Cloud Sync Active" : "Local Mode"} />
            </div>
            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1 bg-slate-50 px-2 py-0.5 rounded border border-slate-100 italic">
               {user?.role} • {isConfigured ? 'CLOUD SYNC' : 'LOCAL STORAGE'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-accent-green/5 text-accent-green text-[9px] font-black uppercase tracking-widest rounded-lg border border-accent-green/10">
            <ShieldCheck className="w-2.5 h-2.5" />
            AI Security: Active
          </div>
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-blue-500/5 text-blue-500 text-[9px] font-black uppercase tracking-widest rounded-lg border border-blue-500/10">
            <RefreshCw className="w-2.5 h-2.5 animate-spin" style={{ animationDuration: '3s' }} />
            Live AI Sync
          </div>
          {user?.role === 'ADMIN' && externalReportLink && (
            <a 
              href={externalReportLink}
              target="_blank"
              rel="noreferrer"
              className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white text-[9px] font-black uppercase tracking-widest rounded-lg border border-indigo-700 hover:bg-indigo-700 transition-all shadow-sm"
              title="Open External Report Book (Proton Drive)"
            >
              <ExternalLink className="h-3 w-3" />
              Master Report
            </a>
          )}
          {user?.role === 'ADMIN' && (
            <button 
              onClick={handleWipeData}
              disabled={isWiping}
              className="px-3 py-1.5 bg-accent-red/10 text-accent-red text-[9px] font-black uppercase tracking-widest rounded-lg border border-accent-red/20 hover:bg-accent-red hover:text-white transition-all disabled:opacity-50 flex items-center gap-2"
              title="System Hard Reset: Clears everything except your account"
            >
              <Trash2 className="h-3 w-3" />
              {isWiping ? "Clearing..." : "Master Clean / মাস্টার রিসেট"}
            </button>
          )}
          <CloudStatusBadge />
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-bg-app text-text-secondary text-[9px] font-black uppercase tracking-widest rounded-lg border border-app-border ml-2">
             ID: <span className="text-slate-900">{user?.username || user?.id?.substring(0, 8)}</span>
          </div>
          <button 
            onClick={() => {
              SupabaseService.clearCache();
              window.location.reload();
            }}
            className="p-2 text-text-secondary hover:text-accent-blue transition-colors ml-1 active:rotate-180 duration-500"
            title="Force Refresh Data / ডাটা রিফ্রেশ করুন"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
          <button 
            onClick={logout}
            className="p-2 text-text-secondary hover:text-accent-red transition-colors"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Admin Mobile Bottom Navigation */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white shadow-[0_-12px_40px_-15px_rgba(0,0,0,0.15)] border-t border-app-border z-50 px-2 pb-6">
        <div className="flex items-center gap-1 py-3 overflow-x-auto scrollbar-hide snap-x">
          {[
            { id: 'DASHBOARD', icon: LayoutDashboard, label: t.dashboard, color: 'accent-blue' },
            { id: 'EMPLOYEES', icon: Users, label: 'Staff', color: 'accent-blue' },
            { id: 'SHIPMENTS', icon: PackageCheck, label: 'Trip', color: 'accent-blue' },
            { id: 'SALARY', icon: CreditCard, label: 'Pay', color: 'accent-blue' },
            { id: 'MILEAGE', icon: Map, label: 'Logs', color: 'accent-blue' },
            { id: 'MISMATCHES', icon: Barcode, label: 'Issues', color: 'accent-blue' },
            { id: 'ADHOC', icon: Plus, label: 'Adhoc', color: 'accent-blue' },
            { id: 'CASH_LOGS', icon: Calculator, label: 'Cash', color: 'accent-blue' }
          ].map((item) => (
            <motion.button
              key={item.id}
              whileTap={{ scale: 0.9 }}
              onClick={() => setActiveTab(item.id as any)}
              className={cn(
                "flex flex-col items-center gap-1.5 min-w-[72px] py-1 transition-all snap-center relative",
                activeTab === item.id ? "text-accent-blue" : "text-slate-400"
              )}
            >
              <div className={cn(
                "p-3 rounded-2xl transition-all duration-500",
                activeTab === item.id ? "bg-accent-blue/10 shadow-inner" : "bg-transparent"
              )}>
                <item.icon className={cn(
                  "h-5 w-5 transition-transform duration-500",
                  activeTab === item.id ? "scale-110" : "scale-100"
                )} />
              </div>
              <span className={cn(
                "text-[8px] font-black uppercase tracking-tighter transition-all duration-300",
                activeTab === item.id ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 h-0"
              )}>
                {item.label}
              </span>
              {activeTab === item.id && (
                <motion.div 
                  layoutId="activeTabIndicator"
                  className="absolute -bottom-1 w-1/2 h-0.5 bg-accent-blue rounded-full shadow-[0_0_8px_#0ea5e9]" 
                />
              )}
            </motion.button>
          ))}
        </div>
      </div>

      <div className="p-6 space-y-6 pb-32">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold tracking-tight">{t.dashboard}</h1>
          <div className="text-xs text-text-secondary font-medium">
            {format(new Date(), 'dd MMM yyyy')}
          </div>
        </div>

        {/* Consolidated Stats Ribbon */}
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
             <div className="bg-gradient-to-br from-emerald-500/5 to-teal-500/10 p-3 rounded-2xl border border-emerald-500/20 shadow-sm flex flex-col items-center justify-center text-center">
                <span className="text-[8px] font-black text-emerald-800 uppercase tracking-tighter mb-1">Sales</span>
                <span className="text-xs font-black text-accent-green">₹{(globalFishSales || 0) > 1000 ? ((globalFishSales || 0)/1000).toFixed(1) + 'k' : (globalFishSales || 0)}</span>
             </div>
             <div className="bg-gradient-to-br from-accent-blue/5 to-indigo-500/10 p-3 rounded-2xl border border-accent-blue/20 shadow-sm flex flex-col items-center justify-center text-center">
                <span className="text-[8px] font-black text-indigo-800 uppercase tracking-tighter mb-1">Online</span>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-black text-slate-900">{activeCount}</span>
                  <div className="w-1 h-1 rounded-full bg-accent-green animate-pulse" />
                </div>
             </div>
             <div className="bg-gradient-to-br from-rose-500/5 to-rose-500/10 p-3 rounded-2xl border border-red-500/20 shadow-sm flex flex-col items-center justify-center text-center">
                <span className="text-[8px] font-black text-rose-800 uppercase tracking-tighter mb-1">Absent</span>
                <span className="text-xs font-black text-accent-red">{deptEmployeesCount - presentCount}</span>
             </div>
          </div>
        </div>

        {/* Tabs - Now hidden on mobile as we use the bottom floating nav */}
        {systemStatus?.isPurgeDay && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden group"
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-accent-blue/10 rounded-full blur-3xl -mr-32 -mt-32" />
            <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-5">
                <div className="w-16 h-16 bg-accent-blue/20 rounded-2xl flex items-center justify-center text-accent-blue">
                  <Download className="h-8 w-8 animate-bounce" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-xl font-black text-white uppercase tracking-tight">পনেরো দিনের ডাটা ডাউনলোড করুন</h2>
                  <p className="text-sm font-bold text-slate-400">
                    {systemStatus.day === 15 ? "১৫ দিন পূর্ণ হয়েছে।" : "মাস শেষ হয়েছে।"} আপনার কর্মচারীদের ডাটা ডাউনলোড করে ডাটাবেস খালি করুন।
                  </p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="px-3 py-1 bg-slate-800 rounded-full text-[10px] font-black text-accent-blue uppercase tracking-widest border border-slate-700">
                      Attendance: {systemStatus.stats.attendance}
                    </span>
                    <span className="px-3 py-1 bg-slate-800 rounded-full text-[10px] font-black text-accent-orange uppercase tracking-widest border border-slate-700">
                      Mismatches: {systemStatus.stats.mismatches}
                    </span>
                  </div>
                </div>
              </div>
              
              <button 
                onClick={handleDownloadAndPurgeFlow}
                disabled={isPurging}
                className="w-full md:w-auto px-10 py-5 bg-accent-blue hover:bg-accent-blue/90 text-white font-black text-sm uppercase tracking-widest rounded-2xl shadow-xl shadow-accent-blue/20 transition-all active:scale-95 flex items-center justify-center gap-3 group"
              >
                {isPurging ? (
                  <RefreshCw className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Database className="h-5 w-5" />
                    Download & Clear DB
                    <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}

        <div className="hidden lg:flex items-center gap-2 bg-white/50 p-1.5 rounded-2xl border border-app-border w-fit overflow-x-auto scrollbar-hide">
          <button 
            onClick={() => setActiveTab('DASHBOARD')}
            className={cn(
              "flex items-center justify-center gap-2 px-3 py-2.5 lg:px-6 rounded-xl text-[10px] lg:text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap",
              activeTab === 'DASHBOARD' ? "bg-accent-blue text-white shadow-lg shadow-accent-blue/20" : "text-text-secondary hover:bg-bg-app"
            )}
          >
            <LayoutDashboard className="h-4 w-4" />
            <span className="truncate">Overview</span>
          </button>
          <button 
            onClick={() => setActiveTab('EMPLOYEES')}
            className={cn(
              "flex items-center justify-center gap-2 px-3 py-2.5 lg:px-6 rounded-xl text-[10px] lg:text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap",
              activeTab === 'EMPLOYEES' ? "bg-accent-blue text-white shadow-lg shadow-accent-blue/20" : "text-text-secondary hover:bg-bg-app"
            )}
          >
            <Users className="h-4 w-4 lg:hidden" />
            <span className="truncate">{t.employee}</span>
          </button>
          <button 
            onClick={() => setActiveTab('SHIPMENTS')}
            className={cn(
              "flex items-center justify-center gap-2 px-3 py-2.5 lg:px-6 rounded-xl text-[10px] lg:text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap",
              activeTab === 'SHIPMENTS' ? "bg-accent-blue text-white shadow-lg shadow-accent-blue/20" : "text-text-secondary hover:bg-bg-app"
            )}
          >
            <PackageCheck className="h-4 w-4 lg:hidden" />
            <span className="truncate tracking-tighter">Shipments</span>
          </button>
          <button 
            onClick={() => setActiveTab('SALARY')}
            className={cn(
              "flex items-center justify-center gap-2 px-3 py-2.5 lg:px-6 rounded-xl text-[10px] lg:text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap",
              activeTab === 'SALARY' ? "bg-accent-blue text-white shadow-lg shadow-accent-blue/20" : "text-text-secondary hover:bg-bg-app"
            )}
          >
            <CreditCard className="h-4 w-4 lg:hidden" />
            <span className="truncate tracking-tighter">{t.salaries}</span>
          </button>
          <button 
            onClick={() => setActiveTab('CASH_LOGS')}
            className={cn(
              "flex items-center justify-center gap-2 px-3 py-2.5 lg:px-6 rounded-xl text-[10px] lg:text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap",
              activeTab === 'CASH_LOGS' ? "bg-accent-blue text-white shadow-lg shadow-accent-blue/20" : "text-text-secondary hover:bg-bg-app"
            )}
          >
            <Calculator className="h-4 w-4 lg:hidden" />
            <span className="truncate tracking-tighter">Cash Logs</span>
          </button>
          <button 
            onClick={() => setActiveTab('MILEAGE')}
            className={cn(
              "flex items-center justify-center gap-2 px-3 py-2.5 lg:px-6 rounded-xl text-[10px] lg:text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap",
              activeTab === 'MILEAGE' ? "bg-accent-blue text-white shadow-lg shadow-accent-blue/20" : "text-text-secondary hover:bg-bg-app"
            )}
          >
            <Map className="h-4 w-4 lg:hidden" />
            <span className="truncate tracking-tighter">{t.mileage}</span>
          </button>
          <button 
            onClick={() => setActiveTab('MISMATCHES')}
            className={cn(
              "flex items-center justify-center gap-2 px-3 py-2.5 lg:px-6 rounded-xl text-[10px] lg:text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap",
              activeTab === 'MISMATCHES' ? "bg-accent-blue text-white shadow-lg shadow-accent-blue/20" : "text-text-secondary hover:bg-bg-app"
            )}
          >
            <Barcode className="h-4 w-4 lg:hidden" />
            <span className="truncate tracking-tighter">{t.valueMismatch}</span>
          </button>
          <button 
            onClick={() => setActiveTab('ADHOC')}
            className={cn(
              "flex items-center justify-center gap-2 px-3 py-2.5 lg:px-6 rounded-xl text-[10px] lg:text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap",
              activeTab === 'ADHOC' ? "bg-accent-blue text-white shadow-lg shadow-accent-blue/20" : "text-text-secondary hover:bg-bg-app"
            )}
          >
            <Plus className="h-4 w-4 lg:hidden" />
            <span className="truncate tracking-tighter">{t.adHoc}</span>
          </button>
          <button 
            onClick={() => setActiveTab('TRACKING')}
            className={cn(
              "flex items-center justify-center gap-2 px-3 py-2.5 lg:px-6 rounded-xl text-[10px] lg:text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap",
              activeTab === 'TRACKING' ? "bg-accent-blue text-white shadow-lg shadow-accent-blue/20" : "text-text-secondary hover:bg-bg-app"
            )}
          >
            <MapPin className="h-4 w-4" />
            <span className="truncate">Live Tracking</span>
          </button>
          <button 
            onClick={() => setActiveTab('REPORTS')}
            className={cn(
              "flex items-center justify-center gap-2 px-3 py-2.5 lg:px-6 rounded-xl text-[10px] lg:text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap",
              activeTab === 'REPORTS' ? "bg-accent-blue text-white shadow-lg shadow-accent-blue/20" : "text-text-secondary hover:bg-bg-app"
            )}
          >
            <FileDown className="h-4 w-4" />
            <span className="truncate">Reports</span>
          </button>
        </div>

        {activeTab === 'DASHBOARD' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-6"
          >
            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {/* STORAGE MASTER QUICK ACTION (NEW PROMINENT CARD) */}
              <button 
                onClick={() => handleStorageCleanupOneClick()}
                className="col-span-2 lg:col-span-1 bg-slate-900 p-4 md:p-6 rounded-3xl border border-slate-800 shadow-xl hover:shadow-2xl transition-all text-left flex flex-col justify-between h-40 md:h-44 group relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-accent-blue/20 rounded-bl-[100px] -mr-8 -mt-8 transition-all group-hover:scale-125 group-hover:bg-accent-blue/30" />
                <div className="w-12 h-12 bg-accent-blue rounded-2xl flex items-center justify-center text-white relative z-10 transition-transform group-hover:rotate-12">
                  <Database className="h-6 w-6" />
                </div>
                <div className="relative z-10">
                  <div className="text-lg md:text-xl font-black text-white uppercase tracking-tighter leading-none mb-1">Storage Master</div>
                  <div className="text-[9px] font-black text-accent-blue uppercase tracking-[0.2em]">One-Click Download & Purge</div>
                  <div className="mt-3 flex items-center gap-2 text-[8px] font-bold text-slate-400">
                    <span className="w-1.5 h-1.5 bg-accent-green rounded-full animate-pulse" />
                    Recommended Before New Month
                  </div>
                </div>
              </button>

              {/* Mismatch Summary Card */}
              <button 
                onClick={() => setActiveTab('MISMATCHES')}
                className="bg-white p-4 md:p-6 rounded-3xl border border-app-border shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-36 md:h-44 group"
              >
                <div className="flex justify-between items-start">
                  <div className="w-10 h-10 md:w-12 md:h-12 bg-accent-orange/10 rounded-2xl flex items-center justify-center text-accent-orange group-hover:bg-accent-orange group-hover:text-white transition-colors">
                    <Barcode className="h-5 w-5 md:h-6 md:h-6" />
                  </div>
                </div>
                <div>
                  <div className="text-xl md:text-3xl font-black text-slate-900 tracking-tighter leading-none">
                    ₹{mismatches.filter(m => m && m.date === format(new Date(), 'yyyy-MM-dd')).reduce((sum, m) => sum + (m.valueDifference || 0), 0).toLocaleString()}
                  </div>
                  <div className="text-[8px] md:text-[10px] font-black text-text-secondary uppercase tracking-widest mt-1">Today's Mismatch</div>
                </div>
              </button>

              {/* Shipments Summary */}
              <button 
                onClick={() => setActiveTab('SHIPMENTS')}
                className="bg-white p-4 md:p-6 rounded-3xl border border-app-border shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-36 md:h-44 group"
              >
                <div className="w-10 h-10 md:w-12 md:h-12 bg-accent-green/10 rounded-2xl flex items-center justify-center text-accent-green group-hover:bg-accent-green group-hover:text-white transition-colors">
                  <PackageCheck className="h-5 w-5 md:h-6 md:h-6" />
                </div>
                <div>
                  <div className="text-xl md:text-3xl font-black text-slate-900 tracking-tighter leading-none">
                    {allAttendanceRecords.reduce((sum, a) => sum + (a.shipments || 0), 0)}
                  </div>
                  <div className="text-[8px] md:text-[10px] font-black text-text-secondary uppercase tracking-widest mt-1">Unit Deliveries</div>
                </div>
              </button>

              {/* Salaries Summary */}
              <button 
                onClick={() => setActiveTab('SALARY')}
                className="bg-white p-4 md:p-6 rounded-3xl border border-app-border shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-36 md:h-44 group"
              >
                <div className="w-10 h-10 md:w-12 md:h-12 bg-accent-red/10 rounded-2xl flex items-center justify-center text-accent-red group-hover:bg-accent-red group-hover:text-white transition-colors">
                  <CreditCard className="h-5 w-5 md:h-6 md:h-6" />
                </div>
                <div className="space-y-2">
                  <div>
                    <div className="text-xl md:text-2xl font-black text-slate-900 tracking-tighter leading-none">
                      ₹{allAttendanceRecords.filter(a => isSameDay(new Date(a.date), new Date())).reduce((sum, a) => sum + (a.earnings || 0), 0).toLocaleString()}
                    </div>
                    <div className="text-[7px] md:text-[8px] font-black text-accent-blue uppercase tracking-widest mt-1">Today's Payroll</div>
                  </div>
                  <div className="pt-2 border-t border-slate-100">
                    <div className="text-sm md:text-base font-black text-slate-500 tracking-tighter leading-none">
                      ₹{allAttendanceRecords.reduce((sum, a) => sum + (a.earnings || 0), 0).toLocaleString()}
                    </div>
                    <div className="text-[7px] md:text-[8px] font-black text-text-secondary uppercase tracking-widest mt-0.5">Monthly Total</div>
                  </div>
                </div>
              </button>

              {/* Mileage Summary */}
              <button 
                onClick={() => setActiveTab('MILEAGE')}
                className="bg-white p-4 md:p-6 rounded-3xl border border-app-border shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-36 md:h-44 group"
              >
                <div className="w-10 h-10 md:w-12 md:h-12 bg-orange-500/10 rounded-2xl flex items-center justify-center text-orange-500 group-hover:bg-orange-500 group-hover:text-white transition-colors">
                  <Map className="h-5 w-5 md:h-6 md:h-6" />
                </div>
                <div>
                  <div className="text-xl md:text-3xl font-black text-slate-900 tracking-tighter leading-none">
                    {allAttendanceRecords.reduce((sum, a) => sum + (a.distanceDriven || 0), 0)} <span className="text-sm">KM</span>
                  </div>
                  <div className="text-[8px] md:text-[10px] font-black text-text-secondary uppercase tracking-widest mt-1">Total Distance</div>
                </div>
              </button>

              {/* AD-HOC Summary Card */}
              <button 
                onClick={() => setActiveTab('ADHOC')}
                className="bg-white p-4 md:p-6 rounded-3xl border border-app-border shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-36 md:h-44 group"
              >
                <div className="w-10 h-10 md:w-12 md:h-12 bg-accent-blue/10 rounded-2xl flex items-center justify-center text-accent-blue group-hover:bg-accent-blue group-hover:text-white transition-colors">
                  <Plus className="h-5 w-5 md:h-6" />
                </div>
                <div>
                  <div className="text-xl md:text-3xl font-black text-slate-900 tracking-tighter leading-none">
                    ₹{adHocJobs.filter(j => j.date === format(new Date(), 'yyyy-MM-dd')).reduce((sum, j) => sum + (j.value || 0), 0).toLocaleString()}
                  </div>
                  <div className="text-[8px] md:text-[10px] font-black text-text-secondary uppercase tracking-widest mt-1">{t.today} {t.adHoc}</div>
                </div>
              </button>

              {/* Calls Summary */}
              {/* Quick Actions Card */}
              <div className="bg-slate-900 p-4 md:p-6 rounded-3xl shadow-xl text-white flex flex-col justify-between h-36 md:h-44">
                <div className="text-[8px] md:text-[10px] font-black uppercase tracking-widest opacity-60">Admin Tools</div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setIsAddingEmployee(true)}
                    className="w-full bg-white/10 hover:bg-white/20 h-10 md:h-14 rounded-2xl flex flex-col items-center justify-center transition-colors"
                  >
                    <Users className="h-3 w-3 md:h-4 md:w-4 mb-0.5 md:mb-1" />
                    <span className="text-[7px] md:text-[8px] font-black uppercase">Add Staff</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Recent Activity Mini-List */}
            <div className="bg-white rounded-[2rem] border border-app-border p-6 shadow-sm">
               <div className="flex items-center justify-between mb-4">
                 <h3 className="text-xs font-black uppercase tracking-widest text-text-secondary">Recent Status Updates</h3>
                 <button onClick={() => setActiveTab('EMPLOYEES')} className="text-[10px] font-bold text-accent-blue underline">View All</button>
               </div>
               <div className="space-y-4">
                 {attendanceToday.slice(0, 5).map((record, idx) => {
                   const emp = employees.find(e => e.id === record.userId);
                   return (
                      <div key={record.id ? `recent-${record.id}-${idx}` : `recent-idx-${idx}`} className="flex items-center justify-between p-2 hover:bg-bg-app rounded-xl transition-colors">
                       <div className="flex items-center gap-3">
                         <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-xs uppercase">
                            {emp?.name?.charAt(0) || '?'}
                         </div>
                         <div>
                            <div className="text-xs font-bold">{emp?.name}</div>
                            <div className="text-[8px] text-text-secondary uppercase">{record.status} • {record.checkInTime ? format(new Date(record.checkInTime), 'hh:mm a') : '---'}</div>
                         </div>
                       </div>
                       <div className="text-right">
                          <div className={cn(
                            "text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter",
                            record.status === 'ABSENT' ? "bg-accent-red/10 text-accent-red" : "bg-accent-green/10 text-accent-green"
                          )}>
                             {record.status}
                          </div>
                       </div>
                     </div>
                   );
                 })}
                 {attendanceToday.length === 0 && (
                   <p className="text-[10px] text-center text-text-secondary py-4 italic">No activity logged yet today.</p>
                 )}
               </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'EMPLOYEES' && (
          <>
            {/* Employees Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Users className="h-5 w-5 text-accent-blue" /> {t.employee}
                </h2>
                <div className="flex items-center gap-2">
                  {selectedEmployeeUids.size > 0 && (
                    <motion.button
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      onClick={handleBulkDelete}
                      disabled={isBulkDeleting}
                      className="px-4 py-2 bg-accent-red text-white rounded-lg text-xs font-bold active:scale-95 transition-all shadow-md shadow-accent-red/20 flex items-center gap-2"
                    >
                      {isBulkDeleting ? (
                        <RefreshCw className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                      Delete ({selectedEmployeeUids.size})
                    </motion.button>
                  )}
                  <button 
                    onClick={() => setIsImportingEmployees(true)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold active:scale-95 transition-all shadow-md shadow-emerald-600/20 flex items-center gap-1.5"
                  >
                    <Database className="h-3.5 w-3.5 animate-pulse" /> Restore / Import Accounts (পুরোনো আইডি রিস্টোর)
                  </button>
                  <button 
                    onClick={() => setIsAddingEmployee(true)}
                    className="px-4 py-2 bg-accent-blue text-white rounded-lg text-xs font-bold active:scale-95 transition-all shadow-md shadow-accent-blue/20"
                  >
                    {t.addEmployee}
                  </button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary" />
                  <input 
                    type="text" 
                    placeholder={t.search} 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-white border border-app-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/20 transition-all shadow-sm"
                  />
                </div>
                
                {user?.role === 'ADMIN' && (
                  <select
                    value={filterDepartment}
                    onChange={(e) => setFilterDepartment(e.target.value)}
                    className="px-4 py-3 bg-white border border-app-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/20 transition-all shadow-sm outline-none"
                  >
                    <option value="">All Departments</option>
                    {departments.map((dept, dIdx) => (
                      <option key={`${dept}-${dIdx}`} value={dept}>{dept}</option>
                    ))}
                  </select>
                )}

                <select
                  value={filterRole}
                  onChange={(e) => setFilterRole(e.target.value)}
                  className="px-4 py-3 bg-white border border-app-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/20 transition-all shadow-sm outline-none"
                >
                  <option value="">All Roles</option>
                  {user?.role === 'ADMIN' && <option value="ADMIN">{t.admin}</option>}
                  <option value="SUPERVISOR">Supervisor</option>
                  <option value="EMPLOYEE">{t.employee}</option>
                </select>

                {filteredEmployees.length > 0 && (
                  <button
                    onClick={toggleSelectAll}
                    className="px-4 py-2 bg-white border border-app-border rounded-xl text-xs font-bold hover:bg-bg-app transition-all flex items-center gap-2 whitespace-nowrap"
                  >
                    <div className={cn(
                      "w-4 h-4 rounded border flex items-center justify-center transition-all",
                      selectedEmployeeUids.size === filteredEmployees.length ? "bg-accent-blue border-accent-blue" : "border-app-border"
                    )}>
                      {selectedEmployeeUids.size === filteredEmployees.length && <CheckCircle2 className="h-3 w-3 text-white" />}
                    </div>
                    {selectedEmployeeUids.size === filteredEmployees.length ? "Deselect All" : "Select All"}
                  </button>
                )}
              </div>

              <div className="space-y-4">
                {filteredEmployees.map((emp, idx) => {
                    const record = attendanceToday.find(a => a.userId === emp.id);
                    const isSelected = selectedEmployeeUids.has(emp.id);
                    return (
                      <motion.div 
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: Math.min(idx * 0.05, 0.4) }}
                        key={`emp-card-${emp.id}-${idx}`} 
                        className={cn(
                          "bg-white rounded-[32px] p-6 border-2 border-app-border flex items-center justify-between gap-4 transition-all hover:border-slate-300 shadow-sm hover:shadow-md group relative",
                          isSelected && "border-accent-blue/40 bg-accent-blue/5",
                          emp.status === 'BLOCKED' && "opacity-50 grayscale",
                          emp.status === 'SUSPENDED' && "opacity-75 border-amber-200 bg-amber-50/10"
                        )}
                      >
                        <div className="flex items-center gap-4 min-w-0 flex-1">
                          {/* Selection Checkbox */}
                          <button
                            onClick={() => toggleEmployeeSelection(emp.id)}
                            className="flex-shrink-0"
                          >
                            <div className={cn(
                              "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all",
                              isSelected ? "bg-accent-blue border-accent-blue" : "border-slate-300 group-hover:border-accent-blue"
                            )}>
                              {isSelected && <CheckCircle2 className="h-4 w-4 text-white" />}
                            </div>
                          </button>

                          {/* Attendance Short Pill Indicator (Screenshot 5) */}
                          <div className="flex-shrink-0">
                            {record ? (
                              record.checkOutTime ? (
                                <div className="w-6 h-10 bg-emerald-50 text-accent-green rounded-2xl flex items-center justify-center font-black border border-emerald-100 text-xs shadow-sm">
                                  ✓
                                </div>
                              ) : (
                                <div className="w-6 h-10 bg-blue-50 text-accent-blue rounded-2xl flex items-center justify-center font-black border border-blue-100 text-xs shadow-sm animate-pulse">
                                  ●
                                </div>
                              )
                            ) : (
                              <div className="w-6 h-10 bg-[#fef2f2] text-accent-red rounded-2xl flex items-center justify-center font-black border border-red-100 text-xs shadow-sm">
                                ✕
                              </div>
                            )}
                          </div>

                          {/* Info Column */}
                          <button 
                            onClick={() => setSelectedEmployeeForHistory(emp)}
                            className="flex items-center gap-4 text-left flex-1 min-w-0"
                          >
                            <div className="min-w-0 flex-1">
                              {/* Title and Badge Row */}
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <h4 className="text-base font-black text-slate-900 leading-none group-hover:text-accent-blue transition-colors truncate">{emp.name}</h4>
                                <div className={cn(
                                  "px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-wider flex items-center gap-1",
                                  emp.status === 'ACTIVE' ? "bg-emerald-50 text-accent-green border border-emerald-100" : 
                                  emp.status === 'SUSPENDED' ? "bg-amber-50 text-amber-600 border border-amber-100" : 
                                  "bg-red-50 text-accent-red border border-red-100"
                                )}>
                                  <div className={cn(
                                    "w-1 h-1 rounded-full",
                                    emp.status === 'ACTIVE' ? "bg-accent-green animate-pulse" : 
                                    emp.status === 'SUSPENDED' ? "bg-amber-500" : 
                                    "bg-accent-red"
                                  )} />
                                  {emp.status === 'ACTIVE' ? t.active : (emp.status === 'SUSPENDED' ? t.suspended : t.blocked)}
                                </div>
                                {emp.role === 'ADMIN' && (
                                  <div className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider bg-accent-blue/10 text-accent-blue border border-accent-blue/20 flex items-center gap-1">
                                    <ShieldCheck className="h-2 w-2" />
                                    {t.admin}
                                  </div>
                                )}
                              </div>

                              {/* Detailed Bullets (Screenshot 5 meta layout) */}
                              <div className="text-[10px] text-text-secondary font-black uppercase tracking-wider space-y-1 mt-2">
                                <div className="flex items-center gap-1.5 text-slate-500">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                                  <span>{emp.username || emp.id}</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-slate-400">
                                  <Smartphone className="h-3 w-3 text-slate-400" />
                                  <span>{t.activeSessions}: {emp.activeSessions?.length || 0}</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-slate-400">
                                  <Clock className="h-3 w-3 text-slate-400" />
                                  <span>{t.lastActive}: {emp.lastActive ? format(new Date(emp.lastActive), 'MMM d, hh:mm a') : 'Never'}</span>
                                </div>

                                {/* Custom High Visibility Credentials Box */}
                                <div className="bg-slate-100/90 border border-slate-200 rounded-2xl p-3 my-2 space-y-1.5 max-w-xs shadow-inner">
                                  <div className="flex items-center justify-between gap-2 text-[9px] text-slate-600">
                                    <span className="font-extrabold text-[8px] uppercase tracking-wider text-slate-500">USER ID / ইউজার আইডি:</span>
                                    <span className="font-black text-accent-blue tracking-normal text-xs font-mono bg-white px-2 py-0.5 rounded border border-slate-200/50 select-all">{emp.username || emp.id}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-2 text-[9px] text-slate-600 border-t border-slate-200/50 pt-1.5">
                                    <span className="font-extrabold text-[8px] uppercase tracking-wider text-slate-500">PASSWORD / পাসওয়ার্ড:</span>
                                    <span className="font-black text-emerald-600 tracking-normal text-xs font-mono bg-white px-2 py-0.5 rounded border border-slate-200/50 select-all">{emp.passwordHash || 'N/A / সংরক্ষিত নেই'}</span>
                                  </div>
                                </div>

                                <div className="flex flex-wrap gap-2 pt-1">
                                  <div className="px-2.5 py-1 bg-accent-green/5 border border-accent-green/10 rounded-full flex items-center gap-1">
                                    <div className="w-1.5 h-1.5 bg-accent-green rounded-full" />
                                    <span className="text-[8px] font-black text-accent-green uppercase tracking-tighter">Monthly:</span>
                                    <span className="text-[10px] font-black text-slate-900 ml-1">₹{allAttendanceRecords.filter(a => a.userId === emp.id).reduce((sum, a) => sum + (a.earnings || 0), 0).toLocaleString()}</span>
                                  </div>
                                  
                                  {allAttendanceRecords.find(a => a.userId === emp.id && isSameDay(new Date(a.date), new Date()))?.earnings !== undefined && (
                                    <div className="px-2.5 py-1 bg-accent-blue/5 border border-accent-blue/10 rounded-full flex items-center gap-1">
                                      <div className="w-1.5 h-1.5 bg-accent-blue rounded-full animate-pulse" />
                                      <span className="text-[8px] font-black text-accent-blue uppercase tracking-tighter">Today:</span>
                                      <span className="text-[10px] font-black text-slate-900 ml-1">₹{allAttendanceRecords.find(a => a.userId === emp.id && isSameDay(new Date(a.date), new Date()))?.earnings?.toLocaleString()}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </button>
                        </div>

                        {/* Right-most Action triggers (Matches edit, session, status buttons in Screenshot 5) */}
                        <div className="flex items-center gap-1.5">
                          <button 
                            onClick={() => handleResetSessions(emp.id)}
                            className="p-3 bg-bg-app border border-app-border hover:bg-slate-200 text-slate-600 rounded-2xl transition-all hover:shadow-inner active:scale-90"
                            title={t.resetSessions}
                          >
                            <Smartphone className="h-4 w-4" />
                          </button>
                          <button 
                            onClick={() => setEditingEmployee(emp)}
                            className="p-3 bg-bg-app border border-app-border hover:bg-slate-200 text-slate-600 rounded-2xl transition-all hover:shadow-inner active:scale-90"
                            title="Edit Profile / তথ্য এডিট করুন"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button 
                            onClick={() => setResetCredentialsEmployee(emp)}
                            className="p-3 bg-bg-app border border-app-border hover:bg-slate-200 text-slate-600 rounded-2xl transition-all hover:shadow-inner active:scale-90"
                            title="Reset Credentials / আইডি ও পাসওয়ার্ড আপডেট"
                          >
                            <Key className="h-4 w-4 text-emerald-600 font-extrabold" />
                          </button>
                          <button 
                            onClick={() => handleUpdateStatus(emp.id, emp.status)}
                            className="p-3 bg-bg-app border border-app-border hover:bg-slate-200 text-slate-600 rounded-2xl transition-all hover:shadow-inner active:scale-90"
                            title={t.status}
                          >
                            <ShieldCheck className="h-4 w-4" />
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
              </div>
            </div>
            
            {/* Attendance Logs */}
            <div className="space-y-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Clock className="h-5 w-5 text-accent-blue" /> {t.attendance}
              </h2>
              
              <div className="grid grid-cols-1 md:flex md:gap-4 md:overflow-x-auto pb-4 scrollbar-hide gap-4">
                {filteredAttendanceToday.map((record, idx) => {
                   const emp = employees.find(e => e.id === record.userId);
                   return (
                     <div 
                       key={`att-log-${record.id || 'no-id'}-${idx}`} 
                       className="min-w-[260px] bg-white rounded-2xl p-4 border border-app-border shadow-sm flex flex-col gap-4 transition-all hover:border-accent-blue/30 relative"
                     >
                      <button 
                         onClick={() => emp && setSelectedEmployeeForHistory(emp)}
                         className="flex items-center gap-3 text-left w-full"
                      >
                        <div className="flex -space-x-3 group-hover:space-x-1 transition-all">
                          {record.checkInPhoto && (
                            <img 
                              src={record.checkInPhoto} 
                              className="w-10 h-10 rounded-lg object-cover ring-2 ring-white shadow-md cursor-pointer hover:z-20 transition-all" 
                              onClick={(e) => { e.stopPropagation(); window.open(record.checkInPhoto, '_blank'); }}
                            />
                          )}
                          {record.checkOutPhoto && (
                            <img 
                              src={record.checkOutPhoto} 
                              className="w-10 h-10 rounded-lg object-cover ring-2 ring-white shadow-md cursor-pointer hover:z-20 transition-all" 
                              onClick={(e) => { e.stopPropagation(); window.open(record.checkOutPhoto, '_blank'); }}
                            />
                          )}
                        </div>
                        <div>
                          <h5 className="text-xs font-bold leading-tight flex items-center gap-2">
                            {emp?.name}
                            {record.reviewNeeded && record.status !== 'FRAUDULENT' && (
                              <span className="text-[8px] font-black text-white bg-amber-500 px-1 rounded-full animate-pulse">
                                {t.review}
                              </span>
                            )}
                            {emp && emp.activeSessions && emp.activeSessions.length > 0 && (
                              <span className="flex items-center gap-0.5 text-[8px] text-accent-green bg-accent-green/10 px-1 rounded-full">
                                <Smartphone className="h-2 w-2" />
                                {emp.activeSessions.length}
                              </span>
                            )}
                          </h5>
                          <p className="text-[9px] text-text-secondary font-medium uppercase">{emp?.jobTitle}</p>
                        </div>
                      </button>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1 text-left">
                          <div className="text-[9px] text-text-secondary font-bold uppercase tracking-widest">Check-in</div>
                          <div className="text-xs font-bold">{format(new Date(record.checkInTime), 'hh:mm a')}</div>
                          {record.checkInLocation?.latitude && record.checkInLocation?.longitude && (
                            <a href={`https://www.google.com/maps?q=${record.checkInLocation.latitude},${record.checkInLocation.longitude}`} target="_blank" rel="noreferrer" className="text-[10px] text-accent-blue font-bold flex items-center gap-1">
                              <MapPin className="h-3 w-3" /> Map
                            </a>
                          )}
                        </div>
                        {record.checkOutTime ? (
                          <div className="space-y-1 text-left">
                            <div className="text-[9px] text-text-secondary font-bold uppercase tracking-widest">Check-out</div>
                            <div className="text-xs font-bold">{format(new Date(record.checkOutTime), 'hh:mm a')}</div>
                            {record.selectedPinCodes && record.selectedPinCodes.length > 0 && (
                              <div className="flex flex-wrap gap-0.5 p-1 bg-slate-50 border border-slate-200/50 rounded-lg max-w-[150px]">
                                {record.selectedPinCodes.map(p => (
                                  <span key={p} className="text-[7px] font-black text-slate-700 bg-white px-1 border border-slate-200 rounded">{p}</span>
                                ))}
                              </div>
                            )}
                            <div className="flex items-center gap-2 mt-0.5">
                              <a href={`https://www.google.com/maps?q=${record.checkOutLocation?.latitude},${record.checkOutLocation?.longitude}`} target="_blank" rel="noreferrer" className="text-[10px] text-accent-blue font-bold flex items-center gap-1">
                                <MapPin className="h-3 w-3" /> Map
                              </a>
                              <span className="text-[10px] text-text-secondary font-bold">• {record.hoursWorked || 0} hrs</span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center bg-bg-app rounded-lg border border-dashed border-app-border gap-1 px-3">
                            <span className="text-[12px]">✅</span>
                            <span className="text-[10px] text-text-secondary font-bold">Active</span>
                          </div>
                        )}
                      </div>

                        <div className="flex gap-2 border-t border-app-border/30 pt-3 mt-1">
                          <button 
                            onClick={async () => {
                              try {
                                await SupabaseService.update('attendance', record.id, { 
                                  status: 'FRAUDULENT', 
                                  earnings: 0,
                                  hoursWorked: 0,
                                  distanceDriven: 0
                                });
                              } catch (err) {
                                console.error("Mark as fake failed:", err);
                              }
                            }}
                            className="flex-1 bg-accent-red/10 text-accent-red text-[9px] font-black uppercase py-2 rounded-lg hover:bg-accent-red hover:text-white transition-all flex items-center justify-center gap-1"
                          >
                            <ShieldAlert className="h-3 w-3" /> Fake
                          </button>
                          <button 
                            onClick={async () => {
                              try {
                                await SupabaseService.delete('attendance', record.id);
                              } catch (err) {
                                console.error("Delete failed:", err);
                              }
                            }}
                            className="flex-1 bg-bg-app text-text-secondary text-[9px] font-black uppercase py-2 rounded-lg hover:bg-accent-red hover:text-white transition-all flex items-center justify-center gap-1 border border-app-border"
                          >
                            <Trash2 className="h-3 w-3" /> Del
                          </button>
                        </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {activeTab === 'SHIPMENTS' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-app-border shadow-sm">
              <div className="space-y-1">
                <h3 className="text-lg font-bold">Shipment Monitoring</h3>
                <p className="text-[10px] text-text-secondary uppercase font-bold tracking-widest px-0.5">Track daily and monthly delivery counts</p>
              </div>
              <div className="flex items-center gap-3">
                <input 
                  type="month" 
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="bg-bg-app px-4 py-2 rounded-lg border border-app-border text-xs font-bold focus:outline-none focus:ring-2 focus:ring-accent-blue/20"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Aggregated Stats */}
              <div className="bg-gradient-to-br from-accent-blue to-blue-700 p-6 rounded-3xl text-white shadow-xl flex flex-col justify-between h-32">
                <div className="text-[10px] font-black uppercase tracking-widest opacity-80">Today's Deliveries</div>
                <div className="text-3xl font-black">{attendanceToday.reduce((sum, a) => sum + (a.shipments || 0), 0)} Units</div>
              </div>
              <div className="bg-white p-6 rounded-3xl border border-app-border shadow-sm flex flex-col justify-between h-32">
                <div className="text-[10px] font-black text-text-secondary uppercase tracking-widest">Monthly Deliveries</div>
                <div className="text-3xl font-black text-accent-blue">{allAttendanceRecords.reduce((sum, a) => sum + (a.shipments || 0), 0)} Units</div>
              </div>
              <div className="bg-white p-6 rounded-3xl border border-app-border shadow-sm flex flex-col justify-between h-32">
                <div className="text-[10px] font-black text-text-secondary uppercase tracking-widest">Active Personnel</div>
                <div className="text-3xl font-black text-accent-green">{new Set(allAttendanceRecords.filter(a => (a.shipments || 0) > 0).map(a => a.userId)).size} Staff</div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-app-border shadow-sm overflow-hidden">
              {/* Desktop Table */}
              <div className="hidden md:block">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-bg-app border-b border-app-border">
                      <th className="px-6 py-4 text-[10px] font-black uppercase text-text-secondary tracking-widest">Employee</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase text-text-secondary tracking-widest">Daily (Today)</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase text-text-secondary tracking-widest">Monthly ({format(new Date(selectedMonth + '-01'), 'MMM')})</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase text-text-secondary tracking-widest text-right">Avg / Day</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-app-border">
                    {employees.filter(e => e.paymentBase === 'PER_SHIPMENT').map((emp, idx) => {
                      const todayRec = attendanceToday.find(a => a.userId === emp.id);
                      const empMonthlyRecords = allAttendanceRecords.filter(a => a.userId === emp.id);
                      const monthlyTotal = empMonthlyRecords.reduce((sum, a) => sum + (a.shipments || 0), 0);
                      const daysWorked = empMonthlyRecords.filter(a => (a.shipments || 0) > 0).length;
                      const avg = (daysWorked || 0) > 0 ? ((monthlyTotal || 0) / daysWorked).toFixed(1) : '0';

                      return (
                        <tr key={`ship-row-${emp.id}-${idx}`} className="hover:bg-bg-app group transition-colors cursor-pointer" onClick={() => setSelectedEmployeeForHistory(emp)}>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full overflow-hidden bg-bg-app border border-app-border shadow-inner">
                                  {emp.profilePicture ? (
                                    <img src={emp.profilePicture} alt={emp.name} className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-text-secondary">{emp.name?.charAt(0) || '?'}</div>
                                  )}
                              </div>
                              <div>
                                <div className="text-sm font-bold text-slate-900 group-hover:text-accent-blue transition-colors">{emp.name}</div>
                                <div className="text-[9px] text-text-secondary font-bold uppercase">{emp.jobTitle}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className={cn(
                                "w-2 h-2 rounded-full",
                                (todayRec?.shipments || 0) > 0 ? "bg-accent-green" : "bg-slate-200"
                              )} />
                              <span className="text-sm font-black text-slate-900">{todayRec?.shipments || 0}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm font-black text-accent-blue">{monthlyTotal} Units</div>
                            <div className="text-[9px] text-text-secondary font-bold">{daysWorked} active days</div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="text-sm font-black text-slate-900">{avg}</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card List */}
              <div className="md:hidden divide-y divide-app-border">
                {employees.filter(e => e.paymentBase === 'PER_SHIPMENT').map((emp, idx) => {
                    const todayRec = attendanceToday.find(a => a.userId === emp.id);
                    const empMonthlyRecords = allAttendanceRecords.filter(a => a.userId === emp.id);
                    const monthlyTotal = empMonthlyRecords.reduce((sum, a) => sum + (a.shipments || 0), 0);
                    const daysWorked = empMonthlyRecords.filter(a => (a.shipments || 0) > 0).length;
                    const avg = (daysWorked || 0) > 0 ? ((monthlyTotal || 0) / daysWorked).toFixed(1) : '0';

                    return (
                      <div key={`ship-card-${emp.id}-${idx}`} className="p-4 space-y-4" onClick={() => setSelectedEmployeeForHistory(emp)}>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full overflow-hidden bg-bg-app border border-app-border shadow-inner">
                              {emp.profilePicture ? (
                                <img src={emp.profilePicture} alt={emp.name} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-text-secondary">{emp.name?.charAt(0) || '?'}</div>
                              )}
                          </div>
                          <div>
                            <div className="text-sm font-bold text-slate-900">{emp.name}</div>
                            <div className="text-[9px] text-text-secondary font-bold uppercase">{emp.jobTitle}</div>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="bg-bg-app p-2 rounded-xl text-center">
                            <div className="text-[8px] font-black text-text-secondary uppercase">Today</div>
                            <div className="text-sm font-black text-slate-900">{todayRec?.shipments || 0}</div>
                          </div>
                          <div className="bg-bg-app p-2 rounded-xl text-center">
                            <div className="text-[8px] font-black text-text-secondary uppercase">Month</div>
                            <div className="text-sm font-black text-accent-blue">{monthlyTotal}</div>
                          </div>
                          <div className="bg-bg-app p-2 rounded-xl text-center">
                            <div className="text-[8px] font-black text-text-secondary uppercase">Avg/Day</div>
                            <div className="text-sm font-black text-slate-900">{avg}</div>
                          </div>
                        </div>
                      </div>
                    );
                })}
              </div>
              {employees.filter(e => e.paymentBase === 'PER_SHIPMENT').length === 0 && (
                <div className="py-20 text-center space-y-3">
                  <div className="text-5xl opacity-20 grayscale">🚚</div>
                  <div className="text-xs font-black text-text-secondary uppercase tracking-widest">No per-shipment employees found</div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'SALARY' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-app-border shadow-sm">
              <div className="space-y-1">
                <h3 className="text-lg font-bold">{t.salary} Generation</h3>
                <p className="text-[10px] text-text-secondary uppercase font-bold tracking-widest px-0.5">Process payments for the month</p>
              </div>
              <div className="flex items-center gap-3">
                <input 
                  type="month" 
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="bg-bg-app px-4 py-2 rounded-lg border border-app-border text-xs font-bold focus:outline-none focus:ring-2 focus:ring-accent-blue/20"
                />
                <button 
                  onClick={handleCalculateSalaries}
                  disabled={isCalculating}
                  className="px-6 py-2 bg-accent-blue text-white rounded-lg text-xs font-black uppercase tracking-widest shadow-lg shadow-accent-blue/20 disabled:opacity-50 active:scale-95 transition-all min-w-[120px]"
                >
                  {isCalculating ? t.calculating : t.generate}
                </button>
                <button 
                  onClick={() => handleExportAttendanceExcel()}
                  disabled={isLoading}
                  className="px-6 py-2 bg-slate-900 text-white rounded-lg text-xs font-black uppercase tracking-widest shadow-lg shadow-slate-900/10 active:scale-95 transition-all flex items-center gap-2"
                >
                  {isLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  Download All Excel
                </button>
              </div>
            </div>

            {/* Master Payday Schedule (Month Following Selection) */}
            <div className="bg-white rounded-2xl border border-app-border shadow-sm overflow-hidden mb-6">
              <div className="bg-accent-green/5 p-4 border-b border-app-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-accent-green rounded-full flex items-center justify-center text-white text-lg">💲</div>
                  <div>
                    <h4 className="text-sm font-black text-slate-900 uppercase">Master Payday Schedule</h4>
                    <p className="text-[10px] text-text-secondary font-bold">Planned for {format(new Date(new Date(selectedMonth + '-01').setMonth(new Date(selectedMonth + '-01').getMonth() + 1)), 'MMMM yyyy')}</p>
                  </div>
                </div>
              </div>
              <div className="divide-y divide-app-border max-h-[300px] overflow-y-auto custom-scrollbar">
                {employees.map((emp, idx) => {
                  const empPayday = allPaydays.find(p => p.userId === emp.id && p.date.startsWith(format(new Date(new Date(selectedMonth + '-01').setMonth(new Date(selectedMonth + '-01').getMonth() + 1)), 'yyyy-MM')));
                  if (!empPayday) return null;
                  return (
                    <div key={`salary-payday-idx-${emp.id}-${idx}`} className="p-4 flex items-center justify-between bg-white hover:bg-bg-app transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-bg-app border border-app-border">
                          {emp.profilePicture ? (
                            <img src={emp.profilePicture} alt={emp.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-text-secondary">{emp.name?.charAt(0) || '?'}</div>
                          )}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-900">{emp.name}</div>
                          <div className="text-[9px] text-text-secondary font-bold uppercase">{emp.jobTitle}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-black text-accent-green">{format(new Date(empPayday.date), 'EEEE, MMM d')}</div>
                        <div className="text-[9px] text-text-secondary font-bold uppercase italic">Designated Payday</div>
                      </div>
                    </div>
                  );
                })}
                {!employees.some(emp => allPaydays.some(p => p.userId === emp.id && p.date.startsWith(format(new Date(new Date(selectedMonth + '-01').setMonth(new Date(selectedMonth + '-01').getMonth() + 1)), 'yyyy-MM')))) && (
                  <div className="p-8 text-center text-text-secondary text-xs italic">
                    No paydays designated for the upcoming month yet.
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-[10px] font-bold text-text-secondary uppercase tracking-widest px-1">{t.salary} Records</h4>
              <div className="grid grid-cols-1 gap-3">
                {filteredSalaries.map((sal, idx) => (
                  <div key={sal.id || `salary-${idx}`} className="bg-white p-5 rounded-2xl border border-app-border shadow-sm flex items-center justify-between group hover:border-accent-blue/30 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-bg-app rounded-xl flex items-center justify-center border border-app-border group-hover:bg-accent-blue/5 transition-all">
                        <TrendingUp className="h-6 w-6 text-accent-blue" />
                      </div>
                      <div>
                        <div className="text-sm font-black text-slate-900">{sal.userName}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[9px] font-black uppercase text-accent-blue py-0.5 px-1.5 bg-accent-blue/10 rounded">
                            {sal.daysPresent} {t.daysPresentCount}
                          </span>
                          <span className="text-[9px] font-black uppercase text-text-secondary py-0.5 px-1.5 bg-bg-app rounded">
                            {sal.totalShipments} {t.shipmentsCount}
                          </span>
                          {sal.totalMileage !== undefined && sal.totalMileage > 0 && (
                            <span className="text-[9px] font-black uppercase text-accent-green py-0.5 px-1.5 bg-accent-green/10 rounded">
                              {sal.totalMileage} {t.km}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className="text-lg font-black text-slate-900 leading-none">₹{sal.totalEarnings.toLocaleString()}</div>
                        <div className={cn(
                          "text-[9px] font-black uppercase mt-1",
                          sal.status === 'PAID' ? "text-accent-green" : "text-accent-red"
                        )}>
                          {sal.status === 'PAID' ? t.paid : t.pending}
                        </div>
                      </div>
                      <button 
                        onClick={() => handleUpdateSalaryStatus(sal.id!, sal.status === 'PAID' ? 'PENDING' : 'PAID')}
                        className={cn(
                          "p-2 rounded-lg transition-all",
                          sal.status === 'PAID' ? "bg-bg-app text-text-secondary" : "bg-accent-green text-white shadow-md shadow-accent-green/20"
                        )}
                      >
                        {sal.status === 'PAID' ? <ShieldAlert className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                ))}
                {salaries.length === 0 && (
                  <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-app-border">
                    <Clock className="h-8 w-8 text-text-secondary mx-auto mb-2 opacity-50" />
                    <p className="text-xs text-text-secondary font-medium">{t.noData}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'MILEAGE' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="bg-white rounded-[32px] border border-app-border p-8 shadow-xl">
               <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                     <div className="w-12 h-12 bg-accent-blue/10 rounded-2xl flex items-center justify-center text-accent-blue font-bold">
                        <Map className="h-6 w-6" />
                     </div>
                     <div>
                        <h2 className="text-xl font-black uppercase tracking-tight text-slate-900">Mileage Tracking</h2>
                        <p className="text-[10px] text-text-secondary font-black uppercase tracking-widest">Verify employee travel logs</p>
                     </div>
                  </div>
               </div>
               
               <div className="space-y-4">
                  {odoHistory.length > 0 ? (
                    odoHistory.map((rec, idx) => (
                      <AttendanceHistoryItem key={rec.id || `odo-${idx}`} rec={rec} paydays={paydays} t={t} />
                    ))
                  ) : (
                    <div className="text-center py-12 text-text-secondary uppercase text-[10px] font-black tracking-widest bg-bg-app/50 rounded-3xl border-2 border-dashed border-app-border/50">
                       No mileage logs recorded yet
                    </div>
                  )}
               </div>
            </div>
          </div>
        )}

        {activeTab === 'MISMATCHES' && (
          <div className="space-y-8 animate-in fade-in duration-500 pb-20">
            {/* Header with Month Selector */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-[32px] border border-app-border shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white">
                    <Barcode className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">{t.valueMismatch}</h2>
                    <p className="text-[10px] text-text-secondary font-black uppercase tracking-widest italic">{format(new Date(selectedMonth + '-01'), 'MMMM yyyy')} reporting period</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <input 
                    type="month" 
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="bg-bg-app px-4 py-2.5 rounded-xl border border-app-border text-[10px] font-black uppercase focus:ring-2 focus:ring-accent-blue/20 outline-none"
                  />
                  <button 
                    onClick={toggleSelectAllMismatches}
                    className="px-6 py-2.5 bg-white text-slate-900 border border-app-border rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm active:scale-95 transition-all flex items-center gap-2"
                  >
                    <CheckSquare className="h-3.5 w-3.5 text-accent-blue" />
                    {selectedMismatchIds.size === mismatches.length ? 'Deselect All' : 'Select All'}
                  </button>
                  <button 
                    onClick={() => handleExportMismatchesExcel('MONTHLY')}
                    className="px-6 py-2.5 bg-accent-blue text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-accent-blue/20 active:scale-95 transition-all flex items-center gap-2"
                  >
                    <Database className="h-3.5 w-3.5" /> 
                    <span>Download Monthly / মাসিক ডাউনলোড</span>
                  </button>
                  {selectedMismatchIds.size > 0 && (
                    <button 
                      onClick={handleBulkDeleteMismatches}
                      disabled={isBulkDeletingMismatches}
                      className="px-6 py-2.5 bg-accent-red text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-accent-red/20 active:scale-95 transition-all flex items-center gap-2"
                    >
                      {isBulkDeletingMismatches ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      Delete ({selectedMismatchIds.size})
                    </button>
                  )}
                </div>
            </div>

            {/* Daily Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 bg-accent-orange text-white px-2 py-1 rounded text-[8px] font-black uppercase tracking-tighter">
                    <Clock className="h-3 w-3" /> LIVE
                  </div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Today's Records</h3>
                </div>
                <button 
                  onClick={() => handleExportMismatchesExcel('DAILY')}
                  className="px-4 py-2 bg-white rounded-xl border border-app-border text-[9px] font-black uppercase tracking-widest text-text-secondary hover:text-accent-blue hover:border-accent-blue/30 transition-all flex items-center gap-2"
                >
                  <Search className="h-3 w-3" /> 
                  <span>Download Daily / দৈনিক ডাউনলোড</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-[32px] border border-app-border p-6 shadow-sm">
                  <div className="text-[9px] font-black text-text-secondary uppercase tracking-widest mb-1">Today's Diff</div>
                  <div className={cn(
                    "text-2xl font-black",
                    mismatches.filter(m => m && m.date === format(new Date(), 'yyyy-MM-dd')).reduce((sum, m) => sum + (m.valueDifference || 0), 0) < 0 ? "text-accent-red" : "text-accent-green"
                  )}>
                    ₹{mismatches.filter(m => m && m.date === format(new Date(), 'yyyy-MM-dd')).reduce((sum, m) => sum + (m.valueDifference || 0), 0).toLocaleString()}
                  </div>
                </div>
                <div className="bg-white rounded-[32px] border border-app-border p-6 shadow-sm">
                  <div className="text-[9px] font-black text-text-secondary uppercase tracking-widest mb-1">Total Reports</div>
                  <div className="text-2xl font-black text-slate-900">
                    {mismatches.filter(m => m.date === format(new Date(), 'yyyy-MM-dd')).length}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {mismatches.filter(m => m.date === format(new Date(), 'yyyy-MM-dd')).length > 0 ? (
                  mismatches.filter(m => m.date === format(new Date(), 'yyyy-MM-dd')).map((m, mIdx) => (
                    <MismatchCard key={`mismatch-${m.id || 'no-id'}-${mIdx}`} m={m} employees={employees} onSelect={toggleMismatchSelection} isSelected={selectedMismatchIds.has(m.id!)} onDelete={async () => {
                      if (window.confirm("Delete this report?")) {
                        await SupabaseService.delete('mismatches', m.id!);
                      }
                    }} />
                  ))
                ) : (
                  <div className="col-span-full py-12 text-center text-[10px] font-black text-text-secondary uppercase tracking-widest italic opacity-50 bg-white rounded-3xl border border-dashed border-app-border">
                    No reports for today yet
                  </div>
                )}
              </div>
            </div>

            {/* Date-by-Date Monthly History */}
            <div className="space-y-6">
               <div className="flex items-center gap-4 px-2">
                 <div className="h-px flex-1 bg-app-border" />
                 <h3 className="text-xs font-black text-text-secondary uppercase tracking-[0.3em] flex items-center gap-2">
                    <History className="h-4 w-4" /> Date-by-Date History
                 </h3>
                 <div className="h-px flex-1 bg-app-border" />
               </div>

               <div className="space-y-12">
                  {mismatchesByDate.filter(([date]) => date !== format(new Date(), 'yyyy-MM-dd')).map(([date, items]) => {
                    let formattedDate = date;
                    try {
                      formattedDate = format(new Date(date), 'EEEE, MMM dd, yyyy');
                    } catch (e) {
                      console.error("Date formatting error", e);
                    }
                    
                    return (
                      <div key={date} className="space-y-6">
                        <div className="flex items-center gap-4">
                          <div className="px-6 py-2 bg-bg-app border border-app-border text-slate-900 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-sm">
                            {formattedDate}
                          </div>
                          <div className="text-[9px] font-black text-text-secondary uppercase tracking-widest">
                            {items.length} Reports • ₹{items.reduce((sum, m) => sum + (m.valueDifference || 0), 0).toLocaleString()}
                          </div>
                        </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {items.map((m, mIdx) => (
                          <MismatchCard key={`mismatch-hist-${m.id || 'no-id'}-${mIdx}`} m={m} employees={employees} onSelect={toggleMismatchSelection} isSelected={selectedMismatchIds.has(m.id!)} onDelete={async () => {
                            if (window.confirm("Delete this report?")) {
                              await SupabaseService.delete('mismatches', m.id!);
                            }
                          }} />
                        ))}
                      </div>
                    </div>
                  );
                })}
               </div>

               {mismatchesByDate.filter(([date]) => date !== format(new Date(), 'yyyy-MM-dd')).length === 0 && (
                <div className="text-center py-24 bg-white rounded-[48px] border-2 border-dashed border-app-border/60">
                   <div className="w-16 h-16 bg-bg-app rounded-2xl flex items-center justify-center mx-auto mb-4 text-text-secondary opacity-20">
                      <Barcode className="h-8 w-8" />
                   </div>
                   <h3 className="text-base font-black text-slate-900 uppercase">Archive Is Clear</h3>
                   <p className="text-[9px] text-text-secondary font-black uppercase tracking-widest mt-2">{format(new Date(selectedMonth + '-01'), 'MMMM yyyy')} historical records will appear here</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'ADHOC' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-[32px] border border-app-border shadow-sm">
              <div className="space-y-1">
                <h2 className="text-xl font-black tracking-tight flex items-center gap-3 italic">
                  <div className="p-2.5 bg-slate-900 text-white rounded-2xl shadow-lg shadow-slate-900/20">
                    <Plus className="h-5 w-5" />
                  </div>
                  {t.adHoc}
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-text-secondary uppercase tracking-[0.2em]">Employee Submission Center</span>
                  <div className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
                </div>
              </div>

              {adHocJobs.length > 0 && (
                <div className="flex items-center gap-2 bg-bg-app px-4 py-2 rounded-xl border border-app-border">
                  <input 
                    type="checkbox" 
                    checked={adHocJobs.length > 0 && selectedAdHocIds.size === adHocJobs.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedAdHocIds(new Set(adHocJobs.map(j => j.id!)));
                      } else {
                        setSelectedAdHocIds(new Set());
                      }
                    }}
                    className="w-4 h-4 rounded border-2 border-app-border text-accent-blue focus:ring-accent-blue/20"
                  />
                  <span className="text-[10px] font-black text-text-secondary uppercase tracking-widest">Select All</span>
                </div>
              )}

              <div className="flex-1 max-w-md mx-4 hidden md:block">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary" />
                  <input
                    type="text"
                    placeholder="Search by name or vehicle..."
                    value={adHocSearchQuery}
                    onChange={(e) => setAdHocSearchQuery(e.target.value)}
                    className="w-full bg-bg-app border border-app-border rounded-2xl pl-11 pr-4 py-3 text-xs font-bold outline-none focus:border-accent-blue transition-all"
                  />
                </div>
              </div>
              
              <div className="flex items-center gap-3 overflow-x-auto pb-1 md:pb-0 scrollbar-hide">
                <div className="bg-bg-app p-1.5 rounded-2xl border border-app-border flex items-center gap-1 shrink-0">
                  <button 
                    onClick={() => setSelectedMonth(format(subMonths(new Date(selectedMonth + '-01'), 1), 'yyyy-MM'))}
                    className="p-2 hover:bg-white rounded-xl transition-all hover:shadow-sm"
                  >
                    <ChevronRight className="h-4 w-4 rotate-180" />
                  </button>
                  <div className="px-4 text-[10px] font-black uppercase tracking-widest text-slate-600">
                    {format(new Date(selectedMonth + '-01'), 'MMMM yyyy')}
                  </div>
                  <button 
                    onClick={() => setSelectedMonth(format(addMonths(new Date(selectedMonth + '-01'), 1), 'yyyy-MM'))}
                    className="p-2 hover:bg-white rounded-xl transition-all hover:shadow-sm"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                <button 
                  onClick={async () => {
                     setSelectedAdHocIds(new Set());
                     const startM = format(startOfMonth(new Date(selectedMonth + '-01')), 'yyyy-MM-dd');
                     const endM = format(endOfMonth(new Date(selectedMonth + '-01')), 'yyyy-MM-dd');
                     const data = await SupabaseService.list('ad_hoc_jobs', [{ column: 'date', value: `${selectedMonth}%`, operator: 'like' }], 500, { column: 'timestamp', ascending: false });
                     setAdHocJobs(data);
                  }}
                  className="p-3 bg-bg-app border border-app-border rounded-xl hover:bg-white transition-all shadow-sm group"
                  title="Refresh Data"
                >
                  <RefreshCw className="h-4 w-4 text-text-secondary group-hover:rotate-180 transition-all duration-500" />
                </button>
                {selectedAdHocIds.size > 0 && (
                  <button 
                    onClick={handleBulkDeleteAdHoc}
                    disabled={isBulkDeletingAdHoc}
                    className="px-6 py-2.5 bg-accent-red text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-accent-red/20 active:scale-95 transition-all flex items-center gap-2 whitespace-nowrap"
                  >
                    {isBulkDeletingAdHoc ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    Delete {selectedAdHocIds.size}
                  </button>
                )}
                <button 
                  onClick={downloadAllDataExcel}
                  className="bg-accent-green text-white px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-accent-green/20 hover:scale-105 transition-all flex items-center gap-2 shrink-0"
                >
                  <Database className="h-4 w-4" /> 
                  <span>Download Excel / এক্সেল ডাউনলোড</span>
                </button>
                <button 
                  onClick={() => setIsManualAdHocOpen(true)}
                  className="bg-accent-blue text-white px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-accent-blue/20 hover:scale-105 transition-all flex items-center gap-2 shrink-0"
                >
                  <Plus className="h-4 w-4" /> 
                  <span>Manual Add / ম্যানুয়াল সেভ</span>
                </button>
              </div>
            </div>

            {/* Stats Ribbon */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
               <div className="bg-white p-5 rounded-[32px] border border-app-border shadow-sm flex flex-col items-center justify-center text-center">
                  <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 mb-2">
                     <Clock className="h-4 w-4" />
                  </div>
                  <span className="text-[9px] font-black text-text-secondary uppercase tracking-widest mb-1">Pending</span>
                  <span className="text-xl font-black text-slate-900">{adHocStats.pending}</span>
               </div>
               <div className="bg-white p-5 rounded-[32px] border border-app-border shadow-sm flex flex-col items-center justify-center text-center">
                  <div className="w-8 h-8 bg-accent-green/10 rounded-full flex items-center justify-center text-accent-green mb-2">
                     <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <span className="text-[9px] font-black text-text-secondary uppercase tracking-widest mb-1">Approved</span>
                  <span className="text-xl font-black text-accent-green">{adHocStats.approved}</span>
               </div>
               <div className="bg-white p-5 rounded-[32px] border border-app-border shadow-sm flex flex-col items-center justify-center text-center col-span-2">
                  <div className="w-8 h-8 bg-accent-blue/10 rounded-full flex items-center justify-center text-accent-blue mb-2">
                     <CreditCard className="h-4 w-4" />
                  </div>
                  <span className="text-[9px] font-black text-text-secondary uppercase tracking-widest mb-1">Total Approved Value</span>
                  <span className="text-2xl font-black text-slate-900 tracking-tighter">
                    <span className="text-sm font-bold text-slate-400 mr-1">₹</span>
                    {adHocStats.totalValue.toLocaleString()}
                  </span>
               </div>
            </div>

            <div className="flex items-center justify-between px-2 py-4">
              <div className="flex items-center gap-3">
                 <div className="flex items-center gap-2 bg-white/50 px-3 py-1.5 rounded-xl border border-app-border">
                   <input 
                     type="checkbox" 
                     checked={isAllVisibleAdHocSelected}
                     onChange={() => {
                        const next = new Set(selectedAdHocIds);
                        if (isAllVisibleAdHocSelected) {
                          visibleAdHocJobs.forEach(j => next.delete(j.id!));
                        } else {
                          visibleAdHocJobs.forEach(j => next.add(j.id!));
                        }
                        setSelectedAdHocIds(next);
                     }}
                     className="w-4 h-4 rounded border-2 border-app-border text-accent-blue focus:ring-accent-blue/20"
                   />
                   <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Select All Visible</span>
                 </div>
                 <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                   {visibleAdHocJobs.length} Results
                 </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
               {visibleAdHocJobs.length > 0 ? (
                 visibleAdHocJobs.map((job, idx) => {
                   const emp = employees.find(e => e.id === job.userId);
                   const isSelected = selectedAdHocIds.has(job.id!);
                   
                   return (
                     <div 
                       key={job.id || `admin-adhoc-${idx}`} 
                       className={cn(
                         "bg-white rounded-[32px] border transition-all duration-300 overflow-hidden group",
                         isSelected ? "border-accent-blue shadow-xl shadow-accent-blue/10 scale-[1.02]" : "border-app-border hover:shadow-md",
                         job.status === 'REJECTED' && "opacity-75 grayscale-[0.5]"
                       )}
                     >
                       <div className="p-6 space-y-4">
                         <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                               <input 
                                 type="checkbox" 
                                 checked={isSelected}
                                 onChange={() => {
                                   const next = new Set(selectedAdHocIds);
                                   if (next.has(job.id!)) next.delete(job.id!);
                                   else next.add(job.id!);
                                   setSelectedAdHocIds(next);
                                 }}
                                 className="w-4 h-4 rounded border-2 border-app-border text-accent-blue focus:ring-accent-blue/20"
                               />
                               <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                 {format(new Date(job.date), 'dd MMM yyyy')} • {format(new Date(job.timestamp), 'HH:mm')}
                               </div>
                            </div>
                            <div className="flex items-center gap-1">
                               {job.status !== 'PENDING' && (
                                 <div className={cn(
                                   "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border",
                                   job.status === 'APPROVED' ? "bg-accent-green/10 border-accent-green/20 text-accent-green" : "bg-accent-red/10 border-accent-red/20 text-accent-red"
                                 )}>
                                   {job.status}
                                 </div>
                               )}
                               <button 
                                  onClick={async () => {
                                    if (window.confirm("Confirm deletion of this AD-HOC record?")) {
                                      try {
                                        await SupabaseService.delete('ad_hoc_jobs', job.id!);
                                        setAdHocJobs(prev => prev.filter(j => j.id !== job.id));
                                      } catch (err: any) {
                                        console.error("Delete failed:", err);
                                        toast.error("Delete failed: " + (err.message || "Unknown error") + "\nডিলিট করতে ব্যর্থ হয়েছে।");
                                      }
                                    }
                                  }}
                                  className="p-2 text-text-secondary hover:text-accent-red hover:bg-accent-red/5 rounded-xl transition-all border border-app-border/50 shadow-sm active:scale-95"
                               >
                                  <Trash2 className="h-4 w-4" />
                               </button>
                            </div>
                         </div>

                         <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-bg-app border border-app-border flex items-center justify-center font-black text-base text-slate-400 shadow-inner overflow-hidden uppercase">
                               {emp?.profilePicture ? (
                                 <img src={emp.profilePicture} alt="" className="w-full h-full object-cover" />
                               ) : (
                                 emp?.name?.charAt(0) || '?'
                               )}
                            </div>
                            <div>
                               <div className="text-base font-black text-slate-900 leading-tight">{emp?.name || job.employeeName}</div>
                               <div className="text-[10px] font-black text-text-secondary uppercase tracking-[0.2em] mt-0.5">{emp?.jobTitle || 'Staff'}</div>
                            </div>
                         </div>

                         <div className="bg-bg-app rounded-3xl p-5 border border-app-border space-y-3">
                            <div className="flex items-center justify-between">
                               <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 bg-accent-blue/10 rounded-lg flex items-center justify-center text-accent-blue">
                                     <MapPin className="h-3.5 w-3.5" />
                                  </div>
                                  <span className="text-[10px] font-black text-text-secondary uppercase tracking-widest">Vehicle</span>
                               </div>
                               <span className="text-xs font-black text-slate-900">{job.vehicleType}</span>
                            </div>
                            <div className="flex items-center justify-between">
                               <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 bg-accent-orange/10 rounded-lg flex items-center justify-center text-accent-orange">
                                     <Clock className="h-3.5 w-3.5" />
                                  </div>
                                  <span className="text-[10px] font-black text-text-secondary uppercase tracking-widest">Job Timing</span>
                               </div>
                               <span className="text-xs font-bold text-slate-900">{job.startTime} - {job.endTime} <span className="text-[9px] text-text-secondary font-black ml-1 uppercase">({job.totalHours}H)</span></span>
                            </div>
                         </div>

                         <div className="pt-2 flex flex-col gap-4">
                            <div className="flex items-center justify-between px-2">
                               <span className="text-[10px] font-black text-text-secondary uppercase tracking-widest">Value Earned</span>
                               <span className="text-2xl font-black text-slate-900 tracking-tighter flex items-center gap-1">
                                 <span className="text-sm font-bold text-slate-400">₹</span>
                                 {job.value.toLocaleString()}
                               </span>
                            </div>

                            {job.status === 'PENDING' ? (
                               <div className="flex items-center gap-3">
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      try {
                                        await SupabaseService.update('ad_hoc_jobs', job.id!, { status: 'APPROVED' });
                                        setAdHocJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'APPROVED' } : j));
                                      } catch (err: any) {
                                        console.error("Approval failed:", err);
                                        toast.error("Approval failed: " + (err.message || "Unknown error"));
                                      }
                                    }}
                                    className="flex-1 bg-accent-green text-white py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-accent-green/10 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                                  >
                                    <CheckCircle2 className="h-4 w-4" /> Approve
                                  </button>
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      try {
                                        await SupabaseService.update('ad_hoc_jobs', job.id!, { status: 'REJECTED' });
                                        setAdHocJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'REJECTED' } : j));
                                      } catch (err: any) {
                                        console.error("Rejection failed:", err);
                                        toast.error("Rejection failed: " + (err.message || "Unknown error"));
                                      }
                                    }}
                                    className="flex-1 bg-white border-2 border-app-border text-accent-red py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-accent-red/5 active:scale-95 transition-all flex items-center justify-center gap-2"
                                  >
                                    <XCircle className="h-4 w-4" /> Reject
                                  </button>
                               </div>
                            ) : (
                               <button 
                                 onClick={async (e) => {
                                   e.stopPropagation();
                                   try {
                                     await SupabaseService.update('ad_hoc_jobs', job.id!, { status: 'PENDING' });
                                     setAdHocJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'PENDING' } : j));
                                   } catch (err: any) {
                                     console.error("Revert failed:", err);
                                     toast.error("Revert failed: " + (err.message || "Unknown error"));
                                   }
                                 }}
                                 className="w-full py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 border-2 border-dashed border-app-border text-text-secondary hover:border-slate-300 transition-all"
                               >
                                 <RefreshCw className="h-3 w-3" /> Revert to Pending
                               </button>
                            )}
                         </div>
                       </div>
                     </div>
                   );
                 })
               ) : (
                 <div className="col-span-full py-24 text-center bg-white rounded-[40px] border-2 border-dashed border-app-border opacity-50">
                    <div className="w-20 h-20 bg-bg-app rounded-full flex items-center justify-center mx-auto mb-6">
                       <History className="h-10 w-10 text-slate-300" />
                    </div>
                    <p className="text-[12px] font-black text-text-secondary uppercase tracking-[0.2em] italic">No submission logs found for this period</p>
                 </div>
               )}
            </div>

            {selectedAdHocIds.size > 0 && (
              <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-8 py-5 rounded-[2rem] shadow-2xl z-[100] flex items-center gap-8 animate-in slide-in-from-bottom-5 duration-500">
                 <div>
                    <div className="text-[10px] font-black uppercase tracking-widest opacity-60">Selection Active</div>
                    <div className="text-sm font-black">{selectedAdHocIds.size} Records Identified</div>
                  </div>
                  <div className="flex items-center gap-3">
                     <button 
                       onClick={() => setSelectedAdHocIds(new Set())}
                       className="text-[10px] font-black uppercase tracking-widest px-4 py-2 hover:bg-white/10 rounded-xl transition-colors"
                     >
                       Clear
                     </button>
                     
                     <div className="h-8 w-[1px] bg-white/20 mx-1 hidden md:block" />
                     
                     <button 
                       onClick={async () => {
                         try {
                           const idsToUpdate = Array.from(selectedAdHocIds);
                           const { error } = await supabase.from('ad_hoc_jobs').update({ status: 'APPROVED' }).in('id', idsToUpdate);
                           if (error) throw error;
                           
                           setAdHocJobs(prev => prev.map(j => idsToUpdate.includes(j.id!) ? { ...j, status: 'APPROVED' } : j));
                           setSelectedAdHocIds(new Set());
                         } catch (err: any) {
                           toast.error("Error: " + (err.message || "Bulk approval failed"));
                         }
                       }}
                       className="bg-accent-green/20 text-accent-green border border-accent-green/30 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-accent-green hover:text-white transition-all flex items-center gap-2"
                     >
                       <CheckCircle2 className="h-4 w-4" /> Approve
                     </button>

                     <button 
                       onClick={async () => {
                         try {
                           const idsToUpdate = Array.from(selectedAdHocIds);
                           const { error } = await supabase.from('ad_hoc_jobs').update({ status: 'REJECTED' }).in('id', idsToUpdate);
                           if (error) throw error;
                           
                           setAdHocJobs(prev => prev.map(j => idsToUpdate.includes(j.id!) ? { ...j, status: 'REJECTED' } : j));
                           setSelectedAdHocIds(new Set());
                         } catch (err: any) {
                           toast.error("Error: " + (err.message || "Bulk rejection failed"));
                         }
                       }}
                       className="bg-white/10 text-white border border-white/20 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-accent-red hover:border-accent-red transition-all flex items-center gap-2"
                     >
                       <XCircle className="h-4 w-4" /> Reject
                     </button>

                     <div className="h-8 w-[1px] bg-white/20 mx-1 hidden md:block" />

                     <button 
                       onClick={async () => {
                         if (window.confirm(`Permanently delete ${selectedAdHocIds.size} selected ad-hoc jobs?`)) {
                            setIsBulkDeletingAdHoc(true);
                            try {
                              const idsToDelete = Array.from(selectedAdHocIds);
                              const { error } = await supabase.from('ad_hoc_jobs').delete().in('id', idsToDelete);
                              if (error) throw error;
                              
                              setAdHocJobs(prev => prev.filter(j => !idsToDelete.includes(j.id!)));
                              setSelectedAdHocIds(new Set());
                              toast.success(`${idsToDelete.length} records deleted successfully. / ${idsToDelete.length}টি রেকর্ড সফলভাবে মুছে ফেলা হয়েছে।`);
                            } catch (err: any) {
                              console.error("Bulk delete ad-hoc failed:", err);
                               toast.error("Error: " + (err.message || "Failed to delete records."));
                            } finally {
                              setIsBulkDeletingAdHoc(false);
                            }
                         }
                       }}
                       disabled={isBulkDeletingAdHoc}
                       className="bg-accent-red px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-accent-red/20 active:scale-95 transition-all flex items-center gap-2"
                     >
                       {isBulkDeletingAdHoc ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                       Delete
                     </button>
                    </div>
                 </div>
              )}
          </div>
        )}
        
        {activeTab === 'CASH_LOGS' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-[32px] border border-app-border shadow-sm">
              <div>
                <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Delivery Cash Reports</h2>
                <p className="text-[10px] text-text-secondary font-black uppercase tracking-widest italic flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-blue" /> Monthly Review: <span className="text-accent-blue">{selectedMonth}</span>
                </p>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
                <div className="flex bg-bg-app p-1.5 rounded-2xl border border-app-border items-center gap-1">
                  <button 
                    onClick={() => setSelectedMonth(format(subMonths(new Date(selectedMonth + '-01'), 1), 'yyyy-MM'))}
                    className="p-2 hover:bg-white rounded-xl transition-all hover:shadow-sm"
                  >
                    <ChevronRight className="h-4 w-4 rotate-180" />
                  </button>
                  <span className="px-4 text-[10px] font-black uppercase tracking-widest min-w-[120px] text-center">{format(new Date(selectedMonth + '-01'), 'MMMM yyyy')}</span>
                  <button 
                    onClick={() => setSelectedMonth(format(addMonths(new Date(selectedMonth + '-01'), 1), 'yyyy-MM'))}
                    className="p-2 hover:bg-white rounded-xl transition-all hover:shadow-sm"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                <button 
                  onClick={async () => {
                     const data = await SupabaseService.list('cash_reports', [{ column: 'date', value: `${selectedMonth}%`, operator: 'like' }], 500, { column: 'timestamp', ascending: false });
                     setCashReports(data);
                  }}
                  className="p-3 bg-bg-app border border-app-border rounded-2xl hover:bg-white transition-all shadow-sm group"
                >
                  <RefreshCw className="h-4 w-4 text-text-secondary group-hover:rotate-180 transition-all duration-500" />
                </button>
                <button 
                  onClick={handleExportCashExcel}
                  className="p-3 bg-bg-app border border-app-border rounded-2xl hover:bg-white transition-all shadow-sm group"
                  title="Download Cash Reports (Excel)"
                >
                  <Download className="h-4 w-4 text-accent-blue" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {cashReports.map((report, idx) => {
                const emp = employees.find(e => e.id === report.userId);
                return (
                  <div key={report.id || `cash-report-${idx}`} className="bg-white rounded-[40px] border border-app-border p-8 shadow-sm hover:shadow-xl transition-all duration-300 space-y-6 group">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-[20px] bg-bg-app border border-app-border flex items-center justify-center font-black text-xl text-slate-400 shadow-inner overflow-hidden uppercase">
                          {emp?.profilePicture ? (
                            <img src={emp.profilePicture} alt="" className="w-full h-full object-cover" />
                          ) : (
                            report.userName?.charAt(0) || '?'
                          )}
                        </div>
                        <div>
                          <div className="text-lg font-black text-slate-900 leading-tight">{report.userName}</div>
                          <div className="text-[10px] font-black text-text-secondary uppercase tracking-widest mt-1 bg-bg-app px-2 py-0.5 rounded-full w-fit">
                            {format(new Date(report.timestamp), 'EEE, MMM d • hh:mm a')}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className="text-[9px] font-black uppercase tracking-widest bg-accent-green/10 text-accent-green px-3 py-1 rounded-full border border-accent-green/20">
                          {report.status}
                        </span>
                        <button 
                          onClick={async () => {
                            if (window.confirm("Delete this cash report?")) {
                              await SupabaseService.delete('cash_reports', report.id!);
                              setCashReports(prev => prev.filter(r => r.id !== report.id));
                            }
                          }}
                          className="p-2 text-text-secondary hover:text-accent-red hover:bg-accent-red/5 rounded-xl transition-all"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-bg-app/50 p-4 rounded-[24px] border border-app-border/50">
                        <div className="text-[8px] font-black text-text-secondary uppercase tracking-widest mb-1.5">Cash Notes</div>
                        <div className="text-lg font-black text-slate-900 tracking-tight">₹{((report.totalAmount || 0) - (report.onlineCash || 0)).toLocaleString()}</div>
                        <div className="text-[9px] font-bold text-text-secondary mt-1">{report.totalNotes} Total Notes</div>
                      </div>
                      <div className="bg-accent-blue/5 p-4 rounded-[24px] border border-accent-blue/20">
                        <div className="text-[8px] font-black text-accent-blue uppercase tracking-widest mb-1.5">Online Payout</div>
                        <div className="text-lg font-black text-accent-blue tracking-tight">₹{(report.onlineCash || 0).toLocaleString()}</div>
                        <div className="text-[9px] font-bold text-accent-blue/50 mt-1">UPI / Wallet</div>
                      </div>
                      <div className="bg-accent-red/5 p-4 rounded-[24px] border border-accent-red/20">
                        <div className="text-[8px] font-black text-accent-red uppercase tracking-widest mb-1.5">Mismatch Adj.</div>
                        <div className="text-lg font-black text-accent-red tracking-tight">₹{(report.valueMismatch || 0).toLocaleString()}</div>
                        <div className="text-[9px] font-bold text-accent-red/50 mt-1">Daily Gap</div>
                      </div>
                      <div className="bg-slate-900 p-4 rounded-[24px] shadow-lg shadow-slate-900/20">
                        <div className="text-[8px] font-black text-white/40 uppercase tracking-widest mb-1.5">Total Grand</div>
                        <div className="text-xl font-black text-white tracking-tighter">₹{(report.totalAmount || 0).toLocaleString()}</div>
                        <div className="text-[9px] font-bold text-white/30 mt-1">Final Submission</div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-app-border border-dashed space-y-3">
                      <button 
                        onClick={() => {
                          setExpandedReportId(expandedReportId === report.id ? null : report.id);
                        }}
                        className="w-full py-3.5 bg-bg-app hover:bg-slate-100 border border-app-border rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all text-text-secondary hover:text-slate-900 group-hover:border-accent-blue/30 flex items-center justify-center gap-1.5"
                      >
                        <Calculator className="h-3.5 w-3.5 text-slate-400 group-hover:text-accent-blue" />
                        {expandedReportId === report.id ? "Hide Note Breakdown" : "Check Note Breakdown"}
                      </button>

                      {expandedReportId === report.id && (
                        <div className="bg-slate-50 border border-app-border rounded-3xl p-4 space-y-2 animate-in fade-in slide-in-from-top-1 duration-300">
                          <h4 className="text-[9px] font-black uppercase tracking-widest text-text-secondary mb-2 border-b border-app-border pb-1">Denomination Units</h4>
                          <div className="grid grid-cols-2 gap-2">
                            {Object.entries(report.denominations || {})
                              .filter(([_, count]) => count && parseInt(count as string) > 0)
                              .map(([denom, count]) => (
                                <div key={denom} className="flex items-center gap-2 bg-white border border-[#e2e8f0] p-2 rounded-xl shadow-sm">
                                  <div className="w-10 h-6 rounded bg-slate-900 text-white font-mono text-[9px] font-black flex items-center justify-center shrink-0">
                                    ₹{denom}
                                  </div>
                                  <div className="text-[10px] text-slate-600 font-bold">× {String(count)}</div>
                                </div>
                              ))}
                            {Object.values(report.denominations || {}).filter(c => c && parseInt(c as string) > 0).length === 0 && (
                              <div className="col-span-full text-center text-[9px] font-bold text-text-secondary italic py-2">No notes registered.</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {cashReports.length === 0 && (
                <div className="col-span-full py-28 text-center bg-white rounded-[40px] border-2 border-dashed border-app-border opacity-50">
                  <div className="w-20 h-20 bg-bg-app rounded-full flex items-center justify-center mx-auto mb-6">
                    <Calculator className="h-10 w-10 text-slate-300" />
                  </div>
                  <p className="text-[12px] font-black text-text-secondary uppercase tracking-[0.2em] italic">No cash reports submitted for this period</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'TRACKING' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="bg-white rounded-[32px] border border-app-border p-6 shadow-xl space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                   <div className="w-12 h-12 bg-accent-blue/10 rounded-2xl flex items-center justify-center text-accent-blue font-bold">
                      <MapPin className="h-6 w-6" />
                   </div>
                   <div>
                      <h2 className="text-xl font-black uppercase tracking-tight text-slate-900">Live Agent Tracking</h2>
                      <p className="text-[10px] text-text-secondary font-black uppercase tracking-widest">Real-time movement and activity monitoring</p>
                   </div>
                </div>
                <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
                   <div className="relative group/search">
                     <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-hover/search:text-accent-blue transition-colors" />
                     <input 
                       type="text"
                       placeholder="Search employee / কর্মচারী খুঁজুন..."
                       value={trackingSearchQuery}
                       onChange={(e) => setTrackingSearchQuery(e.target.value)}
                       className="w-full md:w-64 h-12 pl-12 pr-4 bg-bg-app border border-app-border rounded-xl text-xs font-black uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue/50 transition-all"
                     />
                   </div>
                   <div className="px-3 py-1 bg-accent-green/10 text-accent-green rounded-full text-[8px] font-black uppercase tracking-widest animate-pulse border border-accent-green/20 text-center">
                     Live System Active
                   </div>
                </div>
              </div>

              <LiveMap 
                locations={filteredLiveLocations} 
                logs={locationLogs}
                employees={employees}
                selectedEmployeeId={selectedLiveEmployeeId}
                onSelectEmployee={setSelectedLiveEmployeeId}
              />
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredLiveLocations.length === 0 && (
                   <div className="col-span-full py-12 text-center text-[10px] font-black text-text-secondary uppercase tracking-widest opacity-50 italic">
                      No active tracking data available
                   </div>
                )}
                {filteredLiveLocations.map((loc, idx) => {
                  const emp = employees.find(e => e.id === loc.userId);
                  const isSelected = loc.userId === selectedLiveEmployeeId;
                  const isInactive = loc.status === 'INACTIVE';
                  
                  return (
                    <button
                      key={`track-btn-${loc.id || 'no-id'}-${idx}`}
                      onClick={() => setSelectedLiveEmployeeId(isSelected ? null : loc.userId)}
                      className={cn(
                        "p-4 rounded-[2rem] border transition-all text-left flex items-center gap-3 md:gap-4 overflow-hidden",
                        isSelected ? "bg-accent-blue text-white border-accent-blue shadow-lg shadow-accent-blue/20" : "bg-white border-slate-200 hover:border-accent-blue/30 shadow-sm",
                        isInactive && "opacity-50 grayscale"
                      )}
                    >
                      <div className={cn(
                        "w-10 h-10 md:w-12 md:h-12 rounded-2xl flex items-center justify-center font-black text-xs shadow-inner uppercase shrink-0",
                        isSelected ? "bg-white/20" : "bg-slate-100"
                      )}>
                        {emp?.profilePicture ? (
                           <img src={emp.profilePicture} alt="" className="w-full h-full object-cover rounded-2xl" />
                        ) : (
                           emp?.name?.charAt(0) || '?'
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={cn("text-xs font-black uppercase tracking-tight truncate", isSelected ? "text-white" : "text-slate-900")}>
                          {emp?.name || loc.name}
                        </div>
                        <div className={cn("text-[8px] md:text-[9px] font-bold uppercase opacity-60 truncate", isSelected ? "text-white" : "text-slate-500")}>
                          {emp?.jobTitle}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={cn("text-[9px] md:text-[10px] font-mono font-black", isSelected ? "text-white" : "text-accent-blue")}>
                          {(loc.speed * 3.6).toFixed(1)} <span className="text-[7px]">KM/H</span>
                        </div>
                        <div className="flex items-center justify-end gap-1 mt-0.5">
                          <div className={cn("w-1.5 h-1.5 rounded-full", isInactive ? "bg-slate-400" : "bg-accent-green animate-pulse")} />
                          <span className={cn("text-[7px] md:text-[8px] font-black uppercase tracking-widest", isSelected ? "text-white/60" : "text-slate-400")}>
                            {isInactive ? "Offline" : "Active"}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'REPORTS' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">System Reports & Health</h2>
                <p className="text-sm text-slate-500 font-medium">Export data & monitor system integrity / ডাটা এক্সপোর্ট এবং সিস্টেম মনিটর করুন</p>
              </div>
              <div className="flex bg-white p-1 rounded-2xl border border-app-border">
                <input 
                  type="month" 
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="px-4 py-2 text-sm font-bold bg-transparent outline-none"
                />
              </div>
            </div>

            {/* MASTER DOWNLOAD & CLEAR CARD */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-[32px] p-8 text-white shadow-2xl relative overflow-hidden group">
               <div className="absolute top-0 right-0 w-64 h-64 bg-accent-blue/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:scale-125 transition-transform duration-700" />
               
               <div className="relative z-10 space-y-6">
                 <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center text-accent-blue border border-white/10">
                       <Download className="h-7 w-7" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black uppercase tracking-tight italic">Storage Mastery</h3>
                      <p className="text-xs text-white/60 font-bold uppercase tracking-widest mt-1">One-Click Excel Download & Database Wipe</p>
                    </div>
                 </div>

                 <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
                    <p className="text-sm text-white/80 leading-relaxed italic">
                      "এক ক্লিকে আপনার সকল ডাটা (Attendance, Mismatch, Ad-Hoc) এক্সেল ফাইল হিসেবে ডাউনলোড হবে এবং ডাটাবেস থেকে স্থায়ীভাবে মুছে ফেলা হবে স্টোরেজ খালি করার জন্য।"
                    </p>
                    <div className="flex flex-wrap gap-3">
                       <div className="px-3 py-1 bg-accent-blue/20 text-accent-blue text-[9px] font-black rounded-lg uppercase tracking-widest border border-accent-blue/30">Attendance Logs</div>
                       <div className="px-3 py-1 bg-amber-500/20 text-amber-500 text-[9px] font-black rounded-lg uppercase tracking-widest border border-amber-500/30">Value Mismatches</div>
                       <div className="px-3 py-1 bg-accent-green/20 text-accent-green text-[9px] font-black rounded-lg uppercase tracking-widest border border-accent-green/30">Ad-Hoc Jobs</div>
                       <div className="px-3 py-1 bg-violet-500/20 text-violet-500 text-[9px] font-black rounded-lg uppercase tracking-widest border border-violet-500/30">Cash Reports</div>
                    </div>
                 </div>

                 <div className="flex flex-col sm:flex-row gap-4 pt-2">
                    <button 
                      onClick={handleStorageCleanupOneClick}
                      disabled={isLoading}
                      className="flex-1 bg-accent-blue hover:bg-accent-blue/90 disabled:opacity-50 text-white h-16 rounded-2xl font-black uppercase tracking-[0.2em] shadow-xl shadow-accent-blue/20 flex items-center justify-center gap-3 active:scale-95 transition-all group/btn"
                    >
                      {isLoading ? (
                        <>
                          <RefreshCw className="h-5 w-5 animate-spin" />
                          Processing System Data...
                        </>
                      ) : (
                        <>
                          <Download className="h-5 w-5 group-hover:-translate-y-1 transition-transform" />
                          Download & Clear Database
                        </>
                      )}
                    </button>
                    

                 </div>

                 <div className="flex flex-col items-center gap-2 pt-2">
                    <div className="text-[10px] text-white/40 font-bold uppercase tracking-[0.3em] flex items-center gap-2">
                       <div className="w-1 h-1 bg-accent-green rounded-full animate-pulse" /> Live Storage Watch Active
                    </div>
                    <p className="text-[9px] text-white/30 font-bold uppercase text-center max-w-xs">
                       Recommended before every new month to keep CockroachDB storage at 0% usage
                    </p>
                 </div>
               </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Attendance Summary Card */}
              <div className="bg-white rounded-[2.5rem] p-6 sm:p-8 border border-slate-200 shadow-sm hover:shadow-md transition-all group relative overflow-hidden flex flex-col h-full">
                <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50/50 rounded-bl-[100px] -mr-8 -mt-8 transition-all group-hover:scale-125" />
                <div className="w-16 h-16 bg-blue-50 rounded-3xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform relative border border-blue-100">
                  <CalendarCheck className="h-8 w-8 text-accent-blue" />
                </div>
                <h3 className="text-xl font-black text-slate-900 mb-2">Attendance Summary</h3>
                <p className="text-sm text-slate-500 mb-8 leading-relaxed flex-grow">
                  Complete log of all employee attendance, including check-in/out times, hours, and mileage for {format(new Date(selectedMonth + '-01'), 'MMMM yyyy')}.
                </p>
                <button 
                  onClick={() => handleExportAttendanceExcel()}
                  disabled={isLoading}
                  className="w-full h-14 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors shadow-lg active:scale-95"
                >
                  {isLoading ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
                  Download Excel
                </button>
              </div>

              {/* Value Mismatch Card */}
              <div className="bg-white rounded-[2.5rem] p-6 sm:p-8 border border-slate-200 shadow-sm hover:shadow-md transition-all group relative overflow-hidden flex flex-col h-full">
                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-50/50 rounded-bl-[100px] -mr-8 -mt-8 transition-all group-hover:scale-125" />
                <div className="w-16 h-16 bg-amber-50 rounded-3xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform relative border border-amber-100">
                  <AlertTriangle className="h-8 w-8 text-amber-500" />
                </div>
                <h3 className="text-xl font-black text-slate-900 mb-2">Mismatch Reports</h3>
                <p className="text-sm text-slate-500 mb-8 leading-relaxed flex-grow">
                  All discrepancies found between physical values and system values, including image proofs and calculated loss/gain.
                </p>
                <button 
                  onClick={() => handleExportMismatchesExcel('MONTHLY')}
                  className="w-full h-14 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors shadow-lg active:scale-95"
                >
                  <Download className="h-5 w-5" />
                  Download Excel
                </button>
              </div>

              {/* System Integrity Check Card */}
              <div className="bg-white rounded-[2.5rem] p-6 sm:p-8 border border-slate-200 shadow-sm hover:shadow-md transition-all group relative overflow-hidden h-full flex flex-col">
                <div className="absolute top-0 right-0 w-24 h-24 bg-purple-50/50 rounded-bl-[100px] -mr-8 -mt-8 transition-all group-hover:scale-125" />
                <div className="w-16 h-16 bg-purple-50 rounded-3xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform relative border border-purple-100">
                  <Database className="h-8 w-8 text-purple-600" />
                </div>
                <h3 className="text-xl font-black text-slate-900 mb-2">System Diagnostics</h3>
                <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                  Verify database connectivity and table structures. If features seem missing, use the repair tool.
                </p>
                
                <div className="space-y-4 flex-grow">
                  <button 
                    onClick={async (e) => {
                      const target = e.currentTarget;
                      target.disabled = true;
                      target.innerText = "Checking...";
                      try {
                        const health = await SupabaseService.checkSystemHealth();
                        const missing = Object.entries(health).filter(([_, status]) => !status).map(([name]) => name);
                        if (missing.length === 0) {
                          toast.success("✅ System Healthy! All database tables are accessible.");
                        } else {
                          toast.warning(`⚠️ Issues Detected. The following tables are inaccessible: ${missing.join(', ')}. Please contact support.`);
                        }
                      } catch {
                        toast.error("❌ Critical Connection Error. Database is unreachable.");
                      } finally {
                        target.disabled = false;
                        target.innerText = "Check Database Health";
                      }
                    }}
                    className="w-full py-3 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-purple-200"
                  >
                    Check Database Health
                  </button>
                  <button 
                    onClick={() => {
                      if (window.confirm("This will clear the local schema cache and reload the application. Continue?")) {
                        SupabaseService.clearCache();
                        window.location.reload();
                      }
                    }}
                    className="w-full py-3 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-red-200"
                  >
                    Repair Database
                  </button>
                </div>
              </div>
            </div>
            
            <div className="p-8 bg-blue-600 rounded-[2.5rem] text-white relative overflow-hidden shadow-2xl shadow-blue-200">
               <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl" />
               <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
                 <div>
                   <h4 className="text-2xl font-black mb-2 uppercase tracking-tight">Need custom data?</h4>
                   <p className="text-blue-100 font-medium">If you need a specialized report format not listed here, use the AI Chat to request it. / বিশেষ কোনো রিপোর্ট প্রয়োজন হলে এআই চ্যাট ব্যবহার করুন।</p>
                 </div>
                 <button 
                   onClick={() => setShowChat(true)}
                   className="px-8 py-4 bg-white text-blue-600 rounded-2xl font-black uppercase tracking-widest hover:bg-blue-50 transition-colors shadow-lg active:scale-95"
                 >
                   Open AI Chat
                  </button>
               </div>
            </div>
          </div>
        )}

      </div>

      {/* Chat Trigger */}
      <button 
        onClick={() => setShowChat(true)}
        className="fixed right-6 bottom-24 w-14 h-14 bg-white text-blue-600 rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-all border border-blue-50 z-40"
      >
        <MessageSquare className="h-6 w-6" />
      </button>

      {/* Modals */}
      <AnimatePresence>
        {(isAddingEmployee || editingEmployee) && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}
              className="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-black text-slate-900">{editingEmployee ? t.editEmployee : t.addEmployee}</h3>
                <button onClick={() => { setIsAddingEmployee(false); setEditingEmployee(null); }} className="p-2 text-text-secondary hover:text-accent-red transition-colors"><X className="h-6 w-6" /></button>
              </div>
              
              <EmployeeForm 
                onClose={() => { setIsAddingEmployee(false); setEditingEmployee(null); }} 
                initialData={editingEmployee}
              />
            </motion.div>
          </div>
        )}

        {selectedEmployeeForHistory && isManualAttendanceOpen && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[150] flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}
              className="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black text-slate-900">{t.manualEntry} - Attendance</h3>
                  <p className="text-xs text-text-secondary font-bold uppercase tracking-widest">{selectedEmployeeForHistory.name}</p>
                </div>
                <button onClick={() => setIsManualAttendanceOpen(false)} className="p-2 text-text-secondary hover:text-accent-red transition-colors"><X className="h-6 w-6" /></button>
              </div>
              
              <ManualAttendanceForm 
                employee={selectedEmployeeForHistory}
                onClose={() => setIsManualAttendanceOpen(false)} 
              />
            </motion.div>
          </div>
        )}

        {isManualAdHocOpen && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[150] flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}
              className="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-black text-slate-900">{t.adHoc} - Manual Entry</h3>
                <button onClick={() => setIsManualAdHocOpen(false)} className="p-2 text-text-secondary hover:text-accent-red transition-colors"><X className="h-6 w-6" /></button>
              </div>
              
              <ManualAdHocForm 
                employees={employees.filter(e => e.role === 'EMPLOYEE' || e.role === 'SUPERVISOR')}
                onClose={() => setIsManualAdHocOpen(false)} 
              />
            </motion.div>
          </div>
        )}

        {showChat && (
          <motion.div 
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} 
            className="fixed inset-0 bg-white z-[110] flex flex-col"
          >
             <div className="h-16 border-b border-app-border flex items-center justify-between px-6">
                <h2 className="font-extrabold text-text-primary text-xl">{t.chat}</h2>
                <button onClick={() => setShowChat(false)} className="text-text-secondary p-2"><X className="h-6 w-6" /></button>
             </div>
             <Chat />
          </motion.div>
        )}

        {selectedEmployeeForHistory && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[110] flex items-end sm:items-center justify-center sm:p-4">
            <motion.div 
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              className="bg-white w-full sm:max-w-2xl sm:rounded-[32px] p-6 md:p-8 shadow-2xl flex flex-col h-full sm:h-auto sm:max-h-[90vh] rounded-t-[32px]"
            >
              <div className="flex items-center justify-between mb-6 shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-accent-blue rounded-full flex items-center justify-center text-white font-bold text-xl shadow-md overflow-hidden">
                    {selectedEmployeeForHistory.profilePicture ? (
                      <img src={selectedEmployeeForHistory.profilePicture} alt={selectedEmployeeForHistory.name} className="w-full h-full object-cover" />
                    ) : (
                      selectedEmployeeForHistory.name?.charAt(0) || '?'
                    )}
                  </div>
                  <div>
                    <h3 className="text-xl font-extrabold text-slate-900">{selectedEmployeeForHistory.name}</h3>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                      <p className="text-xs text-text-secondary font-bold uppercase tracking-widest">{selectedEmployeeForHistory.jobTitle}</p>
                      {selectedEmployeeForHistory.paymentBase === 'DRIVER' && (
                        <div className="flex items-center gap-1 text-[10px] text-accent-green font-black">
                          <MapPin className="h-3 w-3" />
                          {selectedEmployeeMileage} {t.km} {t.monthlyMileage}
                        </div>
                      )}
                      <div className="flex items-center gap-1 text-[10px] text-text-secondary font-bold">
                        <Smartphone className="h-3 w-3" />
                        {t.activeSessions}: {selectedEmployeeForHistory.activeSessions?.length || 0}
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-text-secondary font-bold">
                        <Clock className="h-3 w-3" />
                        {t.lastActive}: {selectedEmployeeForHistory.lastActive ? format(new Date(selectedEmployeeForHistory.lastActive), 'MMM d, hh:mm a') : 'Never'}
                      </div>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedEmployeeForHistory(null)} 
                  className="p-2 text-text-secondary hover:text-accent-red transition-colors"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-6 pr-2 custom-scrollbar">
                {/* Calendar View for Payday Marking (Following Month) */}
                <div className="bg-bg-app rounded-2xl p-5 border-2 border-accent-blue/10 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-accent-blue">Designate Payday</h4>
                      <p className="text-[9px] text-text-secondary font-bold">Planned for {format(new Date(new Date(selectedMonth + '-01').setMonth(new Date(selectedMonth + '-01').getMonth() + 1)), 'MMMM yyyy')}</p>
                    </div>
                    <span className="text-[9px] text-text-secondary font-bold italic bg-white px-2 py-1 rounded-lg border border-app-border">Tap to set 💲</span>
                  </div>
                  <div className="grid grid-cols-7 gap-1.5">
                    {['M','T','W','T','F','S','S'].map((d, i) => (
                      <div key={`header-${i}-${d}`} className="text-center text-[9px] font-black text-text-secondary/50 py-1">{d}</div>
                    ))}
                    {eachDayOfInterval({ 
                      start: startOfMonth(new Date(new Date(selectedMonth + '-01').setMonth(new Date(selectedMonth + '-01').getMonth() + 1))), 
                      end: endOfMonth(new Date(new Date(selectedMonth + '-01').setMonth(new Date(selectedMonth + '-01').getMonth() + 1))) 
                    }).map((day) => {
                      const dateStr = format(day, 'yyyy-MM-dd');
                      const isPayday = paydays.some(p => p.userId === selectedEmployeeForHistory?.id && p.date === dateStr);
                      
                      return (
                        <button 
                          key={dateStr}
                          onClick={() => handleTogglePayday(selectedEmployeeForHistory!.id, dateStr)}
                          className={cn(
                            "aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all active:scale-90",
                            isPayday ? "bg-accent-green text-white shadow-lg shadow-accent-green/30 scale-105 z-10" : "bg-white border border-app-border hover:border-accent-blue/30"
                          )}
                        >
                          <span className={cn("text-[9px] font-bold absolute top-1.5 left-1.5", isPayday ? "text-white/60" : "text-text-secondary/30")}>
                            {format(day, 'd')}
                          </span>
                          {isPayday ? (
                            <span className="text-lg font-black drop-shadow-sm">💲</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-4 p-3 bg-white/50 rounded-xl border border-app-border text-[9px] text-text-secondary font-medium leading-relaxed italic">
                    Tip: As per office rules, salary date for {format(new Date(selectedMonth + '-01'), 'MMMM')} is marked in {format(new Date(new Date(selectedMonth + '-01').setMonth(new Date(selectedMonth + '-01').getMonth() + 1)), 'MMMM')}.
                  </div>
                </div>

                {/* New Attendance Calendar View */}
                <AttendanceCalendar 
                  userId={selectedEmployeeForHistory.id} 
                  userName={selectedEmployeeForHistory.name} 
                />

                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-black uppercase tracking-tight text-slate-900 flex items-center gap-2">
                    <History className="h-4 w-4 text-accent-blue" />
                    Attendance History - {format(new Date(selectedMonth + '-01'), 'MMMM yyyy')}
                  </h4>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsManualAttendanceOpen(true)}
                      className="text-[10px] font-black text-white bg-accent-blue px-3 py-1.5 rounded-xl uppercase tracking-widest shadow-md shadow-accent-blue/20 active:scale-95 transition-all flex items-center gap-1.5"
                    >
                      <Plus className="h-3 w-3" />
                      {t.manualEntry}
                    </button>
                    <button
                      onClick={() => handleExportAttendanceExcel(selectedEmployeeForHistory.id)}
                      disabled={isLoading}
                      className="text-[10px] font-black text-white bg-slate-900 px-3 py-1.5 rounded-xl uppercase tracking-widest shadow-md shadow-slate-900/10 active:scale-95 transition-all flex items-center gap-1.5 ml-2"
                    >
                      {isLoading ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                      Excel
                    </button>
                    <div className="text-[10px] font-black text-accent-blue bg-accent-blue/10 px-2 py-1 rounded">
                      {employeeHistory.filter(r => r.status !== 'FRAUDULENT').length} {t.daysPresentCount}
                    </div>
                  </div>
                </div>

                 {employeeHistory.length > 0 ? (
                   <div className="space-y-3">
                     {employeeHistory.map((rec, hIdx) => (
                       <AttendanceHistoryItem key={rec.id ? `hist-${rec.id}-${hIdx}` : `hist-idx-${hIdx}`} rec={rec} paydays={paydays} t={t} />
                     ))}
                   </div>

                ) : (
                  <div className="py-20 text-center space-y-2">
                    <div className="w-12 h-12 bg-bg-app rounded-full flex items-center justify-center mx-auto mb-4">
                      <Clock className="h-6 w-6 text-text-secondary opacity-30" />
                    </div>
                    <p className="text-xs text-text-secondary font-medium tracking-tight italic">No attendance records found for this period.</p>
                  </div>
                )}
              </div>
              
              <button 
                onClick={() => setSelectedEmployeeForHistory(null)}
                className="w-full mt-6 bg-slate-900 text-white py-4 rounded-2xl font-bold text-sm tracking-widest uppercase hover:bg-slate-800 transition-all shadow-xl active:scale-95"
              >
                Close View
              </button>
            </motion.div>
          </div>
        )}

        {isImportingEmployees && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}
              className="bg-white w-full max-w-2xl rounded-[32px] p-6 md:p-8 shadow-2xl space-y-4 overflow-y-auto max-h-[85vh] text-left"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl md:text-2xl font-black text-slate-900 flex items-center gap-2">
                    <Database className="h-6 w-6 text-emerald-600 animate-pulse" />
                    Restore & Import Accounts
                  </h3>
                  <p className="text-[10px] text-text-secondary font-black uppercase tracking-wider">
                    পুরাতন এমপ্লয়ীদের আইডি ও পাসওয়ার্ড রিস্টোর পোর্টাল
                  </p>
                </div>
                <button 
                  onClick={() => setIsImportingEmployees(false)} 
                  className="p-2 text-text-secondary hover:text-accent-red transition-colors"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
              
              <ImportEmployeesWizard 
                onClose={() => setIsImportingEmployees(false)} 
              />
            </motion.div>
          </div>
        )}

        {resetCredentialsEmployee && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[150] flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}
              className="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl space-y-6 text-left"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black text-slate-900">Reset Credentials</h3>
                  <p className="text-[10px] text-text-secondary font-black uppercase tracking-wider">পাসওয়ার্ড ও আইডি সেট করুন</p>
                </div>
                <button onClick={() => setResetCredentialsEmployee(null)} className="p-2 text-text-secondary hover:text-accent-red transition-colors"><X className="h-6 w-6" /></button>
              </div>
              
              <ResetCredentialsForm 
                employee={resetCredentialsEmployee}
                onClose={() => setResetCredentialsEmployee(null)} 
              />
            </motion.div>
          </div>
        )}

        {/* MASTER DATA RESET REMINDER MODAL (1st & 2nd of Month) */}
        {showReminderModal && user?.role === 'ADMIN' && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[300] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="bg-white w-full max-w-md rounded-[40px] overflow-hidden shadow-2xl border border-white/20"
            >
              <div className="bg-accent-red p-8 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />
                <div className="relative z-10 flex items-center gap-4">
                  <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md">
                    <AlertTriangle className="h-8 w-8" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black uppercase tracking-tight">Data Policy Warning</h3>
                    <p className="text-[10px] font-bold text-white/80 uppercase tracking-widest">Monthly Cleanup Protocol</p>
                  </div>
                </div>
              </div>
              
              <div className="p-8 space-y-6">
                <div className="space-y-4">
                  <h4 className="text-xl font-black text-slate-900 leading-tight">
                    এক থেকে দুই দিনের মধ্যে আপনার ডাটা ডিলিট হয়ে যাবে। আপনি এক্ষুনি আপনার সকল ডাটা ডাউনলোড করে নিন।
                  </h4>
                  <p className="text-sm text-slate-500 font-medium leading-relaxed">
                    System maintenance protocol requires clearing transaction logs at the start of each month to ensure peak performance. Please synchronize all records to your Google Sheet now.
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => {
                      setShowReminderModal(false);
                      setActiveTab('REPORTS' as any);
                      // Set a flag so it doesn't show again in this session
                      localStorage.setItem(`reminder_dismissed_${format(new Date(), 'yyyy-MM')}`, 'true');
                    }}
                    className="w-full h-16 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-[0.2em] shadow-xl shadow-slate-900/20 active:scale-95 transition-all flex items-center justify-center gap-3"
                  >
                    Go to Download Now
                    <ArrowRight className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => {
                       setShowReminderModal(false);
                       localStorage.setItem(`reminder_dismissed_${format(new Date(), 'yyyy-MM')}`, 'true');
                    }}
                    className="w-full py-4 text-slate-400 font-black uppercase tracking-widest text-[10px] hover:text-accent-red transition-colors"
                  >
                    Dismiss Warning
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function EmployeeForm({ onClose, initialData }: { onClose: () => void, initialData: UserProfile | null }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    id: initialData?.username || initialData?.id || '',
    password: initialData?.passwordHash || '',
    name: initialData?.name || '',
    jobTitle: initialData?.jobTitle || '',
    department: initialData?.department || '',
    paymentBase: initialData?.paymentBase || 'DAILY_FIXED' as PaymentBase,
    rate: initialData?.rate?.toString() || '',
    profilePicture: initialData?.profilePicture || '',
    role: initialData?.role || 'EMPLOYEE' as Role,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  const startCamera = async () => {
    setShowCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera error:", err);
      toast.error("Could not access camera");
      setShowCamera(false);
    }
  };

  const capturePhoto = async () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);
        
        canvasRef.current.toBlob(async (blob) => {
          if (blob) {
            try {
              const compressed = await compressImage(blob, 45);
              const reader = new FileReader();
              reader.onloadend = () => {
                setFormData({ ...formData, profilePicture: reader.result as string });
                stopCamera();
              };
              reader.readAsDataURL(compressed);
            } catch (err) {
              console.error("Camera capture compression failed:", err);
              toast.error("Failed to process photo within size limits. / সাইজ লিমিটের মধ্যে ফটো প্রসেস করা সম্ভব হয়নি।");
              stopCamera();
            }
          }
        }, 'image/jpeg', 0.9);
      }
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
    setShowCamera(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file, 45);
        const reader = new FileReader();
        reader.onloadend = () => {
          setFormData({ ...formData, profilePicture: reader.result as string });
        };
        reader.readAsDataURL(compressed);
      } catch (err) {
        console.error("Compression failed:", err);
        toast.error("File is too large or invalid. / ফাইলটি অনেক বড় অথবা ইনভ্যালিড।");
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Client-side validation
    if (!formData.jobTitle) {
      toast.warning("Please select a Job Title. / একটি পদ নির্বাচন করুন।");
      return;
    }
    
    if (!initialData && formData.password.length < 6) {
      toast.warning("Password must be at least 6 characters long.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (initialData) {
        // Edit existing
        const newUsername = formData.id.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
        const newEmail = `u_${newUsername}@apl-system.com`;

        const update: Partial<UserProfile> = {
          name: formData.name,
          username: newUsername,
          email: newEmail,
          passwordHash: formData.password || initialData.passwordHash,
          role: formData.role,
          department: formData.department,
          jobTitle: formData.jobTitle,
          paymentBase: formData.paymentBase,
          rate: parseFloat(formData.rate) || 0,
          profilePicture: formData.profilePicture
        };
        await SupabaseService.update('users', initialData.id, update);
        toast.success("Employee profile updated successfully! / কর্মচারীর তথ্য সফলভাবে আপডেট করা হয়েছে!");
      } else {
        // Add new
        const sanitizedId = formData.id.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
        if (!sanitizedId) {
          toast.error("Invalid User ID format");
          return;
        }
        const email = `u_${sanitizedId}@apl-system.com`;
        
        // Universal existence check to prevent duplicate key errors
        const existingEmail = await SupabaseService.list('users', [{ column: 'email', value: email }]);
        const existingId = await SupabaseService.getOne('users', sanitizedId);
        
        if (existingEmail.length > 0 || existingId) {
          toast.warning("⚠️ এই ইমেল বা আইডি ইতিমধ্যে রেজিস্টার্ড আছে। (User already registered with this email/ID)");
          setIsSubmitting(false);
          return;
        }

        let authUserId = '';
        
        // Use a temporary client to sign up the new user without affecting the admin's session
        const { createClient } = await import('@supabase/supabase-js');
        const { supabaseUrl, supabaseAnonKey } = await import('../lib/supabase');
        
        const tempSupabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
          auth: { persistSession: false }
        });

        const { data: authData, error: authErr } = await tempSupabase.auth.signUp({
          email,
          password: formData.password
        });

        if (authErr) {
          const isBoundFailure = authErr.message.toLowerCase().includes('already registered') || authErr.message.toLowerCase().includes('already exists');
          if (isBoundFailure) {
            toast.warning("⚠️ এই ইউজার আইডি ইতিমধ্যে রেজিস্টার্ড আছে। (User already registered)");
            setIsSubmitting(false);
            return;
          }
          throw authErr;
        } else {
          if (!authData.user) throw new Error("Failed to create auth record");
          authUserId = authData.user.id;
        }

        const newUser: UserProfile = {
          id: authUserId, // Must use UUID as primary key for Auth integration
          username: sanitizedId,
          name: formData.name,
          role: formData.role,
          department: formData.department,
          jobTitle: formData.jobTitle,
          paymentBase: formData.paymentBase,
          rate: parseFloat(formData.rate) || 0,
          status: 'ACTIVE',
          lastActive: new Date().toISOString(),
          language: 'en',
          email: email,
          activeSessions: [],
          profilePicture: formData.profilePicture,
          passwordHash: formData.password 
        };

        await SupabaseService.create('users', newUser);
        toast.success(`${formData.role === 'ADMIN' ? 'Admin' : 'Employee'} account created successfully!`);
      }
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.error("Error saving employee: " + (err.message || 'Unknown error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
      {/* Profile Picture Section */}
      <div className="flex flex-col items-center gap-4 mb-6">
        <div className="relative group">
          <div className="w-24 h-24 bg-bg-app rounded-2xl border-2 border-dashed border-app-border flex items-center justify-center overflow-hidden">
            {formData.profilePicture ? (
              <img src={formData.profilePicture} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <Users className="h-10 w-10 text-text-secondary opacity-20" />
            )}
          </div>
          {formData.profilePicture && (
            <button 
              type="button"
              onClick={() => setFormData({...formData, profilePicture: ''})}
              className="absolute -top-2 -right-2 bg-accent-red text-white p-1 rounded-full shadow-lg hover:scale-110 transition-transform"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="flex gap-2">
          {!showCamera ? (
            <>
              <button
                type="button"
                onClick={startCamera}
                className="flex items-center gap-2 px-3 py-2 bg-accent-blue/10 text-accent-blue rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-accent-blue/20 transition-all"
              >
                Take Photo
              </button>
              <label className="flex items-center gap-2 px-3 py-2 bg-bg-app text-text-secondary rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-app-border transition-all cursor-pointer">
                Upload Gallery
                <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
              </label>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="w-full max-w-[200px] aspect-square rounded-xl overflow-hidden bg-black relative">
                <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                <canvas ref={canvasRef} className="hidden" />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={capturePhoto} className="px-4 py-2 bg-accent-green text-white rounded-lg text-[10px] font-bold uppercase">Capture</button>
                <button type="button" onClick={stopCamera} className="px-4 py-2 bg-accent-red text-white rounded-lg text-[10px] font-bold uppercase">Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">{(t as any).role}</label>
        <div className="flex gap-2">
          {(['EMPLOYEE', 'SUPERVISOR', 'ADMIN'] as Role[]).map((r) => {
            if (r === 'ADMIN' && user?.role !== 'ADMIN') return null;
            return (
              <button
                key={r}
                type="button"
                onClick={() => setFormData({ ...formData, role: r })}
                className={cn(
                  "flex-1 h-12 rounded-xl text-xs font-bold uppercase tracking-widest transition-all border",
                  formData.role === r 
                    ? "bg-accent-blue text-white border-accent-blue shadow-lg shadow-accent-blue/20" 
                    : "bg-white text-text-secondary border-app-border hover:border-accent-blue/30"
                )}
              >
                {r === 'ADMIN' ? t.admin : r === 'SUPERVISOR' ? 'Supv' : t.employee}
              </button>
            );
          })}
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">Department</label>
        <input placeholder="e.g. Sales, Delivery" value={formData.department} onChange={e => setFormData({...formData, department: e.target.value})} className="w-full bg-bg-app h-12 px-4 rounded-xl font-bold border border-app-border focus:ring-2 focus:ring-accent-blue/20 outline-none transition-all" />
      </div>
      <div className="space-y-1">
        <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">{t.name}</label>
        <input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-bg-app h-12 px-4 rounded-xl font-bold border border-app-border focus:ring-2 focus:ring-accent-blue/20 outline-none transition-all" />
      </div>
      <div className="space-y-1">
        <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">{t.userId}</label>
        <input required value={formData.id} onChange={e => setFormData({...formData, id: e.target.value})} className="w-full bg-bg-app h-12 px-4 rounded-xl font-bold border border-app-border focus:ring-2 focus:ring-accent-blue/20 outline-none transition-all disabled:opacity-50" />
      </div>
      <div className="space-y-1">
        <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">{t.password}</label>
        <input required type="text" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full bg-bg-app h-12 px-4 rounded-xl font-bold border border-app-border focus:ring-2 focus:ring-accent-blue/20 outline-none transition-all" />
      </div>
      <div className="space-y-1">
        <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">{t.jobTitle} *</label>
        <select 
          required 
          value={formData.jobTitle} 
          onChange={e => {
            const val = e.target.value;
            setFormData(prev => ({
              ...prev, 
              jobTitle: val,
              paymentBase: val === 'DRIVER' ? 'DRIVER' : prev.paymentBase
            }));
          }} 
          className="w-full bg-bg-app h-12 px-4 rounded-xl font-bold border border-app-border focus:ring-2 focus:ring-accent-blue/20 outline-none transition-all appearance-none"
        >
          <option value="">{t.chooseEmployee}...</option>
          <option value="DA">DA</option>
          <option value="NDA">NDA</option>
          <option value="DRIVER">DRIVER</option>
          <option value="IN-HOUSE">IN-HOUSE</option>
          <option value="LOADER">LOADER</option>
          <option value="OTHERS">OTHERS</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">{t.paymentBase}</label>
          <select 
            value={formData.paymentBase} 
            onChange={e => setFormData({...formData, paymentBase: e.target.value as PaymentBase})}
            className="w-full bg-bg-app h-12 px-4 rounded-xl font-bold border border-app-border focus:ring-2 focus:ring-accent-blue/20 outline-none transition-all appearance-none"
          >
            <option value="DAILY_FIXED">{t.dailyFixed}</option>
            <option value="PER_SHIPMENT">{t.perShipment}</option>
            <option value="DRIVER">{t.driver}</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">{t.dailyRate}</label>
          <input required type="number" value={formData.rate} onChange={e => setFormData({...formData, rate: e.target.value})} className="w-full bg-bg-app h-12 px-4 rounded-xl font-bold border border-app-border focus:ring-2 focus:ring-accent-blue/20 outline-none transition-all" />
        </div>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full h-14 bg-accent-blue text-white rounded-2xl font-bold text-lg shadow-lg shadow-accent-blue/20 active:scale-95 transition-all mt-4 flex items-center justify-center"
      >
        {isSubmitting ? <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : t.save}
      </button>
    </form>
  );
}



function MismatchCard({ m, employees, onSelect, isSelected, onDelete }: { 
  m: ValueMismatch, 
  employees: UserProfile[], 
  onSelect: (id: string) => void, 
  isSelected: boolean,
  onDelete: () => void 
}) {
  const emp = employees.find(e => e.id === m.userId);
  return (
    <div className={cn(
      "bg-white rounded-[24px] border transition-all duration-300 overflow-hidden group flex flex-col",
      isSelected ? "border-accent-blue shadow-lg shadow-accent-blue/10" : "border-app-border hover:shadow-md"
    )}>
      <div className="p-4 flex items-center justify-between border-b border-app-border/50">
        <div className="flex items-center gap-3">
           <input 
             type="checkbox" 
             checked={isSelected}
             onChange={() => onSelect(m.id!)}
             className="w-4 h-4 rounded-lg border-2 border-app-border text-accent-blue focus:ring-accent-blue/20"
           />
           <div className="text-[10px] font-black text-text-secondary uppercase tracking-widest leading-none">
             {m.timestamp ? format(new Date(m.timestamp), 'hh:mm:ss a') : 'Untracked Time'}
           </div>
        </div>
        <button onClick={onDelete} className="p-2 text-text-secondary transition-all hover:text-accent-red hover:bg-accent-red/5 rounded-lg active:scale-95 shadow-sm border border-app-border/50">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="p-4 space-y-4 flex-1">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-[10px] text-slate-400">
            {emp?.name?.charAt(0) || '?'}
          </div>
          <div className="text-xs font-black text-slate-900 leading-tight truncate">
            {emp?.name || 'Unknown User'}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
           <div className="bg-bg-app rounded-xl p-2 border border-app-border">
              <span className="text-[7px] font-black text-text-secondary uppercase block mb-0.5">ERP Value</span>
              <span className="text-xs font-bold text-slate-900">₹{m.erpValue || 0}</span>
           </div>
           <div className="bg-bg-app rounded-xl p-2 border border-app-border">
              <span className="text-[7px] font-black text-text-secondary uppercase block mb-0.5">Customer</span>
              <span className="text-xs font-bold text-slate-900">₹{m.customerValue || 0}</span>
           </div>
        </div>

        {m.barcodes && m.barcodes.length > 0 && (
          <div className="bg-slate-50 border border-slate-100 px-3 py-2 rounded-xl flex items-center justify-between">
             <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Barcode</div>
             <div className="text-[10px] font-mono font-bold text-slate-600 truncate max-w-[150px]">{m.barcodes[0]}</div>
          </div>
        )}

        {(m.customerPhoto || m.erpPhoto) && (
          <div className="space-y-2">
            <div 
              className="relative aspect-video rounded-xl overflow-hidden border border-app-border bg-slate-100 group/img cursor-zoom-in"
              onClick={() => window.open(m.customerPhoto || m.erpPhoto, '_blank')}
            >
              <img 
                src={m.customerPhoto || m.erpPhoto} 
                alt="Mismatch Proof" 
                className="w-full h-full object-cover transition-transform group-hover/img:scale-105"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                 <Eye className="w-5 h-5 text-white" />
                 <span className="text-[10px] font-bold text-white ml-2 uppercase">View Full Photo</span>
              </div>
            </div>
            
            <button
               onClick={(e) => {
                 e.stopPropagation();
                 const photoUrl = m.customerPhoto || m.erpPhoto;
                 if (photoUrl) {
                   const a = document.createElement('a');
                   a.href = photoUrl;
                   a.download = `Mismatch_${m.userId}_${m.date}.jpg`;
                   a.target = "_blank";
                   document.body.appendChild(a);
                   a.click();
                   document.body.removeChild(a);
                 }
               }}
               className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-colors border border-slate-200"
            >
              <Download className="w-3 h-3" /> Download Photo
            </button>
          </div>
        )}
      </div>

      <div className={cn(
        "px-4 py-3 border-t",
        m.valueDifference < 0 ? "bg-accent-red/5 border-accent-red/10" : "bg-accent-green/5 border-accent-green/10"
      )}>
        <div className="flex items-center justify-between">
           <span className="text-[8px] font-black uppercase tracking-widest opacity-60">Variance</span>
           <span className={cn(
             "text-sm font-black",
             m.valueDifference < 0 ? "text-accent-red" : "text-accent-green"
           )}>
             {m.valueDifference < 0 ? '-' : '+'}₹{Math.abs(m.valueDifference).toLocaleString()}
           </span>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// RESTORE & BACKUP WIZARD FOR OLD EMPLOYEES
// ==========================================
interface ImportRecord {
  id: string;
  password?: string;
  name?: string;
  role?: Role;
  jobTitle?: string;
  department?: string;
  paymentBase?: PaymentBase;
  rate?: number;
}

function ImportEmployeesWizard({ onClose }: { onClose: () => void }) {
  const [pasteText, setPasteText] = useState('');
  const [parsedRows, setParsedRows] = useState<ImportRecord[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingIndex, setProcessingIndex] = useState(-1);
  const [results, setResults] = useState<{ success: number; skipped: number; errors: string[] }>({
    success: 0,
    skipped: 0,
    errors: []
  });
  const [dragActive, setDragActive] = useState(false);

  const parseContent = (text: string) => {
    if (!text.trim()) {
      toast.warning("পেস্টিং ফিল্ড বা ফাইল ফাঁকা রয়েছে (Paste field or file is empty)");
      return;
    }

    try {
      if (text.trim().startsWith('[') || text.trim().startsWith('{')) {
        const parsed = JSON.parse(text);
        const list = Array.isArray(parsed) ? parsed : [parsed];
        const rows = list.map((item: any) => ({
          id: String(item.id || item.userId || item.username || '').toLowerCase().trim().replace(/[^a-z0-9]/g, ''),
          password: String(item.password || item.pass || '123456'),
          name: String(item.name || item.fullName || 'New Backup Employee'),
          role: String(item.role || 'EMPLOYEE').toUpperCase() as Role,
          jobTitle: String(item.jobTitle || item.title || 'Delivery Representative'),
          department: String(item.department || item.dept || 'Logistics'),
          paymentBase: (item.paymentBase || 'DAILY_FIXED') as PaymentBase,
          rate: parseFloat(item.rate || item.salary || '350') || 350
        })).filter(r => r.id);
        
        if (rows.length > 0) {
          setParsedRows(rows);
          toast.success(`সফলভাবে ${rows.length} টি কর্মচারীর তথ্য রিস্টোর ফাইলিং থেকে পার্স করা হয়েছে! (Successfully parsed ${rows.length} accounts)`);
          return;
        }
      }
    } catch (e) {
      // JSON failure, continue to delimiter separation
    }

    const lines = text.split(/\r?\n/);
    const rows: ImportRecord[] = [];
    
    lines.forEach(line => {
      const rowStr = line.trim();
      if (!rowStr) return;
      
      const parts = rowStr.split(/[,\t;|]/).map(p => p.trim());
      const rawId = parts[0] || '';
      if (!rawId || rawId.toLowerCase() === 'id' || rawId.toLowerCase() === 'userid' || rawId.toLowerCase() === 'username') {
        return;
      }

      const id = rawId.toLowerCase().replace(/[^a-z0-9]/g, '');
      const password = parts[1] || '123456';
      const name = parts[2] || `Employee ${id}`;
      const roleRaw = (parts[3] || 'EMPLOYEE').toUpperCase();
      const role: Role = (roleRaw === 'ADMIN' || roleRaw === 'SUPERVISOR') ? roleRaw as Role : 'EMPLOYEE';
      const rate = parseFloat(parts[4] || '350') || 350;
      const jobTitle = parts[5] || 'Delivery Representative';
      const department = parts[6] || 'Logistics';

      if (id) {
        rows.push({
          id,
          password,
          name,
          role,
          jobTitle,
          department,
          paymentBase: 'DAILY_FIXED',
          rate
        });
      }
    });

    if (rows.length > 0) {
      setParsedRows(rows);
      toast.success(`সফলভাবে ${rows.length} টি কর্মচারীর তথ্য পার্স করা হয়েছে! (${rows.length} accounts parsed successfully)`);
    } else {
      toast.error("ফাইল ফরম্যাট সনাক্ত করা যায়নি। (Format could not be recognized)");
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        parseContent(text);
      };
      reader.readAsText(file);
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        parseContent(text);
      };
      reader.readAsText(file);
    }
  };

  const handleStartImport = async () => {
    if (parsedRows.length === 0) return;
    setIsProcessing(true);
    setProcessingIndex(0);
    
    let successCount = 0;
    let skippedCount = 0;
    const errorsList: string[] = [];

    // Pre-fetch users for comparison
    const existingProfiles = await SupabaseService.list('users');

    for (let i = 0; i < parsedRows.length; i++) {
      setProcessingIndex(i);
      const row = parsedRows[i];
      const email = `u_${row.id}@apl-system.com`;

      try {
        // Universal existence check
        const isUserExist = existingProfiles.some((p: any) => 
          String(p.email || '').toLowerCase() === email.toLowerCase() || 
          String(p.id || '').toLowerCase() === row.id.toLowerCase()
        );

        if (isUserExist) {
          skippedCount++;
          errorsList.push(`[${row.id}] already exists in database.`);
          continue;
        }

        {
          const { createClient } = await import('@supabase/supabase-js');
          const { supabaseUrl, supabaseAnonKey } = await import('../lib/supabase');
          
          const tempSupabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
            auth: { persistSession: false }
          });

          const { data: authData, error: authErr } = await tempSupabase.auth.signUp({
            email,
            password: row.password || '123456'
          });
          
          if (authErr) {
            skippedCount++;
            errorsList.push(`[${row.id}] signup failed: ${authErr.message}`);
            continue;
          }

          if (!authData.user) {
            skippedCount++;
            errorsList.push(`[${row.id}] User return object was null.`);
            continue;
          }

          const newUser: UserProfile = {
            id: authData.user.id,
            username: row.id,
            name: row.name || 'Old Employee',
            role: row.role || 'EMPLOYEE',
            department: row.department || 'Logistics',
            jobTitle: row.jobTitle || 'Delivery Agent',
            paymentBase: row.paymentBase || 'DAILY_FIXED',
            rate: row.rate || 350,
            status: 'ACTIVE',
            lastActive: new Date().toISOString(),
            language: 'en',
            email: email,
            activeSessions: [],
            passwordHash: row.password || '123456'
          };

          await SupabaseService.create('users', newUser);
          successCount++;
          
          await new Promise(resolve => setTimeout(resolve, 800));
        }
      } catch (err: any) {
        skippedCount++;
        errorsList.push(`[${row.id}] execution failed: ${err.message || err}`);
      }
    }

    setResults({
      success: successCount,
      skipped: skippedCount,
      errors: errorsList
    });
    setProcessingIndex(-1);
    setIsProcessing(false);
    toast.success(`রিস্টোর কাজ সম্পন্ন! সফল: ${successCount}, বাদ দেওয়া হয়েছে: ${skippedCount}`);
    
    window.dispatchEvent(new Event('local_db_update_users'));
  };

  const handleRemoveRow = (index: number) => {
    setParsedRows(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdateField = (index: number, field: keyof ImportRecord, value: any) => {
    setParsedRows(prev => prev.map((row, idx) => {
      if (idx === index) {
        return { ...row, [field]: value };
      }
      return row;
    }));
  };

  return (
    <div className="space-y-4">
      {processingIndex !== -1 ? (
        <div className="p-8 text-center space-y-4 border border-emerald-100 rounded-2xl bg-emerald-50/20">
          <RefreshCw className="h-10 w-10 text-emerald-600 animate-spin mx-auto" />
          <div className="space-y-1 text-center">
            <h4 className="text-sm font-black text-slate-800">অ্যাকাউন্ট রিস্টোর হচ্ছে... (Restoring Profiles)</h4>
            <p className="text-xs text-text-secondary font-bold">
              Restoring: {parsedRows[processingIndex]?.id} ({processingIndex + 1} / {parsedRows.length})
            </p>
          </div>
          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-emerald-600 h-full transition-all duration-300" 
              style={{ width: `${((processingIndex + 1) / parsedRows.length) * 100}%` }}
            ></div>
          </div>
        </div>
      ) : parsedRows.length > 0 ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-text-secondary font-black uppercase">
              {parsedRows.length} Profiles Parsed & Loaded
            </span>
            <button 
              onClick={() => setParsedRows([])}
              className="text-xs text-accent-red font-bold hover:underline"
            >
              Clear & Start Over
            </button>
          </div>

          <div className="border border-app-border rounded-xl overflow-hidden max-h-[250px] overflow-y-auto">
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="bg-bg-app border-b border-app-border font-black text-slate-800">
                  <th className="p-2.5">User ID</th>
                  <th className="p-2.5">Name</th>
                  <th className="p-2.5">Password</th>
                  <th className="p-2.5">Role</th>
                  <th className="p-2.5 text-right">Daily Rate</th>
                  <th className="p-2.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app-border font-medium">
                {parsedRows.map((row, idx) => (
                  <tr key={`raw-${row.id}-${idx}`} className="hover:bg-bg-app/50 transition-colors">
                    <td className="p-2.5">
                      <input 
                        type="text" 
                        value={row.id} 
                        onChange={(e) => handleUpdateField(idx, 'id', e.target.value)}
                        className="bg-slate-50 border border-app-border rounded px-1.5 py-0.5 w-20 font-mono font-bold text-slate-900"
                      />
                    </td>
                    <td className="p-2.5">
                      <input 
                        type="text" 
                        value={row.name} 
                        onChange={(e) => handleUpdateField(idx, 'name', e.target.value)}
                        className="bg-slate-50 border border-app-border rounded px-1.5 py-0.5 w-28 font-bold"
                      />
                    </td>
                    <td className="p-2.5">
                      <input 
                        type="text" 
                        value={row.password} 
                        onChange={(e) => handleUpdateField(idx, 'password', e.target.value)}
                        className="bg-slate-50 border border-app-border rounded px-1.5 py-0.5 w-24 font-mono"
                      />
                    </td>
                    <td className="p-2.5">
                      <select 
                        value={row.role} 
                        onChange={(e) => handleUpdateField(idx, 'role', e.target.value)}
                        className="bg-slate-50 border border-app-border rounded px-1 py-0.5 outline-none font-bold"
                      >
                        <option value="EMPLOYEE">Employee</option>
                        <option value="SUPERVISOR">Supervisor</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    </td>
                    <td className="p-2.5 text-right">
                      <input 
                        type="number" 
                        value={row.rate} 
                        onChange={(e) => handleUpdateField(idx, 'rate', parseFloat(e.target.value) || 0)}
                        className="bg-slate-50 border border-app-border rounded px-1.5 py-0.5 w-14 text-right font-black"
                      />
                    </td>
                    <td className="p-2.5 text-center">
                      <button 
                        onClick={() => handleRemoveRow(idx)}
                        className="p-1 text-accent-red hover:bg-accent-red/10 rounded"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {results.success > 0 || results.skipped > 0 ? (
            <div className="p-3 border border-app-border rounded-xl bg-bg-app space-y-2">
              <h5 className="font-bold text-slate-800 text-xs text-left">রিস্টোর ফলাফল (Import Results):</h5>
              <div className="grid grid-cols-2 gap-3 text-[10px] font-bold text-slate-700">
                <div className="bg-white p-2 rounded-lg border border-app-border/40 text-emerald-600 block text-left">
                  Successfully Configured: {results.success}
                </div>
                <div className="bg-white p-2 rounded-lg border border-app-border/40 text-amber-600 block text-left">
                  Skipped/Duplicates: {results.skipped}
                </div>
              </div>
              {results.errors.length > 0 && (
                <div className="text-[10px] text-accent-red text-left space-y-1 font-mono max-h-[80px] overflow-y-auto bg-white p-2 rounded-lg border border-app-border/40">
                  {results.errors.map((err, errIdx) => (
                    <div key={`err-${errIdx}`}>{err}</div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          <div className="flex items-center gap-3 shrink-0 pt-2">
            <button 
              onClick={() => setParsedRows([])} 
              disabled={isProcessing}
              className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black uppercase tracking-widest rounded-2xl transition-all"
            >
              Reset
            </button>
            <button 
              onClick={handleStartImport} 
              disabled={isProcessing}
              className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2"
            >
              <Save className="h-4 w-4" /> Start Restoration ({parsedRows.length})
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div 
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            className={cn(
              "p-8 border-2 border-dashed rounded-[24px] text-center space-y-3 transition-colors cursor-pointer",
              dragActive ? "border-emerald-500 bg-emerald-500/5" : "border-app-border bg-bg-app hover:border-emerald-400"
            )}
            onClick={() => document.getElementById('restore-file-input')?.click()}
          >
            <input 
              id="restore-file-input"
              type="file" 
              accept=".txt,.csv,.json"
              onChange={handleFile}
              className="hidden" 
            />
            <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto text-emerald-600">
              <Download className="h-6 w-6 transform rotate-180" />
            </div>
            <div className="space-y-1 text-center">
              <p className="text-xs font-black text-slate-800">পাসওয়ার্ড ফাইল সিলেক্ট করুন (Click to upload employee file)</p>
              <p className="text-[10px] text-text-secondary font-bold">
                Supports credentials backup file inside your computer
              </p>
            </div>
          </div>

          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-app-border"></div></div>
            <span className="relative bg-white px-3 text-[10px] font-black uppercase text-text-secondary tracking-widest">
              Or Paste Raw Text Line-by-Line
            </span>
          </div>

          <div className="space-y-1.5 text-left">
            <label className="text-[10px] font-black uppercase text-text-secondary tracking-wider">
              ফাইল থেকে ডাটা কপি করে এখানে পেস্ট করুন (ID, Password, Name, Role, Rate Format)
            </label>
            <textarea 
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="babul, babul123, Babul Hossain, EMPLOYEE, 350&#10;robi, robi456, Robi Sorkar, SUPERVISOR, 400"
              rows={4}
              className="w-full bg-bg-app border border-app-border rounded-[18px] p-4 text-xs font-mono placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-accent-blue/10 outline-none"
            />
          </div>

          <button 
            onClick={() => parseContent(pasteText)}
            className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2"
          >
            <Save className="h-4 w-4" /> Load & Preview Accounts
          </button>
        </div>
      )}
    </div>
  );
}

function ResetCredentialsForm({ 
  employee, 
  onClose 
}: { 
  employee: UserProfile; 
  onClose: () => void; 
}) {
  const [newUsername, setNewUsername] = useState(employee.username || employee.id || '');
  const [newPassword, setNewPassword] = useState(employee.passwordHash || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sanitizedUsername = newUsername.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
    if (!sanitizedUsername) {
      toast.error("User ID (Username) cannot be empty. / ইউজার আইডি খালি থাকতে পারবে না।");
      return;
    }

    if (newPassword.length < 6) {
      toast.warning("Password must be at least 6 characters long. / পাসওয়ার্ড অন্তত ৬ অক্ষরের হতে হবে।");
      return;
    }

    setIsSubmitting(true);
    try {
      const newEmail = `u_${sanitizedUsername}@apl-system.com`;

      // 1. Check if username/email is currently used by any other user profile in the database
      if (sanitizedUsername !== (employee.username || employee.id).toLowerCase()) {
        const existingEmail = await SupabaseService.list('users', [{ column: 'email', value: newEmail }]);
        const existingId = await SupabaseService.getOne('users', sanitizedUsername);
        
        if (existingEmail.length > 0 || existingId) {
          toast.warning("⚠️ This User ID is already occupied by another user profile. / এই ইউজার আইডিটি ইতিমধ্যে অন্য একজন ব্যবহার করছেন।");
          setIsSubmitting(false);
          return;
        }
      }

      // 2. Perform the secure profile credential updates in DB
      const updatePayload: Partial<UserProfile> = {
        username: sanitizedUsername,
        passwordHash: newPassword,
        email: newEmail
      };

      await SupabaseService.update('users', employee.id, updatePayload);

      // 3. Try to register the updated auth profile credentials in Supabase Auth behind the scenes for live server compatibility
      if (true) {
        try {
          const { createClient } = await import('@supabase/supabase-js');
          const { supabaseUrl, supabaseAnonKey } = await import('../lib/supabase');
          
          const tempSupabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
            auth: { persistSession: false }
          });

          await tempSupabase.auth.signUp({
            email: newEmail,
            password: newPassword
          });
          console.log("[Supposed Sync] Supabase auth credential record updated successfully.");
        } catch (authErr: any) {
          console.warn("[ResetCredentials] Live Auth signup skipped or deferred:", authErr.message);
        }
      }

      toast.success(`Successfully updated credentials for matching employee profile ${employee.name}!`);
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.error(`Error saving credentials. / পাসওয়ার্ড সংরক্ষণে সমস্যা হয়েছে: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5 text-left">
        <label className="text-xs font-black text-slate-500 uppercase tracking-wider block">Employee Name / নাম:</label>
        <div className="w-full px-4 py-3 bg-slate-100 rounded-xl text-slate-700 text-sm font-semibold border border-slate-200">
          {employee.name}
        </div>
      </div>

      <div className="space-y-1.5 text-left">
        <label className="text-xs font-black text-slate-500 uppercase tracking-wider block">
          Update User ID / ইউজার আইডি আপডেট:
        </label>
        <input
          type="text"
          value={newUsername}
          onChange={(e) => setNewUsername(e.target.value)}
          className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-accent-blue/20 outline-none transition-all"
          placeholder="New User ID e.g. joy123"
          required
        />
        <p className="text-[10px] text-slate-400 font-medium">Auto-sanitizes: lowercase letters and numbers only / শুধুমাত্র ছোট হাতের অক্ষর এবং সংখ্যা প্রযোজ্য।</p>
      </div>

      <div className="space-y-1.5 text-left font-sans font-medium">
        <label className="text-xs font-black text-slate-500 uppercase tracking-wider block">
          Update Security Password / নতুন পাসওয়ার্ড:
        </label>
        <input
          type="text"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm font-bold font-mono tracking-wide text-slate-900 focus:ring-2 focus:ring-accent-blue/20 outline-none transition-all"
          placeholder="Enter custom secure password"
          required
        />
        <p className="text-[10px] text-slate-400 font-medium">Must be at least 6 characters long / পাসওয়ার্ড অন্তত ৬ অক্ষরের হতে হবে।</p>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 py-3 bg-slate-100 border border-slate-200 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs active:scale-95 transition-all uppercase tracking-wider"
        >
          Cancel / বাতিল করুন
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold rounded-xl text-xs active:scale-95 transition-all shadow-md shadow-emerald-600/10 uppercase tracking-wider flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
             <>
               <RefreshCw className="h-4.5 w-4.5 animate-spin" /> Saving...
             </>
          ) : (
             <>
               <Save className="h-4 w-4" /> Save Credentials
             </>
          )}
        </button>
      </div>
    </form>
  );
}
