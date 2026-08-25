import { useEffect, useRef } from "react";
import maplibregl, { type Map as MaplibreMap, Marker } from "maplibre-gl";
import type { SearchResult } from "../lib/types";

// Free, no-API-key vector basemap (https://openfreemap.org) -- avoids any
// Google/Mapbox billing for an internal 30-user tool.
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

interface Props {
  results: SearchResult[];
  searchPoint: { lat: number; lon: number } | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function MapView({ results, searchPoint, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const searchMarkerRef = useRef<Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [-1.5, 52.5],
      zoom: 5.5,
    });
    mapRef.current.addControl(new maplibregl.NavigationControl(), "top-right");
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const marker of markersRef.current.values()) marker.remove();
    markersRef.current.clear();
    searchMarkerRef.current?.remove();
    searchMarkerRef.current = null;

    const bounds = new maplibregl.LngLatBounds();
    let hasBounds = false;

    if (searchPoint) {
      const el = document.createElement("div");
      el.className = "h-4 w-4 rounded-full border-2 border-white bg-brand-900 shadow-md";
      searchMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([searchPoint.lon, searchPoint.lat])
        .addTo(map);
      bounds.extend([searchPoint.lon, searchPoint.lat]);
      hasBounds = true;
    }

    for (const r of results) {
      if (r.lat == null || r.lon == null) continue;
      const el = document.createElement("div");
      const isSelected = r.id === selectedId;
      el.className = `h-6 w-6 cursor-pointer rounded-full border-2 border-white shadow-md transition-transform ${
        isSelected ? "scale-125 bg-highlight" : "bg-brand-600"
      }`;
      el.addEventListener("click", () => onSelect(r.id));
      const marker = new maplibregl.Marker({ element: el }).setLngLat([r.lon, r.lat]).addTo(map);
      markersRef.current.set(r.id, marker);
      bounds.extend([r.lon, r.lat]);
      hasBounds = true;
    }

    if (hasBounds) {
      map.fitBounds(bounds, { padding: 60, maxZoom: 12, duration: 500 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, searchPoint, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const result = results.find((r) => r.id === selectedId);
    if (result?.lat != null && result?.lon != null) {
      map.easeTo({ center: [result.lon, result.lat], duration: 400 });
    }
  }, [selectedId, results]);

  return <div ref={containerRef} className="h-full w-full" />;
}
