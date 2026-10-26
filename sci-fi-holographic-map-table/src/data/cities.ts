import { AR_CITIES, AR_COUNTRIES } from "./arData";

export interface City {
  name: string;
  country: string;
  name_ar?: string | null;
  country_ar?: string | null;
  iso?: string;
  lat: number;
  lon: number;
  pop?: number;
}

const CITIES_URL =
  "https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_50m_populated_places_simple.geojson";

/** Load 1250+ real cities with Arabic names. Falls back to the bundled list. */
export async function loadCities(): Promise<City[]> {
  try {
    const res = await fetch(CITIES_URL);
    const gj = await res.json();
    const list: City[] = gj.features.map((f: any) => {
      const p = f.properties;
      const [lon, lat] = f.geometry.coordinates;
      return {
        name: p.name,
        name_ar: AR_CITIES[p.name] || null,
        country: p.adm0name,
        iso: p.iso_a2,
        country_ar: AR_COUNTRIES[p.iso_a2] || p.adm0name,
        lat,
        lon,
        pop: p.pop_max || p.pop_min || 0,
      };
    });
    return list.sort((a, b) => (b.pop ?? 0) - (a.pop ?? 0));
  } catch {
    return CITIES.map((c) => ({
      ...c,
      name_ar: AR_CITIES[c.name] || null,
      country_ar: c.iso ? AR_COUNTRIES[c.iso] || c.country : c.country,
    }));
  }
}

// A curated list of major world cities for the holographic search index.
export const CITIES: City[] = [
  { name: "Baghdad", country: "Iraq", lat: 33.3152, lon: 44.3661, pop: 7565000 },
  { name: "Basra", country: "Iraq", lat: 30.5085, lon: 47.7804, pop: 2600000 },
  { name: "Erbil", country: "Iraq", lat: 36.1901, lon: 44.0091, pop: 1600000 },
  { name: "Mosul", country: "Iraq", lat: 36.335, lon: 43.1189, pop: 1800000 },
  { name: "Najaf", country: "Iraq", lat: 32.0, lon: 44.335, pop: 1000000 },
  { name: "Karbala", country: "Iraq", lat: 32.6167, lon: 44.0333, pop: 700000 },
  { name: "Dubai", country: "UAE", lat: 25.2048, lon: 55.2708, pop: 3400000 },
  { name: "Abu Dhabi", country: "UAE", lat: 24.4539, lon: 54.3773, pop: 1500000 },
  { name: "Riyadh", country: "Saudi Arabia", lat: 24.7136, lon: 46.6753, pop: 7600000 },
  { name: "Jeddah", country: "Saudi Arabia", lat: 21.4858, lon: 39.1925, pop: 4700000 },
  { name: "Mecca", country: "Saudi Arabia", lat: 21.3891, lon: 39.8579, pop: 2000000 },
  { name: "Doha", country: "Qatar", lat: 25.2854, lon: 51.531, pop: 2400000 },
  { name: "Kuwait City", country: "Kuwait", lat: 29.3759, lon: 47.9774, pop: 3000000 },
  { name: "Manama", country: "Bahrain", lat: 26.2285, lon: 50.586, pop: 700000 },
  { name: "Muscat", country: "Oman", lat: 23.588, lon: 58.3829, pop: 1500000 },
  { name: "Amman", country: "Jordan", lat: 31.9454, lon: 35.9284, pop: 4000000 },
  { name: "Beirut", country: "Lebanon", lat: 33.8938, lon: 35.5018, pop: 2400000 },
  { name: "Damascus", country: "Syria", lat: 33.5138, lon: 36.2765, pop: 2500000 },
  { name: "Jerusalem", country: "Israel", lat: 31.7683, lon: 35.2137, pop: 950000 },
  { name: "Tehran", country: "Iran", lat: 35.6892, lon: 51.389, pop: 9000000 },
  { name: "Istanbul", country: "Turkey", lat: 41.0082, lon: 28.9784, pop: 15500000 },
  { name: "Ankara", country: "Turkey", lat: 39.9334, lon: 32.8597, pop: 5600000 },
  { name: "Cairo", country: "Egypt", lat: 30.0444, lon: 31.2357, pop: 20900000 },
  { name: "Alexandria", country: "Egypt", lat: 31.2001, lon: 29.9187, pop: 5200000 },
  { name: "Casablanca", country: "Morocco", lat: 33.5731, lon: -7.5898, pop: 3700000 },
  { name: "Rabat", country: "Morocco", lat: 34.0209, lon: -6.8416, pop: 1900000 },
  { name: "Algiers", country: "Algeria", lat: 36.7538, lon: 3.0588, pop: 3400000 },
  { name: "Tunis", country: "Tunisia", lat: 36.8065, lon: 10.1815, pop: 2300000 },
  { name: "Tripoli", country: "Libya", lat: 32.8872, lon: 13.1913, pop: 1200000 },
  { name: "Khartoum", country: "Sudan", lat: 15.5007, lon: 32.5599, pop: 5800000 },
  { name: "Nairobi", country: "Kenya", lat: -1.2921, lon: 36.8219, pop: 4400000 },
  { name: "Lagos", country: "Nigeria", lat: 6.5244, lon: 3.3792, pop: 15400000 },
  { name: "Johannesburg", country: "South Africa", lat: -26.2041, lon: 28.0473, pop: 5800000 },
  { name: "Cape Town", country: "South Africa", lat: -33.9249, lon: 18.4241, pop: 4600000 },
  { name: "Addis Ababa", country: "Ethiopia", lat: 9.0192, lon: 38.7525, pop: 5000000 },
  { name: "London", country: "UK", lat: 51.5074, lon: -0.1278, pop: 9000000 },
  { name: "Paris", country: "France", lat: 48.8566, lon: 2.3522, pop: 11000000 },
  { name: "Berlin", country: "Germany", lat: 52.52, lon: 13.405, pop: 3700000 },
  { name: "Madrid", country: "Spain", lat: 40.4168, lon: -3.7038, pop: 6600000 },
  { name: "Barcelona", country: "Spain", lat: 41.3851, lon: 2.1734, pop: 5600000 },
  { name: "Rome", country: "Italy", lat: 41.9028, lon: 12.4964, pop: 4300000 },
  { name: "Amsterdam", country: "Netherlands", lat: 52.3676, lon: 4.9041, pop: 1150000 },
  { name: "Moscow", country: "Russia", lat: 55.7558, lon: 37.6173, pop: 12500000 },
  { name: "Vienna", country: "Austria", lat: 48.2082, lon: 16.3738, pop: 1900000 },
  { name: "Athens", country: "Greece", lat: 37.9838, lon: 23.7275, pop: 3150000 },
  { name: "Lisbon", country: "Portugal", lat: 38.7223, lon: -9.1393, pop: 2900000 },
  { name: "Stockholm", country: "Sweden", lat: 59.3293, lon: 18.0686, pop: 1600000 },
  { name: "New York", country: "USA", lat: 40.7128, lon: -74.006, pop: 18800000 },
  { name: "Los Angeles", country: "USA", lat: 34.0522, lon: -118.2437, pop: 12500000 },
  { name: "Chicago", country: "USA", lat: 41.8781, lon: -87.6298, pop: 8900000 },
  { name: "San Francisco", country: "USA", lat: 37.7749, lon: -122.4194, pop: 4700000 },
  { name: "Washington", country: "USA", lat: 38.9072, lon: -77.0369, pop: 6300000 },
  { name: "Miami", country: "USA", lat: 25.7617, lon: -80.1918, pop: 6100000 },
  { name: "Toronto", country: "Canada", lat: 43.6532, lon: -79.3832, pop: 6200000 },
  { name: "Mexico City", country: "Mexico", lat: 19.4326, lon: -99.1332, pop: 21800000 },
  { name: "Sao Paulo", country: "Brazil", lat: -23.5505, lon: -46.6333, pop: 22000000 },
  { name: "Rio de Janeiro", country: "Brazil", lat: -22.9068, lon: -43.1729, pop: 13500000 },
  { name: "Buenos Aires", country: "Argentina", lat: -34.6037, lon: -58.3816, pop: 15000000 },
  { name: "Lima", country: "Peru", lat: -12.0464, lon: -77.0428, pop: 10700000 },
  { name: "Bogota", country: "Colombia", lat: 4.711, lon: -74.0721, pop: 10700000 },
  { name: "Santiago", country: "Chile", lat: -33.4489, lon: -70.6693, pop: 6800000 },
  { name: "Tokyo", country: "Japan", lat: 35.6762, lon: 139.6503, pop: 37400000 },
  { name: "Osaka", country: "Japan", lat: 34.6937, lon: 135.5023, pop: 19000000 },
  { name: "Beijing", country: "China", lat: 39.9042, lon: 116.4074, pop: 20500000 },
  { name: "Shanghai", country: "China", lat: 31.2304, lon: 121.4737, pop: 27000000 },
  { name: "Hong Kong", country: "China", lat: 22.3193, lon: 114.1694, pop: 7500000 },
  { name: "Seoul", country: "South Korea", lat: 37.5665, lon: 126.978, pop: 9700000 },
  { name: "Singapore", country: "Singapore", lat: 1.3521, lon: 103.8198, pop: 5700000 },
  { name: "Bangkok", country: "Thailand", lat: 13.7563, lon: 100.5018, pop: 10500000 },
  { name: "Jakarta", country: "Indonesia", lat: -6.2088, lon: 106.8456, pop: 10600000 },
  { name: "Kuala Lumpur", country: "Malaysia", lat: 3.139, lon: 101.6869, pop: 7800000 },
  { name: "Manila", country: "Philippines", lat: 14.5995, lon: 120.9842, pop: 13900000 },
  { name: "Mumbai", country: "India", lat: 19.076, lon: 72.8777, pop: 20400000 },
  { name: "Delhi", country: "India", lat: 28.7041, lon: 77.1025, pop: 30300000 },
  { name: "Bangalore", country: "India", lat: 12.9716, lon: 77.5946, pop: 12300000 },
  { name: "Karachi", country: "Pakistan", lat: 24.8607, lon: 67.0011, pop: 16000000 },
  { name: "Lahore", country: "Pakistan", lat: 31.5204, lon: 74.3587, pop: 12600000 },
  { name: "Dhaka", country: "Bangladesh", lat: 23.8103, lon: 90.4125, pop: 21000000 },
  { name: "Kabul", country: "Afghanistan", lat: 34.5553, lon: 69.2075, pop: 4600000 },
  { name: "Sydney", country: "Australia", lat: -33.8688, lon: 151.2093, pop: 5300000 },
  { name: "Melbourne", country: "Australia", lat: -37.8136, lon: 144.9631, pop: 5000000 },
  { name: "Auckland", country: "New Zealand", lat: -36.8485, lon: 174.7633, pop: 1650000 },
];

export function searchCities(query: string, limit = 6, source: City[] = CITIES): City[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return source
    .filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.name_ar && c.name_ar.includes(q)) ||
        c.country.toLowerCase().includes(q) ||
        (c.country_ar && c.country_ar.includes(q)),
    )
    .sort((a, b) => (b.pop ?? 0) - (a.pop ?? 0))
    .slice(0, limit);
}
