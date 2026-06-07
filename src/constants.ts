export const OFFICE_LOCATIONS = [
  { lat: 22.805342, lng: 88.608537, name: "Office 1" },
  { lat: 22.846618, lng: 88.665254, name: "Office 2" },
  { lat: 22.754316, lng: 88.538428, name: "Office 3" }
];

export const MAX_DISTANCE_METERS = 500;

export const AUTHORIZED_PIN_CODES = [
  '743263', '743248', '743222', '743221', 
  '743234', '743704', '743294', '743711'
];

export function getDistanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
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
