import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, ImageOverlay, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export type DebugPlace = {
  id?: string;
  name?: string;
  latitude?: number | null;
  longitude?: number | null;
  category?: string;
  distanceMeters?: number;
};

export type DebugIntelligence = {
  coordinates: { latitude: number; longitude: number };
  radiusMeters?: number;
  mapAsset?: { url?: string; caption?: string };
  facilities?: Record<string, DebugPlace[]>;
};

const propertyPin = L.divIcon({
  className: '',
  html: '<div style="width:15px;height:15px;border-radius:50%;background:#26352b;border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.45)"></div>',
  iconSize: [15, 15],
  iconAnchor: [7.5, 7.5],
});
const placePin = L.divIcon({
  className: '',
  html: '<div style="width:10px;height:10px;border-radius:50%;background:#718b78;border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.45)"></div>',
  iconSize: [10, 10],
  iconAnchor: [5, 5],
});

export function DebugMap({ intelligence }: { intelligence: DebugIntelligence }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { latitude, longitude } = intelligence.coordinates;
  const radiusMeters = intelligence.radiusMeters ?? 1000;
  const latScale = 111320;
  const lonScale = Math.max(111320 * Math.cos((latitude * Math.PI) / 180), 1);
  const halfLat = radiusMeters / (0.72 * latScale);
  const halfLon = radiusMeters / (0.72 * lonScale);
  const bounds: [[number, number], [number, number]] = [
    [latitude - halfLat, longitude - halfLon],
    [latitude + halfLat, longitude + halfLon],
  ];
  const places = Object.values(intelligence.facilities ?? {})
    .flat()
    .filter((place) => place.latitude != null && place.longitude != null);
  if (!mounted)
    return <div className="h-80 w-full rounded-lg border border-[#e4d9b8] bg-[#eef1ec]" />;
  return (
    <MapContainer
      center={[latitude, longitude]}
      zoom={15}
      scrollWheelZoom={false}
      className="h-80 w-full rounded-lg border border-[#e4d9b8]"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {intelligence.mapAsset?.url && (
        <ImageOverlay url={intelligence.mapAsset.url} bounds={bounds} opacity={0.7} />
      )}
      <Marker position={[latitude, longitude]} icon={propertyPin}>
        <Popup>
          Property · {latitude.toFixed(5)}, {longitude.toFixed(5)}
        </Popup>
      </Marker>
      {places.map((place) => (
        <Marker
          key={place.id ?? `${place.name}-${place.latitude}-${place.longitude}`}
          position={[place.latitude as number, place.longitude as number]}
          icon={placePin}
        >
          <Popup>
            {place.name} · {place.category} · {place.distanceMeters}m
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
