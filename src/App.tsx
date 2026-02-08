import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Car, Bike, Footprints, Navigation, Clock, ShieldAlert } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import AnimatedHourglass from './components/AnimatedHourglass';

/** Utility for Tailwind class merging */
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- CONSTANTS ---
/** Calibrated time from drop-off to desk (in seconds) */
const WALKING_TO_CLASSROOM = 55;
/** Default parking/unloading buffer for driving (in seconds) */
const PARKING_BUFFER = 120; // 改為 2 分鐘 (120秒)
/** Default school start time goal */
const DEFAULT_GOAL_TIME = "08:20";
/** Destination: Woodside Elementary School */
const DESTINATION_ADDRESS = "3195 Woodside Rd, Woodside, CA 94062";
/** Destination Coordinates */
const DESTINATION_COORDS = { lat: 37.4277608, lng: -122.259141 };

type TransportMode = 'driving' | 'bicycling' | 'walking';

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
  
  const travelTime = allTravelTimes[mode];
  const [departureTime, setDepartureTime] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState<string>('');
  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState<number>(0);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [userCoords, setUserCoords] = useState<{ lat: number, lng: number } | null>(null);
  const [isGoogleLoaded, setIsGoogleLoaded] = useState(false);
  const [googleStatus, setGoogleStatus] = useState<'loading' | 'ready' | 'error' | 'none'>('none');
  const [apiError, setApiError] = useState<string | null>(null);
  const [systemLogs, setSystemLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    setSystemLogs(prev => [msg, ...prev].slice(0, 5));
    console.log(`[SYS]: ${msg}`);
  };

  /**
   * Dynamically load Google Maps SDK
   */
  useEffect(() => {
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
    const now = new Date();
    const goalDate = new Date();
    goalDate.setHours(goalHour, goalMinute, 0, 0);

    // Only set goal to tomorrow if the goal time + traffic buffer has COMPLETELY passed
    // This allows the "Time to go!" state to persist for the remainder of the current day
    const activeMode = targetMode || mode;
    const modeBuffer = activeMode === 'driving' ? PARKING_BUFFER : 0;
    const totalDeduction = Math.round(trafficSecs + WALKING_TO_CLASSROOM + modeBuffer);
    
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
    console.log(`🕒 New Departure Set: ${finalDeparture.toLocaleTimeString()} (based on ${trafficSecs}s)`);
  }, [goalHour, goalMinute, mode]);

  const lastGoogleFetchTime = useRef<number>(0);
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

    if (!isGoogleLoaded) {
      addLog("Wait: No SDK");
      return;
    }

    // Check if position significantly moved (more than 100 meters) or forced or first time
    const hasMoved = !lastCoords.current || calculateDistance(origin.lat, origin.lng, lastCoords.current.lat, lastCoords.current.lng) > 100;
    const isFirstTime = requestCycleCount.current === 0;
    const isForced = !!targetMode || !!forcedCoords || isFirstTime;

    // Throttling: 
    // - If forced or moved: allow
    // - Otherwise: 15s throttle (was 150s)
    const throttleLimit = 15000; // 15 seconds
    
    if (!isForced && !hasMoved && (now - lastGoogleFetchTime.current < throttleLimit)) {
      return;
    }

    lastCoords.current = origin;
    lastGoogleFetchTime.current = now;
    requestCycleCount.current++;

    addLog(`Live: Fetching all modes...`);

    // --- TIMEOUT PROTECTION ---
    const timeoutId = setTimeout(() => {
      addLog(`ERR: API Timeout (8s)`);
    }, 8000);

    const lat = origin.lat.toFixed(4);
    const lng = origin.lng.toFixed(4);
    addLog(`API Req @ ${lat},${lng}`);
    
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
                
                // If using standby location, force the values to the user's preferred defaults
                // to ensure consistency with their expectations for "standby" state.
                if (locationError === "Using standby location") {
                  if (m === 'driving') finalDuration = 300; // 5m
                  if (m === 'bicycling') finalDuration = 600; // 10m
                  if (m === 'walking') finalDuration = 2280; // 38m
                }

                const updated = { ...prev, [m as TransportMode]: finalDuration };
                // Always update departure time for the currently selected mode
                if (m === (targetMode || mode)) {
                  calculateDepartureTime(finalDuration, m as TransportMode);
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
  }, [mode, calculateDepartureTime, userCoords, isGoogleLoaded, locationError]);

  const handleModeChange = (m: TransportMode) => {
    setMode(m);
    // If we have data for the new mode, update departure time immediately
    if (allTravelTimes[m]) {
      calculateDepartureTime(allTravelTimes[m]!, m);
    }
    // Still trigger an update to ensure it's fresh
    updateTrafficData(m);
  };

  // Geolocation watch
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation not supported");
      // Fallback to: 745 Mountain Home Rd, Woodside, CA 94062
      setUserCoords({ lat: 37.4246, lng: -122.2533 });
      return;
    }

    // 1. Initial quick fetch
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const newCoords = { lat: position.coords.latitude, lng: position.coords.longitude };
        setUserCoords(newCoords);
        setLocationError(null);
      },
      (error) => {
        console.warn("Geolocation current position error:", error);
        // Fallback to: 745 Mountain Home Rd, Woodside, CA 94062
        if (!userCoords) {
          setUserCoords({ lat: 37.4246, lng: -122.2533 });
          setLocationError("Using standby location");
        }
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );

    // 2. Real-time watch
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const newCoords = { lat: position.coords.latitude, lng: position.coords.longitude };
        setUserCoords(newCoords);
        setLocationError(null);
      },
      (error) => {
        console.warn("Geolocation watch error:", error);
        if (!userCoords) {
          // Fallback to: 745 Mountain Home Rd, Woodside, CA 94062
          setUserCoords({ lat: 37.4246, lng: -122.2533 });
          setLocationError("Using standby location");
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []); // Only once on mount

  // Trigger traffic update whenever coordinates or mode changes
  useEffect(() => {
    if (userCoords && isGoogleLoaded) {
      // If we are using the standby location, we treat the default values as "LIVE" immediately
      if (locationError === "Using standby location") {
        setIsLive({
          driving: true,
          bicycling: true,
          walking: true
        });
        // We still trigger the API update to see if we can get real traffic,
        // but the user wants these defaults to be the "standby live" values.
        updateTrafficData();
      } else {
        // Normal behavior for real GPS
        updateTrafficData();
      }
    }
  }, [userCoords, isGoogleLoaded, updateTrafficData, locationError]);

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
        setCountdown("TIME TO GO!");
        setTimeRemainingSeconds(0);
        return;
      }

      setTimeRemainingSeconds(Math.floor(diff / 1000));
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      
      setCountdown(`${h > 0 ? h + 'h ' : ''}${m}m ${s}s`);
    }, 1000);
    
    return () => clearInterval(timer);
  }, [departureTime]);

  const handleStartNavigation = () => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(DESTINATION_ADDRESS)}&travelmode=${mode}`;
    window.open(url, '_blank');
  };

  const formatDuration = (seconds: number | null, isLive: boolean) => {
    if (seconds === null) return '--';
    const mins = Math.ceil(seconds / 60);
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
                  <span className={cn(
                    "text-xs font-black tracking-tight",
                    isLive[m] ? "text-green-400" : "text-white/40"
                  )}>
                    {formatDuration(allTravelTimes[m], isLive[m])}
                    {isLive[m] && <span className="text-[8px] ml-1 opacity-50">LIVE</span>}
                  </span>
                </div>
                {mode === m && (
                  <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent" />
                )}
              </button>
            );
          })}
        </section>

        {/* Result Panel - Balanced for Time Management */}
        <section className="glass rounded-[3rem] p-12 text-center space-y-12 border-white/10 relative overflow-hidden">
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-white/5 rounded-full blur-[100px]" />
          
          <div className="space-y-4 relative z-10">
            <span className="text-[10px] font-medium opacity-40 uppercase tracking-[0.4em] text-white">Time to Departure</span>
            
            <div className="relative w-full flex justify-center py-4">
              <AnimatedHourglass />
            </div>

            <div className={cn(
              "text-4xl font-black tracking-tight transition-all duration-700 text-white drop-shadow-2xl",
              countdown === "TIME TO GO!" ? "text-white scale-105" : ""
            )}>
              {countdown || '---'}
            </div>
          </div>
          
          <div className="pt-10 border-t border-white/10 space-y-4 relative z-10">
            <span className="text-[10px] font-black tracking-[0.5em] uppercase opacity-40 text-white">Recommended Departure</span>
            <div className="text-5xl font-black text-white tracking-tight leading-none py-2 opacity-90">
              {departureTime ? departureTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--'}
            </div>
            
                {/* Logic Breakdown (Educational Insight) */}
                {travelTime && (
                  <div className="flex flex-col items-center gap-4">
                    {/* Total Journey Breakdown */}
                <div className="bg-white/5 rounded-2xl px-4 py-2 flex items-center gap-3 border border-white/10">
                  <Clock size={12} className="opacity-40" />
                  <span className="text-[10px] font-black tracking-tight text-white/40 uppercase">
                    Total Journey: <span className="text-white opacity-100">{Math.ceil((travelTime + (mode === 'driving' ? PARKING_BUFFER : 0) + WALKING_TO_CLASSROOM) / 60)} mins</span>
                  </span>
                </div>
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
          className="w-full bg-white/10 hover:bg-white/20 active:scale-[0.98] transition-all duration-500 text-white border border-white/20 font-black py-6 rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.4)] backdrop-blur-md flex items-center justify-center gap-4 text-sm uppercase tracking-[0.2em]"
        >
          <Navigation size={20} fill="currentColor" />
          Launch Navigator
        </button>

        <button 
          onClick={() => updateTrafficData(mode)}
          className="w-full py-3 text-[10px] font-black tracking-[0.3em] uppercase opacity-40 hover:opacity-100 transition-opacity flex items-center justify-center gap-2"
        >
          <Clock size={12} />
          Sync Traffic Now
        </button>
      </div>

      </main>

      {/* Safety Header (Moved to Bottom) */}
      <footer className="w-full mt-12 space-y-8">
        <div className="w-full bg-white/5 border border-white/10 text-white/60 p-5 rounded-2xl flex items-center gap-4 backdrop-blur-sm">
          <ShieldAlert size={18} className="shrink-0 opacity-50" />
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] leading-relaxed">
            Safety Warning: Do not operate while driving. Configure settings before transit.
          </p>
        </div>

        {/* Footer / Privacy */}
        <div className="text-center space-y-4 pb-10">
          <p 
            className="text-[9px] opacity-30 leading-relaxed px-8 font-medium italic text-white cursor-default select-none active:opacity-10"
          >
            "The journey of a thousand miles begins with a single step."
          </p>
          <div className="flex items-center justify-center gap-3 opacity-20 text-[9px] font-black tracking-widest text-white">
            <div className="w-1 h-1 rounded-full bg-white/50 animate-pulse" />
            <span>WOODSIDE NAVIGATOR ACTIVE</span>
          </div>

          {/* System Status Logs (Debug) - Now hidden by default */}

        </div>
      </footer>
    </div>
  );
}
