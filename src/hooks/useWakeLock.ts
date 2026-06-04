import { useState, useEffect, useCallback } from 'react';

export function useWakeLock(extraCondition: boolean = true) {
  const [wakeLock, setWakeLock] = useState<any>(null);
  const [isActive, setIsActive] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);

  const requestWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) {
      console.warn('Wake Lock not supported on this browser');
      return;
    }

    try {
      console.log('Requesting Screen Wake Lock...');
      const lock = await (navigator as any).wakeLock.request('screen');
      setWakeLock(lock);
      setIsActive(true);
      setIsBlocked(false);
      
      lock.addEventListener('release', () => {
        console.log('Wake Lock was released');
        setIsActive(false);
        setWakeLock(null);
      });
      
      console.log('Wake Lock is active');
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.message.includes('permissions policy')) {
        console.warn('Wake Lock is blocked by permissions policy. Try opening the app in a new tab.');
        setIsBlocked(true);
      } else {
        console.error('Wake Lock error:', err);
      }
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLock) {
      await wakeLock.release();
      setWakeLock(null);
      setIsActive(false);
    }
  }, [wakeLock]);

  useEffect(() => {
    // Re-request wake lock when visibility changes (e.g. tab back in focus)
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && isActive && extraCondition) {
        await requestWakeLock();
        // Force a location update heartbeat
        if ('geolocation' in navigator) {
           navigator.geolocation.getCurrentPosition(() => {}, () => {}, { enableHighAccuracy: true });
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [wakeLock, isActive, requestWakeLock, extraCondition]);

  return { requestWakeLock, releaseWakeLock, isActive, isBlocked };
}
