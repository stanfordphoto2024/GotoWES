
const MAPBOX_TOKEN = (import.meta as any).env.VITE_MAPBOX_TOKEN;
// const TOMTOM_KEY = (import.meta as any).env.VITE_TOMTOM_KEY; // Optional future expansion

export type TransportMode = 'driving' | 'bicycling' | 'walking';

// Mapbox Profiles
// driving-traffic: considers real-time traffic
// driving: standard driving (speed limits)
// cycling: bicycle
// walking: pedestrian
const MAPBOX_PROFILES: Record<TransportMode, string> = {
  driving: 'driving-traffic',
  bicycling: 'cycling',
  walking: 'walking',
};

export interface MapboxRouteResult {
  duration: number; // seconds
  distance: number; // meters
  congestion?: string;
}

export async function fetchMapboxETA(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  mode: TransportMode
): Promise<MapboxRouteResult | null> {
  if (!MAPBOX_TOKEN) {
    console.error("Mapbox token is missing!");
    return null;
  }

  const profile = MAPBOX_PROFILES[mode];
  // Mapbox format: longitude,latitude
  const coords = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coords}?alternatives=true&geometries=geojson&overview=full&steps=true&access_token=${MAPBOX_TOKEN}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.code !== 'Ok') {
      console.error("Mapbox API Error:", data.code, data.message);
      return null;
    }
    
    if (data.routes && data.routes.length > 0) {
      // Sort routes by duration to always get the fastest one
      const sortedRoutes = data.routes.sort((a: any, b: any) => a.duration - b.duration);
      const fastestRoute = sortedRoutes[0];
      
      console.log(`[Mapbox] Mode: ${mode}, Fastest Duration: ${Math.round(fastestRoute.duration/60)}m, Distance: ${(fastestRoute.distance/1000).toFixed(2)}km, Alternatives: ${data.routes.length}`);
      
      return {
        duration: fastestRoute.duration,
        distance: fastestRoute.distance
      };
    }
    return null;
  } catch (error) {
    console.error("Error fetching Mapbox ETA:", error);
    return null;
  }
}
