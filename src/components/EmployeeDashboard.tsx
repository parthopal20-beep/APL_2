import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { translations } from '../context/i18n';
import { 
  MapPin, 
  Clock, 
  Calendar, 
  IndianRupee, 
  MessageSquare,
  LogOut,
  ChevronRight,
  PackageCheck,
  ShieldCheck,
  Smartphone,
  Wifi,
  WifiOff,
  CheckCircle2,
  LogIn,
  History,
  Phone,
  Plus,
  Users,
  AlertCircle,
  AlertTriangle,
  X,
  Scan,
  Send,
  Camera,
  ImageIcon,
  Calculator,
  Barcode,
  Flashlight,
  Zap,
  Trash2,
  RefreshCw,
  CheckSquare,
  Eye,
  Download,
  Database,
  Cloud,
  FileSpreadsheet,
  Check
} from 'lucide-react';
import { 
  format, 
  isSameDay, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval,
  differenceInMinutes,
  addMonths,
  subMonths
} from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { AttendanceRecord, ChatMessage, Payday, ValueMismatch, AdHocJob } from '../types';
import Chat from './Chat';
import AttendanceCalendar from './AttendanceCalendar';
import { toast } from 'sonner';
import { cn, compressImage } from '../lib/utils';
import { SupabaseService } from '../services/SupabaseService';
import { useWakeLock } from '../hooks/useWakeLock';
import { OFFICE_LOCATIONS, MAX_DISTANCE_METERS, getDistanceInMeters, AUTHORIZED_PIN_CODES } from '../constants';
import { isConfigured } from '../lib/supabase';

const getRobustLocation = async (): Promise<GeolocationPosition> => {
  if (!navigator.geolocation) {
    throw new Error("Geolocation is not supported by your browser. / আপনার ব্রাউজারে লোকেশন সার্ভিস সাপোর্ট করে না।");
  }

  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        resolve,
        reject,
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 0 }
      );
    });
    return pos;
  } catch (err) {
    console.warn("High accuracy geolocation failed, trying low accuracy / cached location...", err);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          resolve,
          reject,
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 30000 }
        );
      });
      return pos;
    } catch (fallbackErr: any) {
      console.error("Fallback geolocation failed too:", fallbackErr);
      let msg = "Could not retrieve your location. Please check your GPS and internet connection. / আপনার লোকেশন রিট্রিভ করা সম্ভব হয়নি। দয়া করে নেট এবং জিপিএস চালু আছে কি না চেক করুন।";
      if (fallbackErr.code === 1) {
        msg = "Location permission denied. Please enable GPS permissions in browser settings. / লোকেশন পারমিশন ডিনাইড হয়েছে। দয়া করে ব্রাউজার সেটিংসে জিপিএস পারমিশন দিন।";
      }
      throw new Error(msg);
    }
  }
};

export default function EmployeeDashboard() {
  const { user, logout } = useAuth();
  const { t, language } = useLanguage();
  
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [paydays, setPaydays] = useState<Payday[]>([]);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [shipmentCount, setShipmentCount] = useState('');
  const [showShipmentHistory, setShowShipmentHistory] = useState(false);
  const [viewMonth, setViewMonth] = useState(new Date());
  const [mismatches, setMismatches] = useState<ValueMismatch[]>([]);
  const [activeView, setActiveView] = useState<'SHIFT' | 'HISTORY' | 'MISMATCH' | 'ADHOC' | 'COUNTER'>('SHIFT');
  const [isSubmittingMismatch, setIsSubmittingMismatch] = useState(false);
  
  // Cash Counter State
  const [cashCounts, setCashCounts] = useState<Record<string, string>>({
    '500': '', '200': '', '100': '', '50': '', '20': '', '10': '', '5': '', '2': '', '1': ''
  });
  const [onlineCash, setOnlineCash] = useState<string>('');
  const [isSubmittingCash, setIsSubmittingCash] = useState(false);

  const todaysValueMismatch = React.useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    return mismatches
      .filter(m => m.date === today)
      .reduce((sum, m) => sum + (m.valueDifference || 0), 0);
  }, [mismatches]);

  const totalCashAmount = React.useMemo(() => {
    const notesTotal = Object.entries(cashCounts).reduce((sum, [denom, count]) => {
      return sum + (parseInt(denom) * (parseInt(count) || 0));
    }, 0);
    return notesTotal + (parseInt(onlineCash) || 0);
  }, [cashCounts, onlineCash]);

  const totalCashNotes = React.useMemo(() => {
    return Object.values(cashCounts).reduce((sum, count) => sum + (parseInt(count) || 0), 0);
  }, [cashCounts]);
  
  // Ad-Hoc States
  const [adHocJobs, setAdHocJobs] = useState<AdHocJob[]>([]);
  const [isSubmittingAdHoc, setIsSubmittingAdHoc] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<'TOTO' | 'TATA ACE(107)' | 'MOTOR VAN' | 'ENGINE VAN' | ''>('');
  const [adHocStartTime, setAdHocStartTime] = useState('');
  const [adHocEndTime, setAdHocEndTime] = useState('');
  const [adHocValue, setAdHocValue] = useState('');

  const hasSubmittedAdHocToday = React.useMemo(() => {
    return adHocJobs.some(job => job.date === format(new Date(), 'yyyy-MM-dd'));
  }, [adHocJobs]);

  useEffect(() => {
    if (!user || user.role !== 'EMPLOYEE') return;
    
    const fetchMismatches = async () => {
      // Filter mismatches from the last 24 hours
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const data = await SupabaseService.list('mismatches', [
        { column: 'userId', value: user.id },
        { column: 'timestamp', value: twentyFourHoursAgo, operator: 'gte' }
      ], 20, { column: 'timestamp', ascending: false });
      
      setMismatches(data);
    };

    fetchMismatches();

    const fetchAdHocJobs = async () => {
      const data = await SupabaseService.list('ad_hoc_jobs', [
        { column: 'userId', value: user.id }
      ], 50, { column: 'timestamp', ascending: false });
      setAdHocJobs(data);
    };

    if (user.paymentBase === 'DAILY_FIXED') {
      fetchAdHocJobs();
    }

    // Real-time updates for last 24h
    const sub = SupabaseService.subscribe('mismatches', (data) => {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const filtered = data
        .filter((m: any) => m.userId === user.id && m.timestamp >= twentyFourHoursAgo)
        .sort((a: any, b: any) => b.timestamp.localeCompare(a.timestamp));
      setMismatches(filtered);
    });

    // Real-time updates for ad-hoc
    const adHocSub = SupabaseService.subscribe('ad_hoc_jobs', (data) => {
      const filtered = data
        .filter((j: any) => j.userId === user.id)
        .sort((a: any, b: any) => (b.timestamp || '').localeCompare(a.timestamp || ''));
      setAdHocJobs(filtered);
    });

    return () => { 
      sub.unsubscribe(); 
      adHocSub.unsubscribe();
    };
  }, [user]);
  
  const shipmentHistory = React.useMemo(() => {
    return history.filter(rec => rec.shipments !== undefined && rec.shipments > 0);
  }, [history]);

  const totalMonthlyEarnings = React.useMemo(() => {
    return history.reduce((sum, rec) => sum + (rec.earnings || 0), 0);
  }, [history]);

  const todayEarnings = React.useMemo(() => {
    if (todayRecord?.checkOutTime && todayRecord.earnings !== undefined) {
      return todayRecord.earnings;
    }
    if (!todayRecord) return 0;
    
    // Live estimate based on current input
    const shipments = parseInt(shipmentCount) || 0;
    if (user?.jobTitle === 'NDA') {
      return shipments * (user.rate || 0);
    }
    return user?.paymentBase === 'PER_SHIPMENT' 
      ? shipments * (user.rate || 0) 
      : (user?.rate || 0);
  }, [todayRecord, shipmentCount, user]);

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [showOdoModal, setShowOdoModal] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );
  const [lastNotificationDate, setLastNotificationDate] = useState<{in: string | null, out: string | null}>({ in: null, out: null });
  const [odoMode, setOdoMode] = useState<'IN' | 'OUT'>('IN');
  const [showLocationErrorModal, setShowLocationErrorModal] = useState(false);
  const [locationErrorModalConfig, setLocationErrorModalConfig] = useState<{
    mode: 'IN' | 'OUT';
    photo: string;
    odometer?: number;
    odometerEndInput?: number;
    pinCodesList?: string[];
    originalError: string;
  } | null>(null);

  const { requestWakeLock, releaseWakeLock, isBlocked: isWakeLockBlocked } = useWakeLock(!!(todayRecord && !todayRecord.checkOutTime));

  // Auto-sync shipment counts and estimated earnings to DB for real-time admin visibility
  useEffect(() => {
    if (!todayRecord || todayRecord.checkOutTime) return;
    if (activeView === 'ADHOC') {
       if (!adHocStartTime) setAdHocStartTime(todayRecord.checkInTime);
       if (!adHocEndTime) setAdHocEndTime(format(new Date(), 'HH:mm'));
    }
  }, [activeView, todayRecord]);

  useEffect(() => {
    if (!todayRecord || todayRecord.checkOutTime || !user) return;

    const timer = setTimeout(async () => {
      try {
        const shipments = parseInt(shipmentCount) || 0;
        let currentEarnings = (user.rate || 0);
        
        if (user.jobTitle === 'NDA') {
          currentEarnings = shipments * (user.rate || 0);
        } else if (user.paymentBase === 'PER_SHIPMENT') {
          currentEarnings = shipments * (user.rate || 0);
        }
        
        await SupabaseService.update('attendance', todayRecord.id, {
          shipments,
          earnings: currentEarnings
        });
      } catch (err) {
        console.warn("Failed to sync live progress:", err);
      }
    }, 2000); // Debounce sync by 2s

    return () => clearTimeout(timer);
  }, [shipmentCount, todayRecord, user]);

  // Direct DB access only. Local sync logic removed.
  useEffect(() => {
    return () => {};
  }, []);

  useEffect(() => {
    if (todayRecord && !todayRecord.checkOutTime) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }
  }, [todayRecord, requestWakeLock, releaseWakeLock]);

  // Daily Notifications Logic
  useEffect(() => {
    if (!("Notification" in window)) return;

    const checkPermission = () => {
      setNotificationPermission(Notification.permission);
    };

    if (Notification.permission === 'default') {
      Notification.requestPermission().then(checkPermission);
    }

    const checkNotifications = () => {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const todayStr = format(now, 'yyyy-MM-dd');

      // 6:00 AM Check-In Reminder
      if (currentHour === 6 && currentMinute === 0) {
        if (lastNotificationDate.in !== todayStr && !todayRecord) {
          new Notification(`${translations.en.appName} / ${translations.bn.appName}`, {
            body: `${translations.en.checkInReminder}\n${translations.bn.checkInReminder}`,
            icon: '/icon.png',
            tag: 'check-in-reminder'
          });
          setLastNotificationDate(prev => ({ ...prev, in: todayStr }));
        }
      }

      // 6:00 PM Check-Out Reminder
      if (currentHour === 18 && currentMinute === 0) {
        if (lastNotificationDate.out !== todayStr && todayRecord && !todayRecord.checkOutTime) {
          new Notification(`${translations.en.appName} / ${translations.bn.appName}`, {
            body: `${translations.en.checkOutReminder}\n${translations.bn.checkOutReminder}`,
            icon: '/icon.png',
            tag: 'check-out-reminder'
          });
          setLastNotificationDate(prev => ({ ...prev, out: todayStr }));
        }
      }
    };

    // Check every 30 seconds to ensure we don't miss the 6:00 window
    const interval = setInterval(checkNotifications, 30000);
    
    // Initial check
    checkNotifications();

    return () => clearInterval(interval);
  }, [todayRecord, lastNotificationDate, t]);
  const [tempOdo, setTempOdo] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [selectedPins, setSelectedPins] = useState<string[]>([]);
  
  const [showCamera, setShowCamera] = useState(false);
  const [cameraMode, setCameraMode] = useState<'IN' | 'OUT'>('IN');
  const [facingMode, setFacingMode] = useState<VideoFacingModeEnum>('user');
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  
  // Barcode and Value states
  const [barcodes, setBarcodes] = useState<string[]>([]);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [showManualBarcodeModal, setShowManualBarcodeModal] = useState(false);
  const [manualBarcodeValue, setManualBarcodeValue] = useState('');
  const [isFlashlightOn, setIsFlashlightOn] = useState(false);
  const [customerValue, setCustomerValue] = useState('');
  const [erpValue, setErpValue] = useState('');
  const [mismatchPhoto, setMismatchPhoto] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [showCopiedIndicator, setShowCopiedIndicator] = useState(false);
  const lastLocationRef = useRef<{lat: number, lng: number, time: number} | null>(null);

  // Live Tracking System
  useEffect(() => {
    if (!todayRecord || todayRecord.checkOutTime || !user) {
      if (user) {
        SupabaseService.update('live_locations', user.id, { status: 'INACTIVE' }).catch(() => {});
      }
      return;
    }

    let watchId: number;
    
    const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371e3; // metres
      const φ1 = lat1 * Math.PI/180;
      const φ2 = lat2 * Math.PI/180;
      const Δφ = (lat2-lat1) * Math.PI/180;
      const Δλ = (lon2-lon1) * Math.PI/180;
      const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ/2) * Math.sin(Δλ/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c; 
    };

    const track = async (position: GeolocationPosition) => {
      const { latitude, longitude, speed, accuracy } = position.coords;
      
      // Filter out low accuracy updates
      if (accuracy > 150) return;

      const now = Date.now();
      const last = lastLocationRef.current;
      
      let distance = 0;
      if (last) {
        distance = calculateDistance(latitude, longitude, last.lat, last.lng);
      }

      // Stability Checks:
      // Live marker update: Every 30s OR if moved > 5m
      const shouldUpdateLive = !last || distance > 5 || (now - last.time > 30000);
      
      // Log history (path/idle): Every 1m OR if moved > 25m
      const shouldLogHistory = !last || distance > 25 || (now - last.time > 60000);

      if (shouldUpdateLive) {
        const timestamp = new Date().toISOString();
        try {
          const payload: any = {
            userId: user.id,
            name: user.name,
            latitude,
            longitude,
            lastUpdate: timestamp,
            status: 'ACTIVE'
          };
          
          if (typeof speed === 'number') payload.speed = speed;
          if (typeof accuracy === 'number') payload.accuracy = accuracy;

          await SupabaseService.upsert('live_locations', user.id, payload);

          if (shouldLogHistory) {
            const logPayload: any = {
              userId: user.id,
              latitude,
              longitude,
              timestamp
            };
            if (typeof speed === 'number') logPayload.speed = speed;
            if (typeof accuracy === 'number') logPayload.accuracy = accuracy;

            await SupabaseService.create('location_logs', logPayload);
            // Update reference point
            lastLocationRef.current = { lat: latitude, lng: longitude, time: now };
          }
        } catch (err) {
          console.warn("Tracking update failed:", err);
        }
      }
    };

    if ('geolocation' in navigator) {
      // Use watchPosition for continuous tracking
      watchId = navigator.geolocation.watchPosition(
        track,
        (err) => console.error("Geolocation error:", err),
        {
          enableHighAccuracy: true,
          maximumAge: 5000, 
          timeout: 15000
        }
      );
    }

    return () => {
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
    };
  }, [todayRecord?.id, todayRecord?.checkOutTime, user?.id]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const startCamera = async (mode?: VideoFacingModeEnum) => {
    try {
      const activeMode = mode || facingMode;
      const s = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: activeMode }, 
        audio: false 
      });
      setStream(s);
      if (videoRef.current) {
        videoRef.current.srcObject = s;
      }
    } catch (err) {
      console.error("Camera access error:", err);
      toast.error(t.cameraPermission);
      setShowCamera(false);
    }
  };

  const toggleCamera = async () => {
    const newMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newMode);
    stopCamera();
    await startCamera(newMode);
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      // Target a reasonable size (max 800px width/height)
      const maxDim = 800;
      let width = video.videoWidth;
      let height = video.videoHeight;
      
      if (width > height) {
        if (width > maxDim) {
          height *= maxDim / width;
          width = maxDim;
        }
      } else {
        if (height > maxDim) {
          width *= maxDim / height;
          height = maxDim;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, width, height);
        
        canvas.toBlob(async (blob) => {
          if (blob) {
            try {
              // Strictly target under 50KB for camera photos too
              const compressed = await compressImage(blob, 48);
              
              const finalSizeKB = compressed.size / 1024;
              if (finalSizeKB > 50) {
                 // Retry if still too large
                 const smaller = await compressImage(blob, 35, 400);
                 const reader = new FileReader();
                 reader.onloadend = () => {
                    setCapturedPhoto(reader.result as string);
                    stopCamera();
                    toast.success(`AI Optimize: Camera photo compressed to ${(smaller.size / 1024).toFixed(1)}KB`);
                 };
                 reader.readAsDataURL(smaller);
                 return;
              }

              const reader = new FileReader();
              reader.onloadend = () => {
                setCapturedPhoto(reader.result as string);
                stopCamera();
                toast.info(`AI Optimize: Camera photo compressed to ${finalSizeKB.toFixed(1)}KB`);
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

  const handleBarcodeScanned = (decodedText: string) => {
    if (barcodes.length >= 20) {
      toast.error(`${translations.en.maxBarcodes}\n${translations.bn.maxBarcodes}`);
      return;
    }

    // AI Analysis: Strict Pattern Verification
    // Pattern: 'FMPC' + 10 digits
    const barcodeRegex = /^FMPC\d{10}$/i;
    const isValidFormat = barcodeRegex.test(decodedText);

    if (!isValidFormat) {
      if ('vibrate' in navigator) navigator.vibrate([100, 50, 100, 50, 100]);
      
      // Powerful AI feedback for wrong barcode
      toast.error(
        "AI Analysis Error: WRONG BARCODE! / ভুল বারকোড!\n" +
        "Detection: Pattern mismatch. Only 'FMPC' followed by 10 digits is allowed.\n" +
        "AI বিশ্লেষণ ত্রুটি: ভুল বারকোড! শুধুমাত্র 'FMPC' এবং এরপর ১০টি সংখ্যা গ্রহণযোগ্য।"
      );
      return;
    }

    if (barcodes.includes(decodedText.toUpperCase())) {
      if ('vibrate' in navigator) navigator.vibrate([30, 30, 30]);
      toast.error(`${translations.en.barcodeExists}\n${translations.bn.barcodeExists}`);
      return;
    }
    
    setBarcodes(prev => [...prev, decodedText.toUpperCase()]);
    setShowBarcodeScanner(false);
    
    if ('vibrate' in navigator) {
      navigator.vibrate([10, 50, 10]); 
    }
    
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    audio.volume = 0.5;
    audio.play().catch(() => {});
  };

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsCompressing(true);
      // AI Powered Compression: Strictly targeting < 48KB for safety
      const compressedBlob = await compressImage(file, 48);
      
      const finalSizeKB = compressedBlob.size / 1024;
      if (finalSizeKB > 50) {
         toast.error("AI Warning: Image still exceeds 50KB after compression. Retrying with lower resolution... / ৫০ কেবির বেশি ফাইল আপলোড করা যাবে না। আবার চেষ্টা করা হচ্ছে...");
         // Recursive retry with even smaller target
         const smallerBlob = await compressImage(file, 35, 400); 
         setMismatchPhoto(await blobToDataURL(smallerBlob));
         toast.success(`Success: Optimized to ${(smallerBlob.size / 1024).toFixed(1)}KB`);
         setIsCompressing(false);
         return;
      }

      setMismatchPhoto(await blobToDataURL(compressedBlob));
      setIsCompressing(false);
      toast.info(`AI Optimize: Image compressed to ${finalSizeKB.toFixed(1)}KB for high-speed upload.`);
    } catch (err) {
      console.error("Compression error:", err);
      toast.error("AI Optimization failed. Please try again. / এআই অপ্টিমাইজেশন ব্যর্থ হয়েছে।");
      setIsCompressing(false);
    }
  };

  const blobToDataURL = (blob: Blob): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  };

  const handleReportMismatch = async () => {
    if (!user || user.role !== 'EMPLOYEE') return;

    if (barcodes.length === 0) {
      toast.info("At least one barcode must be scanned. / অন্তত একটি বারকোড স্ক্যান করতে হবে।");
      return;
    }
    if (!customerValue || !erpValue) {
      toast.warning("Please provide both Customer and ERP values. / দয়া করে কাস্টমার এবং ERP উভয় ভ্যালু প্রদান করুন।");
      return;
    }
    if (!mismatchPhoto) {
      toast.warning("Customer photo is mandatory. Please capture a photo of the mismatch. / কাস্টমারের ফটো দেওয়া বাধ্যতামূলক। দয়া করে মিসম্যাচের একটি ফটো তুলুন।");
      return;
    }

    const reportText = `*VALUE MISMATCH REPORT*\n\n` +
      `*Name:* ${user?.name}\n` +
      `*Date:* ${format(new Date(), 'dd/MM/yyyy')}\n` +
      `*Barcodes:* ${barcodes.join(', ')}\n` +
      `*Customer Value:* ₹${customerValue}\n` +
      `*ERP Value:* ₹${erpValue}\n` +
      `*Difference:* ₹${(difference || 0).toFixed(2)}\n\n` +
      `Please upload Customer & ERP photos in the group below.`;
    
    let photoUrl = null;
    try {
      setIsSubmittingMismatch(true);

      // Upload photo if present
      if (mismatchPhoto) {
        // Fallback to storing base64 directly as bucket 'mismatches' may not exist
        photoUrl = mismatchPhoto;
      }

      // 1. Submit to Database for Admin
      const mismatchData = {
        userId: user.id,
        userName: user.name, // Added for consistency
        employeeName: user.name,
        date: format(new Date(), 'yyyy-MM-dd'),
        timestamp: new Date().toISOString(),
        barcodes: [...barcodes], // Ensure it's a clean array
        customerValue: parseFloat(customerValue) || 0,
        erpValue: parseFloat(erpValue) || 0,
        valueDifference: difference,
        customerPhoto: photoUrl
      };

      await SupabaseService.create('mismatches', mismatchData);

      toast.success("SUCCESS: Mismatch report submitted to Admin! / সফল: মিসম্যাচ রিপোর্ট অ্যাডমিনের কাছে সাবমিট করা হয়েছে!");

      // 4. Reset state
      setBarcodes([]);
      setCustomerValue('');
      setErpValue('');
      setMismatchPhoto(null);
      
    } catch (error) {
      console.error("Mismatch report error:", error);
      toast.error("Error logging mismatch: " + (error instanceof Error ? error.message : "Connection failed") + "\nমিসম্যাচ লগ করতে ত্রুটি হয়েছে।");
    } finally {
      setIsSubmittingMismatch(false);
    }
  };

  const handleSubmitAdHoc = async () => {
    // 1. Check if user is checked in
    if (!todayRecord || todayRecord.checkOutTime) {
      toast.warning("Please Check-in first to access this feature. / আগে ডিউটিতে যোগ দিন (Check In). তারপর এই অপশনটি ব্যবহার করতে পারবেন।");
      return;
    }

    // 2. Check if already submitted today
    if (hasSubmittedAdHocToday) {
      toast.error(`${translations.en.adHocLimitReached}\n${translations.bn.adHocLimitReached}`);
      return;
    }

    if (!selectedVehicle || !adHocStartTime || !adHocEndTime || !adHocValue || !user) {
      toast.warning("Please fill all fields for AD-HOC entry. / দয়া করে অ্যাডহক এন্ট্রির জন্য সমস্ত ক্ষেত্র পূরণ করুন।");
      return;
    }
    
    setIsSubmittingAdHoc(true);
    const newEntry: AdHocJob = {
      userId: user.id,
      userName: user.name, // Added for consistency
      employeeName: user.name,
      date: format(new Date(), 'yyyy-MM-dd'),
      vehicleType: selectedVehicle as any,
      startTime: adHocStartTime,
      endTime: adHocEndTime,
      totalHours: adHocHours,
      value: parseFloat(adHocValue) || 0,
      status: 'PENDING',
      timestamp: new Date().toISOString()
    };

    // Optimistic Update: Add to list immediately for speed
    const tempId = 'temp-' + Date.now();
    setAdHocJobs(prev => [{ ...newEntry, id: tempId }, ...prev]);
    
    try {
      const response = await SupabaseService.create('ad_hoc_jobs', newEntry);
      
      // Replace temp ID with real one
      setAdHocJobs(prev => prev.map(j => j.id === tempId ? response : j));

      // Reset form quickly
      setSelectedVehicle('');
      setAdHocStartTime('');
      setAdHocEndTime('');
      setAdHocValue('');
    } catch (err) {
      console.error("Ad-Hoc submission error:", err);
      // Revert optimistic update on error
      setAdHocJobs(prev => prev.filter(j => j.id !== tempId));
      toast.error("Failed to submit AD-HOC entry. Please try again. / Ad-Hoc এন্ট্রি সাবমিট করতে ব্যর্থ হয়েছে। আবার চেষ্টা করুন।");
    } finally {
      setIsSubmittingAdHoc(false);
    }
  };

  const handleAddManualBarcode = () => {
    setShowManualBarcodeModal(true);
  };

  const confirmManualBarcode = () => {
    const code = manualBarcodeValue.trim();
    if (code) {
      if (barcodes.length >= 20) {
        toast.error(t.maxBarcodes);
        return;
      }

      // AI Analysis: Strict Pattern Verification
      const barcodeRegex = /^FMPC\d{10}$/i;
      if (!barcodeRegex.test(code)) {
        if ('vibrate' in navigator) navigator.vibrate([100, 50, 100]);
        toast.error(
          "AI Analysis Error: WRONG BARCODE! / ভুল বারকোড!\n" +
          "Patterns match fail. Only 'FMPC' followed by 10 digits is allowed.\n" +
          "শুধুমাত্র 'FMPC' এবং এরপর ১০টি সংখ্যা গ্রহণযোগ্য।"
        );
        return;
      }

      if (barcodes.includes(code.toUpperCase())) {
        toast.error(t.barcodeExists);
        return;
      }
      setBarcodes(prev => [...prev, code.toUpperCase()]);
      setManualBarcodeValue('');
      setShowManualBarcodeModal(false);
    }
  };

  const closeManualEntry = () => {
    setManualBarcodeValue('');
    setShowManualBarcodeModal(false);
  };

  const adHocHours = React.useMemo(() => {
    if (!adHocStartTime || !adHocEndTime) return 0;
    const [startH, startM] = adHocStartTime.split(':').map(Number);
    const [endH, endM] = adHocEndTime.split(':').map(Number);
    
    let diffMinutes = (endH * 60 + endM) - (startH * 60 + startM);
    if (diffMinutes < 0) diffMinutes += 24 * 60; // Handle overnight shifts
    
    return Number((diffMinutes / 60).toFixed(2));
  }, [adHocStartTime, adHocEndTime]);

  const difference = React.useMemo(() => {
    const erp = parseFloat(erpValue) || 0;
    const cust = parseFloat(customerValue) || 0;
    return erp - cust;
  }, [erpValue, customerValue]);

  const handleProfilePictureChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsUpdatingProfile(true);
    try {
      // AI Powered Compression: Target 48KB strictly
      const compressedBlob = await compressImage(file, 48);
      
      const finalSizeKB = compressedBlob.size / 1024;
      if (finalSizeKB > 50) {
         // Final retry for profile pics
         const smaller = await compressImage(file, 35, 300);
         const reader = new FileReader();
         reader.onloadend = async () => {
           const base64 = reader.result as string;
           await SupabaseService.update('users', user.id, { profilePicture: base64 });
           toast.success(`Profile optimized to ${(smaller.size / 1024).toFixed(1)}KB and updated!`);
           setIsUpdatingProfile(false);
         };
         reader.readAsDataURL(smaller);
         return;
      }

      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        await SupabaseService.update('users', user.id, {
          profilePicture: base64
        });
        toast.success(`Profile updated! (${finalSizeKB.toFixed(1)}KB)`);
        setIsUpdatingProfile(false);
      };
      reader.readAsDataURL(compressedBlob);
    } catch (err: any) {
      toast.error("Failed to update profile picture: " + err.message + "\nপ্রোফাইল পিকচার আপডেট করতে ব্যর্থ হয়েছে।");
      setIsUpdatingProfile(false);
    }
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
    if (showBarcodeScanner) {
      scannerRef.current = new Html5Qrcode("barcode-reader");
      const config = { 
        fps: 60, // Maximum frame rate for fluidity
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          // Narrower, more focused box to prevent catching accidental nearby barcodes
          const width = Math.min(viewfinderWidth * 0.7, 280);
          const height = Math.min(viewfinderHeight * 0.3, 120);
          return { width, height };
        },
        aspectRatio: 1.777778, 
        disableFlip: true,
        formatsToSupport: [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.QR_CODE
        ],
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true 
        }
      };
      
      const startScanner = async () => {
        if (!scannerRef.current) return;
        
        try {
          // Attempt to find back camera for better results
          const devices = await Html5Qrcode.getCameras();
          const backCamera = devices.find(d => 
            d.label.toLowerCase().includes('back') || 
            d.label.toLowerCase().includes('rear') ||
            d.label.toLowerCase().includes('environment')
          );

          // Fix: Ensure we pass either a string ID or a clean object with EXACTLY 1 key
          const cameraIdOrConfig = backCamera ? backCamera.id : { facingMode: "environment" };

          await scannerRef.current.start(
            cameraIdOrConfig,
            config,
            (decodedText) => {
              handleBarcodeScanned(decodedText);
            },
            () => {} // silent error callback for scan failures
          );

          // Success - try to apply extra constraints
          try {
            const track = (scannerRef.current as any).getRunningTrack?.();
            if (track) {
              await track.applyConstraints({
                focusMode: "continuous",
                frameRate: { ideal: 60 }
              }).catch(() => {});
            }
          } catch (e) {
            console.warn("Extra constraints skipped", e);
          }

          if (isFlashlightOn) {
            (scannerRef.current as any).applyVideoConstraints({
              advanced: [{ torch: true }]
            } as any).catch(() => {});
          }
        } catch (err) {
          console.error("Scanner failed:", err);
          toast.error("Camera access failed. Please ensure you have granted camera permissions. / ক্যামেরা অ্যাক্সেস ব্যর্থ হয়েছে। অনুগ্রহ করে ক্যামেরার অনুমতি নিশ্চিত করুন।");
          setShowBarcodeScanner(false);
        }
      };

      startScanner();
    }
    return () => {
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, [showBarcodeScanner]);

  const toggleFlashlight = async () => {
    const nextState = !isFlashlightOn;
    setIsFlashlightOn(nextState);
    
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await (scannerRef.current as any).applyVideoConstraints({
          advanced: [{ torch: nextState }]
        });
      } catch (err) {
        console.error("Failed to toggle flashlight:", err);
      }
    }
  };

  useEffect(() => {
    if (!user || user.role !== 'EMPLOYEE') return;

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [user, stream]);

  useEffect(() => {
    if (!user) return;

    // Fetch today's record
    const today = format(new Date(), 'yyyy-MM-dd');
    
    // Initial fetch
    SupabaseService.list('attendance', [
      { column: 'userId', value: user.id },
      { column: 'date', value: today }
    ], 1).then(data => {
      if (data.length > 0) setTodayRecord(data[0]);
      else setTodayRecord(null);
    });

    const attSub = SupabaseService.subscribe('attendance', (data) => {
      const todayRec = data.find((a: any) => a.userId === user.id && a.date === today);
      setTodayRecord(todayRec || null);

      const start = format(startOfMonth(viewMonth), 'yyyy-MM-dd');
      const end = format(endOfMonth(viewMonth), 'yyyy-MM-dd');
      const filteredHistory = data.filter((r: any) => 
        r.userId === user.id && 
        r.date >= start && 
        r.date <= end
      ).sort((a: any, b: any) => b.date.localeCompare(a.date));
      setHistory(filteredHistory);
    });

    // Fetch history for selected month
    const fetchData = async () => {
      const start = format(startOfMonth(viewMonth), 'yyyy-MM-dd');
      const end = format(endOfMonth(viewMonth), 'yyyy-MM-dd');
      
      const attHistory = await SupabaseService.list('attendance', [
        { column: 'userId', value: user.id },
        { column: 'date', value: start, operator: 'gte' },
        { column: 'date', value: end, operator: 'lte' }
      ], 100, { column: 'date', ascending: false });
      setHistory(attHistory);

      const pays = await SupabaseService.list('paydays', [
        { column: 'userId', value: user.id },
        { column: 'date', value: start, operator: 'gte' },
        { column: 'date', value: end, operator: 'lte' }
      ]);
      setPaydays(pays);
    };

    fetchData();

    return () => { attSub.unsubscribe(); };
  }, [user, viewMonth]);


  const isNDA = React.useMemo(() => {
    return user?.jobTitle === 'NDA';
  }, [user]);

  const isDeliveryRole = React.useMemo(() => {
    const title = user?.jobTitle?.toLowerCase() || '';
    const paymentBase = user?.paymentBase || '';
    return title.includes('delivery') || 
           title.includes('courier') || 
           title.includes('boy') || 
           title === 'da' ||
           title === 'nda' ||
           paymentBase === 'PER_SHIPMENT' || 
           paymentBase === 'DRIVER';
  }, [user]);

  const canTrackMileage = React.useMemo(() => {
    if (!user) return false;
    const jobTitle = user.jobTitle?.toUpperCase() || '';
    const paymentBase = user.paymentBase?.toUpperCase() || '';
    
    // As per request: Odometer and PIN selection is "শুধুমাত্র ড্রাইভার দের জন্য" (Only for drivers)
    // Broadened to include DA and NDA as they are often functionally drivers.
    return jobTitle.includes('DRIVER') || 
           paymentBase.includes('DRIVER') || 
           jobTitle === 'DA' || 
           jobTitle === 'NDA';
  }, [user]);

  const handleCheckIn = async () => {
    if (!user) return;
    
    // 1. Prevent double submission
    if (isSubmitting || isCheckingIn) return;
    
    // 2. Strict prevent duplicate: Refresh today record first
    setIsSubmitting(true);
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const latest = await SupabaseService.list('attendance', [
        { column: 'userId', value: user.id },
        { column: 'date', value: today }
      ], 1);
      
      if (latest.length > 0) {
        setTodayRecord(latest[0]);
        toast.error("You have already checked in for today! / আপনি আজ ইতিমধ্যেই চেক-ইন করেছেন।");
        return;
      }
      
      setCameraMode('IN');
      setFacingMode('user');
      setCapturedPhoto(null);
      setShowCamera(true);
      startCamera('user');
    } catch (err) {
      console.warn("Pre-check-in verify failed, proceeding with local check:", err);
      if (todayRecord) {
        toast.error("You have already checked in for today! / আপনি আজ ইতিমধ্যেই চেক-ইন করেছেন।");
        return;
      }
      // Fallback to current local state
      setCameraMode('IN');
      setFacingMode('user');
      setCapturedPhoto(null);
      setShowCamera(true);
      startCamera('user');
    } finally {
      setIsSubmitting(false);
    }
  };

  const proceedCheckInAfterPhoto = async (photo: string) => {
    if (canTrackMileage) {
      setOdoMode('IN');
      setTempOdo('');
      setCapturedPhoto(photo);
      setShowOdoModal(true);
      setShowCamera(false);
      return;
    }
    await proceedCheckIn(photo);
  };

  const proceedCheckInBypassed = async (photo: string, odometer?: number) => {
    if (!user) return;
    setIsCheckingIn(true);
    try {
      const defaultOffice = OFFICE_LOCATIONS[0];
      const record: any = {
        userId: user.id,
        date: format(new Date(), 'yyyy-MM-dd'),
        checkInTime: new Date().toISOString(),
        checkInLocation: {
          latitude: defaultOffice.lat,
          longitude: defaultOffice.lng,
          address: "Office 1 (Bypassed due to GPS error/timeout - Needs Review)"
        },
        checkInPhoto: photo,
        earnings: (user.paymentBase?.toUpperCase() === 'DAILY_FIXED' || user.paymentBase?.toUpperCase() === 'DRIVER' || user.jobTitle?.toUpperCase() === 'DRIVER') ? (user.rate || 0) : 0,
        status: 'PRESENT',
        reviewNeeded: true
      };

      if (typeof odometer === 'number' && !isNaN(odometer)) {
        record.odometerStart = odometer;
      }

      const result = await SupabaseService.create('attendance', record);
      if (result) {
        setTodayRecord(result);
      }
      
      toast.success("Checked in using GPS Bypass! Needs supervisor review. / জিপিএস বাইপাস দিয়ে চেক-ইন করা হয়েছে! সুপারভাইজার রিভিউ করবেন।");
      setShowLocationErrorModal(false);
      setLocationErrorModalConfig(null);
      setShowCamera(false);
      setCapturedPhoto(null);
    } catch (err: any) {
      console.error("Bypassed check-in error:", err);
      toast.error("Failed to bypass check-in: " + err.message);
    } finally {
      setIsCheckingIn(false);
    }
  };

  const proceedCheckIn = async (photo: string, odometer?: number) => {
    if (!user) return;
    
    // Strict prevent duplicate sub in execution
    if (isSubmitting || isCheckingIn) return;
    setIsCheckingIn(true);

    try {
      // 0. Final double-check for existing record
      const today = format(new Date(), 'yyyy-MM-dd');
      const latest = await SupabaseService.list('attendance', [
        { column: 'userId', value: user.id },
        { column: 'date', value: today }
      ], 1);
      
      if (latest.length > 0) {
        setTodayRecord(latest[0]);
        toast.error("Already checked in for today! / আপনি ইতিমধ্যেই আজ চেক-ইন করেছেন।");
        setIsCheckingIn(false);
        setShowCamera(false);
        return;
      }

      // 1. Get Location with robust helper
      let pos: GeolocationPosition;
      try {
        pos = await getRobustLocation();
      } catch (e: any) {
        console.warn("Location check-in error, using fallback modal:", e);
        setLocationErrorModalConfig({
          mode: 'IN',
          photo,
          odometer,
          originalError: e.message || "Location request timed out. / লোকেশন রিকোয়েস্ট টাইমড আউট হয়েছে।"
        });
        setShowLocationErrorModal(true);
        setIsCheckingIn(false);
        return;
      }

      // 2. Geofencing check
      const isWithinRange = OFFICE_LOCATIONS.some(office => {
        const dist = getDistanceInMeters(
          pos.coords.latitude, 
          pos.coords.longitude, 
          office.lat, 
          office.lng
        );
        return dist <= MAX_DISTANCE_METERS;
      });

      if (!isWithinRange) {
        if ("Notification" in window && Notification.permission === 'granted') {
          new Notification(`${translations.en.appName} / ${translations.bn.appName}`, {
            body: `${translations.en.notAtOffice}\n${translations.bn.notAtOffice}`,
            icon: '/icon.png'
          });
        }
        setLocationErrorModalConfig({
          mode: 'IN',
          photo,
          odometer,
          originalError: `You are not within range of any office. / আপনি অফিসের ৫০০ মিটারের মধ্যে নেই। (Detected: Lat ${pos.coords.latitude.toFixed(4)}, Lng ${pos.coords.longitude.toFixed(4)})`
        });
        setShowLocationErrorModal(true);
        setIsCheckingIn(false);
        return;
      }
      const record: any = {
        userId: user.id,
        date: format(new Date(), 'yyyy-MM-dd'),
        checkInTime: new Date().toISOString(),
        checkInLocation: {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude
        },
        checkInPhoto: photo,
        earnings: (user.jobTitle?.toUpperCase() === 'NDA') ? 0 : (user.paymentBase?.toUpperCase() === 'DAILY_FIXED' || user.paymentBase?.toUpperCase() === 'DRIVER' || user.jobTitle?.toUpperCase() === 'DRIVER') ? (user.rate || 0) : 0,
        status: 'PRESENT'
      };

      if (typeof odometer === 'number' && !isNaN(odometer)) {
        record.odometerStart = odometer;
      }

      const result = await SupabaseService.create('attendance', record);
      if (result) {
        setTodayRecord(result);
      }
      
      toast.success(`${translations.en.checkInSuccess}\n${translations.bn.checkInSuccess}`);
      setShowCamera(false);
      setCapturedPhoto(null);
    } catch (err: any) {
      console.error("Check-in error:", err);
      let message = err.message;
      try {
        const parsed = JSON.parse(err.message);
        message = `Database Error: ${parsed.error}`;
      } catch {
        // Not a JSON error
      }
      toast.error(message || t.locationPermission);
    } finally {
      setIsCheckingIn(false);
    }
  };

  const handleCheckOut = () => {
    if (!user || !todayRecord?.id) return;
    
    if ((user.paymentBase === 'PER_SHIPMENT' || user.jobTitle === 'NDA') && !shipmentCount) {
      toast.warning(t.shipmentsRequired);
      return;
    }

    setCameraMode('OUT');
    setFacingMode('environment'); // Default to back camera for vehicle photo
    setCapturedPhoto(null);
    setShowCamera(true);
    startCamera('environment');
  };

  const proceedCheckOutAfterPhoto = async (photo: string) => {
    if (canTrackMileage) {
      setOdoMode('OUT');
      setTempOdo('');
      setSelectedPins([]); // Reset pins selection on checkout start
      setCapturedPhoto(photo);
      setShowOdoModal(true);
      setShowCamera(false);
      return;
    }
    await proceedCheckOut(photo);
  };

  const proceedCheckOutBypassed = async (photo: string, odometerEndInput?: number, pinCodesList: string[] = []) => {
    if (!user || !todayRecord?.id) return;
    setIsCheckingOut(true);
    try {
      const defaultOffice = OFFICE_LOCATIONS[0];
      const shipments = parseInt(shipmentCount) || 0;
      let earnings = (user.rate || 0);
      
      if (user.jobTitle === 'NDA') {
        earnings = shipments * (user.rate || 0);
      } else if (user.paymentBase === 'PER_SHIPMENT') {
        earnings = shipments * (user.rate || 0);
      }

      const checkoutTime = new Date().toISOString();
      const diffMinutes = differenceInMinutes(new Date(checkoutTime), new Date(todayRecord.checkInTime));
      const hoursWorked = +(diffMinutes / 60).toFixed(2);

      let distanceDriven = 0;
      
      const updates: any = {
        checkOutTime: checkoutTime,
        checkOutLocation: {
          latitude: defaultOffice.lat,
          longitude: defaultOffice.lng,
          address: "Office 1 (Bypassed due to GPS error/timeout - Needs Review)"
        },
        checkOutPhoto: photo,
        shipments: shipments,
        earnings: earnings,
        hoursWorked: hoursWorked,
        status: 'PRESENT',
        reviewNeeded: true,
        barcodes,
        customerValue: parseFloat(customerValue) || 0,
        erpValue: parseFloat(erpValue) || 0,
        valueDifference: (parseFloat(erpValue) || 0) - (parseFloat(customerValue) || 0),
        selectedPinCodes: pinCodesList
      };

      if (canTrackMileage && odometerEndInput !== undefined && !isNaN(odometerEndInput)) {
        const startOdo = todayRecord.odometerStart || 0;
        distanceDriven = odometerEndInput - startOdo;
        
        if (distanceDriven < 0) {
           throw new Error(`${t.outBox} cannot be less than ${t.inBox}`);
        }
        
        updates.odometerEnd = odometerEndInput;
        updates.distanceDriven = distanceDriven;
      }

      await SupabaseService.update('attendance', todayRecord.id, updates);
      
      try {
        await SupabaseService.update('live_locations', user.id, { status: 'INACTIVE' });
      } catch (e) {
        console.warn("Failed to stop tracking on checkout:", e);
      }

      setTodayRecord(null);
      setHistory(prev => {
        const index = prev.findIndex(r => r.id === todayRecord.id);
        if (index > -1) {
          const updated = [...prev];
          updated[index] = { ...updated[index], ...updates };
          return updated;
        }
        return prev;
      });

      toast.success("Checked out using GPS Bypass! Needs supervisor review. / জিপিএস বাইপাস দিয়ে চেক-আউট করা হয়েছে! সুপারভাইজার রিভিউ করবেন।");
      setShowLocationErrorModal(false);
      setLocationErrorModalConfig(null);
      setShowOdoModal(false);
      setShowCamera(false);
      setCapturedPhoto(null);
    } catch (err: any) {
      console.error("Bypassed check-out error:", err);
      toast.error(err.message || "Failed to bypass check-out.");
    } finally {
      setIsCheckingOut(false);
    }
  };

  const proceedCheckOut = async (photo: string, odometerEndInput?: number, pinCodesList: string[] = []) => {
    if (!user) return;
    if (!todayRecord?.id) {
      console.error("No active attendance record found for checkout:", todayRecord);
      toast.error("Internal Error: No active session found. Please refresh and try again. / অভ্যন্তরীণ সমস্যা: কোনো সক্রিয় সেশন পাওয়া যায়নি। দয়া করে রিফ্রেশ করে পুনরায় চেষ্টা করুন।");
      return;
    }

    setIsCheckingOut(true);
    try {
      // 1. Get Location with robust helper
      let pos: GeolocationPosition;
      try {
        pos = await getRobustLocation();
      } catch (e: any) {
        console.warn("Location check-out error, using fallback modal:", e);
        setLocationErrorModalConfig({
          mode: 'OUT',
          photo,
          odometerEndInput,
          pinCodesList,
          originalError: e.message || "Location request timed out. / লোকেশন রিকোয়েস্ট টাইমড আউট হয়েছে।"
        });
        setShowLocationErrorModal(true);
        setIsCheckingOut(false);
        return;
      }

      // 2. Geofencing check (keep as is but with slightly wider margin or more helpful message)
      const isWithinRange = OFFICE_LOCATIONS.some(office => {
        const dist = getDistanceInMeters(
          pos.coords.latitude, 
          pos.coords.longitude, 
          office.lat, 
          office.lng
        );
        return dist <= MAX_DISTANCE_METERS;
      });

      if (!isWithinRange) {
        if ("Notification" in window && Notification.permission === 'granted') {
          new Notification(`${translations.en.appName} / ${translations.bn.appName}`, {
            body: `${translations.en.notAtOffice}\n${translations.bn.notAtOffice}`,
            icon: '/icon.png'
          });
        }
        setLocationErrorModalConfig({
          mode: 'OUT',
          photo,
          odometerEndInput,
          pinCodesList,
          originalError: `You are not within range of any office. / আপনি অফিসের ৫০০ মিটারের মধ্যে নেই। (Detected: Lat ${pos.coords.latitude.toFixed(4)}, Lng ${pos.coords.longitude.toFixed(4)})`
        });
        setShowLocationErrorModal(true);
        setIsCheckingOut(false);
        return;
      }

      const shipments = parseInt(shipmentCount) || 0;
      let earnings = (user.rate || 0);
      
      if (user.jobTitle === 'NDA') {
        earnings = shipments * (user.rate || 0);
      } else if (user.paymentBase === 'PER_SHIPMENT') {
        earnings = shipments * (user.rate || 0);
      }

      const checkoutTime = new Date().toISOString();
      const diffMinutes = differenceInMinutes(new Date(checkoutTime), new Date(todayRecord.checkInTime));
      const hoursWorked = +(diffMinutes / 60).toFixed(2);

      let distanceDriven = 0;
      let reviewNeeded = false;
      
      const updates: any = {
        checkOutTime: checkoutTime,
        checkOutLocation: {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude
        },
        checkOutPhoto: photo,
        shipments: shipments,
        earnings: earnings,
        hoursWorked: hoursWorked,
        status: 'PRESENT', // Keep present or use todayRecord.status
        barcodes,
        customerValue: parseFloat(customerValue) || 0,
        erpValue: parseFloat(erpValue) || 0,
        valueDifference: (parseFloat(erpValue) || 0) - (parseFloat(customerValue) || 0),
        selectedPinCodes: pinCodesList
      };

      if (canTrackMileage && odometerEndInput !== undefined && !isNaN(odometerEndInput)) {
        const startOdo = todayRecord.odometerStart || 0;
        distanceDriven = odometerEndInput - startOdo;
        
        if (distanceDriven < 0) {
           throw new Error(`${t.outBox} cannot be less than ${t.inBox}`);
        }
        
        updates.odometerEnd = odometerEndInput;
        updates.distanceDriven = distanceDriven;
        
        if (distanceDriven < 0.1) {
          reviewNeeded = true;
        }
      }

      updates.reviewNeeded = reviewNeeded;

      try {
        await SupabaseService.update('attendance', todayRecord.id, updates);
        
        // Clear tracking data on check-out as requested
        try {
          // Delete live location entry
          await SupabaseService.deleteWhere('live_locations', [{ column: 'userId', value: user.id }]);
          
          // Delete today's logs
          const today = format(new Date(), 'yyyy-MM-dd');
          await SupabaseService.deleteWhere('location_logs', [
            { column: 'userId', value: user.id },
            { column: 'timestamp', value: today, operator: 'gte' }
          ]);
        } catch (clearErr) {
          console.warn("Tracking data cleanup failed:", clearErr);
        }

        setTodayRecord(prev => prev ? { ...prev, ...updates } : null);
      } catch (dbErr) {
        console.error("Check-out failed:", dbErr);
        throw dbErr;
      }
      
      toast.success(`${translations.en.checkOutSuccess}\n${translations.bn.checkOutSuccess}`);
      setShipmentCount('');
      setShowCamera(false);
      setCapturedPhoto(null);
    } catch (err: any) {
      console.error("Check-out error:", err);
      let message = err.message;
      try {
        const parsed = JSON.parse(err.message);
        message = `Database Error: ${parsed.error}`;
      } catch {
        // Not a JSON error
      }
      toast.error(message || "Failed to complete check-out. Please try again.");
    } finally {
      setIsCheckingOut(false);
    }
  };

  const handleOdoSubmit = async () => {
    const trimmedOdo = tempOdo.trim();
    if (!trimmedOdo) {
      toast.error("দয়া করে কিলোমিটার রিডিং লিখুন। (Please enter odometer reading)");
      return;
    }

    const val = parseFloat(trimmedOdo);
    
    // Detailed validation
    if (isNaN(val)) {
      toast.error(`${translations.en.invalidOdometer}\n${translations.bn.invalidOdometer}`);
      return;
    }
    
    if (val < 0) {
      toast.error(`${translations.en.odoNegative}\n${translations.bn.odoNegative}`);
      return;
    }

    if (val > 1000000) {
      if (!window.confirm(t.odoTooLarge)) {
        return;
      }
    }

    if (odoMode === 'IN') {
      await proceedCheckIn(capturedPhoto!, val);
      setShowOdoModal(false);
    } else {
      const startOdo = todayRecord?.odometerStart || 0;
      if (val < startOdo) {
        toast.error(`${translations.en.odoLowerThanStart}\n${translations.bn.odoLowerThanStart}`);
        return;
      }
      
      if (selectedPins.length === 0) {
        toast.error("দয়া করে অন্তত একটি পিন কোড সিলেক্ট করুন। (Please select at least one PIN Code to continue)");
        return;
      }

      await proceedCheckOut(capturedPhoto!, val, selectedPins);
      setShowOdoModal(false);
    }
  };

  const monthlyEarnings = React.useMemo(() => history.filter(r => r.status !== 'FRAUDULENT').reduce((sum, rec) => sum + (rec.earnings || 0), 0), [history]);
  const monthlyMileage = React.useMemo(() => history.filter(r => r.status !== 'FRAUDULENT').reduce((sum, rec) => sum + (rec.distanceDriven || 0), 0), [history]);
  const isPaydayToday = React.useMemo(() => paydays.some(p => p.date === format(new Date(), 'yyyy-MM-dd')), [paydays]);

  return (
    <div className="flex flex-col min-h-screen bg-bg-app text-text-primary font-sans">
      <AnimatePresence>
        {notificationPermission === 'default' && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            className="bg-accent-blue text-white py-1.5 px-6 flex items-center justify-between gap-3 overflow-hidden"
          >
            <div className="flex items-center gap-2">
              <Zap className="h-3 w-3 animate-pulse" />
              <span className="text-[9px] font-bold uppercase tracking-widest leading-none">
                {language === 'bn' 
                  ? "সঠিক সময় হাজিরা দিতে নোটিফিকেশন চালু করুন"
                  : "Enable notifications for shift reminders"}
              </span>
            </div>
            <button 
              onClick={async () => {
                const res = await Notification.requestPermission();
                setNotificationPermission(res);
              }}
              className="bg-white text-accent-blue px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-tighter shadow-sm active:scale-95 transition-transform"
            >
              Enable
            </button>
          </motion.div>
        )}
        {!isOnline && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-accent-red text-white text-[10px] font-black uppercase tracking-widest py-2 px-6 flex items-center justify-center gap-2 overflow-hidden sticky top-0 z-[60]"
          >
            <WifiOff className="h-3 w-3" />
            OFFLINE MODE: DATA SAVED LOCALLY (অফলাইন মোড: ডাটা ফোনে সেভ হচ্ছে)
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Aesthetic Blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-[-1]">
        <motion.div 
          animate={{ 
            scale: [1, 1.2, 1],
            rotate: [0, 90, 0],
            x: [0, 50, 0],
            y: [0, 30, 0]
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute top-[-10%] left-[-10%] w-[400px] h-[400px] bg-accent-blue/5 rounded-full blur-[100px]"
        />
        <motion.div 
          animate={{ 
            scale: [1, 1.3, 1],
            rotate: [0, -90, 0],
            x: [0, -50, 0],
            y: [0, -30, 0]
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-accent-indigo/5 rounded-full blur-[120px]"
        />
      </div>

      {/* Header Bar */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-100 p-4 pb-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <motion.label 
            whileHover={{ scale: 1.05 }}
            className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-accent-blue/30 to-accent-indigo/30 p-[1px] relative cursor-pointer group shadow-lg"
          >
            <div className="w-full h-full bg-slate-900 rounded-2xl overflow-hidden shadow-inner border border-white/20 flex items-center justify-center">
              {isUpdatingProfile ? (
                <div className="w-full h-full flex items-center justify-center bg-accent-blue/10">
                   <div className="w-5 h-5 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
                </div>
              ) : user?.profilePicture ? (
                <img src={user.profilePicture} alt={user.name} className="w-full h-full object-cover grayscale-[0.1] contrast-[1.1]" />
              ) : (
                <span className="text-white font-black text-xl">{user?.name?.charAt(0) || '?'}</span>
              )}
            </div>
            <div className="absolute inset-x-0 bottom-0 h-1/3 bg-black/60 backdrop-blur-sm rounded-b-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
              <Camera className="h-4 w-4 text-white" />
            </div>
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              onChange={handleProfilePictureChange}
              disabled={isUpdatingProfile}
            />
          </motion.label>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
               <h1 className="text-sm font-black text-white tracking-widest uppercase italic shimmer-text leading-tight">
                 {user?.name.split(' ')[0]}
               </h1>
               <div className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-accent-green shadow-[0_0_10px_rgba(16,185,129,0.6)]' : 'bg-accent-red'} animate-pulse`} title={isOnline ? "Cloud Sync Active" : "Local Mode"} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-black text-slate-100 tracking-[0.2em] uppercase bg-white/5 px-2 py-0.5 rounded border border-white/10">
                {user?.jobTitle} • {isOnline ? 'CLOUD LIVE' : 'OFFLINE MODE'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
           <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowChat(true)}
            className="p-3 card-glass-bright rounded-2xl text-accent-blue relative hover:shadow-lg hover:shadow-accent-blue/10 transition-all border border-slate-200"
          >
            <MessageSquare className="h-5 w-5" />
            <motion.div 
               animate={{ scale: [1, 1.2, 1] }}
               transition={{ repeat: Infinity, duration: 2 }}
               className="absolute -top-1 -right-1 w-3 h-3 bg-accent-red rounded-full border-2 border-white shadow-sm"
            />
          </motion.button>
          <motion.button 
            whileTap={{ scale: 0.9 }}
            onClick={logout}
            className="p-3 card-glass-bright rounded-2xl text-slate-500 hover:text-accent-red transition-all border border-slate-200"
          >
            <LogOut className="h-5 w-5" />
          </motion.button>
        </div>
      </header>

      {/* Employee Mobile Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 z-50 px-2 pb-8 pointer-events-none flex justify-center">
        <motion.div 
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", damping: 25, stiffness: 200, delay: 0.2 }}
          className="card-glass rounded-[40px] border border-slate-200/50 p-2 flex items-center justify-start sm:justify-center gap-1 shadow-2xl pointer-events-auto overflow-x-auto scrollbar-hide relative snap-x snap-mandatory w-fit max-w-full lg:max-w-[600px] min-h-[90px]"
        >
          <div className="absolute inset-x-0 -top-8 h-8 pointer-events-none flex justify-center">
             <div className="w-12 h-1 bg-slate-400/20 rounded-full" />
          </div>
          <div className="absolute inset-0 bg-gradient-to-tr from-accent-blue/10 via-transparent to-accent-indigo/10 opacity-50 pointer-events-none rounded-[40px]" />
          
          <motion.button
            whileTap={{ scale: 0.9 }}
            whileHover={{ scale: 1.05 }}
            onClick={() => setActiveView('SHIFT')}
            className={cn(
              "flex flex-col items-center justify-center gap-1 min-w-[72px] sm:min-w-[85px] flex-shrink-0 transition-all duration-500 relative py-4 px-1 sm:px-2 rounded-3xl z-10 snap-center",
              activeView === 'SHIFT' 
                ? "text-white bg-accent-blue shadow-lg shadow-accent-blue/40 ring-4 ring-accent-blue/10" 
                : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
            )}
          >
            <Clock className={cn("h-6 w-6 transition-transform duration-500", activeView === 'SHIFT' && "scale-110 drop-shadow-sm")} />
            <span className="text-[8px] font-black uppercase tracking-widest whitespace-nowrap">Shift</span>
            {activeView === 'SHIFT' && (
              <motion.div 
                layoutId="navTabIndicator"
                className="absolute inset-0 bg-accent-blue rounded-3xl -z-10"
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
          </motion.button>

          <motion.button
             whileTap={todayRecord ? { scale: 0.9 } : undefined}
             whileHover={todayRecord ? { scale: 1.05 } : undefined}
             onClick={() => {
               if (!todayRecord) {
                 toast.warning("Check-In required first! / আগে চেক-ইন করুন।");
                 return;
               }
               setActiveView('MISMATCH');
             }}
             className={cn(
               "flex flex-col items-center justify-center gap-1 min-w-[72px] sm:min-w-[85px] flex-shrink-0 transition-all duration-500 relative py-4 px-1 sm:px-2 rounded-3xl z-10 snap-center",
               activeView === 'MISMATCH' 
                 ? "text-white shadow-lg shadow-accent-cyan/40 ring-4 ring-accent-cyan/10" 
                 : "text-slate-400 hover:text-slate-600 hover:bg-slate-50",
               !todayRecord && "opacity-40 grayscale"
             )}
          >
            <Barcode className={cn("h-6 w-6 transition-transform duration-500", activeView === 'MISMATCH' && "scale-110")} />
            <span className="text-[8px] font-black uppercase tracking-widest whitespace-nowrap">Mismatch</span>
            {activeView === 'MISMATCH' && (
              <motion.div 
                layoutId="navTabIndicator"
                className="absolute inset-0 bg-accent-cyan rounded-3xl -z-10"
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
          </motion.button>

          {(!user?.jobTitle?.toUpperCase().includes('DRIVER') && !user?.paymentBase?.toUpperCase().includes('DRIVER')) && (
            <motion.button
              whileTap={todayRecord ? { scale: 0.9 } : undefined}
              whileHover={todayRecord ? { scale: 1.05 } : undefined}
              onClick={() => {
                if (!todayRecord) {
                  toast.warning("Check-In required first! / আগে চেক-ইন করুন।");
                  return;
                }
                setActiveView('ADHOC');
              }}
              className={cn(
                "flex flex-col items-center justify-center gap-1 min-w-[72px] sm:min-w-[85px] flex-shrink-0 transition-all duration-500 relative py-4 px-1 sm:px-2 rounded-3xl z-10 snap-center",
                activeView === 'ADHOC' 
                  ? "text-white shadow-lg shadow-accent-indigo/40 ring-4 ring-accent-indigo/10" 
                  : "text-slate-400 hover:text-slate-600 hover:bg-slate-50",
                !todayRecord && "opacity-40 grayscale"
              )}
            >
              <Plus className={cn("h-6 w-6 transition-transform duration-500", activeView === 'ADHOC' && "scale-110")} />
              <span className="text-[8px] font-black uppercase tracking-widest whitespace-nowrap">AD-HOC</span>
              {activeView === 'ADHOC' && (
                <motion.div 
                  layoutId="navTabIndicator"
                  className="absolute inset-0 bg-accent-indigo rounded-3xl -z-10"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
            </motion.button>
          )}

          <motion.button
            whileTap={{ scale: 0.9 }}
            whileHover={{ scale: 1.05 }}
            onClick={() => setActiveView('COUNTER')}
            className={cn(
              "flex flex-col items-center justify-center gap-1 min-w-[72px] sm:min-w-[85px] flex-shrink-0 transition-all duration-500 relative py-4 px-1 sm:px-2 rounded-3xl z-10 snap-center",
              activeView === 'COUNTER' 
                ? "text-white shadow-lg shadow-indigo-600/40 ring-4 ring-indigo-600/10" 
                : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
            )}
          >
            <Calculator className={cn("h-6 w-6 transition-transform duration-500", activeView === 'COUNTER' && "scale-110")} />
            <span className="text-[8px] font-black uppercase tracking-widest whitespace-nowrap">Counter</span>
            {activeView === 'COUNTER' && (
              <motion.div 
                layoutId="navTabIndicator"
                className="absolute inset-0 bg-indigo-600 rounded-3xl -z-10"
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.9 }}
            whileHover={{ scale: 1.05 }}
            onClick={() => setActiveView('HISTORY')}
            className={cn(
              "flex flex-col items-center justify-center gap-1 min-w-[72px] sm:min-w-[85px] flex-shrink-0 transition-all duration-500 relative py-4 px-1 sm:px-2 rounded-3xl z-10 snap-center",
              activeView === 'HISTORY' 
                ? "text-white shadow-lg shadow-slate-900/40 ring-4 ring-slate-900/10" 
                : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
            )}
          >
            <History className={cn("h-6 w-6 transition-transform duration-500", activeView === 'HISTORY' && "scale-110")} />
            <span className="text-[8px] font-black uppercase tracking-widest whitespace-nowrap">History</span>
            {activeView === 'HISTORY' && (
              <motion.div 
                layoutId="navTabIndicator"
                className="absolute inset-0 bg-black rounded-3xl -z-10"
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
          </motion.button>
        </motion.div>
      </div>

      <div className="p-6 space-y-6 pb-40">
        <AnimatePresence mode="wait">
          {!todayRecord ? (
            <motion.div 
              key="no-session"
              initial="hidden"
              animate="show"
              exit="exit"
              variants={{
                show: { 
                  transition: { 
                    staggerChildren: 0.1,
                    delayChildren: 0.1
                  } 
                }
              }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="space-y-6"
            >
              {/* Urgent Check-in Prompt */}
              <motion.div 
                variants={{
                  hidden: { opacity: 0, y: 20 },
                  show: { opacity: 1, y: 0 }
                }}
                className="bg-amber-500/10 backdrop-blur-xl border border-amber-500/30 p-6 rounded-[32px] text-center space-y-3 shadow-2xl relative overflow-hidden group"
              >
                <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/5 to-transparent pointer-events-none" />
                <div className="w-14 h-14 bg-amber-500/20 text-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-1 shadow-inner relative z-10">
                  <AlertTriangle className="h-7 w-7 animate-pulse" />
                </div>
                <h2 className="text-xl font-black text-amber-600 uppercase tracking-tight relative z-10 italic">Check-In Required</h2>
                <p className="text-[10px] text-slate-600 font-bold leading-relaxed uppercase tracking-widest relative z-10">
                  সব ফিচার ব্যবহার করার জন্য প্রথমে চেক-ইন করুন। <br />
                  <span className="opacity-60 font-medium">Tap below to join duty</span>
                </p>
              </motion.div>

              <motion.div 
                variants={{
                  hidden: { opacity: 0, y: 20 },
                  show: { opacity: 1, y: 0 }
                }}
                className="card-glass rounded-[40px] overflow-hidden flex flex-col shadow-2xl border border-white/10"
              >
                <div className="p-8 pb-4 flex flex-col items-center text-center space-y-6">
                  <motion.div 
                    animate={{ scale: [1, 1.05, 1], rotate: [0, 5, -5, 0] }}
                    transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
                    className="w-24 h-24 rounded-[32px] flex items-center justify-center bg-accent-blue/10 text-accent-blue shadow-[0_0_40px_rgba(14,165,233,0.1)] relative group"
                  >
                    <div className="absolute inset-0 border border-accent-blue/30 rounded-[32px] animate-ping opacity-20" />
                    <LogIn className="h-12 w-12 text-accent-blue relative z-10" />
                  </motion.div>
                  <div className="space-y-1">
                    <h3 className="text-3xl font-black text-slate-900 tracking-tighter uppercase italic">{t.notCheckedIn}</h3>
                    <p className="text-[10px] text-accent-blue font-black uppercase tracking-[0.4em] opacity-80">
                      {format(new Date(), 'EEEE, dd MMMM')}
                    </p>
                  </div>
                </div>

                <div className="px-10 pb-10 space-y-6">
                  <div className="space-y-4">
                    <motion.button
                      whileTap={{ scale: 0.96 }}
                      whileHover={{ scale: 1.03, boxShadow: "0 0 30px rgba(14,165,233,0.3)" }}
                      onClick={handleCheckIn}
                      disabled={isCheckingIn || !isOnline}
                      className="w-full h-20 bg-gradient-to-r from-accent-blue to-accent-indigo hover:opacity-95 text-white rounded-3xl flex flex-col items-center justify-center transition-all shadow-2xl shadow-accent-blue/25 disabled:opacity-50 disabled:pointer-events-none group"
                    >
                      {isCheckingIn ? (
                        <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          <div className="flex items-center gap-3">
                             <LogIn className="h-6 w-6 group-hover:translate-x-1 transition-transform" />
                             <span className="text-lg font-black uppercase tracking-[0.2em]">{t.checkIn}</span>
                          </div>
                          <span className="text-[8px] font-black opacity-60 uppercase tracking-widest mt-1">Tap for secure verification</span>
                        </>
                      )}
                    </motion.button>
                    <div className="flex items-center justify-center gap-3">
                      <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
                        <Wifi className={cn("h-3 w-3", isOnline ? "text-accent-green" : "text-accent-red")} />
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                          {t.status}: {isOnline ? t.online : t.offline}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>

            {/* Added Calendar for Paydays Visibility even before check-in */}
            <motion.div 
              variants={{
                hidden: { opacity: 0, scale: 0.95 },
                show: { opacity: 1, scale: 1 }
              }}
              className="space-y-6 mt-8 pb-12"
            >
              <div className="flex items-center justify-between px-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-accent-blue/20 rounded-2xl flex items-center justify-center text-accent-blue shadow-inner">
                    <Calendar className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-900 italic leading-none mb-1">Performance Calendar</h3>
                    <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Attendance & Salary Logs</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-accent-green/20 border border-accent-green/30 px-3 py-1.5 rounded-full">
                  <div className="w-1.5 h-1.5 bg-accent-green rounded-full animate-pulse" />
                  <span className="text-[8px] font-black text-accent-green uppercase tracking-widest italic">Live Sync</span>
                </div>
              </div>

              <motion.div 
                whileHover={{ scale: 1.01 }}
                className="card-glass border border-white/20 rounded-[32px] p-1 shadow-2xl relative overflow-hidden group"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-accent-blue/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <AttendanceCalendar 
                  userId={user!.id} 
                  userName={user!.name} 
                  paydays={paydays}
                />
              </motion.div>

              <div className="bg-white/10 border border-white/10 rounded-2xl p-4 flex items-center gap-4 relative overflow-hidden group/hint">
                <div className="absolute inset-0 bg-accent-indigo/10 opacity-0 group-hover/hint:opacity-100 transition-opacity" />
                <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-xl group-hover/hint:scale-110 transition-transform">💰</div>
                <p className="flex-1 text-[10px] font-bold text-slate-200 uppercase tracking-[0.1em] leading-relaxed italic">
                  Check <span className="text-white font-black">💰 symbols</span> to know your scheduled salary dates. / আপনার বেতন প্রদানের তারিখ জানতে <span className="text-accent-green font-black">💰 চিহ্নটি</span> দেখুন।
                </p>
              </div>
          </motion.div>
        </motion.div>
      ) : (
          <motion.div
            key={activeView}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ type: "spring", stiffness: 350, damping: 28 }}
            className="space-y-6"
          >
            {activeView === 'SHIFT' && (
              <motion.div
                key="shift-view-content"
                initial="hidden"
                animate="show"
                exit="hidden"
                variants={{
                  show: {
                    transition: {
                      staggerChildren: 0.12,
                      delayChildren: 0.1
                    }
                  },
                  hidden: {
                    transition: {
                      staggerChildren: 0.05,
                      staggerDirection: -1
                    }
                  }
                }}
                className="space-y-6"
              >
                {/* Payday Alert */}
        <AnimatePresence>
          {isPaydayToday && (
            <motion.div 
              variants={{
                hidden: { opacity: 0, scale: 0.9, y: 15 },
                show: { opacity: 1, scale: 1, y: 0 }
              }}
              className="bg-accent-green text-white p-4 rounded-2xl shadow-lg shadow-accent-green/20 flex items-center justify-between overflow-hidden"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-2xl">
                  💰
                </div>
                <div>
                  <div className="text-sm font-black uppercase tracking-tight">It's Payday Today!</div>
                  <div className="text-[10px] text-white/80 font-bold uppercase tracking-widest italic">Visit office to collect your salary</div>
                </div>
              </div>
              <div className="text-3xl font-black animate-bounce">💲</div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Attendance Section */}
        <motion.div 
          variants={{
            hidden: { opacity: 0, y: 30 },
            show: { opacity: 1, y: 0 }
          }}
          className="space-y-4"
        >
          <div className="card-glass rounded-[40px] overflow-hidden flex flex-col shadow-2xl border border-white/10 transition-all duration-500">
            <div className="p-8 pb-4 flex flex-col items-center text-center space-y-6">
              <motion.div 
                whileHover={{ scale: 1.05, rotate: 5 }}
                className={cn(
                "w-24 h-24 rounded-[32px] flex items-center justify-center transition-all duration-500 shadow-2xl relative group",
                !todayRecord ? "bg-accent-blue/10 text-accent-blue" : (todayRecord.checkOutTime ? "bg-accent-green/10 text-accent-green" : "bg-accent-blue/20 text-accent-blue")
              )}>
                <div className="absolute inset-0 bg-white/5 rounded-[32px] blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                {!todayRecord ? <LogIn className="h-12 w-12 animate-pulse" /> : (todayRecord.checkOutTime ? <ShieldCheck className="h-12 w-12 text-accent-green" /> : <Clock className="h-12 w-12 animate-pulse text-accent-blue drop-shadow-[0_0_10px_rgba(14,165,233,0.5)]" />)}
              </motion.div>
              <div className="space-y-1">
                <h3 className="text-3xl font-black text-slate-900 tracking-tighter uppercase italic leading-none">
                  {!todayRecord ? t.notCheckedIn : (todayRecord.checkOutTime ? t.shiftEnded : t.onDuty)}
                </h3>
                <p className="text-[10px] text-accent-cyan font-black uppercase tracking-[0.4em] opacity-80 shimmer-text">
                  {format(new Date(), 'EEEE, dd MMMM')}
                </p>
                <div className="flex justify-center gap-2 mt-4">
                </div>
                {todayRecord && (
                  <div className="flex justify-center pt-2">
                  </div>
                )}
              </div>
            </div>

            {/* Main Finance Summary Card - High Visibility */}
            <motion.div 
              variants={{
                hidden: { opacity: 0, y: 20 },
                show: { opacity: 1, y: 0 }
              }}
              className="grid grid-cols-2 gap-4 px-4 pb-6"
            >
              <motion.div 
                whileHover={{ y: -6, scale: 1.03, boxShadow: "0 20px 40px -12px rgba(0,0,0,0.1)" }}
                whileTap={{ scale: 0.98 }}
                className="bg-white border border-slate-200 p-5 rounded-[32px] flex flex-col items-center justify-center text-center shadow-sm relative overflow-hidden transition-all duration-300"
              >
                <div className="absolute top-3 right-3 w-1.5 h-1.5 bg-accent-green rounded-full animate-pulse shadow-[0_0_8px_#10b981]" />
                <div className="text-[9px] font-black uppercase text-slate-500 tracking-widest mb-1">Today Earnings</div>
                <div className="text-2xl font-black text-slate-900 flex items-baseline gap-1">
                  <span className="text-sm font-bold text-accent-green">₹</span>
                  {todayEarnings.toLocaleString()}
                </div>
              </motion.div>
              
              <motion.div 
                whileHover={{ y: -4 }}
                className="bg-white border border-slate-200 p-5 rounded-[32px] flex flex-col items-center justify-center text-center shadow-sm relative overflow-hidden"
              >
                <div className="absolute top-3 right-3 w-1.5 h-1.5 bg-accent-blue rounded-full animate-pulse shadow-[0_0_8px_#0ea5e9]" />
                <div className="text-[9px] font-black uppercase text-slate-500 tracking-widest mb-1">Month Total</div>
                <div className="text-2xl font-black text-slate-900 flex items-baseline gap-1">
                  <span className="text-sm font-bold text-accent-blue">₹</span>
                  {totalMonthlyEarnings.toLocaleString()}
                </div>
              </motion.div>
            </motion.div>

            <div className="px-6 pb-10 space-y-8">
               {!todayRecord.checkOutTime ? (
                <div className="space-y-8">
                  {/* Active Shift Details */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 rounded-3xl p-5 border border-slate-200 flex flex-col gap-1 items-center justify-center text-center">
                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">{t.inAt}</span>
                      <span className="text-lg font-black text-slate-900 italic underline decoration-accent-blue/30 underline-offset-4">{format(new Date(todayRecord.checkInTime), 'hh:mm a')}</span>
                    </div>
                    {canTrackMileage && (
                      <div className="bg-slate-50 rounded-3xl p-5 border border-slate-200 flex flex-col gap-1 items-center justify-center text-center">
                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">{t.startOdo}</span>
                        <span className="text-lg font-black text-slate-900 italic underline decoration-accent-indigo/30 underline-offset-4">{todayRecord.odometerStart} <span className="text-[10px] font-bold text-slate-500 uppercase">KM</span></span>
                      </div>
                    )}
                  </div>

                  {/* Payment Specific Inputs */}
                  {(user?.paymentBase === 'PER_SHIPMENT' || user?.jobTitle === 'NDA') && (
                    <motion.div 
                      layout
                      className="bg-gradient-to-br from-white/10 to-transparent p-6 rounded-[32px] border border-white/10 space-y-6 shadow-2xl relative group overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-accent-blue/5 opacity-0 group-focus-within:opacity-100 transition-opacity pointer-events-none" />
                      <div className="flex items-center justify-between relative z-10">
                        <label className="text-[10px] font-black text-accent-cyan uppercase tracking-[0.2em] flex items-center gap-2">
                           <PackageCheck className="h-4 w-4" /> {user?.jobTitle === 'NDA' ? 'Daily Delivery Units' : t.shipments}
                        </label>
                      </div>
                      <div className="flex items-center justify-between gap-8 bg-black/20 p-5 rounded-3xl border border-white/5 shadow-inner relative z-10">
                        <motion.button 
                          whileTap={{ scale: 0.8 }}
                          onClick={() => setShipmentCount(prev => Math.max(0, (parseInt(prev) || 0) - 1).toString())}
                          className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center font-bold text-2xl text-accent-red border border-slate-200 active:bg-slate-50 transition-all shadow-sm"
                        >
                          -
                        </motion.button>
                        <div className="flex-1 text-center">
                          <input
                            type="number"
                            value={shipmentCount}
                            onChange={(e) => setShipmentCount(e.target.value)}
                            placeholder="0"
                            className="w-full bg-transparent text-6xl font-black outline-none tracking-tighter text-center text-white italic drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]"
                          />
                          <div className="text-[10px] font-black text-accent-blue uppercase tracking-[0.3em] mt-1">{t.units}</div>
                        </div>
                        <motion.button 
                          whileTap={{ scale: 0.8 }}
                          onClick={() => setShipmentCount(prev => ((parseInt(prev) || 0) + 1).toString())}
                          className="w-14 h-14 bg-accent-blue text-white rounded-2xl flex items-center justify-center font-bold text-2xl shadow-xl shadow-accent-blue/30 active:scale-110 transition-all border border-white/20"
                        >
                          +
                        </motion.button>
                      </div>
                    </motion.div>
                  )}

                  {/* Active Status Ribbon */}
                  <div className="bg-accent-blue/10 border border-accent-blue/20 rounded-3xl p-5 flex items-center justify-between relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-r from-accent-blue/5 to-transparent pointer-events-none" />
                    <div className="flex items-center gap-4 relative z-10">
                      <div className="relative">
                        <div className="w-4 h-4 bg-accent-blue rounded-full animate-ping opacity-20" />
                        <div className="absolute inset-0 w-4 h-4 bg-accent-blue rounded-full shadow-[0_0_15px_rgba(14,165,233,0.6)]" />
                      </div>
                      <div>
                        <div className="text-[11px] font-black text-white uppercase tracking-widest leading-none mb-1 flex items-center gap-2">
                           LIVE SHIFT MONITORING
                           <span className="bg-accent-blue text-white px-2 py-0.5 rounded text-[8px] font-bold shadow-lg">SAFE</span>
                        </div>
                        <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">AI Guarding your session security</div>
                      </div>
                    </div>
                  </div>

                   <div className="space-y-4">
                    <motion.button
                      whileTap={{ scale: 0.96 }}
                      whileHover={{ scale: 1.02 }}
                      onClick={handleCheckOut}
                      disabled={isCheckingOut || ((user.paymentBase === 'PER_SHIPMENT' || user.jobTitle === 'NDA') && !shipmentCount)}
                      className={cn(
                        "w-full h-20 text-white rounded-3xl flex flex-col items-center justify-center transition-all shadow-2xl relative overflow-hidden group",
                        (isCheckingOut || ((user.paymentBase === 'PER_SHIPMENT' || user.jobTitle === 'NDA') && !shipmentCount)) 
                          ? "bg-slate-800 text-slate-500 shadow-none grayscale opacity-40" 
                          : "bg-gradient-to-r from-accent-red to-orange-600 shadow-accent-red/25"
                      )}
                    >
                      {isCheckingOut ? (
                        <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          <div className="flex items-center gap-3">
                             <LogOut className="h-6 w-6 group-hover:translate-x-1 transition-transform" />
                             <span className="text-lg font-black uppercase tracking-[0.2em]">{t.checkOut}</span>
                          </div>
                          <span className="text-[8px] font-black opacity-60 uppercase tracking-widest mt-1 italic">Finish Duty & Submit Records</span>
                        </>
                      )}
                    </motion.button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6 pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/5 p-5 rounded-3xl border border-white/10 flex flex-col items-center justify-center text-center">
                       <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{t.earnings}</span>
                       <span className="text-2xl font-black text-accent-green italic">₹{todayRecord.earnings}</span>
                    </div>
                    <div className="bg-white/5 p-5 rounded-3xl border border-white/10 flex flex-col items-center justify-center text-center">
                       <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{t.hoursWorked}</span>
                       <span className="text-2xl font-black text-white italic">{todayRecord.hoursWorked || 0} hrs</span>
                    </div>
                  </div>
                  <div className="text-center p-3">
                    <span className="text-[10px] font-black text-accent-green uppercase bg-accent-green/10 border border-accent-green/20 px-6 py-3 rounded-full tracking-[0.2em] shadow-lg shadow-accent-green/5 animate-pulse">
                      Duty Complete • Securely Saved
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>

      {canTrackMileage && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-black uppercase tracking-tight text-slate-900 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-accent-blue" />
              {t.vehicleLog}
            </h3>
            <span className="text-[10px] font-black text-accent-blue bg-accent-blue/10 px-2 py-0.5 rounded-full uppercase">
              {t.active}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3">
             {/* Today's Active Trip */}
             <div className="bg-white border-2 border-accent-blue/20 rounded-3xl p-6 shadow-xl shadow-accent-blue/5 overflow-hidden relative">
                <div className="absolute top-0 right-0 p-4 opacity-5">
                  <MapPin className="h-24 w-24 -mr-8 -mt-8 rotate-12" />
                </div>
                
                <div className="relative z-10 space-y-6">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-accent-blue uppercase tracking-widest flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {t.today} {t.distanceDriven}
                      </span>
                      <div className="flex items-baseline gap-1">
                        <span className={cn(
                          "text-4xl font-black tracking-tighter",
                          todayRecord?.distanceDriven ? "text-accent-blue" : "text-text-secondary/20"
                        )}>
                          {(todayRecord?.distanceDriven || 0).toFixed(1)}
                        </span>
                        <span className="text-sm font-black text-accent-blue/60 uppercase">{t.km}</span>
                      </div>
                    </div>
                    {todayRecord?.checkInTime && (
                      <div className="text-right">
                        <span className="text-[10px] font-black text-text-secondary uppercase tracking-widest">Shift Time</span>
                        <div className="text-sm font-bold text-slate-900">{format(new Date(todayRecord.checkInTime), 'hh:mm a')} - {todayRecord.checkOutTime ? format(new Date(todayRecord.checkOutTime), 'hh:mm a') : 'Now'}</div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-app-border/50">
                    <div className="space-y-1">
                      <span className="text-[9px] font-black text-text-secondary/50 uppercase tracking-widest">{t.startOdometer}</span>
                      <div className="text-lg font-black text-slate-900">{todayRecord?.odometerStart || '--'} <span className="text-[10px] opacity-30 italic">{t.km}</span></div>
                    </div>
                    <div className="space-y-1 text-right">
                      <span className="text-[9px] font-black text-text-secondary/50 uppercase tracking-widest">{t.endOdometer}</span>
                      <div className="text-lg font-black text-slate-900">{todayRecord?.odometerEnd || '--'} <span className="text-[10px] opacity-30 italic">{t.km}</span></div>
                    </div>
                  </div>
                </div>
             </div>

             {/* Vehicle Usage Info */}
             <div className="bg-slate-900 rounded-2xl p-4 text-white flex items-center justify-between shadow-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                    <History className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.monthlyMileage}</div>
                    <div className="text-lg font-black text-white">{monthlyMileage} {t.km}</div>
                  </div>
                </div>
                <div className="text-right">
                   <div className="text-[8px] font-black text-accent-blue uppercase tracking-tighter bg-accent-blue/20 px-2 py-1 rounded">Verified Log</div>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* Stats Grid */}
        <div className="grid grid-cols-1 gap-3">
          {/* WhatsApp Live Call button removed as requested */}
        </div>
      </motion.div>
    )}

        {activeView === 'MISMATCH' && (
          <motion.div 
            key="mismatch-view"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            className="space-y-6 px-1"
          >
            <div className="card-glass border border-slate-200 rounded-[32px] p-8 text-slate-900 shadow-sm relative overflow-hidden group">
               <div className="absolute top-0 right-0 w-32 h-32 bg-accent-blue/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
               <h2 className="text-3xl font-black uppercase tracking-tight mb-1 italic leading-none">{t.valueMismatch}</h2>
               <p className="text-[10px] text-accent-blue font-black uppercase tracking-[0.3em] opacity-60">Record discrepancies with proof</p>
            </div>

            <div className="card-glass border border-slate-200 rounded-[40px] p-6 space-y-8 shadow-sm">
               <div className="flex flex-col gap-6">
                  <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-5">
                       <div className="w-14 h-14 bg-accent-blue/10 rounded-2xl flex items-center justify-center text-accent-blue shadow-inner">
                          <Barcode className="h-7 w-7" />
                       </div>
                       <div>
                          <div className="text-md font-black text-slate-900 uppercase italic tracking-widest leading-none mb-1">Barcodes</div>
                          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{barcodes.length}/20 Scanned</div>
                       </div>
                    </div>
                  </div>
               </div>

                  <div className="grid grid-cols-2 gap-4">
                      <motion.button 
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setShowBarcodeScanner(true)}
                        disabled={barcodes.length >= 20}
                        className="bg-accent-blue text-white h-16 rounded-2xl text-[10px] font-black uppercase tracking-widest flex flex-col items-center justify-center shadow-lg disabled:opacity-30 group"
                      >
                        <div className="flex items-center gap-2">
                           <Scan className="h-5 w-5" /> <span>Fast Scan</span>
                        </div>
                        <span className="text-[7px] text-white/60 font-bold mt-1 tracking-widest leading-none italic">AI POWERED</span>
                      </motion.button>
                     <motion.button 
                       whileTap={{ scale: 0.95 }}
                       onClick={handleAddManualBarcode}
                       disabled={barcodes.length >= 20}
                       className="bg-white border border-slate-200 text-slate-900 h-16 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-30 shadow-sm"
                     >
                       <Plus className="h-5 w-5 text-slate-400" /> {t.manualEntry}
                     </motion.button>
                  </div>

                  {barcodes.length > 0 && (
                    <div className="grid grid-cols-2 gap-3 max-h-56 overflow-y-auto pr-2">
                      {barcodes.map((code, idx) => (
                        <motion.div 
                          key={`barcode-${code}-${idx}`} 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex items-center justify-between shadow-sm"
                        >
                          <span className="text-[10px] font-black text-slate-700 truncate tracking-tight">{code}</span>
                          <button 
                            onClick={() => setBarcodes(prev => prev.filter((_, i) => i !== idx))}
                            className="text-accent-red/60 hover:text-accent-red p-1 transition-colors"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </motion.div>
                      ))}
                    </div>
                  )}

                  <div className="pt-4 border-t border-slate-100 space-y-8">
                    <div className="grid grid-cols-2 gap-5">
                      <div className="space-y-3">
                         <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block px-1 italic">Customer Value</label>
                         <div className="relative group">
                           <input 
                             type="number"
                             value={customerValue}
                             onChange={(e) => setCustomerValue(e.target.value)}
                             onClick={() => {
                               if (customerValue) {
                                 navigator.clipboard.writeText(customerValue);
                                 setShowCopiedIndicator(true);
                                 setTimeout(() => setShowCopiedIndicator(false), 2000);
                               }
                             }}
                             placeholder="0.00"
                             className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-sm font-black text-slate-900 outline-none focus:border-accent-blue transition-all cursor-pointer"
                           />
                           {showCopiedIndicator && (
                             <motion.div 
                               initial={{ scale: 0.5, opacity: 0 }}
                               animate={{ scale: 1, opacity: 1 }}
                               className="absolute -top-3 right-0 bg-accent-blue text-white text-[8px] font-black px-2 py-1 rounded-full shadow-lg"
                             >
                               COPIED!
                             </motion.div>
                           )}
                         </div>
                      </div>
                      <div className="space-y-3">
                         <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block px-1 italic">ERP Value</label>
                         <input 
                           type="number"
                           value={erpValue}
                           onChange={(e) => setErpValue(e.target.value)}
                           placeholder="0.00"
                           className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-sm font-black text-slate-900 outline-none focus:border-accent-blue transition-all"
                         />
                      </div>
                    </div>

                    <div className="bg-slate-50 rounded-3xl p-6 flex items-center justify-between border border-slate-200 relative overflow-hidden group">
                      <div className="flex items-center gap-4 relative z-10">
                         <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-400 border border-slate-100">
                            <Calculator className="h-6 w-6" />
                         </div>
                         <div className="text-[11px] font-black text-slate-500 uppercase tracking-widest italic">Variance Result</div>
                      </div>
                      <div className={cn(
                        "text-2xl font-black relative z-10",
                        difference < 0 ? "text-accent-red" : "text-accent-green"
                      )}>
                         ₹{(difference || 0).toFixed(2)}
                      </div>
                    </div>

                    {/* Photo Upload Section */}
                    {barcodes.length > 0 && erpValue && customerValue && (
                      <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-4"
                      >
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-1 italic">Proof of Discrepancy</label>
                        <div className="flex gap-4">
                          <motion.label 
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.98 }}
                            className={cn(
                              "flex flex-col items-center justify-center flex-1 h-44 border-2 border-dashed rounded-[32px] cursor-pointer transition-all relative overflow-hidden",
                              mismatchPhoto ? "border-accent-green/50 bg-accent-green/10" : "border-slate-200 hover:border-accent-blue bg-slate-50 card-glass"
                            )}
                          >
                            <div className="flex flex-col items-center justify-center px-4 relative z-10">
                              {isCompressing ? (
                                <RefreshCw className="h-8 w-8 text-accent-blue animate-spin" />
                              ) : mismatchPhoto ? (
                                <img src={mismatchPhoto} alt="Captured" className="h-32 w-auto rounded-3xl shadow-2xl ring-2 ring-white/10" />
                              ) : (
                                <>
                                  <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center mb-3">
                                     <Camera className="h-8 w-8 text-white opacity-40 group-hover:opacity-100 transition-opacity" />
                                  </div>
                                  <p className="text-[10px] font-black text-white/50 uppercase tracking-[0.2em] text-center">Capture Customer Value Photo</p>
                                  <span className="text-[8px] text-accent-cyan font-bold italic mt-1 opacity-60">GEOTAGGED • SECURE</span>
                                </>
                              )}
                            </div>
                            <input 
                              type="file" 
                              className="hidden" 
                              accept="image/*" 
                              capture="environment"
                              onChange={handlePhotoCapture}
                            />
                          </motion.label>
                          {mismatchPhoto && (
                            <motion.button 
                              whileTap={{ scale: 0.9 }}
                              onClick={() => setMismatchPhoto(null)}
                              className="bg-white text-accent-red p-4 rounded-[24px] self-end border border-slate-200 shadow-sm"
                            >
                              <Trash2 className="h-6 w-6" />
                            </motion.button>
                          )}
                        </div>
                      </motion.div>
                    )}

                    <motion.button
                      whileTap={{ scale: 0.96 }}
                      whileHover={{ scale: 1.02 }}
                      onClick={handleReportMismatch}
                      disabled={isSubmittingMismatch || isCompressing || !erpValue || !customerValue || barcodes.length === 0 || !mismatchPhoto}
                      className={cn(
                        "w-full h-24 rounded-[32px] flex flex-col items-center justify-center transition-all shadow-2xl relative overflow-hidden group",
                        (isSubmittingMismatch || isCompressing || !erpValue || !customerValue || barcodes.length === 0 || !mismatchPhoto) 
                          ? "bg-slate-800 text-slate-500 shadow-none saturate-0 opacity-40" 
                          : "bg-gradient-to-r from-accent-blue to-accent-indigo text-white shadow-accent-blue/20"
                      )}
                    >
                      {isSubmittingMismatch ? (
                        <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <div className="text-center relative z-10">
                          <div className="flex items-center justify-center gap-3 mb-1">
                             <Send className="h-6 w-6 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                             <span className="text-lg font-black uppercase tracking-[0.2em]">Submit Report</span>
                          </div>
                          <span className="text-[8px] font-black opacity-60 uppercase tracking-widest italic flex items-center justify-center gap-2">
                             <ShieldCheck className="h-3 w-3" /> Encrypted Submission to Admin Panel
                          </span>
                        </div>
                      )}
                    </motion.button>
                  </div>
               </div>

            {/* Today's Mismatch History */}
            {mismatches.length > 0 && new Date().getHours() >= 1 && (
              <div className="space-y-6 pt-4">
                <div className="flex items-center gap-6">
                  <div className="h-px flex-1 bg-white/5" />
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-[0.3em] px-2 italic underline decoration-accent-blue/30 underline-offset-4">Today's Summary</span>
                  <div className="h-px flex-1 bg-white/5" />
                </div>
                
                <div className="grid grid-cols-1 gap-4">
                  <div className="card-glass border border-white/10 rounded-[32px] p-6 shadow-2xl flex items-center justify-between group overflow-hidden">
                    <div className="absolute inset-0 bg-accent-blue/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="flex items-center gap-4 relative z-10">
                      <div className="w-12 h-12 bg-accent-blue/10 rounded-2xl flex items-center justify-center text-accent-blue shadow-inner group-hover:scale-110 transition-transform">
                        <Calculator className="h-6 w-6" />
                      </div>
                      <div>
                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Active Variance Total</div>
                        <div className="text-[8px] font-bold text-accent-blue uppercase tracking-widest">REALTIME CALCULATION</div>
                      </div>
                    </div>
                    <div className={cn(
                      "text-3xl font-black relative z-10 drop-shadow-[0_0_15px_rgba(255,255,255,0.1)] italic",
                      mismatches.reduce((sum, m) => sum + (m.valueDifference || 0), 0) < 0 ? "text-accent-red" : "text-accent-green"
                    )}>
                      ₹{Math.abs(mismatches.reduce((sum, m) => sum + (m.valueDifference || 0), 0)).toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] px-3 flex items-center gap-3">
                     RECENT DISCREPANCIES
                  </h3>
                  {mismatches.map((m, idx) => (
                    <motion.div 
                      key={`mismatch-${m.id || 'no-id'}-${idx}`} 
                      layout
                      className="card-glass border border-white/10 rounded-[40px] p-6 flex flex-col gap-6 shadow-2xl group overflow-hidden"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                           <div className="w-2 h-2 rounded-full bg-accent-blue animate-pulse" />
                           <div className="text-[11px] font-black text-white uppercase tracking-widest shimmer-text italic">
                              {m.timestamp ? format(new Date(m.timestamp), 'hh:mm a') : 'Unknown'}
                           </div>
                        </div>
                        <motion.button 
                          whileTap={{ scale: 0.9 }}
                          onClick={async () => {
                            if (window.confirm("Delete this record?")) {
                              try {
                                await SupabaseService.delete('mismatches', m.id!);
                                setMismatches(prev => prev.filter(item => item.id !== m.id));
                              } catch (err) {
                                console.error("Delete failed:", err);
                                toast.error("Failed to delete record.");
                              }
                            }
                          }}
                          className="p-3 bg-white/5 hover:bg-accent-red/20 text-slate-400 hover:text-accent-red rounded-2xl transition-all border border-white/5 shadow-inner"
                        >
                          <Trash2 className="h-4 w-4" />
                        </motion.button>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                         <div className="bg-white/5 rounded-3xl p-5 border border-white/5 group-hover:bg-white/10 transition-colors">
                            <span className="text-[8px] font-black text-slate-500 uppercase block mb-1 tracking-widest">ERP Value</span>
                            <span className="text-xl font-black text-white italic">₹{m.erpValue || 0}</span>
                         </div>
                         <div className="bg-white/5 rounded-3xl p-5 border border-white/5 group-hover:bg-white/10 transition-colors">
                            <span className="text-[8px] font-black text-slate-500 uppercase block mb-1 tracking-widest">Customer</span>
                            <span className="text-xl font-black text-white italic">₹{m.customerValue || 0}</span>
                         </div>
                      </div>

                      <div className="flex items-center justify-between px-2 py-3 bg-white/5 rounded-2xl border border-white/5">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic">Live Variance</span>
                        <span className={cn(
                          "text-2xl font-black italic",
                          (m.valueDifference || 0) < 0 ? "text-accent-red" : "text-accent-green"
                        )}>
                          {(m.valueDifference || 0) < 0 ? '-' : '+'}₹{Math.abs(m.valueDifference || 0).toLocaleString()}
                        </span>
                      </div>

                      {(m.customerPhoto || m.erpPhoto) && (
                        <div className="space-y-4 pt-2">
                          <motion.div 
                            whileHover={{ scale: 1.02 }}
                            className="relative aspect-video rounded-[32px] overflow-hidden border border-white/10 bg-slate-900 group/img cursor-zoom-in shadow-2xl"
                            onClick={() => window.open(m.customerPhoto || m.erpPhoto, '_blank')}
                          >
                            <img 
                              src={m.customerPhoto || m.erpPhoto} 
                              alt="Proof" 
                              className="w-full h-full object-cover grayscale-[0.2] contrast-[1.1] transition-all group-hover/img:scale-110 group-hover/img:grayscale-0"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 bg-accent-blue/10 mix-blend-overlay pointer-events-none" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                               <div className="bg-white/10 backdrop-blur-md p-4 rounded-full border border-white/20">
                                 <Eye className="w-8 h-8 text-white" />
                               </div>
                            </div>
                          </motion.div>
                          
                          <motion.button
                             whileTap={{ scale: 0.95 }}
                             onClick={(e) => {
                               e.stopPropagation();
                               const photoUrl = m.customerPhoto || m.erpPhoto;
                               if (photoUrl) {
                                 const a = document.createElement('a');
                                 a.href = photoUrl;
                                 a.download = `Mismatch_${m.date}.jpg`;
                                 a.target = "_blank";
                                 document.body.appendChild(a);
                                 a.click();
                                 document.body.removeChild(a);
                               }
                             }}
                             className="w-full py-4 bg-slate-50 hover:bg-slate-100 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all border border-slate-200 text-slate-600"
                          >
                            <Download className="w-4 h-4 text-accent-blue" /> Backup proof to Gallery
                          </motion.button>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {activeView === 'ADHOC' && (
          <motion.div 
             key="adhoc-view"
             initial={{ opacity: 0, x: 20 }}
             animate={{ opacity: 1, x: 0 }}
             exit={{ opacity: 0, x: -20 }}
             className="space-y-6 px-1"
          >
            {!todayRecord || todayRecord.checkOutTime ? (
              <div className="card-glass border border-white/20 rounded-[32px] p-6 flex flex-col items-center text-center space-y-6 shadow-2xl backdrop-blur-3xl relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-tr from-accent-red/10 to-transparent" />
                <div className="w-16 h-16 bg-accent-red/20 rounded-2xl flex items-center justify-center text-accent-red relative z-10">
                  <AlertTriangle className="h-8 w-8 animate-pulse" />
                </div>
                <div className="space-y-2 relative z-10">
                  <h2 className="text-xl font-black text-white uppercase italic tracking-tighter">OFF-DUTY ACCESS</h2>
                  <p className="text-[10px] text-slate-100 font-bold uppercase tracking-widest leading-relaxed">
                    আগে ডিউটিতে যোগ দিন (Check In) তারপর অ্যাড-হক রেকর্ড করতে পারবেন।
                  </p>
                </div>
                <motion.button 
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setActiveView('SHIFT')}
                  className="px-8 py-3.5 bg-gradient-to-r from-accent-blue to-accent-indigo text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl relative z-10 italic"
                >
                  START SHIFT NOW
                </motion.button>
              </div>
            ) : (user?.jobTitle?.toUpperCase().includes('DRIVER') || user?.paymentBase?.toUpperCase().includes('DRIVER')) ? (
              <div className="card-glass border border-white/20 rounded-[32px] p-6 flex flex-col items-center text-center space-y-6 shadow-2xl relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-tr from-accent-indigo/10 to-transparent" />
                <div className="w-16 h-16 bg-accent-indigo/20 rounded-2xl flex items-center justify-center text-accent-indigo relative z-10">
                  <ShieldCheck className="h-8 w-8" />
                </div>
                <div className="space-y-2 relative z-10">
                  <h2 className="text-xl font-black text-white uppercase italic tracking-tighter">RESTRICTED ZONE</h2>
                  <p className="text-[10px] text-slate-100 font-bold uppercase tracking-widest leading-relaxed">
                    অ্যাড-হক অপশনটি ড্রাইভারদের জন্য প্রযোজ্য নয়। <br />
                    (AD-HOC option is restricted for field roles only)
                  </p>
                </div>
                <motion.button 
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setActiveView('SHIFT')}
                  className="px-8 py-3 bg-white/10 border border-white/20 text-slate-100 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl relative z-10"
                >
                  BACK TO DASHBOARD
                </motion.button>
              </div>
            ) : (
              <>
            <div className="card-glass border border-slate-200 rounded-[24px] p-5 text-slate-900 shadow-sm relative overflow-hidden group">
                   <div className="absolute top-0 right-0 w-32 h-32 bg-accent-indigo/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                   <div className="flex items-center gap-4 relative z-10">
                      <div className="w-12 h-12 bg-accent-indigo/10 rounded-xl flex items-center justify-center text-accent-indigo shadow-inner">
                         <Plus className="h-6 w-6" />
                      </div>
                      <div>
                         <h2 className="text-xl font-black uppercase tracking-tight italic leading-none mb-1">AD-HOC</h2>
                         <p className="text-[9px] text-accent-indigo font-black uppercase tracking-widest opacity-90">Salary Support Logic</p>
                      </div>
                   </div>
                </div>

                <div className="card-glass border border-slate-200 rounded-[32px] p-6 shadow-sm space-y-8 group">
                  {/* Once per day notice */}
                  {hasSubmittedAdHocToday && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-accent-red/10 border border-accent-red/20 rounded-[24px] p-6 flex flex-col items-center text-center gap-3 relative overflow-hidden"
                    >
                      <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-accent-red shadow-sm border border-slate-200">
                        <AlertCircle className="h-6 w-6" />
                      </div>
                      <div className="space-y-1 relative z-10">
                        <div className="text-base font-black text-slate-900 uppercase italic tracking-tighter">
                          Submission Blocked
                        </div>
                        <div className="text-[9px] font-bold text-accent-red uppercase tracking-widest leading-tight">
                           Limit reached for today
                        </div>
                      </div>
                    </motion.div>
                  )}

                  <div className="space-y-6">
                    <div className="space-y-4">
                      <label className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] px-2 italic">Operational Assets</label>
                      <div className="grid grid-cols-2 gap-4">
                        {['TOTO', 'TATA ACE(107)', 'MOTOR VAN', 'ENGINE VAN'].map((v) => (
                          <motion.button
                            key={v}
                            whileTap={!hasSubmittedAdHocToday ? { scale: 0.95 } : undefined}
                            onClick={() => setSelectedVehicle(v as any)}
                            disabled={hasSubmittedAdHocToday}
                            className={cn(
                              "py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all duration-300",
                              selectedVehicle === v 
                                ? "bg-accent-indigo border-accent-indigo text-white shadow-lg" 
                                : "bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900",
                              hasSubmittedAdHocToday && "opacity-30 cursor-not-allowed"
                            )}
                          >
                            {v}
                          </motion.button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-5">
                      <div className="space-y-3">
                        <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest px-2 italic text-center w-full">Duty Start</label>
                        <input 
                          type="time" 
                          value={adHocStartTime}
                          onChange={(e) => setAdHocStartTime(e.target.value)}
                          disabled={hasSubmittedAdHocToday}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-6 text-xl font-black text-slate-900 outline-none focus:border-accent-blue transition-all disabled:opacity-30 text-center shadow-inner"
                        />
                      </div>
                      <div className="space-y-4">
                        <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest px-2 italic text-center w-full">Duty End</label>
                        <input 
                          type="time" 
                          value={adHocEndTime}
                          onChange={(e) => setAdHocEndTime(e.target.value)}
                          disabled={hasSubmittedAdHocToday}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-6 text-xl font-black text-slate-900 outline-none focus:border-accent-blue transition-all disabled:opacity-30 text-center shadow-inner"
                        />
                      </div>
                    </div>

                    {adHocStartTime && adHocEndTime && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-accent-blue/10 border border-accent-blue/10 rounded-[32px] p-6 flex items-center justify-between relative overflow-hidden"
                      >
                         <div className="text-[11px] font-black text-accent-blue uppercase tracking-widest italic relative z-10 flex items-center gap-3">
                            <Clock className="h-5 w-5" /> Duration
                         </div>
                         <div className="text-3xl font-black text-slate-900 relative z-10 italic">
                            {adHocHours}<span className="text-xs ml-1 opacity-60 font-black">HRS</span>
                         </div>
                      </motion.div>
                    )}

                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 italic">Service Value (Fixed)</label>
                      <div className="relative group/val">
                        <div className="absolute left-6 top-1/2 -translate-y-1/2 text-accent-green font-black text-xl">₹</div>
                        <input 
                          type="number" 
                          value={adHocValue}
                          onChange={(e) => setAdHocValue(e.target.value)}
                          disabled={hasSubmittedAdHocToday}
                          placeholder="0.00"
                          className="w-full bg-slate-50 border border-slate-200 rounded-3xl pl-12 pr-6 py-6 text-2xl font-black text-slate-900 outline-none focus:border-accent-green transition-all disabled:opacity-30"
                        />
                      </div>
                    </div>
                  </div>

                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    whileHover={{ scale: 1.02 }}
                    onClick={handleSubmitAdHoc}
                    disabled={isSubmittingAdHoc || !selectedVehicle || !adHocStartTime || !adHocEndTime || !adHocValue || hasSubmittedAdHocToday}
                    className={cn(
                      "w-full h-24 rounded-[32px] flex flex-col items-center justify-center transition-all shadow-2xl relative overflow-hidden group",
                      (isSubmittingAdHoc || !selectedVehicle || !adHocStartTime || !adHocEndTime || !adHocValue || hasSubmittedAdHocToday) 
                        ? "bg-slate-800 text-slate-500 shadow-none saturate-0 opacity-40" 
                        : "bg-gradient-to-r from-accent-indigo to-accent-blue text-white shadow-accent-indigo/20"
                    )}
                  >
                    {isSubmittingAdHoc ? (
                      <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <div className="text-center relative z-10">
                        <div className="flex items-center justify-center gap-3 mb-1">
                           <Send className="h-6 w-6 group-hover:translate-x-1 transition-transform" />
                           <span className="text-lg font-black uppercase tracking-[0.2em]">Submit Record</span>
                        </div>
                        <span className="text-[8px] font-black opacity-60 uppercase tracking-widest italic flex items-center justify-center gap-2">
                           {hasSubmittedAdHocToday ? 'Limit Reached for Today' : 'One Shot Submission • Admin Verified'}
                        </span>
                      </div>
                    )}
                  </motion.button>
                </div>
              </>
            )}

            {/* Previous ADHOC Jobs */}
            <div className="space-y-6 mt-8">
              <div className="flex items-center justify-between px-2">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-3 italic">
                  <History className="h-4 w-4 text-accent-indigo animate-spin-slow" /> Recent AD-HOC History
                </h3>
                <div className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[8px] font-black text-slate-500 uppercase tracking-widest">
                  {adHocJobs.length} {adHocJobs.length === 1 ? 'Entry' : 'Entries'}
                </div>
              </div>

              <div className="space-y-4">
                {adHocJobs.length > 0 ? (
                  adHocJobs.map((job, idx) => (
                    <motion.div 
                      key={`emp-adhoc-${job.id || 'no-id'}-${idx}`} 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      whileHover={{ x: 4 }}
                      className="card-glass border border-white/10 rounded-[30px] p-6 flex items-center justify-between shadow-xl relative overflow-hidden group/item"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-accent-indigo/5 to-transparent opacity-0 group-hover/item:opacity-100 transition-opacity" />
                      <div className="flex items-center gap-6 relative z-10">
                        <div className="w-14 h-14 bg-accent-indigo/10 rounded-2xl flex items-center justify-center text-accent-indigo shadow-inner group-hover/item:scale-110 transition-transform">
                           <MapPin className="h-7 w-7 opacity-50" />
                        </div>
                        <div>
                          <div className="flex items-center gap-3 mb-1">
                            <div className="text-[11px] font-black uppercase text-white tracking-widest leading-none">{job.vehicleType}</div>
                          </div>
                          <div className="flex items-center gap-2">
                             <div className="text-[9px] font-black text-slate-500 uppercase tracking-tighter bg-white/5 px-2 py-0.5 rounded">
                               {format(new Date(job.timestamp), 'MMM dd')}
                             </div>
                             <div className="text-[9px] font-bold text-accent-cyan uppercase tracking-widest opacity-60">
                               {job.startTime} - {job.endTime} ({job.totalHours}h)
                             </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-6 relative z-10">
                        <div className="text-right">
                          <div className="text-xl font-black text-white leading-none mb-2 flex items-center justify-end gap-1 italic">
                             <span className="text-xs text-accent-green font-black">₹</span>
                             {job.value.toLocaleString()}
                          </div>
                          <div className={cn(
                            "text-[8px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full border shadow-lg",
                            job.status === 'PENDING' ? "bg-amber-500/10 border-amber-500/40 text-amber-500" : 
                            job.status === 'APPROVED' ? "bg-accent-green/10 border-accent-green/40 text-accent-green" : 
                            "bg-accent-red/10 border-accent-red/40 text-accent-red"
                          )}>
                            {job.status || 'PENDING'}
                          </div>
                        </div>
                        <motion.button 
                          whileTap={{ scale: 0.8 }}
                          onClick={async () => {
                            if (window.confirm("Delete this log?")) {
                              await SupabaseService.delete('ad_hoc_jobs', job.id!);
                              setAdHocJobs(prev => prev.filter(j => j.id !== job.id));
                            }
                          }}
                          className="w-10 h-10 bg-accent-red/10 hover:bg-accent-red/20 text-accent-red rounded-2xl flex items-center justify-center transition-all border border-accent-red/20 group-hover/item:shadow-[0_0_15px_rgba(239,68,68,0.2)]"
                        >
                           <Trash2 className="h-5 w-5" />
                        </motion.button>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="text-center py-20 card-glass border border-dashed border-white/10 rounded-[40px] opacity-40">
                    <History className="h-10 w-10 text-white/20 mx-auto mb-4" />
                    <p className="text-[10px] font-black text-white uppercase tracking-[0.3em] italic">Archive empty</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {activeView === 'COUNTER' && (
          <motion.div 
            key="counter-view"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            <div className="card-glass border border-slate-200 rounded-[24px] p-5 text-slate-900 shadow-sm relative overflow-hidden group">
               <div className="absolute top-0 right-0 w-48 h-48 bg-accent-blue/5 rounded-full blur-[60px] -translate-y-1/2 translate-x-1/2" />
               <div className="flex items-center gap-4 relative z-10">
                  <div className="w-12 h-12 bg-accent-blue/10 rounded-xl flex items-center justify-center text-accent-blue shadow-inner group-hover:scale-110 transition-transform duration-500">
                     <Calculator className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black uppercase tracking-tight italic leading-none mb-1">CASH COUNTER</h2>
                    <p className="text-[10px] text-accent-blue font-black uppercase tracking-widest opacity-80">Settlement Ledger</p>
                  </div>
               </div>
            </div>

            <div className="card-glass border border-slate-200 rounded-[32px] overflow-hidden shadow-sm p-4 md:p-8 space-y-6 relative">
               <motion.div 
                 initial="hidden"
                 animate="show"
                 variants={{
                   show: { transition: { staggerChildren: 0.03 } }
                 }}
                 className="divide-y divide-slate-100 space-y-4 relative z-10"
               >
                  {[500, 200, 100, 50, 20, 10, 5, 2, 1].map((denom) => {
                    // Custom styles representing actual Indian banknotes colors with Mahatma Gandhi theme
                    const noteTheme = 
                      denom === 500 ? "from-stone-500 to-stone-700 border-stone-400" : 
                      denom === 200 ? "from-orange-500 to-orange-700 border-orange-400" : 
                      denom === 100 ? "from-indigo-400 to-indigo-600 border-indigo-300" : 
                      denom === 50 ? "from-cyan-400 to-cyan-600 border-cyan-300" : 
                      denom === 20 ? "from-lime-500 to-lime-700 border-lime-400" : 
                      denom === 10 ? "from-amber-600 to-amber-800 border-amber-500" : 
                      denom === 5 ? "from-green-500 to-green-700 border-green-400" : 
                      denom === 2 ? "from-pink-500 to-pink-700 border-pink-400" : 
                      "from-sky-400 to-sky-600 border-sky-300";

                    const increment = () => {
                      setCashCounts(prev => {
                        const val = parseInt(prev[denom.toString()] || '0') + 1;
                        return { ...prev, [denom.toString()]: val.toString() };
                      });
                    };

                    const decrement = () => {
                      setCashCounts(prev => {
                        const val = Math.max(0, parseInt(prev[denom.toString()] || '0') - 1);
                        return { ...prev, [denom.toString()]: val === 0 ? '' : val.toString() };
                      });
                    };

                    const currentCount = parseInt(cashCounts[denom.toString()] || '0');

                    return (
                      <motion.div 
                        key={denom}
                        variants={{
                          hidden: { opacity: 0, x: -10 },
                          show: { opacity: 1, x: 0 }
                        }}
                        className="flex flex-col sm:flex-row sm:items-center py-4 px-1 hover:bg-slate-50 rounded-2xl transition-all gap-4"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {/* Super Premium Indian Rupee Banknote GUI - Made slightly smaller for mobile */}
                          <div className={cn(
                            "relative w-24 h-14 sm:w-28 sm:h-16 rounded-2xl bg-gradient-to-r border-2 shadow-sm flex items-center justify-between p-2 select-none overflow-hidden shrink-0 group/note",
                            noteTheme
                          )}>
                             <div className="absolute inset-0 flex items-center justify-center font-mono text-xl font-black text-white/10 uppercase pointer-events-none">
                              ₹{denom}
                            </div>
                            
                            <button 
                              type="button" 
                              onClick={decrement}
                              className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/40 text-white flex items-center justify-center font-black shadow-sm transition-transform active:scale-75 z-10 cursor-pointer text-sm"
                            >
                              -
                            </button>
                            
                            <span className="text-[9px] font-mono font-black text-white bg-black/20 px-1 py-0.5 rounded pointer-events-none">
                              ₹{denom}
                            </span>

                            <button 
                              type="button" 
                              onClick={increment}
                              className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/40 text-white flex items-center justify-center font-black shadow-sm transition-transform active:scale-75 z-10 cursor-pointer text-sm"
                            >
                              +
                            </button>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-slate-500">×</span>
                            <input 
                              type="number"
                              pattern="[0-9]*"
                              inputMode="numeric"
                              value={cashCounts[denom.toString()]}
                              onChange={(e) => setCashCounts(prev => ({ ...prev, [denom.toString()]: e.target.value }))}
                              placeholder="0"
                              className="w-14 sm:w-16 bg-white border border-slate-200 text-slate-900 rounded-xl px-2 py-1.5 text-center text-sm font-black outline-none focus:ring-2 focus:ring-accent-blue transition-all"
                            />
                          </div>
                        </div>

                        <div className="w-full sm:w-28 text-left sm:text-right shrink-0">
                          <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Subtotal</div>
                          <div className="text-base font-black text-slate-900 font-mono tracking-tight">
                            ₹{(denom * currentCount).toLocaleString()}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}

                  {/* Online Cash Input */}
                  <div className="flex flex-col sm:flex-row sm:items-center p-6 gap-6 bg-slate-50 rounded-2xl border border-slate-200 mt-6">
                    <div className="w-16 h-10 rounded-xl bg-accent-blue flex items-center justify-center text-white font-black text-[10px] shadow-sm uppercase tracking-tighter shrink-0">
                      Online
                    </div>
                    <div className="flex-1">
                      <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1.5 ml-1">UPI / Net Banking Total</div>
                      <input 
                        type="number"
                        value={onlineCash}
                        onChange={(e) => setOnlineCash(e.target.value)}
                        placeholder="Enter amount..."
                        className="w-full bg-white text-slate-900 border border-slate-200 rounded-xl px-4 py-3 text-sm font-black outline-none focus:border-accent-blue focus:ring-4 focus:ring-accent-blue/5 transition-all"
                      />
                    </div>
                    <div className="w-full sm:w-28 text-left sm:text-right">
                      <div className="text-[8px] font-black text-accent-blue uppercase tracking-widest leading-none mb-1">Total Online</div>
                      <div className="text-xl font-black text-accent-blue">₹{(parseInt(onlineCash) || 0).toLocaleString()}</div>
                    </div>
                  </div>

                  {/* Value Mismatch Display (Readonly) */}
                  <div className="flex flex-col sm:flex-row sm:items-center p-6 gap-6 bg-red-50 rounded-2xl border border-red-100 mt-4">
                    <div className="w-16 h-10 rounded-xl bg-accent-red flex items-center justify-center text-white font-black text-[9px] shadow-sm uppercase tracking-tighter text-center shrink-0">
                      Mismatch
                    </div>
                    <div className="flex-1">
                      <div className="text-[10px] font-black text-accent-red uppercase tracking-widest leading-none mb-1.5 ml-1">Daily Discrepancy</div>
                      <div className="text-xs font-bold text-slate-400">Sum of all reported mismatches today</div>
                    </div>
                    <div className="w-full sm:w-28 text-left sm:text-right">
                      <div className="text-[8px] font-black text-accent-red uppercase tracking-widest leading-none mb-1">Amount</div>
                      <div className="text-xl font-black text-accent-red">₹{todaysValueMismatch.toLocaleString()}</div>
                    </div>
                  </div>
               </motion.div>
            </div>

            {/* Sticky Total Footer (inside the view container) */}
            <div className="bg-white border border-app-border rounded-[32px] p-6 shadow-xl space-y-4">
               <div className="flex items-center justify-between">
                  <button 
                    onClick={() => {
                      if (window.confirm("Clear all entries? / সমস্ত এন্ট্রি মুছে ফেলতে চান?")) {
                        setCashCounts({
                          '500': '', '200': '', '100': '', '50': '', '20': '', '10': '', '5': '', '2': '', '1': ''
                        });
                      }
                    }}
                    className="w-12 h-12 bg-accent-red/10 text-accent-red rounded-2xl flex items-center justify-center active:scale-95 transition-all"
                  >
                    <Trash2 className="h-6 w-6" />
                  </button>
                  <div className="text-right">
                    <div className="text-xs font-black text-text-secondary uppercase tracking-widest leading-none mb-1">Total Amount</div>
                    <div className="text-3xl font-black text-accent-green tracking-tighter">₹{totalCashAmount.toLocaleString()}</div>
                    <div className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mt-1">{totalCashNotes} Total Notes</div>
                  </div>
               </div>
               
               <button 
                 onClick={async () => {
                   if (!user) return;
                   if (totalCashAmount === 0 && !window.confirm("Submit zero amount?")) return;
                   
                   setIsSubmittingCash(true);
                   try {
                     const payload = {
                       userId: user.id,
                       userName: user.name,
                       date: format(new Date(), 'yyyy-MM-dd'),
                       timestamp: new Date().toISOString(),
                       denominations: cashCounts,
                       onlineCash: parseInt(onlineCash) || 0,
                       valueMismatch: todaysValueMismatch,
                       totalAmount: totalCashAmount,
                       totalNotes: totalCashNotes,
                       status: 'SUBMITTED'
                     };
                     
                     await SupabaseService.create('cash_reports', payload);
                     toast.success("✅ Cash report submitted successfully! / ক্যাশ রিপোর্ট সফলভাবে জমা দেওয়া হয়েছে।");
                     
                     // Optional: Reset counts after successful submission
                     setCashCounts({
                       '500': '', '200': '', '100': '', '50': '', '20': '', '10': '', '5': '', '2': '', '1': ''
                     });
                     setOnlineCash('');
                   } catch (err: any) {
                     toast.error("Submit failed: " + err.message);
                   } finally {
                     setIsSubmittingCash(false);
                   }
                 }}
                 disabled={isSubmittingCash}
                 className="w-full h-14 bg-accent-blue text-white rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-accent-blue/20 active:scale-95 transition-all disabled:opacity-50"
               >
                 {isSubmittingCash ? <RefreshCw className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                 <span>Submit Cash Report</span>
               </button>
            </div>
          </motion.div>
        )}

        {activeView === 'HISTORY' && (
          <motion.div 
            key="history-view"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="grid grid-cols-2 gap-4">
              <motion.div 
                whileHover={{ scale: 1.02 }}
                className="bg-white p-4 rounded-2xl border border-app-border shadow-sm flex flex-col gap-1 transition-all hover:border-accent-green/30"
              >
                <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">{t.monthlyTotal}</span>
                <span className="text-xl font-black text-accent-green tracking-tight">₹{monthlyEarnings}</span>
              </motion.div>
              {canTrackMileage ? (
                <motion.div 
                  whileHover={{ scale: 1.02 }}
                  className="bg-white p-4 rounded-2xl border border-app-border shadow-sm flex flex-col gap-1 items-start relative overflow-hidden group transition-all hover:border-accent-blue/30"
                >
                  <div className="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                    <MapPin className="h-12 w-12 text-accent-blue" />
                  </div>
                  <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-accent-blue" /> {t.monthlyMileage}
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-black text-accent-blue tracking-tight">{(monthlyMileage || 0).toFixed(1)}</span>
                    <span className="text-[10px] text-accent-blue/60 font-bold uppercase tracking-tighter">{t.km}</span>
                  </div>
                </motion.div>
              ) : (
                <motion.div 
                  whileHover={{ scale: 1.02 }}
                  className="bg-white p-4 rounded-2xl border border-app-border shadow-sm flex flex-col gap-1 transition-all hover:border-accent-blue/30"
                >
                  <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">{t.history}</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-black tracking-tight">{history.length}</span>
                    <span className="text-[10px] text-text-secondary font-bold uppercase tracking-tighter">/ {format(viewMonth, 'MMM')}</span>
                  </div>
                </motion.div>
              )}
            </div>
          
            {/* Unified Attendance Calendar */}
            <AttendanceCalendar 
              userId={user.id} 
              userName={user.name} 
              paydays={paydays}
            />
              
            {/* History List */}
            <div className="pt-6 border-t border-app-border space-y-4">
              <h4 className="text-[10px] font-bold text-text-secondary uppercase tracking-widest px-1 flex items-center gap-2">
                <History className="h-3 w-3 text-accent-blue" /> {t.detailedLogs || "Detailed Logs"}
              </h4>
              <motion.div 
                variants={{
                  show: { transition: { staggerChildren: 0.05 } }
                }}
                initial="hidden"
                animate="show"
                className="space-y-3"
              >
                {history.length > 0 ? (
                  history.map((record, hIdx) => {
                    const isPayday = paydays.some(p => p.date === record.date);
                    const isDriverLog = canTrackMileage && record.odometerStart !== undefined;
                    
                    return (
                      <motion.div 
                        key={`emp-hist-${record.id || 'no-id'}-${hIdx}`}
                        variants={{
                          hidden: { opacity: 0, y: 10 },
                          show: { opacity: 1, y: 0 }
                        }}
                        whileHover={{ scale: 1.01, x: 2 }}
                        className={cn(
                          "group bg-white rounded-2xl border border-app-border hover:border-accent-blue/30 transition-all overflow-hidden flex flex-col shadow-sm",
                          record.status === 'FRAUDULENT' && "bg-accent-red/5 border-accent-red/20 opacity-80"
                        )}
                      >
                        {/* Record Header */}
                        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/50">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-10 h-10 rounded-xl bg-white flex flex-col items-center justify-center border border-slate-200 shadow-sm",
                              record.status === 'FRAUDULENT' && "bg-red-50 border-red-200"
                            )}>
                              <span className="text-[9px] font-black text-slate-400 leading-none uppercase">{format(new Date(record.date), 'MMM')}</span>
                              <span className="text-sm font-black text-slate-900 leading-none mt-0.5">{format(new Date(record.date), 'dd')}</span>
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{format(new Date(record.date), 'EEEE')}</div>
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-xs font-black text-slate-900 uppercase">Duty Record</span>
                                {isPayday && <span className="text-xs">💰</span>}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-black text-accent-green">₹{record.earnings}</div>
                            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{t.earned || "Earned"}</div>
                          </div>
                        </div>

                      {/* Detailed Stats */}
                      <div className="p-4 grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                            <Clock className="h-3 w-3 text-accent-blue" /> Log Detail
                          </div>
                          <div className="text-xs font-bold text-slate-900">
                             {format(new Date(record.checkInTime), 'hh:mm a')}
                             {record.checkOutTime ? ` - ${format(new Date(record.checkOutTime), 'hh:mm a')}` : <span className="text-accent-blue"> • Active</span>}
                          </div>
                          <div className="text-[9px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded inline-block">
                            {record.hoursWorked ? `${record.hoursWorked} worked` : 'Shift in progress'}
                          </div>
                        </div>

                        {isDriverLog && (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 text-[9px] font-black text-text-secondary uppercase tracking-widest">
                              <MapPin className="h-3 w-3 text-accent-blue" /> {t.mileage}
                            </div>
                            <div className="text-xs font-bold text-slate-900 flex items-center gap-1">
                               <span className="text-base font-black text-accent-blue">{(record.distanceDriven || 0).toFixed(1)}</span>
                               <span className="text-[10px] font-black text-accent-blue/60 uppercase">{t.km}</span>
                            </div>
                            <div className="text-[10px] text-text-secondary/60">
                               {record.odometerStart} km → {record.odometerEnd || '--'} km
                            </div>
                            {record.selectedPinCodes && record.selectedPinCodes.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {record.selectedPinCodes.map(pin => (
                                  <span key={pin} className="px-1.5 py-0.5 bg-accent-blue/10 text-accent-blue text-[8px] font-black rounded border border-accent-blue/20">
                                    {pin}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {isDriverLog && record.distanceDriven !== undefined && record.distanceDriven < 0.1 && (
                          <div className="col-span-2 mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
                             <div className="mt-0.5">
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                             </div>
                             <div className="flex flex-col">
                                <span className="text-[9px] font-black text-amber-700 uppercase tracking-widest leading-none">{t.lowDistanceFlagged}</span>
                                <span className="text-[8px] text-amber-600/70 font-bold mt-1">Manual review required for {record.distanceDriven} km trip</span>
                             </div>
                          </div>
                        )}

                        {record.status === 'FRAUDULENT' && (
                          <div className="col-span-2 mt-1 p-2 bg-accent-red/10 border border-accent-red/20 rounded-lg flex items-center gap-2">
                             <AlertCircle className="h-4 w-4 text-accent-red" />
                             <span className="text-[10px] font-black text-accent-red uppercase tracking-widest">{t.fakeAttendanceWarning}</span>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })
              ) : (
                <div className="text-center py-12 bg-bg-app rounded-2xl border border-dashed border-app-border">
                  <p className="text-xs text-text-secondary font-medium italic opacity-50">No records for this month</p>
                </div>
              )}
            </motion.div>
          </div>
        </motion.div>
      )}
    </motion.div>
  )}
  </AnimatePresence>
</div>

    {/* Floating Chat Trigger */}
    <button
      onClick={() => setShowChat(true)}
      className="fixed right-6 bottom-24 w-14 h-14 bg-white text-blue-600 rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-all border border-blue-50 z-40"
    >
      <MessageSquare className="h-6 w-6" />
    </button>

      {/* Overlays */}
      <AnimatePresence>
        {showChat && (
          <motion.div 
            initial={{ y: '100%' }} 
            animate={{ y: 0 }} 
            exit={{ y: '100%' }} 
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-0 bg-white z-[70] flex flex-col"
          >
             <div className="h-16 border-b flex items-center justify-between px-6">
                <h2 className="font-black text-slate-900 text-xl">{t.chat}</h2>
                <button onClick={() => setShowChat(false)} className="text-slate-400 font-black text-2xl p-2">✕</button>
             </div>
             <Chat />
          </motion.div>
        )}
      </AnimatePresence>
      
      <AnimatePresence>
        {showCamera && (
          <div className="fixed inset-0 z-[110] bg-black flex flex-col">
            <div className="flex-1 relative flex items-center justify-center">
              {!capturedPhoto ? (
                <>
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    className="w-full h-full object-cover" 
                  />
                  <div className="absolute inset-0 border-[40px] border-black/40 pointer-events-none">
                    <div className="w-full h-full border-2 border-white/20 rounded-[32px] flex items-center justify-center">
                       <div className="w-64 h-64 border-2 border-dashed border-white/40 rounded-full" />
                    </div>
                  </div>
                </>
              ) : (
                <img src={capturedPhoto} className="w-full h-full object-cover" alt="Selfie" />
              )}
              
              <div className="absolute top-8 left-0 right-0 text-center text-white px-8">
                 <h3 className="text-xl font-black uppercase tracking-widest leading-none mb-1">
                   {cameraMode === 'IN' ? "Capture Selfie (নিজের ছবি)" : "Capture Vehicle (গাড়ির ছবি)"}
                 </h3>
                 <p className="text-[10px] font-bold opacity-60 uppercase mt-2 tracking-widest">
                   {cameraMode === 'IN' ? 'Check In Verification' : 'Check Out Verification'}
                 </p>
                 {cameraMode === 'OUT' && (
                   <div className="mt-3 bg-white/10 backdrop-blur-md rounded-xl p-2 inline-block">
                     <p className="text-[9px] font-bold text-white uppercase tracking-tighter">গাড়ির সামনের অংশ ও মিটারের ছবি তুলুন</p>
                   </div>
                 )}
              </div>

              <div className="absolute bottom-12 left-0 right-0 flex flex-col items-center gap-6">
                {!capturedPhoto ? (
                  <>
                    <div className="flex items-center gap-6">
                      <button 
                        onClick={() => { stopCamera(); setShowCamera(false); }}
                        className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center text-white backdrop-blur-md border border-white/20 hover:bg-white/20 transition-all"
                      >
                        <X className="h-6 w-6" />
                      </button>
                      
                      <button 
                        onClick={capturePhoto}
                        className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(255,255,255,0.3)] active:scale-90 transition-all p-2"
                      >
                        <div className="w-full h-full border-4 border-slate-900 rounded-full flex items-center justify-center">
                           <Camera className="h-8 w-8 text-slate-900" />
                        </div>
                      </button>

                      <button 
                        onClick={toggleCamera}
                        className={cn(
                          "w-14 h-14 rounded-2xl flex flex-col items-center justify-center text-white backdrop-blur-md border transition-all",
                          facingMode === 'user' ? "bg-accent-blue/30 border-accent-blue/50" : "bg-white/10 border-white/20"
                        )}
                      >
                        <RefreshCw className="h-5 w-5 mb-1" />
                        <span className="text-[8px] font-black uppercase tracking-tighter">
                          {facingMode === 'user' ? 'Front' : 'Back'}
                        </span>
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <button 
                      onClick={() => { setCapturedPhoto(null); startCamera(); }}
                      className="h-14 px-8 bg-white/10 rounded-2xl text-white font-black uppercase tracking-widest backdrop-blur-md"
                    >
                      Retake
                    </button>
                    <button 
                      onClick={() => {
                        if (cameraMode === 'IN') proceedCheckInAfterPhoto(capturedPhoto);
                        else proceedCheckOutAfterPhoto(capturedPhoto);
                      }}
                      className="h-14 px-10 bg-accent-blue rounded-2xl text-white font-black uppercase tracking-widest shadow-xl shadow-accent-blue/20"
                    >
                      {t.confirm}
                    </button>
                  </>
                )}
              </div>
            </div>
            <canvas ref={canvasRef} className="hidden" />
          </div>
        )}
      </AnimatePresence>

      {/* GPS Location Fallback/Error Modal */}
      <AnimatePresence>
        {showLocationErrorModal && locationErrorModalConfig && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-black/70 backdrop-blur-md">
            <motion.div 
               initial={{ opacity: 0, scale: 0.9, y: 30 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.9, y: 30 }}
               className="bg-white w-full max-w-md rounded-[32px] overflow-hidden shadow-2xl border border-rose-100"
            >
              <div className="p-8 space-y-6">
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center shadow-inner">
                    <AlertTriangle className="h-8 w-8" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">
                      লোকেশন সংযোগ সমস্যা <br />
                      <span className="text-sm font-semibold text-rose-500">Location Connection Issue</span>
                    </h3>
                  </div>
                </div>

                <div className="bg-rose-50/50 p-4 rounded-2xl border border-rose-100 text-xs text-rose-700 space-y-1 font-medium select-none font-sans">
                  <p className="font-bold">Error details / ত্রুটির বিবরণ:</p>
                  <p className="font-mono bg-white p-2.5 rounded-xl border border-rose-100 break-words leading-relaxed">{locationErrorModalConfig.originalError}</p>
                </div>

                <div className="text-xs text-slate-500 text-center space-y-1 leading-relaxed px-2 font-sans">
                  <p>আপনার জিপিএস সংযোগ দুর্বল, অথবা আপনি অফিসের সীমানার বাইরে রয়েছেন। দয়া করে নিশ্চিত করুন আপনার জিপিএস এবং ইন্টারনেট সংযোগ সক্রিয় আছে।</p>
                  <p className="font-semibold italic text-slate-400">Your GPS signal is poor or you are currently outside any designated office. Please verify connection status.</p>
                </div>

                <div className="flex flex-col gap-3 font-sans">
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={async () => {
                      setShowLocationErrorModal(false);
                      if (locationErrorModalConfig.mode === 'IN') {
                        await proceedCheckIn(locationErrorModalConfig.photo, locationErrorModalConfig.odometer);
                      } else {
                        await proceedCheckOut(
                          locationErrorModalConfig.photo, 
                          locationErrorModalConfig.odometerEndInput, 
                          locationErrorModalConfig.pinCodesList
                        );
                      }
                    }}
                    className="w-full h-14 bg-gradient-to-r from-accent-blue to-indigo-600 hover:opacity-95 text-white rounded-xl flex items-center justify-center gap-2 font-black uppercase tracking-wider text-xs shadow-lg shadow-accent-blue/25"
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Retry GPS Check / পুনরায় চেষ্টা করুন
                  </motion.button>

                  <div className="relative flex py-1 items-center">
                    <div className="flex-grow border-t border-slate-100"></div>
                    <span className="flex-shrink mx-4 text-[9px] font-black uppercase tracking-widest text-slate-500">Or Bypass</span>
                    <div className="flex-grow border-t border-slate-100"></div>
                  </div>

                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={async () => {
                      if (locationErrorModalConfig.mode === 'IN') {
                        await proceedCheckInBypassed(locationErrorModalConfig.photo, locationErrorModalConfig.odometer);
                      } else {
                        await proceedCheckOutBypassed(
                          locationErrorModalConfig.photo, 
                          locationErrorModalConfig.odometerEndInput, 
                          locationErrorModalConfig.pinCodesList
                        );
                      }
                    }}
                    className="w-full p-3 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl flex flex-col items-center justify-center transition-all border border-amber-200"
                  >
                    <span className="text-[11px] font-black uppercase tracking-wider">Manual Attendance (Admin Review Required)</span>
                    <span className="text-[9px] font-bold text-amber-600">ম্যানুয়াল এটেনডেন্স (সুপারভাইজার অনুমোদন করবে)</span>
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Odometer Modal */}
      <AnimatePresence>
        {showOdoModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
            <motion.div 
               initial={{ opacity: 0, scale: 0.9, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.9, y: 20 }}
               className="bg-white w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl"
            >
              <div className="p-8 space-y-6">
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="w-16 h-16 bg-accent-blue/10 rounded-full flex items-center justify-center text-accent-blue">
                    <MapPin className="h-8 w-8 animate-bounce" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-xl font-black text-slate-900 tracking-tight">
                      {odoMode === 'IN' ? "চেক ইন কিলোমিটার / Start Kilometer" : "চেক আউট কিলোমিটার / End Kilometer"}
                    </h3>
                    <p className="text-xs text-text-secondary font-medium px-4">
                      {odoMode === 'IN' 
                        ? "গাড়ি স্টার্ট করার আগে ছবিতে দেখানো মিটারের রিডিংটি এখানে লিখুন।"
                        : "কোম্পানি শিফট শেষ করার আগে ছবিতে দেখানো মিটারের বর্তমান রিডিংটি লিখুন।"}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="bg-bg-app p-6 rounded-2xl border-2 border-accent-blue/30 focus-within:border-accent-blue transition-all">
                    <label className="text-[10px] font-black text-accent-blue uppercase tracking-widest block mb-2">
                      {odoMode === 'IN' ? "শুরুর কিলোমিটার / START ODOMETER (KM)" : "শেষের কিলোমিটার / END ODOMETER (KM)"}
                    </label>
                    <input 
                      autoFocus
                      type="number"
                      step="0.1"
                      min="0"
                      inputMode="decimal"
                      value={tempOdo}
                      onChange={(e) => setTempOdo(e.target.value)}
                      placeholder="000.0"
                      className="w-full bg-transparent text-4xl font-black outline-none placeholder:text-text-secondary/10 tracking-tighter"
                    />
                    {odoMode === 'OUT' && todayRecord?.odometerStart && (
                      <div className="mt-3 pt-3 border-t border-app-border flex justify-between items-center">
                        <span className="text-[9px] font-black text-text-secondary uppercase tracking-widest">Start Reading / শুরুর রিডিং</span>
                        <span className="text-xs font-black text-slate-900">{todayRecord.odometerStart} {t.km}</span>
                      </div>
                    )}
                  </div>

                  {odoMode === 'OUT' && (
                    <div className="space-y-4 transition-all duration-300">
                      {tempOdo.trim().length > 0 ? (
                        <div className="bg-bg-app p-4 rounded-2xl border border-app-border space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-accent-blue uppercase tracking-widest block">
                              Address PIN Codes / পিন কোড লিখুন
                            </span>
                            <span className="text-[9px] font-bold text-text-secondary px-2 py-0.5 bg-white border border-app-border rounded-full italic">
                              SECURE ENTRY
                            </span>
                          </div>

                          <div className="relative">
                            <input 
                              type="tel"
                              pattern="[0-9]*"
                              inputMode="numeric"
                              maxLength={6}
                              value={pinInput}
                              onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, '');
                                if (val.length <= 6) setPinInput(val);
                                if (val.length === 6) {
                                  if (AUTHORIZED_PIN_CODES.includes(val)) {
                                    if (!selectedPins.includes(val)) {
                                      setSelectedPins(prev => [...prev, val]);
                                      toast.success(`PIN ${val} Added! / পিন ${val} যোগ হয়েছে!`);
                                    }
                                    setPinInput('');
                                  } else {
                                    toast.error("Invalid PIN / অবৈধ পিন কোড");
                                    setPinInput('');
                                  }
                                }
                              }}
                              placeholder="Type PIN here..."
                              className="w-full bg-white h-12 px-4 rounded-xl border border-app-border focus:border-accent-blue focus:ring-4 focus:ring-accent-blue/10 outline-none text-center font-black tracking-[0.5em] transition-all placeholder:tracking-normal placeholder:font-medium placeholder:text-slate-400"
                            />
                            {pinInput.length > 0 && (
                              <button 
                                onClick={() => setPinInput('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 p-1"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            )}
                          </div>

                          <div className="space-y-2">
                             <div className="flex items-center justify-between px-1">
                               <span className="text-[9px] font-bold text-text-secondary uppercase tracking-wider">Saved PINs / সেভ করা পিনগুলো</span>
                               <span className="text-[9px] font-bold text-accent-blue">{selectedPins.length} ADDED</span>
                             </div>
                             
                             <div className="flex flex-wrap gap-2 min-h-[40px] p-2 bg-white rounded-xl border border-dashed border-slate-200">
                                {selectedPins.length === 0 ? (
                                  <p className="text-[10px] text-slate-400 italic m-auto">No PINs added yet. / কোনো পিন যোগ করা হয়নি।</p>
                                ) : (
                                  selectedPins.map((pin) => (
                                    <div 
                                      key={pin} 
                                      className="flex items-center gap-1.5 bg-accent-blue/10 text-accent-blue px-3 py-1.5 rounded-full border border-accent-blue/20 animate-in zoom-in-50 duration-200"
                                    >
                                      <span className="text-xs font-black tracking-wider">{pin}</span>
                                      <button 
                                        onClick={() => setSelectedPins(prev => prev.filter(p => p !== pin))}
                                        className="p-0.5 hover:bg-accent-blue/20 rounded-full transition-colors"
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </div>
                                  ))
                                )}
                             </div>
                          </div>

                          <div className="pt-2">
                            <span className="text-[9px] font-bold text-text-secondary block mb-2 uppercase tracking-tight opacity-60">Quick Suggestions / সাজেশন থেকে সিলেক্ট করুন</span>
                            <div className="grid grid-cols-4 gap-1.5">
                              {AUTHORIZED_PIN_CODES.map((pin) => {
                                const isSelected = selectedPins.includes(pin);
                                return (
                                  <button
                                    key={pin}
                                    type="button"
                                    onClick={() => {
                                      setSelectedPins(prev =>
                                        prev.includes(pin)
                                          ? prev.filter(p => p !== pin)
                                          : [...prev, pin]
                                      );
                                    }}
                                    className={cn(
                                      "py-2 px-1 rounded-xl text-[10px] font-black transition-all border",
                                      isSelected 
                                        ? "bg-accent-blue text-white border-accent-blue shadow-sm" 
                                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                                    )}
                                  >
                                    {pin}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          
                          {selectedPins.length === 0 && (
                            <p className="text-[10px] text-accent-red font-bold uppercase tracking-wider text-center animate-pulse mt-1">
                              দয়া করে অন্তত একটি পিন কোড সিলেক্ট করুন
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="p-4 bg-amber-50/50 border border-amber-200/50 rounded-2xl text-center">
                          <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">
                            কিলোমিটার রিডিং দেওয়ার পর পিন কোড সিলেক্ট করার অপশন আসবে।
                          </p>
                          <p className="text-[9px] text-amber-700 opacity-65">
                            (PIN Code section will be unlocked after you enter the kilometer reading above.)
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={() => setShowOdoModal(false)}
                      className="h-14 rounded-2xl text-[10px] font-black uppercase tracking-widest text-text-secondary bg-bg-app border border-app-border hover:bg-white transition-colors"
                    >
                      Cancel / বাতিল
                    </button>
                    <button 
                      onClick={handleOdoSubmit}
                      disabled={isCheckingIn || isCheckingOut}
                      className="h-14 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white bg-accent-blue shadow-lg shadow-accent-blue/20 active:scale-95 transition-all disabled:opacity-50"
                    >
                      {isCheckingIn || isCheckingOut ? "Saving..." : "Confirm / নিশ্চিত করুন"}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {showBarcodeScanner && (
          <div className="fixed inset-0 z-[120] bg-black flex flex-col">
            <div className="bg-white/10 backdrop-blur-md p-6 flex items-center justify-between">
               <div className="text-white">
                  <h3 className="text-lg font-black uppercase tracking-widest">{t.valueMismatch}</h3>
                  <p className="text-[10px] font-bold opacity-60 uppercase tracking-widest">{barcodes.length}/20 Scanned</p>
               </div>
               <div className="flex items-center gap-3">
                 <button 
                   onClick={toggleFlashlight}
                   className={cn(
                     "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                     isFlashlightOn ? "bg-accent-blue text-white shadow-lg shadow-accent-blue/30" : "bg-white/10 text-white"
                   )}
                 >
                   {isFlashlightOn ? <Zap className="h-5 w-5" /> : <Flashlight className="h-5 w-5" />}
                 </button>
                 <button 
                   onClick={() => setShowBarcodeScanner(false)}
                   className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white"
                 >
                   <X className="h-5 w-5" />
                 </button>
               </div>
            </div>

            <div className="flex-1 relative overflow-hidden bg-black">
               <div id="barcode-reader" className="w-full h-full" />
               
               {/* AI HUD Overlay - Surgical Precision */}
               <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                  <div className="w-64 h-32 relative">
                     {/* Tight Corners */}
                     <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-accent-blue rounded-tl-xl shadow-[0_0_15px_rgba(0,123,255,0.8)]" />
                     <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-accent-blue rounded-tr-xl shadow-[0_0_15px_rgba(0,123,255,0.8)]" />
                     <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-accent-blue rounded-bl-xl shadow-[0_0_15px_rgba(0,123,255,0.8)]" />
                     <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-accent-blue rounded-br-xl shadow-[0_0_15px_rgba(0,123,255,0.8)]" />
                     
                     {/* Center Crosshair */}
                     <div className="absolute inset-0 flex items-center justify-center opacity-40">
                        <div className="w-4 h-0.5 bg-accent-blue" />
                        <div className="w-0.5 h-4 bg-accent-blue" />
                     </div>

                     {/* Sharp Scan Line */}
                     <motion.div 
                        initial={{ top: '10%' }}
                        animate={{ top: '90%' }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="absolute left-1 right-1 h-0.5 bg-accent-blue shadow-[0_0_15px_rgba(0,123,255,1)] z-10"
                     />
                     
                     <div className="absolute -top-12 left-0 right-0 flex flex-col items-center gap-1">
                        <div className="flex items-center gap-2">
                           <div className="w-1.5 h-1.5 rounded-full bg-accent-blue animate-ping" />
                           <span className="text-[7px] text-accent-blue font-black tracking-[0.3em] uppercase">PRECISION AI: CALIBRATED</span>
                        </div>
                        <div className="h-[1px] w-24 bg-gradient-to-r from-transparent via-accent-blue/50 to-transparent" />
                     </div>

                     <div className="absolute -bottom-10 left-0 right-0 text-center">
                        <span className="text-[7px] text-white/60 font-black tracking-[0.2em] uppercase">DETECTING 'FMPC' IDENTIFIER</span>
                     </div>
                  </div>
                  
                  <div className="mt-20">
                     <div className="bg-black/60 px-6 py-2 rounded-2xl backdrop-blur-xl border border-white/10 flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-accent-blue animate-pulse" />
                        <p className="text-white text-[9px] font-black uppercase tracking-[0.15em]">
                           AI Code Validation: Active
                        </p>
                     </div>
                  </div>
               </div>
            </div>

            <div className="bg-white/10 backdrop-blur-md p-8 flex flex-col gap-4">
               <button 
                 onClick={handleAddManualBarcode}
                 className="w-full h-14 bg-white/20 hover:bg-white/30 text-white rounded-2xl flex items-center justify-center gap-3 font-black uppercase tracking-widest transition-all"
               >
                 <Plus className="h-5 w-5" /> {t.manualEntry}
               </button>
               <div className="text-center text-white/40 text-[9px] font-bold uppercase tracking-widest">
                  Scanning happens automatically
               </div>
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
              @keyframes scan {
                0%, 100% { transform: translateY(-100px); }
                50% { transform: translateY(100px); }
              }
              .animate-scan {
                animation: scan 2s ease-in-out infinite;
              }
              #barcode-reader video {
                width: 100% !important;
                height: 100% !important;
                object-fit: cover !important;
              }
            ` }} />
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showManualBarcodeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[130] flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-black uppercase tracking-tight text-slate-900">{t.manualEntry}</div>
                <button 
                  onClick={closeManualEntry}
                  className="p-2 text-text-secondary hover:text-accent-red"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-3">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest block px-1">{t.enterBarcode}</label>
                    <input
                      type="text"
                      autoFocus
                      value={manualBarcodeValue}
                      onChange={(e) => setManualBarcodeValue(e.target.value)}
                      placeholder="e.g. FMPC1234567890"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') confirmManualBarcode();
                      }}
                      className="w-full bg-bg-app border border-app-border rounded-2xl px-4 py-4 text-sm font-black outline-none focus:border-accent-blue focus:ring-4 focus:ring-accent-blue/5 transition-all uppercase"
                    />
                  </div>
                  <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100 italic">
                    AI strictly validates codes starting with <span className="text-accent-blue font-black">FMPC</span> followed by <span className="text-slate-900 font-black">10 digits</span>.
                  </p>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={confirmManualBarcode}
                    className="h-14 bg-bg-app border border-app-border text-slate-900 rounded-2xl flex items-center justify-center gap-2 font-black uppercase tracking-widest transition-all active:scale-95"
                  >
                    <Plus className="h-4 w-4" /> {t.addMore}
                  </button>
                  <button
                    onClick={() => {
                      confirmManualBarcode();
                      closeManualEntry();
                      setShowBarcodeScanner(false);
                    }}
                    className="h-14 bg-accent-blue text-white rounded-2xl flex items-center justify-center gap-2 font-black uppercase tracking-widest transition-all active:scale-95 shadow-xl shadow-accent-blue/20"
                  >
                    <CheckCircle2 className="h-4 w-4" /> {t.confirm}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Shipment History Modal */}
      <AnimatePresence>
        {showShipmentHistory && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-md flex items-end sm:items-center justify-center p-4"
          >
            <motion.div
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              className="bg-white w-full max-w-md rounded-t-[32px] sm:rounded-[32px] overflow-hidden flex flex-col max-h-[85vh] shadow-[0_-20px_50px_-12px_rgba(0,0,0,0.3)]"
            >
              <div className="p-6 border-b border-app-border flex items-center justify-between sticky top-0 bg-white z-10">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-accent-blue/10 rounded-xl text-accent-blue">
                    <PackageCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black tracking-tight">{t.shipments} History</h3>
                    <p className="text-[10px] text-text-secondary font-bold uppercase tracking-widest leading-none mt-1">Precise delivery logs</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowShipmentHistory(false)}
                  className="p-2 hover:bg-bg-app rounded-full transition-colors"
                >
                  <X className="h-6 w-6 text-text-secondary" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-accent-blue/5 p-4 rounded-2xl border border-accent-blue/10 flex flex-col items-center justify-center text-center">
                    <span className="text-[8px] font-black text-accent-blue uppercase tracking-widest mb-1">Total Units</span>
                    <span className="text-2xl font-black text-accent-blue">{shipmentHistory.reduce((sum, r) => sum + (r.shipments || 0), 0)}</span>
                  </div>
                  <div className="bg-bg-app p-4 rounded-2xl border border-app-border flex flex-col items-center justify-center text-center">
                    <span className="text-[8px] font-black text-text-secondary uppercase tracking-widest mb-1">Active Days</span>
                    <span className="text-2xl font-black text-slate-900">{shipmentHistory.length}</span>
                  </div>
                </div>

                {shipmentHistory.length === 0 ? (
                  <div className="py-12 text-center space-y-3">
                    <div className="text-4xl">📦</div>
                    <div className="text-sm font-bold text-text-secondary uppercase tracking-widest">No shipment records found</div>
                    <p className="text-xs text-text-secondary/60">Delivered units will appear here after checkout</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {shipmentHistory.map((rec, idx) => (
                      <div key={rec.id || `ship-${idx}`} className="bg-bg-app p-4 rounded-2xl border border-app-border flex items-center justify-between group">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-white rounded-xl flex flex-col items-center justify-center border border-app-border group-hover:border-accent-blue transition-colors">
                              <div className="text-[8px] font-black uppercase text-text-secondary leading-none">{format(new Date(rec.date), 'MMM')}</div>
                              <div className="text-sm font-black text-slate-900 leading-none mt-0.5">{format(new Date(rec.date), 'dd')}</div>
                          </div>
                          <div>
                            <div className="text-[10px] font-black text-text-secondary uppercase tracking-widest">Shipment Units</div>
                            <div className="text-sm font-black text-slate-900">{rec.shipments} Delivered</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] font-black text-accent-green uppercase tracking-tighter">Earnings</div>
                          <div className="font-mono text-sm font-black text-slate-900">₹{rec.earnings}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-6 bg-bg-app border-t border-app-border">
                <button
                  onClick={() => setShowShipmentHistory(false)}
                  className="w-full h-12 bg-slate-900 text-white rounded-xl font-black uppercase tracking-widest active:scale-95 transition-all shadow-xl shadow-slate-900/20"
                >
                  Close History
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
