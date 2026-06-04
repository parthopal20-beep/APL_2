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
  Download
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
import { OFFICE_LOCATIONS, MAX_DISTANCE_METERS, getDistanceInMeters } from '../constants';

export default function EmployeeDashboard() {
  const { user, logout } = useAuth();
  const { t, language } = useLanguage();
  
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [paydays, setPaydays] = useState<Payday[]>([]);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
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

    return () => { sub.unsubscribe(); };
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
        const currentEarnings = user.paymentBase === 'PER_SHIPMENT' 
          ? shipments * (user.rate || 0) 
          : (user.rate || 0);
        
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
              const compressed = await compressImage(blob, 150);
              const reader = new FileReader();
              reader.onloadend = () => {
                setCapturedPhoto(reader.result as string);
                stopCamera();
              };
              reader.readAsDataURL(compressed);
            } catch (err) {
              // Fallback if compression fails
              const data = canvas.toDataURL('image/jpeg', 0.6);
              setCapturedPhoto(data);
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

    // AI Analysis: Verify 'FMPC' prefix
    const isFMPC = decodedText.toUpperCase().startsWith('FMPC');
    if (!isFMPC) {
      if ('vibrate' in navigator) navigator.vibrate([100, 50, 100]);
      // Show AI analysis feedback instead of closing
      toast.error("AI Analysis Error: Invalid Barcode. Every code must start with 'FMPC'. Please scan the correct label.\n" +
            "AI বিশ্লেষণ ত্রুটি: অবৈধ বারকোড। প্রতিটি কোড অবশ্যই 'FMPC' দিয়ে শুরু হতে হবে। দয়া করে সঠিক লেবেলটি স্ক্যান করুন।");
      return;
    }

    if (barcodes.includes(decodedText)) {
      if ('vibrate' in navigator) navigator.vibrate([30, 30, 30]);
      toast.error(`${translations.en.barcodeExists}\n${translations.bn.barcodeExists}`);
      return;
    }
    
    setBarcodes(prev => [...prev, decodedText]);
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
      const compressedBlob = await compressImage(file, 150);
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setMismatchPhoto(reader.result as string);
        setIsCompressing(false);
      };
      reader.readAsDataURL(compressedBlob);
    } catch (err) {
      console.error("Compression error:", err);
      toast.error("Failed to process image. / ছবি প্রসেস করতে ব্যর্থ হয়েছে।");
      setIsCompressing(false);
    }
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
        employeeName: user.name,
        date: format(new Date(), 'yyyy-MM-dd'),
        timestamp: new Date().toISOString(),
        barcodes,
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
      if (barcodes.includes(code)) {
        toast.error(t.barcodeExists);
        return;
      }
      setBarcodes(prev => [...prev, code]);
      setManualBarcodeValue('');
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
      const compressedBlob = await compressImage(file, 100); // Profile pic can be even smaller
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        await SupabaseService.update('users', user.id, {
          profilePicture: base64
        });
        toast.success("Profile picture updated successfully! / প্রোফাইল ছবি সফলভাবে আপডেট করা হয়েছে!");
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


  const isDeliveryRole = React.useMemo(() => {
    const title = user?.jobTitle?.toLowerCase() || '';
    const paymentBase = user?.paymentBase || '';
    return title.includes('delivery') || 
           title.includes('courier') || 
           title.includes('boy') || 
           paymentBase === 'PER_SHIPMENT' || 
           paymentBase === 'DRIVER';
  }, [user]);

  const canTrackMileage = React.useMemo(() => {
    if (!user) return false;
    
    // Driver or Per Shipment must track mileage
    if (user.paymentBase === 'DRIVER' || user.paymentBase === 'PER_SHIPMENT') {
      return true;
    }
    
    // Fixed salary can skip
    if (user.paymentBase === 'DAILY_FIXED') {
      return false;
    }

    const title = user.jobTitle?.toLowerCase() || '';
    if (title.includes('payment collection') || title.includes('jute shipment')) {
      return false;
    }
    return true;
  }, [user]);

  const handleCheckIn = () => {
    if (!user) return;
    setCameraMode('IN');
    setFacingMode('user');
    setCapturedPhoto(null);
    setShowCamera(true);
    startCamera('user');
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

  const proceedCheckIn = async (photo: string, odometer?: number) => {
    if (!user) return;
    setIsCheckingIn(true);

    try {
      // 1. Get Location with aggressive fallback
      const pos = await new Promise<GeolocationPosition>((res, rej) => {
        const timeoutId = setTimeout(() => {
          rej(new Error("Location request timed out. Trying low accuracy..."));
        }, 8000);

        navigator.geolocation.getCurrentPosition(
          (p) => { clearTimeout(timeoutId); res(p); },
          (err) => {
            clearTimeout(timeoutId);
            console.warn("High accuracy check-in location failed, trying low accuracy fallback:", err);
            navigator.geolocation.getCurrentPosition(
              (p) => res(p),
              (e) => { 
                let message = "Could not retrieve your location. Check GPS settings.";
                if (e.code === e.PERMISSION_DENIED) message = "Location permission denied.";
                rej(new Error(message)); 
              },
              { timeout: 10000, enableHighAccuracy: false }
            );
          },
          { timeout: 15000, enableHighAccuracy: true, maximumAge: 0 }
        );
      }).catch(e => {
        console.warn("Location error, using last known if available:", e);
        throw new Error(e.message || "Checking-in requires location verification. Please enable GPS.");
      }) as GeolocationPosition;

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
        throw new Error(`${translations.en.notAtOffice}\n${translations.bn.notAtOffice}`);
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
        earnings: (user.paymentBase === 'DAILY_FIXED' || user.paymentBase === 'DRIVER') ? (user.rate || 0) : 0,
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
    
    if (user.paymentBase === 'PER_SHIPMENT' && !shipmentCount) {
      toast.warning(t.shipmentsRequired);
      return;
    }

    setCameraMode('OUT');
    setFacingMode('user');
    setCapturedPhoto(null);
    setShowCamera(true);
    startCamera('user');
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

  const proceedCheckOut = async (photo: string, odometerEndInput?: number, pinCodesList: string[] = []) => {
    if (!user) return;
    if (!todayRecord?.id) {
      console.error("No active attendance record found for checkout:", todayRecord);
      toast.error("Internal Error: No active session found. Please refresh and try again. / অভ্যন্তরীণ সমস্যা: কোনো সক্রিয় সেশন পাওয়া যায়নি। দয়া করে রিফ্রেশ করে পুনরায় চেষ্টা করুন।");
      return;
    }

    setIsCheckingOut(true);
    try {
      // 1. Get Location with aggressive fallback
      const pos = await new Promise<GeolocationPosition>((res, rej) => {
        const timeoutId = setTimeout(() => {
          rej(new Error("Location request timed out. Trying low accuracy..."));
        }, 8000); // Shorter initial timeout for high accuracy

        navigator.geolocation.getCurrentPosition(
          (p) => { clearTimeout(timeoutId); res(p); },
          (err) => {
            clearTimeout(timeoutId);
            console.warn("High accuracy check-out location failed, trying low accuracy fallback:", err);
            navigator.geolocation.getCurrentPosition(
              (p) => res(p),
              (e) => { 
                let message = "Could not retrieve your location. Check GPS settings.";
                if (e.code === e.PERMISSION_DENIED) message = "Location permission denied.";
                rej(new Error(message)); 
              },
              { timeout: 10000, enableHighAccuracy: false }
            );
          },
          { timeout: 15000, enableHighAccuracy: true, maximumAge: 0 }
        );
      }).catch(e => {
        console.warn("Location error, using last known if available:", e);
        // If location fails, we might still want to allow checkout if they are close enough to the end of shift
        // but for now, let's keep it required for security as per original intent, but with better error msg
        throw new Error(e.message || "Checking-out requires location verification. Please enable GPS.");
      }) as GeolocationPosition;

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
        throw new Error(`${translations.en.notAtOffice}\n${translations.bn.notAtOffice}`);
      }

      const shipments = parseInt(shipmentCount) || 0;
      const earnings = user.paymentBase === 'PER_SHIPMENT' 
        ? shipments * (user.rate || 0) 
        : (user.rate || 0);

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
      toast.error(`${translations.en.invalidOdometer}\n${translations.bn.invalidOdometer}`);
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
        toast.warning("দয়া করে অন্তত একটি পিন কোড সিলেক্ট করুন। (Please select at least one PIN Code)");
        return;
      }

      const distance = val - startOdo;
      if (distance < 0.1) {
        if (!window.confirm(t.lowDistanceWarning)) {
          return;
        }
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
            {t.internetRequired}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Bar */}
      <header className="bg-white px-6 py-4 border-b border-app-border flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <label className="relative group cursor-pointer">
            <div className="w-10 h-10 bg-accent-blue rounded-full flex items-center justify-center text-white font-bold shadow-sm overflow-hidden ring-2 ring-bg-app">
              {user?.profilePicture ? (
                <img src={user.profilePicture} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                user?.name?.charAt(0) || '?'
              )}
            </div>
            <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Plus className="h-4 w-4 text-white" />
            </div>
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              onChange={handleProfilePictureChange}
              disabled={isUpdatingProfile}
            />
          </label>
          <div>
            <div className="flex items-center gap-2">
              <div className="text-sm font-bold leading-none">{user?.name}</div>
              <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", isOnline ? "bg-accent-green" : "bg-accent-red")} />
              <div className="flex items-center gap-0.5 bg-accent-green/10 px-1 py-0.5 rounded border border-accent-green/20">
                <ShieldCheck className="h-2.5 w-2.5 text-accent-green" />
                <span className="text-[5px] font-black text-accent-green uppercase tracking-tighter">AI Protected</span>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-1">
               <div className="text-[10px] text-text-secondary uppercase tracking-wider">{user?.jobTitle}</div>
               {user?.status && user.status !== 'ACTIVE' && (
                 <div className={cn(
                   "px-1.5 py-0.5 rounded-full text-[7px] font-black uppercase tracking-tighter flex items-center gap-1 border",
                   user.status === 'SUSPENDED' ? "bg-amber-500/5 text-amber-500 border-amber-500/20" : 
                   "bg-accent-red/5 text-accent-red border-accent-red/20"
                 )}>
                   {user.status === 'SUSPENDED' ? t.suspended : t.blocked}
                 </div>
               )}
               {todayRecord && !todayRecord.checkOutTime && (
                 <div className="flex items-center gap-1.5 bg-accent-green/5 border border-accent-green/20 px-2 py-0.5 rounded-full">
                   <div className="w-1 h-1 rounded-full bg-accent-green animate-pulse" />
                   <span className="text-[7px] font-black text-accent-green uppercase tracking-tighter">Live Track</span>
                 </div>
               )}
            </div>
            {canTrackMileage && (
              <div className="flex items-center gap-1.5 mt-1 bg-accent-blue/10 border border-accent-blue/20 px-2 py-0.5 rounded-full w-fit shadow-sm shadow-accent-blue/5">
                <MapPin className="h-2.5 w-2.5 text-accent-blue animate-bounce" />
                <span className="text-[9px] font-black text-accent-blue uppercase tracking-tighter">
                  {(monthlyMileage || 0).toFixed(1)} {t.km}
                </span>
              </div>
            )}
          </div>
        </div>
        <button 
          onClick={logout}
          className="p-2 text-text-secondary hover:text-accent-red transition-colors"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </header>

      {/* Employee Mobile Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-lg border-t border-app-border px-6 py-2 pb-safe z-50 flex justify-between items-center shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.1)]">
        <button
          onClick={() => setActiveView('SHIFT')}
          className={cn(
            "flex flex-col items-center gap-1 transition-all",
            activeView === 'SHIFT' ? "text-accent-blue scale-110" : "text-text-secondary opacity-60"
          )}
        >
          <Clock className={cn("h-6 w-6", activeView === 'SHIFT' && "fill-accent-blue/10")} />
          <span className="text-[8px] font-black uppercase tracking-tighter">Shift</span>
        </button>

        <button
          onClick={() => {
            if (!todayRecord) {
              toast.warning("Please Check-In first to access this feature. / এই ফিচারটি ব্যবহার করার জন্য প্রথমে চেক-ইন করুন।");
              return;
            }
            setActiveView('MISMATCH');
          }}
          className={cn(
            "flex flex-col items-center gap-1 transition-all relative",
            activeView === 'MISMATCH' ? "text-accent-blue scale-110" : "text-text-secondary opacity-60",
            !todayRecord && "opacity-30 grayscale"
          )}
        >
          <Barcode className={cn("h-6 w-6", activeView === 'MISMATCH' && "fill-accent-blue/10")} />
          <span className="text-[8px] font-black uppercase tracking-tighter">{t.valueMismatch}</span>
          {!todayRecord && <div className="absolute -top-1 -right-1 bg-white rounded-full p-0.5 shadow-sm border border-app-border"><ShieldCheck className="h-2 w-2 text-text-secondary" /></div>}
        </button>

        {user?.paymentBase === 'DAILY_FIXED' && (
          <button
            onClick={() => {
              if (!todayRecord) {
                toast.warning("Please Check-In first to access this feature. / এই ফিচারটি ব্যবহার করার জন্য প্রথমে চেক-ইন করুন।");
                return;
              }
              setActiveView('ADHOC');
            }}
            className={cn(
              "flex flex-col items-center gap-1 transition-all relative",
              activeView === 'ADHOC' ? "text-accent-blue scale-110" : "text-text-secondary opacity-60",
              !todayRecord && "opacity-30 grayscale"
            )}
          >
            <Plus className={cn("h-6 w-6", activeView === 'ADHOC' && "fill-accent-blue/10")} />
            <span className="text-[8px] font-black uppercase tracking-tighter">AD-HOC</span>
            {!todayRecord && <div className="absolute -top-1 -right-1 bg-white rounded-full p-0.5 shadow-sm border border-app-border"><ShieldCheck className="h-2 w-2 text-text-secondary" /></div>}
          </button>
        )}

        <button
          onClick={() => setActiveView('HISTORY')}
          className={cn(
            "flex flex-col items-center gap-1 transition-all relative",
            activeView === 'HISTORY' ? "text-accent-blue scale-110" : "text-text-secondary opacity-60"
          )}
        >
          <History className={cn("h-6 w-6", activeView === 'HISTORY' && "fill-accent-blue/10")} />
          <span className="text-[8px] font-black uppercase tracking-tighter">History</span>
        </button>

        <button
          onClick={() => setActiveView('COUNTER')}
          className={cn(
            "flex flex-col items-center gap-1 transition-all relative",
            activeView === 'COUNTER' ? "text-accent-blue scale-110" : "text-text-secondary opacity-60"
          )}
        >
          <Calculator className={cn("h-6 w-6", activeView === 'COUNTER' && "fill-accent-blue/10")} />
          <span className="text-[8px] font-black uppercase tracking-tighter">Counter</span>
        </button>
      </div>

      <div className="p-6 space-y-6 pb-32">
        {!todayRecord ? (
          <div className="space-y-6">
            {/* Urgent Check-in Prompt */}
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-amber-50 border-2 border-amber-200 p-6 rounded-[32px] text-center space-y-3 shadow-xl shadow-amber-500/5"
            >
              <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-2">
                <AlertTriangle className="h-8 w-8" />
              </div>
              <h2 className="text-lg font-black text-amber-900 uppercase tracking-tight">Check-In Required</h2>
              <p className="text-xs text-amber-800 font-medium leading-relaxed">
                সব ফিচার ব্যবহার করার জন্য প্রথমে আপনাকে চেকিং করতে হবে। <br />
                (To access all features, you must Check-In first.)
              </p>
            </motion.div>

            {/* Attendance Section (Always visible but forced to Check-in state when !todayRecord) */}
            <div className="bg-white rounded-[32px] border border-app-border shadow-sm overflow-hidden flex flex-col">
              <div className="p-8 pb-4 flex flex-col items-center text-center space-y-4">
                <div className="w-20 h-20 rounded-full flex items-center justify-center bg-accent-blue/10 text-accent-blue shadow-inner">
                  <LogIn className="h-10 w-10" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">{t.notCheckedIn}</h3>
                  <p className="text-[10px] text-text-secondary font-black uppercase tracking-[0.2em]">
                    {format(new Date(), 'EEEE, dd MMMM')}
                  </p>
                </div>
              </div>

              <div className="px-8 pb-8 space-y-6">
                <div className="space-y-4">
                  <div className="py-2 text-center text-xs text-text-secondary font-medium italic opacity-70">
                    Mandatory Step: Check In now
                  </div>
                  <button
                    onClick={handleCheckIn}
                    disabled={isCheckingIn || !isOnline}
                    className="w-full h-16 bg-accent-blue hover:bg-accent-blue/90 text-white rounded-2xl flex items-center justify-center gap-3 font-black uppercase tracking-widest transition-all active:scale-95 shadow-xl shadow-accent-blue/20"
                  >
                    {isCheckingIn ? (
                      <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <LogIn className="h-6 w-6" />
                        {t.checkIn}
                      </>
                    )}
                  </button>
                  <div className="flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-tighter text-text-secondary/50">
                    <Wifi className={cn("h-3 w-3", isOnline ? "text-accent-green" : "text-accent-red")} />
                    {t.status}: {isOnline ? t.online : t.offline}
                  </div>
                </div>
              </div>
            </div>

            {/* Added Calendar for Paydays Visibility even before check-in */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 px-2">
                <Calendar className="w-4 h-4 text-accent-blue" />
                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 underline decoration-accent-blue/30 underline-offset-4">Attendance & Salary Calendar</h3>
              </div>
              <AttendanceCalendar 
                userId={user!.id} 
                userName={user!.name} 
                paydays={paydays}
              />
              <p className="px-4 text-[9px] font-medium text-slate-400 italic text-center">
                Check 💰 symbols to know your scheduled salary dates. / আপনার বেতন প্রদানের তারিখ জানতে 💰 চিহ্নটি দেখুন।
              </p>
            </div>
          </div>
        ) : (
          <>
            {activeView === 'SHIFT' && (
              <>
                {/* Payday Alert */}
        <AnimatePresence>
          {isPaydayToday && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
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
        <div className="space-y-4">
          <div className="bg-white rounded-[32px] border border-app-border shadow-sm overflow-hidden flex flex-col">
            <div className="p-8 pb-4 flex flex-col items-center text-center space-y-4">
              <div className={cn(
                "w-20 h-20 rounded-full flex items-center justify-center transition-all duration-500 shadow-inner",
                !todayRecord ? "bg-accent-blue/10 text-accent-blue" : (todayRecord.checkOutTime ? "bg-accent-green/10 text-accent-green" : "bg-accent-orange/10 text-accent-orange")
              )}>
                {!todayRecord ? <LogIn className="h-10 w-10" /> : (todayRecord.checkOutTime ? <ShieldCheck className="h-10 w-10" /> : <Clock className="h-10 w-10 animate-pulse text-amber-500" />)}
              </div>
              <div className="space-y-1">
                <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                  {!todayRecord ? t.notCheckedIn : (todayRecord.checkOutTime ? t.shiftEnded : t.onDuty)}
                </h3>
                <p className="text-[10px] text-text-secondary font-black uppercase tracking-[0.2em]">
                  {format(new Date(), 'EEEE, dd MMMM')}
                </p>
              </div>
            </div>

            {/* Main Finance Summary Card - High Visibility */}
            <div className="grid grid-cols-2 gap-4 px-8 pb-4">
              <div className="bg-bg-app border-2 border-accent-green/20 p-4 rounded-[24px] flex flex-col items-center justify-center text-center shadow-sm relative overflow-hidden group">
                <div className="absolute top-2 right-2 w-1.5 h-1.5 bg-accent-green rounded-full animate-pulse" />
                <div className="text-[10px] font-black uppercase text-accent-green tracking-widest mb-1">Today's Income</div>
                <div className="text-xl font-black text-slate-900 leading-none flex items-center gap-1">
                  <span className="text-sm font-bold text-slate-400">₹</span>
                  {todayEarnings.toLocaleString()}
                </div>
              </div>
              <div className="bg-bg-app border-2 border-accent-blue/20 p-4 rounded-[24px] flex flex-col items-center justify-center text-center shadow-sm relative">
                <div className="text-[10px] font-black uppercase text-accent-blue tracking-widest mb-1">Monthly Total</div>
                <div className="text-xl font-black text-slate-900 leading-none flex items-center gap-1">
                  <span className="text-sm font-bold text-slate-400">₹</span>
                  {totalMonthlyEarnings.toLocaleString()}
                </div>
              </div>
            </div>

            <div className="px-8 pb-8 space-y-6">
              {!todayRecord ? (
                <div className="space-y-4">
                  <div className="py-2 text-center text-xs text-text-secondary font-medium italic opacity-70">
                    Step 1: Check In to start your daily log
                  </div>
                  <button
                    onClick={handleCheckIn}
                    disabled={isCheckingIn || !isOnline}
                    className="w-full h-16 bg-accent-blue hover:bg-accent-blue/90 text-white rounded-2xl flex items-center justify-center gap-3 font-black uppercase tracking-widest transition-all active:scale-95 shadow-xl shadow-accent-blue/20"
                  >
                    {isCheckingIn ? (
                      <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <LogIn className="h-6 w-6" />
                        {t.checkIn}
                      </>
                    )}
                  </button>
                  <div className="flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-tighter text-text-secondary/50">
                    <Wifi className={cn("h-3 w-3", isOnline ? "text-accent-green" : "text-accent-red")} />
                    {t.status}: {isOnline ? t.online : t.offline}
                  </div>
                </div>
              ) : !todayRecord.checkOutTime ? (
                <div className="space-y-6">
                  {/* Active Shift Details */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-bg-app rounded-2xl p-4 border border-app-border flex flex-col gap-1 items-center justify-center text-center">
                      <span className="text-[8px] font-black text-text-secondary uppercase tracking-widest">{t.inAt}</span>
                      <span className="text-base font-black text-slate-900">{format(new Date(todayRecord.checkInTime), 'hh:mm a')}</span>
                    </div>
                    {canTrackMileage && (
                      <div className="bg-bg-app rounded-2xl p-4 border border-app-border flex flex-col gap-1 items-center justify-center text-center">
                        <span className="text-[8px] font-black text-text-secondary uppercase tracking-widest">{t.startOdo}</span>
                        <span className="text-base font-black text-slate-900">{todayRecord.odometerStart} KM</span>
                      </div>
                    )}
                  </div>

                  {/* Payment Specific Inputs */}
                  {user?.paymentBase === 'PER_SHIPMENT' && (
                    <div className="space-y-4">
                      <div className="bg-bg-app p-5 rounded-2xl border-2 border-accent-blue/10 focus-within:border-accent-blue/40 transition-all space-y-3 shadow-inner">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-black text-accent-blue uppercase tracking-widest flex items-center gap-2">
                             <PackageCheck className="h-4 w-4" /> {t.shipments}
                          </label>
                          <button 
                            onClick={() => setShowShipmentHistory(true)}
                            className="text-[9px] font-black text-accent-blue hover:underline uppercase tracking-wide flex items-center gap-1"
                          >
                            <History className="h-3 w-3" /> View Records
                          </button>
                        </div>
                        <div className="flex items-center justify-between gap-6 bg-slate-900/5 p-4 rounded-2xl border border-app-border mx-2">
                          <button 
                            onClick={() => setShipmentCount(prev => Math.max(0, (parseInt(prev) || 0) - 1).toString())}
                            className="w-12 h-12 bg-white border border-app-border rounded-xl flex items-center justify-center font-bold text-2xl active:bg-bg-app transition-colors shadow-sm"
                          >
                            -
                          </button>
                          <div className="flex-1 text-center">
                            <input
                              type="number"
                              value={shipmentCount}
                              onChange={(e) => setShipmentCount(e.target.value)}
                              placeholder="0"
                              className="w-full bg-transparent text-5xl font-black outline-none tracking-tighter text-center text-slate-900"
                            />
                            <div className="text-[10px] font-black text-accent-blue/60 uppercase tracking-[0.1em] mt-1 pr-1">{t.units}</div>
                          </div>
                          <button 
                            onClick={() => setShipmentCount(prev => ((parseInt(prev) || 0) + 1).toString())}
                            className="w-12 h-12 bg-accent-blue text-white rounded-xl flex items-center justify-center font-bold text-2xl active:scale-110 shadow-lg shadow-accent-blue/20 transition-all"
                          >
                            +
                          </button>
                        </div>
                        <div className="text-[9px] text-text-secondary font-bold uppercase text-center opacity-70">
                          Total shipment units for today's delivery
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Active Status Ribbon */}
                  <div className="bg-accent-green/5 border border-accent-green/10 rounded-2xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-3 h-3 bg-accent-green rounded-full animate-ping opacity-20" />
                        <div className="absolute inset-0 w-3 h-3 bg-accent-green rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                      </div>
                      <div>
                        <div className="text-[10px] font-black text-accent-green uppercase tracking-widest leading-none mb-1 flex items-center gap-1.5">
                           Live Monitoring Active
                           <div className="flex items-center gap-1 bg-accent-green text-white px-1.5 py-0.5 rounded shadow-sm text-[6px]">
                             <ShieldCheck className="h-2 w-2" />
                             AI SHIELD
                           </div>
                        </div>
                        <div className="text-[9px] text-accent-green/60 font-medium">Your data and safety are AI-protected</div>
                        {isWakeLockBlocked && (
                          <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 max-w-[200px]">
                            <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0 mt-0.5" />
                            <p className="text-[8px] text-amber-800 font-bold leading-normal">
                              BACKGROUND PERSISTENCE RESTRICTED. FOR FULL BACKGROUND WORK, PLEASE OPEN IN <b>NEW TAB</b>.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                    {canTrackMileage && (
                      <div className="bg-white/50 px-3 py-1.5 rounded-xl border border-app-border flex items-center gap-2">
                        <MapPin className="h-3 w-3 text-accent-blue" />
                        <span className="text-[10px] font-black text-slate-900">{(todayRecord?.distanceDriven || 0).toFixed(1)} KM</span>
                      </div>
                    )}
                  </div>

                   <div className="space-y-3">
                    <div className="text-center text-[10px] text-text-secondary font-bold italic opacity-60 uppercase tracking-widest">
                      Step 2: Check Out to complete task
                    </div>
                    <button
                      onClick={handleCheckOut}
                      disabled={isCheckingOut || (user.paymentBase === 'PER_SHIPMENT' && !shipmentCount)}
                      className={cn(
                        "w-full h-16 text-white rounded-2xl flex items-center justify-center gap-3 font-black uppercase tracking-widest transition-all active:scale-95 shadow-xl",
                        (isCheckingOut || (user.paymentBase === 'PER_SHIPMENT' && !shipmentCount)) 
                          ? "bg-slate-200 text-slate-400 shadow-none cursor-not-allowed" 
                          : "bg-accent-red shadow-accent-red/20"
                      )}
                    >
                      {isCheckingOut ? (
                        <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          <LogOut className="h-6 w-6" />
                          {t.checkOut}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6 pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-bg-app p-4 rounded-2xl border border-app-border flex flex-col items-center justify-center text-center">
                       <span className="text-[8px] font-black text-text-secondary uppercase tracking-widest mb-1">{t.earnings}</span>
                       <span className="text-xl font-black text-accent-green">₹{todayRecord.earnings}</span>
                    </div>
                    <div className="bg-bg-app p-4 rounded-2xl border border-app-border flex flex-col items-center justify-center text-center">
                       <span className="text-[8px] font-black text-text-secondary uppercase tracking-widest mb-1">{t.hoursWorked}</span>
                       <span className="text-xl font-black text-slate-900">{todayRecord.hoursWorked || 0} hrs</span>
                    </div>
                  </div>

                  {canTrackMileage && todayRecord.distanceDriven !== undefined && (
                    <div className="bg-accent-blue/5 p-4 rounded-2xl border border-accent-blue/10 flex flex-col items-center text-center space-y-2">
                       <div className="flex items-center gap-2 text-accent-blue">
                         <MapPin className="h-4 w-4" />
                         <span className="text-[10px] font-black uppercase tracking-widest">{t.tripSummary}</span>
                       </div>
                       <div className="text-2xl font-black text-slate-900 leading-none">
                         {(todayRecord.distanceDriven || 0).toFixed(1)} <span className="text-xs uppercase text-text-secondary/60">{t.km}</span>
                       </div>
                       {todayRecord.distanceDriven < 0.1 && (
                         <div className="mt-2 p-2 bg-amber-50 rounded-lg border border-amber-200 flex items-center gap-2">
                           <AlertTriangle className="h-3 w-3 text-amber-500" />
                           <span className="text-[9px] font-black text-amber-700 uppercase tracking-widest">{t.lowDistanceFlagged}</span>
                         </div>
                       )}
                    </div>
                  )}

                  <div className="text-center p-2">
                    <span className="text-[10px] font-black text-accent-green uppercase bg-accent-green/10 px-4 py-2 rounded-full tracking-widest">
                      Daily Task Completed
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

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
             <div className="bg-slate-900 rounded-2xl p-5 text-white flex items-center justify-between shadow-lg">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center">
                    <History className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <div className="text-[10px] font-black text-white/50 uppercase tracking-widest">{t.monthlyMileage}</div>
                    <div className="text-xl font-black text-white">{monthlyMileage} {t.km}</div>
                  </div>
                </div>
                <div className="text-right">
                   <div className="text-[9px] font-black text-accent-blue uppercase tracking-tighter bg-accent-blue/20 px-2 py-1 rounded">Verified Trip Log</div>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* Stats Grid */}
        <div className="grid grid-cols-1 gap-3">
          {/* WhatsApp Live Call button removed as requested */}
        </div>
      </>
    )}

        {activeView === 'MISMATCH' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-6"
          >
            <div className="bg-slate-900 rounded-[32px] p-6 text-white shadow-2xl relative overflow-hidden">
               <div className="absolute top-0 right-0 w-32 h-32 bg-accent-blue/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
               <h2 className="text-2xl font-black uppercase tracking-tight mb-1">{t.valueMismatch}</h2>
               <p className="text-[10px] text-white/50 font-black uppercase tracking-widest">Record barcode discrepancies</p>
            </div>

            <div className="bg-white rounded-[32px] border border-app-border p-6 space-y-6 shadow-xl">
               <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                       <div className="w-10 h-10 bg-accent-blue/10 rounded-xl flex items-center justify-center text-accent-blue">
                          <Barcode className="h-5 w-5" />
                       </div>
                       <div>
                          <div className="text-sm font-black text-slate-900 uppercase">Barcodes</div>
                          <div className="text-[10px] font-bold text-text-secondary uppercase">{barcodes.length}/20 Scanned</div>
                       </div>
                    </div>
                  </div>
               </div>

                  <div className="grid grid-cols-2 gap-3">
                      <button 
                        onClick={() => setShowBarcodeScanner(true)}
                        disabled={barcodes.length >= 20}
                        className="bg-accent-blue text-white h-12 rounded-xl text-[10px] font-black uppercase tracking-widest flex flex-col items-center justify-center shadow-lg shadow-accent-blue/20 active:scale-95 transition-all disabled:opacity-50"
                      >
                        <div className="flex items-center gap-2">
                           <Scan className="h-4 w-4" /> <span>Fast Scan</span>
                        </div>
                        <span className="text-[7px] opacity-60">AI Optimized • 1s Detect</span>
                      </button>
                     <button 
                       onClick={handleAddManualBarcode}
                       disabled={barcodes.length >= 20}
                       className="bg-bg-app border border-app-border text-slate-900 h-12 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-white active:scale-95 transition-all disabled:opacity-50"
                     >
                       <Plus className="h-4 w-4" /> {t.manualEntry}
                     </button>
                  </div>
               </div>

               {barcodes.length > 0 && (
                  <div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto pr-1">
                    {barcodes.map((code, idx) => (
                      <div key={`barcode-${code}-${idx}`} className="bg-bg-app border border-app-border p-3 rounded-xl flex items-center justify-between shadow-sm animate-in zoom-in-95 duration-300">
                        <span className="text-[10px] font-black text-slate-700 truncate">{code}</span>
                        <button 
                          onClick={() => setBarcodes(prev => prev.filter((_, i) => i !== idx))}
                          className="text-accent-red p-1"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
               )}

               <div className="pt-6 border-t border-app-border space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2 relative">
                       <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest block px-1">Customer Value / কাস্টমার ভ্যালু</label>
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
                         className="w-full bg-bg-app border border-app-border rounded-xl px-4 py-3.5 text-sm font-black outline-none focus:border-accent-blue focus:ring-4 focus:ring-accent-blue/5 transition-all cursor-pointer"
                       />
                       {showCopiedIndicator && (
                         <div className="absolute -top-1 right-0 bg-accent-blue text-white text-[8px] font-black px-2 py-1 rounded-full animate-bounce">
                           COPIED!
                         </div>
                       )}
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest block px-1">ERP Value / ERP ভ্যালু</label>
                       <input 
                         type="number"
                         value={erpValue}
                         onChange={(e) => setErpValue(e.target.value)}
                         placeholder="0.00"
                         className="w-full bg-bg-app border border-app-border rounded-xl px-4 py-3.5 text-sm font-black outline-none focus:border-accent-blue focus:ring-4 focus:ring-accent-blue/5 transition-all"
                       />
                    </div>
                  </div>

                  <div className="bg-accent-blue/5 rounded-2xl p-4 flex items-center justify-between border border-accent-blue/10">
                    <div className="flex items-center gap-3">
                       <Calculator className="h-5 w-5 text-accent-blue" />
                       <div className="text-xs font-black text-accent-blue uppercase tracking-tight">ERP - Customer</div>
                    </div>
                    <div className={cn(
                      "text-xl font-black",
                      difference < 0 ? "text-accent-red" : "text-accent-green"
                    )}>
                       ₹{(difference || 0).toFixed(2)}
                    </div>
                  </div>

                  {/* Photo Upload Section - Appears after values are entered as requested */}
                  {barcodes.length > 0 && erpValue && customerValue && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-500">
                      <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest block px-1">Customer Value Photo / কাস্টমার ভ্যালু ফটো</label>
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <label className={cn(
                            "flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-2xl cursor-pointer transition-all",
                            mismatchPhoto ? "border-accent-green/50 bg-accent-green/5" : "border-app-border hover:border-accent-blue hover:bg-accent-blue/5"
                          )}>
                            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                              {isCompressing ? (
                                <RefreshCw className="h-6 w-6 text-accent-blue animate-spin" />
                              ) : mismatchPhoto ? (
                                <img src={mismatchPhoto} alt="Captured" className="h-24 w-auto rounded-lg shadow-md" />
                              ) : (
                                <>
                                  <Camera className="h-6 w-6 text-text-secondary mb-2" />
                                  <p className="text-[8px] font-bold text-text-secondary uppercase tracking-wider text-center px-4">Tap to Take Photo / ফটো তুলতে এখানে ক্লিক করুন</p>
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
                          </label>
                        </div>
                        {mismatchPhoto && (
                          <button 
                            onClick={() => setMismatchPhoto(null)}
                            className="bg-accent-red/10 text-accent-red p-3 rounded-2xl self-end"
                          >
                            <Trash2 className="h-5 w-5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleReportMismatch}
                    disabled={isSubmittingMismatch || isCompressing || !erpValue || !customerValue || barcodes.length === 0 || !mismatchPhoto}
                    className={cn(
                      "w-full h-20 rounded-3xl flex flex-col items-center justify-center gap-1 font-black uppercase tracking-widest transition-all active:scale-95 shadow-xl",
                      (isSubmittingMismatch || isCompressing || !erpValue || !customerValue || barcodes.length === 0 || !mismatchPhoto) 
                        ? "bg-slate-300 shadow-none cursor-not-allowed" 
                        : "bg-accent-blue shadow-accent-blue/20"
                    )}
                  >
                    {isSubmittingMismatch ? (
                      <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <div className="flex items-center gap-3 text-white">
                           <Send className="h-6 w-6" />
                           <span>Submit Mismatch Report</span>
                        </div>
                        <span className="text-[9px] text-white/70 tracking-[0.1em] font-medium">
                          Data & Photo will be directly saved to Admin
                        </span>
                      </>
                    )}
                  </button>
               </div>

            {/* Today's Mismatch History */}
            {mismatches.length > 0 && new Date().getHours() >= 1 && (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="h-px flex-1 bg-app-border" />
                  <span className="text-[10px] font-black uppercase text-text-secondary tracking-widest px-2">Today's Total Amount</span>
                  <div className="h-px flex-1 bg-app-border" />
                </div>
                
                <div className="grid grid-cols-1 gap-4">
                  <div className="bg-white border border-app-border rounded-[24px] p-6 shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-accent-blue/10 rounded-xl flex items-center justify-center text-accent-blue">
                        <Calculator className="h-5 w-5" />
                      </div>
                      <div className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Calculated Mismatch</div>
                    </div>
                    <div className={cn(
                      "text-2xl font-black",
                      mismatches.reduce((sum, m) => sum + (m.valueDifference || 0), 0) < 0 ? "text-accent-red" : "text-accent-green"
                    )}>
                      ₹{mismatches.reduce((sum, m) => sum + (m.valueDifference || 0), 0).toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-[10px] font-black text-text-secondary uppercase tracking-[0.2em] px-2 flex items-center gap-2">
                    <History className="h-3 w-3" /> Recent Mismatches
                  </h3>
                  {mismatches.map((m, idx) => (
                    <div key={`mismatch-${m.id || 'no-id'}-${idx}`} className="bg-white border border-app-border rounded-2xl p-4 flex flex-col gap-3 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <div className="flex items-center justify-between">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                           {m.timestamp ? format(new Date(m.timestamp), 'hh:mm:ss a') : 'Unknown Time'}
                        </div>
                        <button 
                          onClick={async () => {
                            if (window.confirm("Confirm delete this record?")) {
                              try {
                                await SupabaseService.delete('mismatches', m.id!);
                                setMismatches(prev => prev.filter(item => item.id !== m.id));
                              } catch (err) {
                                console.error("Delete failed:", err);
                                toast.error("Failed to delete record.");
                              }
                            }
                          }}
                          className="p-2 hover:bg-accent-red/5 text-text-secondary hover:text-accent-red rounded-xl transition-all border border-app-border/50 shadow-sm active:scale-95"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
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

                      <div className="flex items-center justify-between px-1">
                        <span className="text-[8px] font-black uppercase tracking-widest opacity-60">Variance</span>
                        <span className={cn(
                          "text-sm font-black",
                          (m.valueDifference || 0) < 0 ? "text-accent-red" : "text-accent-green"
                        )}>
                          {(m.valueDifference || 0) < 0 ? '-' : '+'}₹{Math.abs(m.valueDifference || 0).toLocaleString()}
                        </span>
                      </div>

                      {(m.customerPhoto || m.erpPhoto) && (
                        <div className="space-y-2 mt-2">
                          <div 
                            className="relative aspect-video rounded-[20px] overflow-hidden border border-app-border bg-slate-50 group/img cursor-zoom-in"
                            onClick={() => window.open(m.customerPhoto || m.erpPhoto, '_blank')}
                          >
                            <img 
                              src={m.customerPhoto || m.erpPhoto} 
                              alt="Proof" 
                              className="w-full h-full object-cover transition-transform group-hover/img:scale-105"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                               <Eye className="w-5 h-5 text-white" />
                            </div>
                          </div>
                          
                          <button
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
                             className="w-full py-2.5 bg-bg-app hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all border border-app-border active:scale-95"
                          >
                            <Download className="w-3.5 h-3.5" /> Download Photo
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {activeView === 'ADHOC' && (
          <div className="space-y-6 animate-in slide-in-from-right duration-500">
            {!todayRecord || todayRecord.checkOutTime ? (
              <div className="bg-white rounded-[32px] border border-app-border p-12 text-center space-y-6 shadow-sm">
                <div className="w-20 h-20 bg-accent-orange/10 rounded-full flex items-center justify-center mx-auto text-accent-orange">
                  <AlertCircle className="h-10 w-10" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-black text-slate-900 uppercase">OFF-DUTY</h2>
                  <p className="text-text-secondary text-sm font-bold">
                    আগে ডিউটিতে যোগ দিন (Check In) তারপর AD-HOC সাবমিট করতে পারবেন।
                  </p>
                </div>
                <button 
                  onClick={() => setActiveView('SHIFT')}
                  className="px-8 py-3 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest"
                >
                  Go to Shift
                </button>
              </div>
            ) : (
              <>
                <div className="bg-slate-900 rounded-[32px] p-8 text-white shadow-2xl relative overflow-hidden">
                   <div className="absolute top-0 right-0 w-32 h-32 bg-accent-blue/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                   <div className="flex items-center gap-4 relative z-10">
                      <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center text-accent-blue">
                         <Plus className="h-8 w-8" />
                      </div>
                      <div>
                         <h2 className="text-2xl font-black uppercase tracking-tight">AD-HOC</h2>
                         <p className="text-[10px] text-white/50 font-black uppercase tracking-widest italic">Fixed Salary Support Module</p>
                      </div>
                   </div>
                </div>

                <div className="bg-white rounded-[32px] border border-app-border p-8 shadow-sm space-y-6">
                  {/* Once per day notice */}
                  {hasSubmittedAdHocToday && (
                    <div className="bg-accent-red/5 border border-accent-red/20 rounded-2xl p-6 flex flex-col items-center text-center gap-3 animate-in fade-in zoom-in duration-500">
                      <div className="w-12 h-12 bg-accent-red/10 rounded-full flex items-center justify-center text-accent-red">
                        <AlertCircle className="h-6 w-6" />
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs font-black text-accent-red uppercase tracking-widest">
                          {t.adHocSubmittedToday}
                        </div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-tight">
                          {t.adHocLimitReached}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest px-1">VEHICLE TYPE</label>
                      <div className="grid grid-cols-2 gap-3">
                        {['TOTO', 'TATA ACE(107)', 'MOTOR VAN', 'ENGINE VAN'].map((v) => (
                          <button
                            key={v}
                            onClick={() => setSelectedVehicle(v as any)}
                            disabled={hasSubmittedAdHocToday}
                            className={cn(
                              "py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all",
                              selectedVehicle === v 
                                ? "bg-slate-900 border-slate-900 text-white shadow-lg" 
                                : "bg-bg-app border-app-border text-text-secondary hover:border-slate-300",
                              hasSubmittedAdHocToday && "opacity-50 cursor-not-allowed"
                            )}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest px-1">START TIME</label>
                        <input 
                          type="time" 
                          value={adHocStartTime}
                          onChange={(e) => setAdHocStartTime(e.target.value)}
                          disabled={hasSubmittedAdHocToday}
                          className="w-full bg-bg-app border border-app-border rounded-2xl px-4 py-4 text-sm font-black outline-none focus:border-accent-blue transition-all disabled:opacity-50"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest px-1">END TIME</label>
                        <input 
                          type="time" 
                          value={adHocEndTime}
                          onChange={(e) => setAdHocEndTime(e.target.value)}
                          disabled={hasSubmittedAdHocToday}
                          className="w-full bg-bg-app border border-app-border rounded-2xl px-4 py-4 text-sm font-black outline-none focus:border-accent-blue transition-all disabled:opacity-50"
                        />
                      </div>
                    </div>

                    {adHocStartTime && adHocEndTime && (
                      <div className="bg-accent-blue/5 border border-accent-blue/10 rounded-2xl p-4 flex items-center justify-between">
                         <div className="text-[10px] font-black text-accent-blue uppercase tracking-widest">Total Working Hours</div>
                         <div className="text-xl font-black text-accent-blue">{adHocHours}<span className="text-[10px] ml-1 opacity-60">HRS</span></div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest px-1">VALUE / AMOUNT</label>
                      <div className="relative">
                        <div className="absolute left-5 top-1/2 -translate-y-1/2 text-text-secondary font-black">₹</div>
                        <input 
                          type="number" 
                          value={adHocValue}
                          onChange={(e) => setAdHocValue(e.target.value)}
                          disabled={hasSubmittedAdHocToday}
                          placeholder="0.00"
                          className="w-full bg-bg-app border border-app-border rounded-2xl pl-10 pr-4 py-4 text-sm font-black outline-none focus:border-accent-blue transition-all disabled:opacity-50"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleSubmitAdHoc}
                    disabled={isSubmittingAdHoc || !selectedVehicle || !adHocStartTime || !adHocEndTime || !adHocValue || hasSubmittedAdHocToday}
                    className="w-full py-5 bg-slate-900 text-white rounded-3xl font-black uppercase tracking-widest shadow-xl shadow-slate-900/10 active:scale-[0.98] transition-all disabled:opacity-50 disabled:grayscale"
                  >
                    {isSubmittingAdHoc ? t.adHocSubmitting : hasSubmittedAdHocToday ? t.adHocSubmittedToday : t.adHocConfirmed}
                  </button>
                </div>
              </>
            )}

            {/* Previous AD-HOC Jobs */}
            <div className="space-y-4">
              <h3 className="text-[10px] font-black text-text-secondary uppercase tracking-[0.2em] px-2 flex items-center gap-2">
                <History className="h-3 w-3" /> Recent AD-HOC History
              </h3>
              <div className="space-y-3">
                {adHocJobs.length > 0 ? (
                  adHocJobs.map((job, idx) => (
                    <div key={`emp-adhoc-${job.id || 'no-id'}-${idx}`} className="bg-white border border-app-border rounded-2xl p-4 flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300 group">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-bg-app rounded-xl flex items-center justify-center text-xs font-black">
                           <MapPin className="h-5 w-5 text-accent-blue opacity-30" />
                        </div>
                        <div>
                          <div className="text-[10px] font-black uppercase text-slate-900">{job.vehicleType}</div>
                          <div className="text-[8px] font-bold text-text-secondary uppercase tracking-tighter">
                            {format(new Date(job.timestamp), 'MMM dd')} • {job.startTime}-{job.endTime} ({job.totalHours}h)
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-sm font-black text-slate-900 leading-none mb-1 flex items-center justify-end gap-0.5">
                             <span className="text-[10px] text-slate-400 font-bold">₹</span>
                             {job.value.toLocaleString()}
                          </div>
                          <div className={cn(
                            "text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border",
                            job.status === 'PENDING' ? "bg-amber-500/10 border-amber-500/20 text-amber-600" : 
                            job.status === 'APPROVED' ? "bg-accent-green/10 border-accent-green/20 text-accent-green" : 
                            "bg-accent-red/10 border-accent-red/20 text-accent-red"
                          )}>
                            {job.status || 'PENDING'}
                          </div>
                        </div>
                        <button 
                          onClick={async () => {
                            if (window.confirm("Delete this log?")) {
                              await SupabaseService.delete('ad_hoc_jobs', job.id!);
                              setAdHocJobs(prev => prev.filter(j => j.id !== job.id));
                            }
                          }}
                          className="p-2 hover:bg-accent-red/5 text-text-secondary hover:text-accent-red rounded-xl transition-all border border-app-border/50 shadow-sm active:scale-95"
                        >
                           <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-app-border opacity-50">
                    <p className="text-[10px] font-black text-text-secondary uppercase tracking-widest italic">No entry records yet</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeView === 'COUNTER' && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="bg-slate-900 rounded-[32px] p-6 text-white shadow-2xl relative overflow-hidden">
               <div className="absolute top-0 right-0 w-32 h-32 bg-accent-blue/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
               <div className="flex items-center gap-4 relative z-10">
                  <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-accent-blue">
                     <Calculator className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black uppercase tracking-tight">Cash Counter / ক্যাশ কাউন্টার</h2>
                    <p className="text-[10px] text-white/50 font-black uppercase tracking-widest leading-none">Calculate total cash easily</p>
                  </div>
               </div>
            </div>

            <div className="bg-[#0c0f12] rounded-[32px] border-2 border-[#1a2026] overflow-hidden shadow-2xl p-4 md:p-6 space-y-4">
               <div className="divide-y divide-[#1e2730] space-y-3">
                  {[500, 200, 100, 50, 20, 10, 5, 2, 1].map((denom) => {
                    // Custom styles representing actual Indian banknotes colors with Mahatma Gandhi theme
                    const noteTheme = 
                      denom === 500 ? "from-[#57534e] to-[#292524] border-[#78716c]" : // Stone gray
                      denom === 200 ? "from-[#ea580c] to-[#9a3412] border-[#f97316]" : // Yellow-orange
                      denom === 100 ? "from-[#6366f1] to-[#3730a3] border-[#818cf8]" : // Lavender / Blue
                      denom === 50 ? "from-[#06b6d4] to-[#0891b2] border-[#22d3ee]" : // Fluorescent Teal-blue
                      denom === 20 ? "from-[#84cc16] to-[#4d7c0f] border-[#a3e635]" : // Yellow-green
                      denom === 10 ? "from-[#a16207] to-[#713f12] border-[#ca8a04]" : // Chocolate Brown
                      denom === 5 ? "from-[#10b981] to-[#047857] border-[#34d399]" : // Green-pink
                      denom === 2 ? "from-[#ec4899] to-[#be185d] border-[#f472b6]" : // Peach/rose
                      "from-[#06b6d3] to-[#1e3a8a] border-[#67e8f9]"; // Cyan-blue

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
                      <div key={denom} className="flex flex-col sm:flex-row sm:items-center py-4 px-2 hover:bg-white/5 rounded-2xl transition-all gap-4">
                        <div className="flex items-center gap-4 flex-1">
                          {/* Super Premium Indian Rupee Banknote GUI */}
                          <div className={cn(
                            "relative w-28 h-16 rounded-2xl bg-gradient-to-r border-2 shadow-inner flex items-center justify-between p-2 select-none overflow-hidden shrink-0 group/note",
                            noteTheme
                          )}>
                            {/* Watermark circle representing Gandhi profile silhouette in Photograph 8 */}
                            <div className="absolute inset-0 m-auto w-10 h-10 rounded-full border border-white/10 bg-white/5 opacity-10 flex items-center justify-center pointer-events-none">
                              <span className="text-[10px] uppercase font-black text-white">RBI</span>
                            </div>
                            
                            {/* Center denomination watermark */}
                            <div className="absolute inset-0 flex items-center justify-center font-mono text-xl font-black text-white/5 uppercase select-none pointer-events-none">
                              ₹{denom}
                            </div>

                            {/* Tactile superimposed buttons inside the banknote margins */}
                            <button 
                              type="button" 
                              onClick={decrement}
                              className="w-8 h-8 rounded-full bg-rose-500/80 hover:bg-rose-500 text-white flex items-center justify-center font-black shadow-lg transition-transform active:scale-75 z-10 select-none cursor-pointer"
                              title="Minus / মাইনাস"
                            >
                              -
                            </button>
                            
                            <span className="text-[10px] font-mono font-black text-white/50 bg-black/20 px-1 py-0.5 rounded pointer-events-none">
                              ₹{denom}
                            </span>

                            <button 
                              type="button" 
                              onClick={increment}
                              className="w-8 h-8 rounded-full bg-[#10b981]/80 hover:bg-[#10b981] text-white flex items-center justify-center font-black shadow-lg transition-transform active:scale-75 z-10 select-none cursor-pointer"
                              title="Plus / প্লাস"
                            >
                              +
                            </button>
                          </div>

                          {/* Multiplicaton Sign and Input Box */}
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-white/40">×</span>
                            <input 
                              type="number"
                              pattern="[0-9]*"
                              inputMode="numeric"
                              value={cashCounts[denom.toString()]}
                              onChange={(e) => setCashCounts(prev => ({ ...prev, [denom.toString()]: e.target.value }))}
                              placeholder="0"
                              className="w-16 bg-white border border-slate-700 text-slate-950 rounded-xl px-2.5 py-1.5 text-center text-sm font-black outline-none focus:ring-2 focus:ring-accent-blue transition-all"
                            />
                          </div>
                        </div>

                        {/* Gold calculated valuation panel on dark bg right margin */}
                        <div className="w-full sm:w-28 text-left sm:text-right shrink-0">
                          <div className="text-[8px] font-black text-white/40 uppercase tracking-widest leading-none mb-1">Subtotal</div>
                          <div className="text-base font-black text-amber-400 font-mono tracking-tight">
                            ₹{(denom * currentCount).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Online Cash Input */}
                  <div className="flex items-center p-4 gap-4 bg-accent-blue/10 rounded-2xl border border-accent-blue/20 mt-4">
                    <div className="w-14 h-10 rounded-lg bg-accent-blue flex items-center justify-center text-white font-black text-[10px] shadow-sm uppercase tracking-tighter shrink-0">
                      Online
                    </div>
                    <div className="flex-1">
                      <input 
                        type="number"
                        value={onlineCash}
                        onChange={(e) => setOnlineCash(e.target.value)}
                        placeholder="UPI / Net payment total..."
                        className="w-full bg-slate-800 text-white border border-slate-700/60 rounded-xl px-4 py-2 text-xs font-black outline-none focus:border-accent-blue focus:shadow-sm transition-all"
                      />
                    </div>
                    <div className="w-24 text-right">
                      <div className="text-[8px] font-black text-accent-blue uppercase tracking-widest leading-none mb-1">UPI/Net</div>
                      <div className="text-sm font-black text-accent-blue">₹{(parseInt(onlineCash) || 0).toLocaleString()}</div>
                    </div>
                  </div>

                  {/* Value Mismatch Display (Readonly) */}
                  <div className="flex items-center p-4 gap-4 bg-[#ef4444]/10 rounded-2xl border border-[#ef4444]/20 mt-4">
                    <div className="w-14 h-10 rounded-lg bg-accent-red flex items-center justify-center text-white font-black text-[9px] shadow-sm uppercase tracking-tighter text-center shrink-0">
                      Mismatch
                    </div>
                    <div className="flex-1">
                      <div className="text-[10px] font-black text-accent-red uppercase tracking-widest leading-none mb-1">Today's Value Mismatch</div>
                      <div className="text-xs font-bold text-white/50">Automatically calculated from reports</div>
                    </div>
                    <div className="w-24 text-right">
                      <div className="text-[8px] font-black text-accent-red uppercase tracking-widest leading-none mb-1">Amount</div>
                      <div className="text-sm font-black text-accent-red">₹{todaysValueMismatch.toLocaleString()}</div>
                    </div>
                  </div>
               </div>
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
          <div className="space-y-6 animate-in slide-in-from-right duration-500">

          <div className="bg-white p-4 rounded-2xl border border-app-border shadow-sm flex flex-col gap-1">
            <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">{t.monthlyTotal}</span>
            <span className="text-xl font-black text-accent-green tracking-tight">₹{monthlyEarnings}</span>
          </div>
          {canTrackMileage ? (
            <div className="bg-white p-4 rounded-2xl border border-app-border shadow-sm flex flex-col gap-1 items-start relative overflow-hidden group">
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
            </div>
          ) : (
            <div className="bg-white p-4 rounded-2xl border border-app-border shadow-sm flex flex-col gap-1">
              <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">{t.history}</span>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-black tracking-tight">{history.length}</span>
                <span className="text-[10px] text-text-secondary font-bold uppercase tracking-tighter">/ {format(viewMonth, 'MMM')}</span>
              </div>
            </div>
          )}
        
        {/* Unified Attendance Calendar */}
        <AttendanceCalendar 
          userId={user.id} 
          userName={user.name} 
          paydays={paydays}
        />
          
        {/* History List */}
          <div className="pt-6 border-t border-app-border space-y-4">
            <h4 className="text-[10px] font-bold text-text-secondary uppercase tracking-widest px-1 flex items-center gap-2">
              <History className="h-3 w-3" /> {t.detailedLogs || "Detailed Logs"}
            </h4>
            <div className="space-y-3">
              {history.length > 0 ? (
                history.map((record, hIdx) => {
                  const isPayday = paydays.some(p => p.date === record.date);
                  const isDriverLog = canTrackMileage && record.odometerStart !== undefined;
                  
                  return (
                    <div key={`emp-hist-${record.id || 'no-id'}-${hIdx}`} className={cn(
                      "group bg-white rounded-2xl border border-app-border hover:border-accent-blue/30 transition-all overflow-hidden flex flex-col",
                      record.status === 'FRAUDULENT' && "bg-accent-red/5 border-accent-red/20 opacity-80"
                    )}>
                      {/* Record Header */}
                      <div className="flex items-center justify-between p-4 border-b border-app-border/50 bg-bg-app/30">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-10 h-10 rounded-xl bg-white flex flex-col items-center justify-center border border-app-border shadow-sm",
                            record.status === 'FRAUDULENT' && "bg-accent-red/10 border-accent-red/20"
                          )}>
                            <span className="text-[9px] font-black text-text-secondary leading-none uppercase">{format(new Date(record.date), 'MMM')}</span>
                            <span className="text-sm font-black text-slate-900 leading-none mt-0.5">{format(new Date(record.date), 'dd')}</span>
                          </div>
                          <div>
                            <div className="text-[10px] font-black text-text-secondary uppercase tracking-wider">{format(new Date(record.date), 'EEEE')}</div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-xs font-black text-slate-900 uppercase">Shift Summary</span>
                              {isPayday && <span className="text-xs">💰</span>}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-black text-accent-green">₹{record.earnings}</div>
                          <div className="text-[9px] font-bold text-text-secondary uppercase tracking-widest">{t.earned || "Earned"}</div>
                        </div>
                      </div>

                      {/* Detailed Stats */}
                      <div className="p-4 grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-[9px] font-black text-text-secondary uppercase tracking-widest">
                            <Clock className="h-3 w-3 text-accent-blue" /> Timestamps
                          </div>
                          <div className="text-xs font-bold text-slate-900">
                             {format(new Date(record.checkInTime), 'hh:mm a')}
                             {record.checkOutTime ? ` - ${format(new Date(record.checkOutTime), 'hh:mm a')}` : <span className="text-accent-blue"> • In Progress</span>}
                          </div>
                          <div className="text-[10px] text-text-secondary/60">
                            {record.hoursWorked ? `${record.hoursWorked} hours logged` : 'Shift active'}
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
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-12 bg-bg-app rounded-2xl border border-dashed border-app-border">
                  <p className="text-xs text-text-secondary font-medium italic opacity-50">No records for this month</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )}
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
                 <h3 className="text-xl font-black uppercase tracking-widest">{t.captureSelfie}</h3>
                 <p className="text-[10px] font-bold opacity-60 uppercase mt-2 tracking-widest">
                   {cameraMode === 'IN' ? 'Check In Verification' : 'Check Out Verification'}
                 </p>
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
                      {odoMode === 'IN' ? t.inBox : t.outBox}
                    </h3>
                    <p className="text-xs text-text-secondary font-medium px-4">
                      {odoMode === 'IN' 
                        ? "Enter your starting odometer reading (KM) before beginning your shift."
                        : "Enter your ending odometer reading (KM) to complete your shift log."}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="bg-bg-app p-6 rounded-2xl border-2 border-accent-blue/30 focus-within:border-accent-blue transition-all">
                    <label className="text-[10px] font-black text-accent-blue uppercase tracking-widest block mb-2">Distance Reading (KM)</label>
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
                        <span className="text-[9px] font-black text-text-secondary uppercase tracking-widest">Start Reading</span>
                        <span className="text-xs font-black text-slate-900">{todayRecord.odometerStart} {t.km}</span>
                      </div>
                    )}
                  </div>

                  {odoMode === 'OUT' && (
                    <div className="bg-bg-app p-4 rounded-2xl border border-app-border space-y-3">
                      <span className="text-[10px] font-black text-accent-blue uppercase tracking-widest block">
                        Select Pin Codes / ডেলিভারি করা পিন কোডগুলো সিলেক্ট করুন
                      </span>
                      <div className="grid grid-cols-4 gap-1.5">
                        {['743263', '743248', '743222', '743221', '743234', '743704', '743294', '743711'].map((pin) => {
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
                                "py-2 px-1 rounded-xl text-xs font-black transition-all border",
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
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={() => setShowOdoModal(false)}
                      className="h-14 rounded-2xl text-[10px] font-black uppercase tracking-widest text-text-secondary bg-bg-app border border-app-border hover:bg-white transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleOdoSubmit}
                      disabled={!tempOdo || isCheckingIn || isCheckingOut}
                      className="h-14 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white bg-accent-blue shadow-lg shadow-accent-blue/20 active:scale-95 transition-all disabled:opacity-50"
                    >
                      {isCheckingIn || isCheckingOut ? "Saving..." : "Confirm"}
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
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest block px-1">{t.enterBarcode}</label>
                  <input
                    type="text"
                    autoFocus
                    value={manualBarcodeValue}
                    onChange={(e) => setManualBarcodeValue(e.target.value)}
                    placeholder="Enter barcode text..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') confirmManualBarcode();
                    }}
                    className="w-full bg-bg-app border border-app-border rounded-2xl px-4 py-4 text-sm font-black outline-none focus:border-accent-blue focus:ring-4 focus:ring-accent-blue/5 transition-all"
                  />
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
