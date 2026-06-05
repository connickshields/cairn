import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import { LatLngBounds } from "leaflet";
import { useRouteStore } from "../store";
import { deriveAnchors } from "../lib/anchors";

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = JSON.stringify(points);
  useEffect(() => {
    if (points.length > 0) map.fitBounds(new LatLngBounds(points), { padding: [30, 30] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

export function MapPanel() {
  const segments = useRouteStore((s) => s.segments);
  const anchors = deriveAnchors(segments);
  const all: [number, number][] = anchors.flatMap((s) => s.points.map((p) => [p.lat, p.lon] as [number, number]));

  return (
    <MapContainer center={[38.47, -120.2]} zoom={11} className="h-full w-full">
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {anchors.map((seg) => {
        const line = seg.points.map((p) => [p.lat, p.lon] as [number, number]);
        return (
          <div key={seg.id}>
            {line.length > 1 && <Polyline positions={line} />}
            {seg.points.map((p) => (
              <Marker key={p.id} position={[p.lat, p.lon]}>
                <Popup>
                  <strong>mile {p.fwdMile || "?"}</strong>
                  <br />
                  {p.text}
                </Popup>
              </Marker>
            ))}
          </div>
        );
      })}
      <FitBounds points={all} />
    </MapContainer>
  );
}
