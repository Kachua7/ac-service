import type {
  ACType,
  Booking,
  LatLng,
  ServiceCategory,
  Technician,
} from '../shared/types.js';

export function haversineDistanceKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const c =
    2 *
    Math.atan2(
      Math.sqrt(
        sinLat * sinLat +
          Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng,
      ),
      Math.sqrt(
        1 -
          (sinLat * sinLat +
            Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng),
      ),
    );
  return Math.round(R * c * 100) / 100;
}

export function generateRouteWaypoints(from: LatLng, to: LatLng, steps = 14): LatLng[] {
  const points: LatLng[] = [];
  // Add a subtle realistic Jaipur arterial bend at midpoint so route isn't a flat straight line
  const midOffsetLat = (to.lng - from.lng) * 0.08;
  const midOffsetLng = (from.lat - to.lat) * 0.08;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Quadratic Bezier interpolation
    const ctrlLat = (from.lat + to.lat) / 2 + midOffsetLat;
    const ctrlLng = (from.lng + to.lng) / 2 + midOffsetLng;
    const lat =
      (1 - t) * (1 - t) * from.lat + 2 * (1 - t) * t * ctrlLat + t * t * to.lat;
    const lng =
      (1 - t) * (1 - t) * from.lng + 2 * (1 - t) * t * ctrlLng + t * t * to.lng;
    points.push({
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
    });
  }
  return points;
}

export interface RankedTechnicianCandidate {
  technician: Technician;
  distanceKm: number;
  score: number;
}

export function findAndRankTechnicians(params: {
  technicians: Technician[];
  bookings: Booking[];
  serviceCategory: ServiceCategory;
  acType: ACType;
  serviceAreaId: string;
  destination: LatLng;
  scheduledDate: string;
  slotId: string;
  excludeTechnicianIds?: string[];
}): RankedTechnicianCandidate[] {
  const {
    technicians,
    bookings,
    serviceCategory,
    acType,
    serviceAreaId,
    destination,
    scheduledDate,
    slotId,
    excludeTechnicianIds = [],
  } = params;

  const busyTechnicianIds = new Set(
    bookings
      .filter(
        (b) =>
          b.scheduledDate === scheduledDate &&
          b.slotId === slotId &&
          b.assignedTechnicianId &&
          b.status !== 'CANCELLED' &&
          b.status !== 'COMPLETED',
      )
      .map((b) => b.assignedTechnicianId as string),
  );

  const candidates = technicians.filter((tech) => {
    if (excludeTechnicianIds.includes(tech.id)) return false;
    if (tech.verificationStatus !== 'APPROVED') return false;
    if (!tech.online) return false;
    if (!tech.skills.includes(serviceCategory)) return false;
    if (!tech.supportedAcTypes.includes(acType)) return false;
    if (busyTechnicianIds.has(tech.id)) return false;
    const dist = haversineDistanceKm(tech.currentLocation, destination);
    if (!tech.serviceAreaIds.includes(serviceAreaId) && dist > 12) return false;
    return true;
  });

  return candidates
    .map((tech) => {
      const distanceKm = haversineDistanceKm(tech.currentLocation, destination);
      const areaMatchBonus = tech.serviceAreaIds.includes(serviceAreaId) ? 20 : 0;
      const distanceScore = Math.max(0, 35 - distanceKm * 3.5);
      const ratingScore = tech.rating * 5; // max 25
      const reliabilityScore = (tech.acceptanceRate * 0.1 + tech.onTimeRate * 0.1); // max 20
      const score = Number(
        (areaMatchBonus + distanceScore + ratingScore + reliabilityScore).toFixed(2),
      );
      return { technician: tech, distanceKm, score };
    })
    .sort((a, b) => b.score - a.score);
}
