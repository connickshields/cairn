export interface LatLon {
  lat: number;
  lon: number;
}

// e.g. "N38°28.59' W120°10.43'" — hemisphere, degrees, decimal-minutes, prime.
const COORD_RE =
  /^\s*([NS])\s*(\d{1,3})\s*[°º]\s*(\d{1,2}(?:\.\d+)?)\s*['′]\s*([EW])\s*(\d{1,3})\s*[°º]\s*(\d{1,2}(?:\.\d+)?)\s*['′]\s*$/i;

export function parseDmsCoordinate(input: string): LatLon {
  const m = COORD_RE.exec(input);
  if (!m) {
    throw new Error(`Unparseable coordinate: ${JSON.stringify(input)}`);
  }
  const [, latH, latD, latM, lonH, lonD, lonM] = m;
  const lat = toDecimal(Number(latD), Number(latM), latH.toUpperCase() === "S");
  const lon = toDecimal(Number(lonD), Number(lonM), lonH.toUpperCase() === "W");
  if (lat < -90 || lat > 90) throw new Error(`Latitude out of range: ${lat}`);
  if (lon < -180 || lon > 180) throw new Error(`Longitude out of range: ${lon}`);
  return { lat, lon };
}

function toDecimal(degrees: number, minutes: number, negative: boolean): number {
  if (minutes >= 60) throw new Error(`Minutes out of range: ${minutes}`);
  const decimal = degrees + minutes / 60;
  return negative ? -decimal : decimal;
}
