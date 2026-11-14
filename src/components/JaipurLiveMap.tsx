import { MapPin, Navigation, Radio } from 'lucide-react';
import type { LatLng, TechnicianTrackingState } from '../../shared/types';

interface JaipurLiveMapProps {
  tracking?: TechnicianTrackingState;
  destination: LatLng;
  localityName: string;
  technicianName?: string;
  wsConnected: boolean;
  bookingStatus: string;
}

const JAIPUR_LANDMARKS: Array<{ label: string; coords: LatLng }> = [
  { label: 'Vaishali Nagar', coords: { lat: 26.9124, lng: 75.7439 } },
  { label: 'Vidyadhar Nagar', coords: { lat: 26.9609, lng: 75.7811 } },
  { label: 'C-Scheme', coords: { lat: 26.9068, lng: 75.7985 } },
  { label: 'Raja Park', coords: { lat: 26.8965, lng: 75.8305 } },
  { label: 'Mansarovar', coords: { lat: 26.8682, lng: 75.7689 } },
  { label: 'Malviya Nagar', coords: { lat: 26.8549, lng: 75.8243 } },
  { label: 'Jagatpura', coords: { lat: 26.8342, lng: 75.8621 } },
];

// Jaipur projection bounds
const MIN_LAT = 26.82;
const MAX_LAT = 26.975;
const MIN_LNG = 75.72;
const MAX_LNG = 75.88;

function project(coord: LatLng): { x: number; y: number } {
  const x = ((coord.lng - MIN_LNG) / (MAX_LNG - MIN_LNG)) * 680 + 40;
  const y = (1 - (coord.lat - MIN_LAT) / (MAX_LAT - MIN_LAT)) * 340 + 30;
  return {
    x: Math.max(24, Math.min(736, x)),
    y: Math.max(24, Math.min(376, y)),
  };
}

export function JaipurLiveMap({
  tracking,
  destination,
  localityName,
  technicianName,
  wsConnected,
  bookingStatus,
}: JaipurLiveMapProps) {
  const destPt = project(destination);
  const techPt = tracking ? project(tracking.currentLocation) : null;
  const waypoints = tracking?.routeWaypoints.map(project) ?? [];
  const fullPathD =
    waypoints.length > 1
      ? `M ${waypoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ')}`
      : '';

  const completedCount = tracking
    ? Math.max(
        1,
        Math.round((tracking.routeProgressPct / 100) * Math.max(1, waypoints.length - 1)) + 1,
      )
    : 0;
  const completedPoints = waypoints.slice(0, completedCount);
  const completedPathD =
    completedPoints.length > 1
      ? `M ${completedPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ')}`
      : '';

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <Navigation className="h-4 w-4 text-sky-700" />
          <span className="font-display text-sm font-semibold text-slate-900">
            Jaipur Live Dispatch Telemetry
          </span>
          <span className="text-xs text-slate-400" aria-hidden="true">
            ·
          </span>
          <span className="text-xs text-slate-600">{localityName}</span>
        </div>

        <div className="flex items-center gap-2 text-xs font-medium">
          <Radio
            className={`h-3.5 w-3.5 ${wsConnected ? 'text-emerald-600' : 'text-amber-600'}`}
          />
          <span className={wsConnected ? 'text-emerald-700' : 'text-amber-700'}>
            {wsConnected ? 'Live WebSocket Sync' : 'Reconnecting Socket'}
          </span>
        </div>
      </div>

      <div className="relative bg-slate-50">
        <svg
          viewBox="0 0 760 400"
          className="h-72 w-full sm:h-80"
          role="img"
          aria-label={`Live dispatch map showing technician route to ${localityName}, Jaipur`}
        >
          <defs>
            <pattern id="grid" width="38" height="38" patternUnits="userSpaceOnUse">
              <path
                d="M 38 0 L 0 0 0 38"
                fill="none"
                stroke="#e2e8f0"
                strokeWidth="0.8"
              />
            </pattern>
          </defs>

          <rect width="760" height="400" fill="#f8fafc" />
          <rect width="760" height="400" fill="url(#grid)" />

          {/* Jaipur arterial corridors */}
          <path
            d="M 40 190 Q 250 185 450 195 T 720 175"
            fill="none"
            stroke="#cbd5e1"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d="M 365 20 Q 375 180 395 380"
            fill="none"
            stroke="#cbd5e1"
            strokeWidth="4.5"
            strokeLinecap="round"
          />
          <path
            d="M 110 340 Q 340 245 640 70"
            fill="none"
            stroke="#e2e8f0"
            strokeWidth="3.5"
          />

          {/* Locality labels */}
          {JAIPUR_LANDMARKS.map((lm) => {
            const p = project(lm.coords);
            return (
              <g key={lm.label} transform={`translate(${p.x}, ${p.y})`}>
                <circle r="3" fill="#94a3b8" />
                <text
                  x="7"
                  y="3"
                  fontSize="10.5"
                  fontWeight="500"
                  fill="#64748b"
                  fontFamily="DM Sans, sans-serif"
                >
                  {lm.label}
                </text>
              </g>
            );
          })}

          {/* Remaining planned route */}
          {fullPathD && (
            <path
              d={fullPathD}
              fill="none"
              stroke="#94a3b8"
              strokeWidth="3"
              strokeDasharray="6 6"
              strokeLinecap="round"
            />
          )}

          {/* Completed live route */}
          {completedPathD && (
            <path
              d={completedPathD}
              fill="none"
              stroke="#0369a1"
              strokeWidth="4"
              strokeLinecap="round"
            />
          )}

          {/* Customer Destination Pin */}
          <g transform={`translate(${destPt.x}, ${destPt.y})`}>
            <circle r="14" fill="#0369a1" fillOpacity="0.14" />
            <circle r="6" fill="#0369a1" stroke="#ffffff" strokeWidth="2" />
            <rect
              x="-52"
              y="-32"
              width="104"
              height="20"
              rx="4"
              fill="#0f172a"
            />
            <text
              x="0"
              y="-19"
              textAnchor="middle"
              fontSize="10"
              fontWeight="600"
              fill="#ffffff"
              fontFamily="DM Sans, sans-serif"
            >
              Service Address
            </text>
          </g>

          {/* Technician Live Marker */}
          {techPt && (
            <g
              style={{
                transform: `translate(${techPt.x}px, ${techPt.y}px)`,
                transition: 'transform 0.7s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              <circle r="16" fill="#0284c7" fillOpacity="0.18" />
              <circle r="9" fill="#ffffff" stroke="#0284c7" strokeWidth="3" />
              <circle r="3.5" fill="#0284c7" />
              <rect
                x="-58"
                y="14"
                width="116"
                height="21"
                rx="4"
                fill="#0369a1"
              />
              <text
                x="0"
                y="28"
                textAnchor="middle"
                fontSize="10"
                fontWeight="600"
                fill="#ffffff"
                fontFamily="DM Sans, sans-serif"
              >
                {technicianName ? technicianName.split(' ')[0] : 'Technician'} · Live
              </text>
            </g>
          )}
        </svg>

        {/* Bottom Map Telemetry Strip */}
        <div className="grid grid-cols-2 gap-4 border-t border-slate-200 bg-white px-5 py-3.5 sm:grid-cols-4">
          <div>
            <div className="text-xs text-slate-500">Estimated Arrival</div>
            <div className="mt-0.5 font-mono text-base font-semibold text-slate-900 tabular-nums">
              {tracking
                ? bookingStatus === 'TECHNICIAN_ARRIVED' || tracking.etaMinutes === 0
                  ? 'Arrived'
                  : `${tracking.etaMinutes} min`
                : 'Pending dispatch'}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Distance Remaining</div>
            <div className="mt-0.5 font-mono text-base font-semibold text-slate-900 tabular-nums">
              {tracking ? `${tracking.distanceRemainingKm.toFixed(2)} km` : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Route Progress</div>
            <div className="mt-0.5 font-mono text-base font-semibold text-slate-900 tabular-nums">
              {tracking ? `${tracking.routeProgressPct}%` : '0%'}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Live Coordinates</div>
            <div className="mt-0.5 flex items-center gap-1 font-mono text-xs text-slate-700 tabular-nums">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-sky-700" />
              <span>
                {tracking
                  ? `${tracking.currentLocation.lat.toFixed(4)}, ${tracking.currentLocation.lng.toFixed(4)}`
                  : `${destination.lat.toFixed(4)}, ${destination.lng.toFixed(4)}`}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
