import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { format } from 'date-fns';
import { ShieldCheck } from 'lucide-react';

interface LiveMapProps {
  locations: any[];
  logs?: any[]; 
  employees: any[];
  selectedEmployeeId?: string | null;
  onSelectEmployee?: (id: string | null) => void;
}

const createCustomIcon = (name: string, speed: number = 0, isSelected?: boolean) => {
  const color = isSelected ? 'bg-accent-green' : 'bg-blue-600';
  const ring = isSelected ? 'ring-accent-green/40' : 'ring-blue-500/20';
  const speedKmh = (speed * 3.6).toFixed(1);

  return L.divIcon({
    className: 'custom-div-icon',
    html: `
      <div class="relative group">
        <!-- Floating Tooltip when selected -->
        ${isSelected ? `
          <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 px-3 py-1.5 bg-slate-900 border border-white/20 text-white rounded-xl text-[10px] font-black whitespace-nowrap shadow-2xl z-[1001] flex flex-col items-center animate-in fade-in zoom-in slide-in-from-bottom-2 duration-300">
            <span class="tracking-tight uppercase text-[8px] opacity-60 mb-0.5">${name}</span>
            <span class="text-accent-green text-[11px]">${speedKmh} km/h</span>
            <div class="absolute top-[calc(100%-1px)] left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-slate-900"></div>
          </div>
        ` : ''}

        <!-- Pulse Highlight -->
        ${isSelected ? `
          <div class="absolute -inset-6 rounded-full bg-accent-green/20 animate-ping duration-[3000ms]"></div>
          <div class="absolute -inset-4 rounded-full bg-accent-green/10 animate-pulse duration-[2000ms]"></div>
        ` : ''}

        <!-- Profile Marker -->
        <div class="relative ${color} text-white w-10 h-10 rounded-full border-2 border-white shadow-lg flex items-center justify-center font-bold text-sm ring-4 ${ring} transition-all duration-700 transform ${isSelected ? 'scale-110 shadow-accent-green/40 brightness-110' : 'hover:scale-105 active:scale-95'}">
          <span class="drop-shadow-sm font-black uppercase">${(name || '?').charAt(0)}</span>
          
          <!-- Selected indicator dot -->
          ${isSelected ? `
            <div class="absolute -top-1 -right-1 w-3.5 h-3.5 bg-white rounded-full flex items-center justify-center shadow-sm">
                <div class="w-2 h-2 bg-accent-green rounded-full animate-pulse"></div>
            </div>
          ` : ''}
        </div>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -30]
  });
};

const createStopIcon = (duration: number) => {
  return L.divIcon({
    className: 'stop-marker',
    html: `
      <div class="relative flex items-center justify-center group cursor-pointer">
        <div class="absolute -inset-3 bg-accent-red/30 rounded-full animate-ping"></div>
        <div class="w-7 h-7 bg-accent-red text-white flex items-center justify-center rounded-full border-2 border-white shadow-xl text-[9px] font-black transform transition-transform group-hover:scale-110">
          ${duration}m
        </div>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
};

function ChangeView({ center, zoom, follow }: { center: [number, number], zoom?: number, follow?: boolean }) {
  const map = useMap();
  React.useEffect(() => {
    if (follow) {
      map.flyTo(center, zoom || 16, {
        duration: 2, // Slightly slower for smoother feel
        easeLinearity: 0.1
      });
    }
  }, [center[0], center[1], zoom, follow, map]);
  return null;
}

export default function LiveMap({ locations, logs = [], employees, selectedEmployeeId, onSelectEmployee }: LiveMapProps) {
  const [paths, setPaths] = React.useState<Record<string, [number, number][]>>({});
  const [idleZones, setIdleZones] = React.useState<Record<string, { lat: number; lng: number; duration: number; startTime: string; endTime: string }[]>>({});

  // Distance calculator helper
  const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
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

  React.useEffect(() => {
    const newPaths: Record<string, [number, number][]> = {};
    const newIdles: Record<string, { lat: number; lng: number; duration: number; startTime: string; endTime: string }[]> = {};

    const logsByUser: Record<string, any[]> = {};
    logs.forEach(log => {
      if (!logsByUser[log.userId]) logsByUser[log.userId] = [];
      logsByUser[log.userId].push(log);
    });

    Object.keys(logsByUser).forEach(uid => {
      const userLogs = logsByUser[uid]
        .filter(log => log && typeof log.latitude === 'number' && typeof log.longitude === 'number')
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      
      const polyline: [number, number][] = [];
      const idles: { lat: number; lng: number; duration: number; startTime: string; endTime: string }[] = [];

      let currentStay: any[] = [];

      userLogs.forEach((log, index) => {
        polyline.push([log.latitude, log.longitude]);

        if (index === 0) {
          currentStay = [log];
          return;
        }

        const prevLog = currentStay[currentStay.length - 1];
        const dist = getDistance(log.latitude, log.longitude, prevLog.latitude, prevLog.longitude);

        if (dist < 40) { // Radius of 40 meters
          currentStay.push(log);
        } else {
          if (currentStay.length >= 5) {
            const start = new Date(currentStay[0].timestamp).getTime();
            const end = new Date(currentStay[currentStay.length - 1].timestamp).getTime();
            const durationMins = Math.round((end - start) / 60000);

            if (durationMins >= 5) {
              idles.push({
                lat: currentStay[0].latitude,
                lng: currentStay[0].longitude,
                duration: durationMins,
                startTime: currentStay[0].timestamp,
                endTime: currentStay[currentStay.length - 1].timestamp
              });
            }
          }
          currentStay = [log];
        }
      });

      if (currentStay.length >= 5) {
        const start = new Date(currentStay[0].timestamp).getTime();
        const end = new Date(currentStay[currentStay.length - 1].timestamp).getTime();
        const durationMins = Math.round((end - start) / 60000);
        if (durationMins >= 5) {
          idles.push({
            lat: currentStay[0].latitude,
            lng: currentStay[0].longitude,
            duration: durationMins,
            startTime: currentStay[0].timestamp,
            endTime: currentStay[currentStay.length - 1].timestamp
          });
        }
      }

      newPaths[uid] = polyline;
      newIdles[uid] = idles;
    });

    setPaths(newPaths);
    setIdleZones(newIdles);
  }, [logs]);

  const selectedLoc = locations.find(l => l.userId === selectedEmployeeId);
  const defaultCenter: [number, number] = [20.5937, 78.9629];
  
  const center = React.useMemo(() => {
    if (selectedLoc && typeof selectedLoc.latitude === 'number' && typeof selectedLoc.longitude === 'number') {
      return [selectedLoc.latitude, selectedLoc.longitude] as [number, number];
    }
    
    // Fallback to first valid location
    const firstValid = locations.find(l => l && typeof l.latitude === 'number' && typeof l.longitude === 'number');
    if (firstValid) {
      return [firstValid.latitude, firstValid.longitude] as [number, number];
    }

    return defaultCenter;
  }, [selectedLoc, locations, defaultCenter]);

  return (
    <div className="h-[400px] md:h-[600px] w-full rounded-3xl overflow-hidden border-2 border-app-border shadow-2xl bg-bg-app relative group">
      <MapContainer 
        center={center} 
        zoom={15} 
        scrollWheelZoom={true}
        className="h-full w-full z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {Object.entries(paths).map(([userId, path]) => {
          const isSelected = userId === selectedEmployeeId;
          if (!isSelected && selectedEmployeeId) return null;
          return (
            <Polyline 
              key={`path-${userId}`} 
              positions={path} 
              color={isSelected ? "#10b981" : "#3b82f6"} 
              weight={isSelected ? 5 : 3} 
              opacity={isSelected ? 0.9 : 0.4} 
              dashArray={isSelected ? undefined : "10, 15"}
            />
          );
        })}

        {/* Render Idle Zones with Radius Circles */}
        {Object.entries(idleZones).map(([userId, zones]) => {
          const isSelected = userId === selectedEmployeeId;
          if (!isSelected && selectedEmployeeId) return null;

          return zones.map((zone, idx) => {
            if (!zone || typeof zone.lat !== 'number' || typeof zone.lng !== 'number') return null;
            
            return (
              <React.Fragment key={`idle-group-${userId}-${idx}`}>
                <Circle
                  center={[zone.lat, zone.lng]}
                  radius={40}
                  pathOptions={{ 
                    fillColor: '#ef4444', 
                    color: '#ef4444', 
                    weight: 1, 
                    opacity: 0.3, 
                    fillOpacity: 0.1 
                  }}
                />
                <Marker
                  position={[zone.lat, zone.lng]}
                  icon={createStopIcon(zone.duration)}
                  zIndexOffset={500}
                >
                  <Popup>
                    <div className="p-3 text-center min-w-[140px]">
                      <div className="text-[9px] font-black text-accent-red uppercase tracking-widest mb-1 bg-accent-red/10 py-1 rounded-full">Stay Detected</div>
                      <div className="text-3xl font-black text-slate-900 my-1">{zone.duration}<span className="text-xs">m</span></div>
                      <div className="flex items-center justify-center gap-1.5 text-[9px] text-text-secondary font-bold border-t border-app-border mt-2 pt-2">
                         <span>{format(new Date(zone.startTime), 'hh:mm a')}</span>
                         <span className="opacity-40">→</span>
                         <span>{format(new Date(zone.endTime), 'hh:mm a')}</span>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              </React.Fragment>
            );
          });
        })}

        {locations.map((loc, idx) => {
          const emp = employees.find(e => e.id === loc.userId);
          const isSelected = loc.userId === selectedEmployeeId;
          const isInactive = loc.status === 'INACTIVE';
          const isFaded = (selectedEmployeeId && !isSelected) || isInactive;
          if (!loc.latitude || !loc.longitude) return null;
          
          return (
            <Marker 
              key={`live-${loc.userId}-${idx}`} 
              position={[loc.latitude, loc.longitude]}
              icon={createCustomIcon(emp?.name || loc.name, loc.speed || 0, isSelected)}
              zIndexOffset={isSelected ? 1000 : isInactive ? -500 : 0}
              opacity={isSelected ? 1 : isInactive ? 0.4 : isFaded ? 0.3 : 1}
              eventHandlers={{
                click: () => onSelectEmployee?.(isSelected ? null : loc.userId)
              }}
            >
              <Popup>
                <div className="p-2 min-w-[150px]">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2.5 h-2.5 rounded-full bg-accent-green animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                    <span className="font-black text-sm tracking-tight">{emp?.name || loc.name}</span>
                  </div>
                  <div className="text-[10px] text-text-secondary uppercase font-bold tracking-tighter mb-3">{emp?.jobTitle}</div>
                  
                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-app-border/60">
                    <div className="bg-bg-app p-2 rounded-xl border border-app-border/50">
                      <div className="text-[7px] text-text-secondary uppercase font-black opacity-60">Speed</div>
                      <div className="text-[11px] font-mono font-black text-accent-blue">{loc.speed ? `${(loc.speed * 3.6).toFixed(1)} km/h` : '0 km/h'}</div>
                    </div>
                    <div className="bg-bg-app p-2 rounded-xl border border-app-border/50">
                      <div className="text-[7px] text-text-secondary uppercase font-black opacity-60">Accuracy</div>
                      <div className="text-[11px] font-mono font-black text-accent-green">{loc.accuracy ? `${loc.accuracy.toFixed(1)}m` : '---'}</div>
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
        <ChangeView center={center} zoom={selectedEmployeeId ? 17 : 15} follow={!!selectedEmployeeId} />
      </MapContainer>

      {/* Map Legends Overlay */}
      <div className="absolute bottom-6 left-6 z-[1000]">
        <div className="bg-white/90 backdrop-blur-xl p-4 rounded-3xl border-2 border-white shadow-2xl flex flex-col gap-3 min-w-[160px]">
          <div className="text-[10px] font-black text-slate-900 uppercase tracking-widest border-b border-app-border pb-2">Map Legend</div>
          
          <div className="flex items-center gap-3 group translate-x-0 hover:translate-x-1 transition-transform">
            <div className="w-3.5 h-3.5 rounded-full bg-accent-green shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
            <div className="text-[10px] font-black text-slate-700">Selected User</div>
          </div>
          
          <div className="flex items-center gap-3 translate-x-0 hover:translate-x-1 transition-transform">
            <div className="w-3.5 h-3.5 rounded-full bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.4)]" />
            <div className="text-[10px] font-black text-slate-700">Active Other</div>
          </div>

          <div className="flex items-center gap-3 translate-x-0 hover:translate-x-1 transition-transform">
            <div className="w-3.5 h-3.5 rounded-full bg-accent-red animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.4)]" />
            <div className="text-[10px] font-black text-slate-700">Stay Detected ({">"}5m)</div>
          </div>

          <div className="flex items-center gap-3 translate-x-0 hover:translate-x-1 transition-transform border-t border-app-border pt-2 mt-1">
            <ShieldCheck className="h-3.5 w-3.5 text-accent-green" />
            <div className="text-[8px] font-black text-accent-green uppercase tracking-widest">AI Shield Active</div>
          </div>
        </div>
      </div>
    </div>
  );
}

