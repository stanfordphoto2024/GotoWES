import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Car, Bike, Footprints, Navigation, Clock, ShieldAlert } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

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
const DEFAULT_GOAL_TIME = "08:15";
/** Destination: Woodside Elementary School */
const DESTINATION_ADDRESS = "3195 Woodside Rd, Woodside, CA 94062";

type TransportMode = 'driving' | 'bicycling' | 'walking';

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
  const [goalMinute, setGoalMinute] = useState(15);
  const [mode, setMode] = useState<TransportMode>('driving');
  const [travelTime, setTravelTime] = useState<number | null>(null); // in seconds
  const [departureTime, setDepartureTime] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState<string>('');
  const [locationError, setLocationError] = useState<string | null>(null);

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
   * 
   * Algebra explanation for students:
   * 1. Variable A (GoalTime): The time you must be at your desk (e.g., 08:15).
   * 2. Variable B (RealTimeTraffic): Navigation estimate from current location (seconds).
   * 3. Variable C (WALKING_TO_CLASSROOM): Fixed walk from drop-off to classroom (55s).
   * 4. Variable D (ModeBuffer): Buffer for parking/locking (Driving: 300s, others: 0s).
   * 
   * Process: Departure = A - (B + C + D)
   * Note: Time is base-60; we convert to total seconds from midnight for precision.
   */
  const calculateDepartureTime = useCallback((trafficSecs: number) => {
    const goalDate = new Date();
    goalDate.setHours(goalHour, goalMinute, 0, 0);

    const modeBuffer = mode === 'driving' ? PARKING_BUFFER : 0;
    const totalDeduction = Math.round(trafficSecs + WALKING_TO_CLASSROOM + modeBuffer);
    
    const departure = new Date(goalDate.getTime() - totalDeduction * 1000);
    setDepartureTime(departure);
  }, [goalHour, goalMinute, mode]);

  /** Mock fetch for travel time - now supports immediate updates */
  const updateTrafficData = useCallback((targetMode?: TransportMode) => {
    const activeMode = targetMode || mode;
    
    const getMockTraffic = (m: TransportMode) => {
      // 根據使用者回饋修正 Mock 數據，使其更接近 Google Maps 實際情況 (約 7 分鐘)
      // 7 分鐘 = 420 秒
      const mockTrafficValues: Record<TransportMode, number> = {
        driving: 360 + Math.random() * 120,    // 6~8 分鐘 (平均 7 分)
        bicycling: 600 + Math.random() * 180,  // 10~13 分鐘
        walking: 1200 + Math.random() * 300    // 20~25 分鐘
      };
      return mockTrafficValues[m];
    };

    // Immediate calculation with mock to ensure zero-latency UI
    const mock = getMockTraffic(activeMode);
    setTravelTime(mock);
    calculateDepartureTime(mock);

    // Background refinement if geolocation is available
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          // In a real app, this would use Google Distance Matrix API with the new mode
          // For now, we refine the mock slightly to simulate a "live" update
          const refinedMock = getMockTraffic(activeMode);
          setTravelTime(refinedMock);
          calculateDepartureTime(refinedMock);
          setLocationError(null);
        },
        (err) => {
          setLocationError("Using default location (Traffic estimated)");
        },
        { timeout: 5000 }
      );
    } else {
      setLocationError("Geolocation not supported");
    }
  }, [mode, calculateDepartureTime]);

  const handleModeChange = (m: TransportMode) => {
    setMode(m);
    // Force an immediate update for the new mode without waiting for the next interval
    updateTrafficData(m);
  };

  // Initial calculation and interval
  useEffect(() => {
    updateTrafficData();
    const interval = setInterval(updateTrafficData, 20000);
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
      
      if (diff <= 0) {
        setCountdown("Time to leave!");
        return;
      }

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

  return (
    <div className="min-h-screen flex flex-col items-center p-6 pt-12 pb-20 max-w-lg mx-auto font-sans selection:bg-vibrant-blue/30 relative z-10">
      {/* Main Glass Dashboard */}
      <main className="w-full space-y-8">
        
        {/* Time Picker Section (Vertical Scroller) */}
        <section className="glass rounded-[2.5rem] p-10 text-center relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <label className="text-[10px] font-black opacity-40 mb-8 block tracking-[0.5em] uppercase text-white">Arrival Goal</label>
          
          <div className="flex justify-center items-center gap-10">
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
                  {m === 'driving' && <Car size={32} strokeWidth={1} />}
                  {m === 'bicycling' && <Bike size={32} strokeWidth={1} />}
                  {m === 'walking' && <Footprints size={32} strokeWidth={1} />}
                </div>
                <span className="text-[9px] font-black tracking-[0.3em] uppercase relative z-10">{labels[m]}</span>
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
            <div className={cn(
              "text-7xl font-black tracking-tight transition-all duration-700 text-white drop-shadow-2xl",
              countdown === "Time to leave!" ? "text-white scale-105" : ""
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
              <div className="flex justify-center items-center gap-3 opacity-30 text-[8px] font-bold tracking-widest uppercase mt-4 text-white">
                <span>Traffic {Math.floor(travelTime / 60)}m</span>
                <div className="w-1 h-1 rounded-full bg-white/50" />
                <span>Buffer {mode === 'driving' ? '2m' : '0m'}</span>
                <div className="w-1 h-1 rounded-full bg-white/50" />
                <span>Walk 55s</span>
              </div>
            )}
          </div>

          {locationError && (
            <div className="flex items-center justify-center gap-2 text-[9px] text-white/30 font-bold uppercase tracking-widest pt-2 relative z-10">
              <div className="w-1 h-1 rounded-full bg-white/20 animate-pulse" />
              {locationError}
            </div>
          )}
        </section>

        {/* Navigation Button */}
        <button 
          onClick={handleStartNavigation}
          className="w-full bg-white/10 hover:bg-white/20 active:scale-[0.98] transition-all duration-500 text-white border border-white/20 font-black py-6 rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.4)] backdrop-blur-md flex items-center justify-center gap-4 text-sm uppercase tracking-[0.2em]"
        >
          <Navigation size={20} fill="currentColor" />
          Launch Navigator
        </button>

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
          <p className="text-[9px] opacity-30 leading-relaxed px-8 font-medium italic text-white">
            "The journey of a thousand miles begins with a single step."
          </p>
          <div className="flex items-center justify-center gap-3 opacity-20 text-[9px] font-black tracking-widest text-white">
            <div className="w-1 h-1 rounded-full bg-white/50 animate-pulse" />
            <span>WOODSIDE NAVIGATOR ACTIVE</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
