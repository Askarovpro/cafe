import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const TASHKENT: [number, number] = [41.3111, 69.2797];

// Gold pin as a divIcon — avoids Leaflet's broken default-marker image paths under bundlers.
const pin = L.divIcon({
  className: '',
  html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#f2c14c;border:2px solid #17171a;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 22],
});

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=uz`);
    const d = await r.json();
    return d.display_name ?? '';
  } catch { return ''; }
}

async function forwardGeocode(q: string): Promise<{ lat: number; lng: number; address: string } | null> {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=uz&q=${encodeURIComponent(q)}`);
    const d = await r.json();
    if (!d[0]) return null;
    return { lat: +d[0].lat, lng: +d[0].lon, address: d[0].display_name };
  } catch { return null; }
}

export function MapPicker({ onChange }: { onChange: (loc: { lat: number; lng: number; address: string }) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  const set = async (lat: number, lng: number, knownAddress?: string) => {
    marker.current?.setLatLng([lat, lng]);
    const address = knownAddress ?? (await reverseGeocode(lat, lng));
    onChange({ lat, lng, address });
  };

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current).setView(TASHKENT, 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(m);
    const mk = L.marker(TASHKENT, { icon: pin, draggable: true }).addTo(m);
    mk.on('dragend', () => { const p = mk.getLatLng(); set(p.lat, p.lng); });
    m.on('click', (e: L.LeafletMouseEvent) => set(e.latlng.lat, e.latlng.lng));
    map.current = m;
    marker.current = mk;
    return () => { m.remove(); map.current = null; marker.current = null; };
  }, []);

  const doSearch = async () => {
    if (!search.trim()) return;
    setBusy(true);
    const r = await forwardGeocode(search);
    setBusy(false);
    if (r && map.current) {
      map.current.setView([r.lat, r.lng], 16);
      set(r.lat, r.lng, r.address);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div className="split">
        <input
          placeholder="Manzil qidirish (masalan: Chilonzor 5)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), doSearch())}
        />
        <button type="button" className="btn btn--ghost" style={{ flex: '0 0 auto' }} onClick={doSearch} disabled={busy}>
          {busy ? '…' : 'Topish'}
        </button>
      </div>
      <div ref={el} style={{ height: 220, borderRadius: 'var(--r-sm)', overflow: 'hidden', border: '1px solid var(--line)' }} />
      <div className="muted">Xaritani bosing yoki belgini suring — manzil avtomatik to'ladi.</div>
    </div>
  );
}
