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
  const snapEnabled = useRouteStore((s) => s.snapEnabled);
  const snapped = useRouteStore((s) => s.snapped);
  const anchors = deriveAnchors(segments);
  const all: [number, number][] = anchors.flatMap((s) => s.points.map((p) => [p.lat, p.lon] as [number, number]));

  return (
    <MapContainer center={[38.47, -120.2]} zoom={11} className="h-full w-full">
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {anchors.map((seg) => {
        const snap = snapEnabled ? snapped[seg.id] : undefined;
        const straight = seg.points.map((p) => [p.lat, p.lon] as [number, number]);
        return (
          <div key={seg.id}>
            {snap
              ? snap.legs.map((leg, i) => (
                  <Polyline
                    key={i}
                    positions={leg.points.map((p) => [p.lat, p.lon] as [number, number])}
                    pathOptions={leg.snapped ? {} : { dashArray: "6", color: "#888" }}
                  />
                ))
              : straight.length > 1 && <Polyline positions={straight} />}
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
