import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Car, Bike, Footprints, Navigation, Clock, ShieldAlert } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import AnimatedHourglass, { HourglassHandle } from './components/AnimatedHourglass';
import { fetchMapboxETA, type TransportMode } from './services/traffic';

/** Utility for Tailwind class merging */
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- CONSTANTS ---
/** Calibrated time from drop-off to desk (in seconds) */
const WALKING_TO_CLASSROOM = 0; // 已移除，改為 0
/** Default parking/unloading buffer for driving (in seconds) */
const PARKING_BUFFER = 0; // 已移除，改為 0
/** Default school start time goal */
const DEFAULT_GOAL_TIME = "08:20";
/** Destination: Woodside Elementary School */
const DESTINATION_ADDRESS = "3195 Woodside Rd, Woodside, CA 94062";
/** Destination Coordinates */
const DESTINATION_COORDS = { lat: 37.4277608, lng: -122.259141 };

/** 
 * Calculate distance between two points using Haversine formula (in meters)
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // Earth radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

interface TimeScrollerProps {
  value: number;
  max: number;
  onChange: (val: number) => void;
}

function VerticalTimeScroller({ value, max, onChange }: TimeScrollerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemHeight = 64; // h-16
  const [isScrolling, setIsScrolling] = useState(false);
  
  // Create a looped array: [max-2, max-1, max, 0, 1, 2, ..., max, 0, 1, 2]
  // To keep it simple and smooth, we use 3 sets of numbers
  const singleRange = Array.from({ length: max + 1 }, (_, i) => i);
  const numbers = [...singleRange, ...singleRange, ...singleRange];
  const offset = max + 1;

  // Initial scroll to middle set
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = (value + offset) * itemHeight;
    }
  }, []);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    
    const scrollTop = scrollRef.current.scrollTop;
    const currentIndex = Math.round(scrollTop / itemHeight);
    const actualValue = currentIndex % (max + 1);

    if (actualValue !== value) {
      onChange(actualValue);
    }

    // Infinite scroll logic: jump back to middle set if reaching boundaries
    if (currentIndex < offset) {
      scrollRef.current.scrollTop = (currentIndex + offset) * itemHeight;
    } else if (currentIndex >= offset * 2) {
      scrollRef.current.scrollTop = (currentIndex - offset) * itemHeight;
    }
  };

  return (
    <div className="flex flex-col items-center group">
      <div className="relative h-16 w-24 overflow-hidden">
        <div 
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-full overflow-y-scroll snap-y snap-mandatory no-scrollbar scroller-mask"
        >
          {numbers.map((n, i) => (
            <div 
              key={i}
              className="h-16 flex items-center justify-center snap-center shrink-0"
            >
              <span className={cn(
                "text-6xl font-black transition-all duration-300 tracking-tighter",
                value === n ? "text-white scale-110" : "text-white/10 scale-75 blur-[1px]"
              )}>
                {n.toString().padStart(2, '0')}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [goalTime, setGoalTime] = useState(DEFAULT_GOAL_TIME);
  const [goalHour, setGoalHour] = useState(8);
  const [goalMinute, setGoalMinute] = useState(20);
  const [mode, setMode] = useState<TransportMode>('driving');
  const [allTravelTimes, setAllTravelTimes] = useState<Record<TransportMode, number | null>>({
    driving: 300,   // 5m * 60s
    bicycling: 600, // 10m * 60s
    walking: 2280   // 38m * 60s
  });
  const [routeDistances, setRouteDistances] = useState<Record<TransportMode, number | null>>({
    driving: null,
    bicycling: null,
    walking: null
  });
  
  const travelTime = allTravelTimes[mode];
  const [departureTime, setDepartureTime] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState<string>('');
  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState<number>(0);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [userCoords, setUserCoords] = useState<{ lat: number, lng: number } | null>(null);
  const [isGoogleLoaded, setIsGoogleLoaded] = useState(false);
  const [googleStatus, setGoogleStatus] = useState<'loading' | 'ready' | 'error' | 'none'>('none');
  const [apiError, setApiError] = useState<string | null>(null);
  const [trafficProvider, setTrafficProvider] = useState<'google' | 'mapbox'>('google');
  const [systemLogs, setSystemLogs] = useState<string[]>([]);
  const hourglassRef = useRef<HourglassHandle>(null);
  
  // --- ALARM SYSTEM ---
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const [isAlarmPlaying, setIsAlarmPlaying] = useState(false);
  const [hasPlayedAlarm, setHasPlayedAlarm] = useState(false);
  const justCrossedZeroRef = useRef(false);
  const prevDiffRef = useRef<number | null>(null);

  // Initialize Audio Context (Lazy Load & Unlock)
  const initAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().then(() => {
        console.log("🔊 AudioContext Resumed/Unlocked");
      }).catch(err => console.error("Audio resume failed", err));
    }
  }, []);

  // Unlock audio on first interaction
  useEffect(() => {
    const unlockAudio = () => {
        initAudioContext();
        // Remove listeners once unlocked
        window.removeEventListener('click', unlockAudio);
        window.removeEventListener('touchstart', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
    };

    window.addEventListener('click', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    return () => {
        window.removeEventListener('click', unlockAudio);
        window.removeEventListener('touchstart', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
    };
  }, [initAudioContext]);

  const stopAlarm = useCallback(() => {
    if (oscillatorRef.current) {
      try {
        oscillatorRef.current.stop();
        oscillatorRef.current.disconnect();
      } catch (e) {
        // ignore
      }
      oscillatorRef.current = null;
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.disconnect();
      gainNodeRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    setIsAlarmPlaying(false);
  }, []);

  const playAlarm = useCallback(() => {
    if (isAlarmPlaying) return;
    
    // Ensure context exists and is ready
    initAudioContext();
    const ctx = audioCtxRef.current;

    if (!ctx) {
        console.error("AudioContext initialization failed");
        return;
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    // Classic Alarm Sound: Square wave, A5 (880Hz)
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    
    // Rhythmic pattern: Beep-Beep-Beep-Beep...
    // 0.2s ON, 0.1s OFF
    const now = ctx.currentTime;
    for (let i = 0; i < 200; i++) { // Schedule ~60s of beeps
       const start = now + i * 0.3;
       const end = start + 0.2;
       gain.gain.setValueAtTime(0.1, start);
       gain.gain.setValueAtTime(0, end);
    }
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    oscillatorRef.current = osc;
    gainNodeRef.current = gain;
    setIsAlarmPlaying(true);
    setHasPlayedAlarm(true);
    
    // Cleanup automatically after 60s
    setTimeout(() => {
        if (audioCtxRef.current?.state === 'running') {
            stopAlarm();
        }
    }, 60000);
  }, [isAlarmPlaying, stopAlarm]);

  const addLog = (msg: string) => {
    setSystemLogs(prev => [msg, ...prev].slice(0, 5));
    console.log(`[SYS]: ${msg}`);
  };

  // Add a dedicated debug log for coordinates to see what's actually being used
  useEffect(() => {
    if (userCoords) {
      addLog(`Coords: ${userCoords.lat.toFixed(4)},${userCoords.lng.toFixed(4)}`);
    }
  }, [userCoords]);

  /**
   * Check for Mapbox Token
   */
  useEffect(() => {
    const mapboxToken = (import.meta as any).env.VITE_MAPBOX_TOKEN;
    if (mapboxToken) {
      setTrafficProvider('mapbox');
      addLog("Provider: Mapbox");
    } else {
      addLog("Provider: Google (Default)");
    }
  }, []);

  /**
   * Dynamically load Google Maps SDK
   */
  useEffect(() => {
    // If using Mapbox, we don't strictly need Google SDK for distance matrix, 
    // but we might keep it if we want to fallback or use it for other things.
    // For now, let's load it anyway unless explicitly disabled, 
    // but if trafficProvider is Mapbox, we won't use it for traffic.
    
    const checkGoogle = () => {
      if (typeof google !== 'undefined' && google.maps && google.maps.DistanceMatrixService) {
        setIsGoogleLoaded(true);
        setGoogleStatus('ready');
        addLog("Google SDK Ready");
        return true;
      }
      return false;
    };

    if (checkGoogle()) return;

    setGoogleStatus('loading');
    addLog("Loading Google SDK...");
    
    const apiKey = (import.meta as any).env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      setGoogleStatus('error');
      setApiError("API Key Missing");
      addLog("Error: API Key Missing");
      return;
    }

    const scriptId = 'google-maps-sdk';
    if (document.getElementById(scriptId)) {
      // If script exists but checkGoogle failed, wait a bit
      const timer = setInterval(() => {
        if (checkGoogle()) clearInterval(timer);
      }, 500);
      return () => clearInterval(timer);
    }

    const script = document.createElement('script');
    script.id = scriptId;
    (window as any).initGoogleMaps = () => {
      checkGoogle();
    };
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry,places&callback=initGoogleMaps`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      setGoogleStatus('error');
      addLog("SDK Load Failed");
    };
    document.head.appendChild(script);
  }, []);

  const [lastApiUpdate, setLastApiUpdate] = useState<Date | null>(null);
  const [isLive, setIsLive] = useState<Record<TransportMode, boolean>>({
    driving: false,
    bicycling: false,
    walking: false
  });

  /**
   * Sync goalTime string whenever hour or minute changes
   */
  useEffect(() => {
    const timeString = `${goalHour.toString().padStart(2, '0')}:${goalMinute.toString().padStart(2, '0')}`;
    setGoalTime(timeString);
  }, [goalHour, goalMinute]);

  /**
   * MATHEMATICAL LOGIC: calculateDepartureTime()
   * 
   * Formula: RequiredDeparture = GoalTime - RealTimeTraffic - WALKING_TO_CLASSROOM - ModeBuffer
   */
  const calculateDepartureTime = useCallback((trafficSecs: number, targetMode?: TransportMode) => {
    const activeMode = targetMode || mode;
    
    // 根據使用者回饋調整時間係數
    let adjustedTrafficSecs = trafficSecs;
    if (activeMode === 'walking') {
      adjustedTrafficSecs = trafficSecs * 1.85; // 步行 1.85x
    } else if (activeMode === 'bicycling') {
      adjustedTrafficSecs = trafficSecs * 1.25; // 騎車 1.25x
    }

    const now = new Date();
    const goalDate = new Date();
    goalDate.setHours(goalHour, goalMinute, 0, 0);

    const modeBuffer = activeMode === 'driving' ? PARKING_BUFFER : 0;
    const totalDeduction = Math.round(adjustedTrafficSecs + WALKING_TO_CLASSROOM + modeBuffer);
    
    // The moment you SHOULD have left
    const departure = new Date(goalDate.getTime() - totalDeduction * 1000);

    // We jump to tomorrow if:
    // 1. It's already a different day.
    // 2. It's more than 4 hours past today's goal time (grace period for "Time to go!").
    const isSameDay = now.getDate() === goalDate.getDate() && now.getMonth() === goalDate.getMonth();
    const hasPassedDeparture = now.getTime() > departure.getTime();
    const isWayPastGoal = now.getTime() > goalDate.getTime() + (4 * 3600 * 1000);

    if (isWayPastGoal || (hasPassedDeparture && !isSameDay)) {
      // If it's way past goal or already a different day, look forward to tomorrow
      goalDate.setDate(goalDate.getDate() + 1);
    } else if (hasPassedDeparture && isSameDay) {
      // Keep today's departure time to trigger "Time to go!"
    }

    const finalDeparture = new Date(goalDate.getTime() - totalDeduction * 1000);
    setDepartureTime(finalDeparture);
    setHasPlayedAlarm(false); // Reset alarm for new departure time
    stopAlarm(); // Stop any existing alarm
    
    // Reset prevDiffRef so we don't trigger alarm on large jumps
    // unless we are already tracking a countdown.
    // Actually, let's leave prevDiffRef alone so traffic updates don't break flow?
    // But if goal time changed manually, we might want to reset.
    // For now, let's NOT reset it here, but handle logic in interval.

    console.log(`🕒 New Departure Set: ${finalDeparture.toLocaleTimeString()} (based on ${trafficSecs}s)`);
  }, [goalHour, goalMinute, mode, stopAlarm]);

  const lastGoogleFetchTime = useRef<number>(0);
  const lastFetchTimes = useRef<Record<TransportMode, number>>({
    driving: 0,
    bicycling: 0,
    walking: 0
  });
  const lastCoords = useRef<{ lat: number, lng: number } | null>(null);
  const requestCycleCount = useRef<number>(0);

  /**
   * Fetch travel time from Google Maps or fallback to distance calculation
   */
  const updateTrafficData = useCallback((targetMode?: TransportMode, forcedCoords?: { lat: number, lng: number }) => {
    const now = Date.now();
    const origin = forcedCoords || userCoords;

    if (!origin) {
      addLog("Wait: No GPS");
      return;
    }

    if (trafficProvider === 'google' && !isGoogleLoaded) {
      addLog("Wait: No SDK");
      return;
    }

    // Check if position significantly moved (more than 100 meters) or forced or first time
    const hasMoved = !lastCoords.current || calculateDistance(origin.lat, origin.lng, lastCoords.current.lat, lastCoords.current.lng) > 100;
    const isFirstTime = requestCycleCount.current === 0;
    const isForced = !!targetMode || !!forcedCoords || isFirstTime;

    // Throttling: 
    // - If forced or moved: allow
    // - Selected mode: 30s throttle
    // - Other modes: 120s throttle
    const selectedThrottle = 30000;
    const backgroundThrottle = 120000;
    
    const isModeSelected = (m: TransportMode) => m === (targetMode || mode);
    
    // Check if we actually need to update
    const needsUpdate = (m: TransportMode) => {
      if (isForced || hasMoved) return true;
      const lastUpdate = lastFetchTimes.current[m] || 0;
      const throttle = isModeSelected(m) ? selectedThrottle : backgroundThrottle;
      return (now - lastUpdate) > throttle;
    };

    const modesToUpdate = (['driving', 'bicycling', 'walking'] as TransportMode[]).filter(needsUpdate);

    if (modesToUpdate.length === 0) return;

    lastCoords.current = origin;
    lastGoogleFetchTime.current = now; // Global last fetch for UI sync
    requestCycleCount.current++;

    addLog(`Live: Updating ${modesToUpdate.join(', ')} (${trafficProvider})...`);

    // --- TIMEOUT PROTECTION ---
    const timeoutId = setTimeout(() => {
      addLog(`ERR: API Timeout (8s)`);
    }, 8000);

    // Update fetch times for the modes we are about to fetch
    modesToUpdate.forEach(m => {
      lastFetchTimes.current[m] = now;
    });

    const lat = origin.lat.toFixed(4);
    const lng = origin.lng.toFixed(4);
    addLog(`API Req @ ${lat},${lng}`);
    
    // --- MAPBOX LOGIC ---
    if (trafficProvider === 'mapbox') {
      modesToUpdate.forEach(async (m) => {
        try {
          // Use current userCoords directly from state instead of 'origin' parameter
          // to ensure we are using the freshest react state.
          // Note: 'origin' passed to updateTrafficData might be stale if coming from a callback closure.
          const currentOrigin = userCoords || origin; 
          const result = await fetchMapboxETA(currentOrigin, DESTINATION_COORDS, m);
          
          if (result !== null) {
            clearTimeout(timeoutId);
            const durationValue = result.duration;
            const distanceValue = result.distance;
            const rawDuration = result.duration;

            addLog(`${m}: ${Math.round(rawDuration/60)}m (${(distanceValue/1000).toFixed(1)}km)`);
            
            setIsLive(prev => ({ ...prev, [m]: true }));
            setRouteDistances(prev => ({ ...prev, [m]: distanceValue }));
            setAllTravelTimes(prev => {
              const updated = { ...prev, [m]: rawDuration };
              if (m === (targetMode || mode)) {
                calculateDepartureTime(rawDuration, m);
              }
              return updated;
            });
            setLastApiUpdate(new Date());
            setApiError(null);
          } else {
             addLog(`${m} Fail: Null`);
          }
        } catch (err: any) {
          addLog(`${m} Err: ${err.message}`);
        }
      });
      return;
    }

    // --- GOOGLE LOGIC ---
    try {
      if (!google.maps.DistanceMatrixService) {
        addLog("ERR: No DM Service");
        return;
      }
      
      const service = new google.maps.DistanceMatrixService();
      const originLatLng = new google.maps.LatLng(origin.lat, origin.lng);
      const destLatLng = new google.maps.LatLng(DESTINATION_COORDS.lat, DESTINATION_COORDS.lng);

      const modesToFetch = [
        { m: 'driving', g: 'DRIVING' },
        { m: 'bicycling', g: 'BICYCLING' },
        { m: 'walking', g: 'WALKING' }
      ];

      // Execute all requests in parallel for maximum speed
      modesToFetch.forEach(({ m, g }) => {
        addLog(`> Req ${m}...`);
        service.getDistanceMatrix({
          origins: [originLatLng],
          destinations: [destLatLng],
          travelMode: g as any,
          drivingOptions: m === 'driving' ? {
            departureTime: new Date(),
            trafficModel: 'pessimistic' as any
          } : undefined
        }, (response, status) => {
          if (status !== 'OK') {
            addLog(`${m} Fail: ${status}`);
            setApiError(`Google API Error: ${status}`);
            return;
          }

          if (response && response.rows[0].elements[0].status === 'OK') {
              clearTimeout(timeoutId);
              const element = response.rows[0].elements[0];
              const duration = element.duration_in_traffic || element.duration;
              const durationValue = duration.value;
              
              addLog(`${m}: ${Math.round(durationValue/60)}m OK`);
              
              setIsLive(prev => ({ ...prev, [m as TransportMode]: true }));
              setAllTravelTimes(prev => {
                let finalDuration = durationValue;
                
                const updated = { ...prev, [m as TransportMode]: durationValue };
                // Always update departure time for the currently selected mode
                if (m === (targetMode || mode)) {
                  calculateDepartureTime(durationValue, m as TransportMode);
                }
                return updated;
              });
              setLastApiUpdate(new Date());
              setApiError(null);
            } else {
            const elementStatus = response?.rows[0]?.elements[0]?.status || 'UNKNOWN';
            addLog(`${m} Error: ${elementStatus}`);
          }
        });
      });
    } catch (err: any) {
      addLog(`API Error: ${err.message}`);
      setApiError(`API Error: ${err.message}`);
    }
  }, [mode, calculateDepartureTime, userCoords, isGoogleLoaded, locationError, trafficProvider]);

  const handleModeChange = (m: TransportMode) => {
    setMode(m);
    // If we have data for the new mode, update departure time immediately
    if (allTravelTimes[m]) {
      calculateDepartureTime(allTravelTimes[m]!, m);
    }
    // Still trigger an update to ensure it's fresh
    updateTrafficData(m);
  };

  // Geolocation logic
  const refreshLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation not supported");
      setUserCoords({ lat: 37.4419, lng: -122.1430 });
      return;
    }

    addLog("Locating (GPS Priority)...");
    
    // Strategy 1: Try High Accuracy (GPS) first
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        setUserCoords({ lat: latitude, lng: longitude });
        setLocationError(null);
        addLog(`GPS Fix: ${accuracy.toFixed(0)}m`);
      },
      (error) => {
        // If Permission Denied, show it clearly
        if (error.code === 1) {
          setLocationError("Location Permission Denied");
          addLog("ERR: Permission Denied");
          return;
        }

        // Strategy 2: Fallback to Low Accuracy (WiFi/IP)
        addLog("GPS Failed, trying WiFi/IP...");
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const { latitude, longitude, accuracy } = pos.coords;
            setUserCoords({ lat: latitude, lng: longitude });
            setLocationError(null);
            addLog(`WiFi Fix: ${accuracy.toFixed(0)}m`);
          },
          (err2) => {
            console.warn("WiFi/IP location error:", err2);
            if (!userCoords) {
              setUserCoords({ lat: 37.4419, lng: -122.1430 });
              // Only show error if explicitly denied. 
              if (err2.code === 1) {
                setLocationError("Location Permission Denied");
              } else {
                setLocationError(null);
              }
              addLog("Using Standby Location");
            }
          },
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 30000 }
        );
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  }, [userCoords]);

  useEffect(() => {
    refreshLocation();
    
    // Continuous background watching with low power (WiFi/IP based)
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const newCoords = { lat: position.coords.latitude, lng: position.coords.longitude };
        setUserCoords(newCoords);
        setLocationError(null);
      },
      undefined,
      { enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []); // Initial mount

  // Trigger traffic update whenever coordinates or mode changes
  useEffect(() => {
    if (userCoords) {
      // If we have coordinates, we try to fetch traffic regardless of location error status
      // because we might be using a fallback location that still needs traffic data.
      if (trafficProvider === 'mapbox') {
        updateTrafficData();
      } else if (isGoogleLoaded) {
        updateTrafficData();
      }
    }
  }, [userCoords, isGoogleLoaded, trafficProvider, updateTrafficData]);

  // Regular interval for live updates
  useEffect(() => {
    const interval = setInterval(() => {
      // Every 10 seconds, we attempt an update. 
      // updateTrafficData internally throttles to 15s unless moved > 100m.
      updateTrafficData();
    }, 10000); 

    return () => clearInterval(interval);
  }, [updateTrafficData]);

  // Force recalculation when goal time changes
  useEffect(() => {
    if (travelTime) {
      calculateDepartureTime(travelTime);
    }
  }, [goalTime, travelTime, calculateDepartureTime]);

  // Update countdown every second
  useEffect(() => {
    const timer = setInterval(() => {
      if (!departureTime) return;
      
      const now = new Date();
      const diff = departureTime.getTime() - now.getTime();
      
      // If time has passed today (within 24 hours), show "TIME TO GO!"
      if (diff <= 0) {
        // If we were counting down (previous tick was positive), mark trigger
        // Also check if jump wasn't too massive (e.g. < 5 seconds jump) to ensure it's a countdown
        // But traffic updates might cause jumps. Let's just trust prev > 0.
        if (prevDiffRef.current !== null && prevDiffRef.current > 0) {
           justCrossedZeroRef.current = true;
           console.log(`⏰ Trigger Armed! (Prev: ${prevDiffRef.current}, Curr: ${diff})`);
        }

        setCountdown("TIME TO GO!");
        setTimeRemainingSeconds(0);
        prevDiffRef.current = diff;
        return;
      }

      // Mark that we have seen a valid countdown state (> 0)
      prevDiffRef.current = diff;

      setTimeRemainingSeconds(Math.floor(diff / 1000));
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      
      setCountdown(`${h > 0 ? h + 'h ' : ''}${m}m ${s}s`);
    }, 1000);
    
    return () => clearInterval(timer);
  }, [departureTime]);

  // Trigger Alarm logic
  useEffect(() => {
    if (countdown === "TIME TO GO!" && !hasPlayedAlarm && !isAlarmPlaying && justCrossedZeroRef.current) {
      console.log("🔔 Attempting to play alarm...");
      playAlarm();
      justCrossedZeroRef.current = false; // Consume trigger
    }
  }, [countdown, hasPlayedAlarm, isAlarmPlaying, playAlarm]);

  const handleStartNavigation = () => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(DESTINATION_ADDRESS)}&travelmode=${mode}`;
    window.open(url, '_blank');
  };

  const formatDuration = (seconds: number | null, isLive: boolean, modeForFormat: TransportMode) => {
    if (seconds === null) return '--';
    
    // 應用係數調整
     let adjustedSeconds = seconds;
     if (modeForFormat === 'walking') {
       adjustedSeconds = seconds * 1.85;
     } else if (modeForFormat === 'bicycling') {
       adjustedSeconds = seconds * 1.25;
     }
    
    const mins = Math.round(adjustedSeconds / 60);
    return `${mins}m`;
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-6 pt-12 pb-20 max-w-lg mx-auto font-sans selection:bg-vibrant-blue/30 relative">
      {/* ... existing code ... */}
      {/* (Update labels and LIVE tag in the button loop) */}
      {/* Fixed Background Layer */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <img 
          src="/wes/wes.webp" 
          alt="background"
          className="w-full h-full object-cover"
          loading="eager"
          // @ts-ignore
          fetchpriority="high"
          style={{ 
            objectPosition: '65% center',
            filter: 'brightness(0.7) contrast(1.02) saturate(1.05)',
            imageRendering: '-webkit-optimize-contrast',
            WebkitBackfaceVisibility: 'hidden',
            backfaceVisibility: 'hidden',
            transform: 'translateZ(0)', // Force GPU acceleration for cleaner rendering
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/40" />
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/stardust.png")' }} />
      </div>
      
      {/* Main Glass Dashboard */}
      <main className="w-full space-y-8 relative z-10">
        
        {/* Time Picker Section (Vertical Scroller) */}
        <section className="glass rounded-[2.5rem] p-10 text-center relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <label className="text-[10px] font-black opacity-40 mb-8 block tracking-[0.5em] uppercase text-white">Arrival Goal</label>
          
          <div className="flex justify-center items-center gap-4">
            <VerticalTimeScroller 
              value={goalHour} 
              max={23} 
              onChange={setGoalHour} 
            />
            
            <div className="text-6xl font-thin text-white opacity-20 pb-8">:</div>

            <VerticalTimeScroller 
              value={goalMinute} 
              max={59} 
              onChange={setGoalMinute} 
            />
          </div>
        </section>

        {/* Mode Selector */}
        <section className="flex justify-between gap-4">
          {(['walking', 'driving', 'bicycling'] as TransportMode[]).map((m) => {
            const labels: Record<TransportMode, string> = {
              driving: 'DRIVING',
              bicycling: 'CYCLING',
              walking: 'WALKING'
            };
            return (
              <button
                key={m}
                onClick={() => handleModeChange(m)}
                className={cn(
                  "flex-1 glass rounded-3xl py-7 flex flex-col items-center gap-4 transition-all duration-500 active:scale-95 group relative overflow-hidden",
                  mode === m 
                    ? "bg-white/10 border-white/30 shadow-[0_20px_40px_rgba(0,0,0,0.3)] ring-1 ring-white/20" 
                    : "opacity-40 hover:opacity-80 hover:bg-white/5"
                )}
              >
                <div className={cn(
                  "transition-transform duration-500 group-hover:scale-110 relative z-10",
                  mode === m ? "text-white" : "text-white/70"
                )}>
                  {m === 'driving' && <Car size={28} strokeWidth={1} />}
                  {m === 'bicycling' && <Bike size={28} strokeWidth={1} />}
                  {m === 'walking' && <Footprints size={28} strokeWidth={1} />}
                </div>
                <div className="flex flex-col items-center gap-1 relative z-10">
                  <span className="text-[9px] font-black tracking-[0.2em] uppercase opacity-60">{labels[m]}</span>
                  <div className="flex items-center gap-1 mt-1">
                    <span className={cn(
                      "text-xs font-black tracking-tight",
                      isLive[m] ? "text-green-400" : "text-white/40"
                    )}>
                      {formatDuration(allTravelTimes[m], isLive[m], m)}
                    </span>
                    {isLive[m] && (
                       <div className="flex items-center gap-1 mt-1">
                         <div className="w-1 h-1 rounded-full bg-green-400 animate-pulse" />
                         <span className="text-green-400/80 text-[8px] font-bold uppercase tracking-tighter">Live</span>
                       </div>
                     )}
                  </div>
                </div>
                {mode === m && (
                  <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent" />
                )}
              </button>
            );
          })}
        </section>

        <button 
          onClick={() => {
            updateTrafficData(mode);
            hourglassRef.current?.reset();
          }}
          className="w-full py-3 text-[10px] font-black tracking-[0.3em] uppercase opacity-40 hover:opacity-100 transition-opacity flex items-center justify-center gap-2 select-none -mt-4"
        >
          <Clock size={12} />
          Sync Traffic Now
        </button>

        {/* Result Panel - Balanced for Time Management */}
        <section className="glass rounded-[3rem] px-12 pb-12 pt-1 text-center space-y-12 border-white/10 relative overflow-hidden select-none">
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-white/5 rounded-full blur-[100px]" />
          
          <div className="space-y-4 relative z-10 -mt-10">
            <div className="relative w-full flex justify-center py-0">
              <AnimatedHourglass ref={hourglassRef} />
            </div>

            <div  
              onClick={countdown === "TIME TO GO!" ? stopAlarm : undefined}
              className={cn(
              "text-4xl font-black tracking-tight transition-all duration-700 text-white drop-shadow-2xl select-none",
              countdown === "TIME TO GO!" ? "animate-heartbeat text-white cursor-pointer hover:scale-105 active:scale-95" : ""
            )}>
              {countdown || '---'}
              {countdown === "TIME TO GO!" && isAlarmPlaying && (
                <div className="text-[10px] font-bold text-red-500 mt-2 tracking-widest animate-pulse">
                  TAP TO STOP ALARM
                </div>
              )}
            </div>
          </div>
          
          <div className="pt-10 border-t border-white/10 space-y-4 relative z-10">
            <span className="text-[10px] font-black tracking-[0.5em] uppercase opacity-40 text-white whitespace-nowrap">Recommended Departure</span>
            <div className="text-5xl font-black text-white tracking-tight leading-none py-2 opacity-90">
              {departureTime ? departureTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--'}
            </div>

            <div className="flex items-center justify-center gap-2 opacity-30 pt-2 px-4">
              <ShieldAlert size={12} className="shrink-0" />
              <p className="text-[8px] font-bold uppercase tracking-[0.1em] leading-relaxed">
                Safety Warning: Do not operate while driving. Configure settings before transit.
              </p>
            </div>
            
                {/* Logic Breakdown (Educational Insight) */}
                {travelTime && (
                  <div className="flex flex-col items-center gap-4">
              </div>
            )}

            {/* ERROR DISPLAY */}
            {apiError && (
              <div className="mt-6 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl backdrop-blur-md">
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 animate-pulse shrink-0" />
                  <div className="space-y-1 text-left">
                    <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Connection Error</p>
                    <p className="text-[10px] text-white/80 font-mono leading-relaxed break-words">{apiError}</p>
                    
                    {/* Actionable Advice */}
                    {apiError.includes('REQUEST_DENIED') && (
                      <p className="text-[9px] text-white/50 pt-2 border-t border-white/5 mt-2">
                        • Check if "Distance Matrix API" is enabled in Google Console.<br/>
                        • Verify API Key restrictions.<br/>
                        • Check billing status.
                      </p>
                    )}
                    {apiError.includes('OVER_QUERY_LIMIT') && (
                      <p className="text-[9px] text-white/50 pt-2 border-t border-white/5 mt-2">
                        • API Quota exceeded. Check billing.
                      </p>
                    )}
                    {apiError.includes('ZERO_RESULTS') && (
                      <p className="text-[9px] text-white/50 pt-2 border-t border-white/5 mt-2">
                        • No route found. Are you overseas?
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {locationError && (
            <div className="flex items-center justify-center gap-2 text-[9px] text-red-400 font-bold uppercase tracking-widest pt-2 relative z-10">
              <div className="w-1 h-1 rounded-full bg-red-400 animate-pulse" />
              {locationError}
            </div>
          )}
          {!userCoords && !locationError && (
            <div className="flex items-center justify-center gap-2 text-[9px] text-white/30 font-bold uppercase tracking-widest pt-2 relative z-10">
              <div className="w-1 h-1 rounded-full bg-white/20 animate-pulse" />
              Waiting for location...
            </div>
          )}
        </section>

      {/* Navigation Button */}
      <div className="w-full space-y-4">
        <button 
          onClick={handleStartNavigation}
          className="w-full bg-white/10 hover:bg-white/20 active:scale-[0.98] transition-all duration-500 text-white border border-white/20 font-black py-6 rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.4)] backdrop-blur-md flex items-center justify-center gap-4 text-sm uppercase tracking-[0.2em] select-none"
        >
          <Navigation size={20} fill="currentColor" />
          Launch Navigator
        </button>
      </div>

      </main>

      {/* Safety Header (Moved to Bottom) */}
      <footer className="w-full mt-6 space-y-4">
        {/* Footer / Privacy */}
        <div className="text-center pb-10">
          <p 
            className="text-[9px] opacity-30 leading-relaxed px-8 font-medium italic text-white cursor-default select-none"
          >
            "The journey of a thousand miles begins with a single step."
          </p>

          {/* System Status Logs (Debug) - Now hidden by default */}
        </div>
      </footer>
    </div>
  );
}
