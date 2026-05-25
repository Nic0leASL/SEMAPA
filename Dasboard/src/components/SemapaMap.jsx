import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Polygon, Tooltip, CircleMarker, Popup, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { districtsCochabamba } from '../../distritos_cochabamba (1)';
import { subdistritosCochabamba } from '../../subdistritos_cochabamba';
import { zonasCochabamba } from '../../zonas_cochabamba';
import { dashboardMockData } from '../mockData';

// Component to dynamically update map view center and zoom
function ChangeView({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, 15);
    }
  }, [center, map]);
  return null;
}

// Component to capture zoom levels and bounds from Leaflet map events
function MapEventsHandler({ onZoomChange, onBoundsChange }) {
  const map = useMapEvents({
    zoomend() {
      onZoomChange(map.getZoom());
    },
    moveend() {
      onBoundsChange(map.getBounds());
    }
  });

  useEffect(() => {
    if (map) {
      onZoomChange(map.getZoom());
      onBoundsChange(map.getBounds());
    }
  }, [map, onZoomChange, onBoundsChange]);

  return null;
}

export default function SemapaMap() {
  const [viewMode, setViewMode] = useState('normal'); // 'normal' | 'heatmap'
  const [currentZoom, setCurrentZoom] = useState(12); // Track map zoom level!
  const [showInfras, setShowInfras] = useState(true); // Default to true!
  const [infras, setInfras] = useState([]);
  const [loadingInfras, setLoadingInfras] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [searchCenter, setSearchCenter] = useState(null);
  const [clickedInfo, setClickedInfo] = useState(null);
  const [mapBounds, setMapBounds] = useState(null);

  // Load properties dynamically in a background Web Worker (subhilo) to prevent blocking the UI
  useEffect(() => {
    if (!showInfras || infras.length > 0) return;

    const loadingTimeoutId = setTimeout(() => {
      setLoadingInfras(true);
    }, 0);

    // Create an inline Web Worker to parse the JSON in a separate thread
    const workerCode = `
      self.onmessage = async (e) => {
        const { url } = e.data;
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error("Failed to fetch coordinate file");
          const data = await res.json();
          
          // Map short keys to full keys
          const mapped = data.map(item => ({
            numero_catastro: item.c,
            direccion: item.d,
            latitud: item.lat,
            longitud: item.lng,
            distrito: item.dist
          }));

          self.postMessage({ success: true, data: mapped });
        } catch (err) {
          self.postMessage({ success: false, error: err.message });
        }
      };
    `;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    const worker = new Worker(workerUrl);

    worker.postMessage({ url: window.location.origin + '/infraestructuras_coordenadas.json' });

    worker.onmessage = (e) => {
      const { success, data, error } = e.data;
      if (success) {
        setInfras(data);
      } else {
        console.error("Worker failed to parse JSON:", error);
      }
      setLoadingInfras(false);
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
    };

    worker.onerror = (err) => {
      console.error("Worker error:", err);
      setLoadingInfras(false);
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
    };

    return () => {
      clearTimeout(loadingTimeoutId);
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
    };
  }, [showInfras, infras.length]);

  const filteredInfras = useMemo(() => {
    if (!activeQuery) return infras;
    return infras
      .filter((infra) => infra.direccion && infra.direccion.toLowerCase().includes(activeQuery))
      .slice(0, 1000);
  }, [infras, activeQuery]);

  // Compute visible markers in current viewport bounds (only for zoom >= 15 to keep 60 FPS)
  const visibleInfras = useMemo(() => {
    if (!showInfras || currentZoom < 15 || !mapBounds) {
      return [];
    }
    const southWest = mapBounds.getSouthWest();
    const northEast = mapBounds.getNorthEast();

    const minLat = southWest.lat;
    const maxLat = northEast.lat;
    const minLng = southWest.lng;
    const maxLng = northEast.lng;

    return filteredInfras.filter(infra =>
      infra.latitud >= minLat &&
      infra.latitud <= maxLat &&
      infra.longitud >= minLng &&
      infra.longitud <= maxLng
    );
  }, [showInfras, currentZoom, mapBounds, filteredInfras]);

  // Handle address searches in-memory
  const handleSearch = () => {
    const raw = searchQuery.trim();
    if (!raw) {
      setActiveQuery('');
      setSearchCenter(null);
      return;
    }

    const query = raw.toLowerCase();
    setActiveQuery(query);
    const firstMatch = infras.find((infra) => infra.direccion && infra.direccion.toLowerCase().includes(query));
    if (firstMatch) {
      setSearchCenter([firstMatch.latitud, firstMatch.longitud]);
    } else {
      setSearchCenter(null);
    }
  };

  // Mappings of districts to their subalcaldias (from the districts CSV metadata)
  const DISTRICT_TO_SUBALCALDIA = {
    'sector1': { id: 'tunari', name: 'Subalcaldía Tunari', color: '#06b6d4' },
    'sector2': { id: 'tunari', name: 'Subalcaldía Tunari', color: '#06b6d4' },
    'sector13': { id: 'tunari', name: 'Subalcaldía Tunari', color: '#06b6d4' },
    'sector3': { id: 'molle', name: 'Subalcaldía Molle', color: '#a855f7' },
    'sector4': { id: 'molle', name: 'Subalcaldía Molle', color: '#a855f7' },
    'sector5': { id: 'alejo_calatayud', name: 'Subalcaldía Alejo Calatayud', color: '#10b981' },
    'sector8': { id: 'alejo_calatayud', name: 'Subalcaldía Alejo Calatayud', color: '#10b981' },
    'sector6': { id: 'valle_hermoso', name: 'Subalcaldía Valle Hermoso', color: '#ef4444' },
    'sector7': { id: 'valle_hermoso', name: 'Subalcaldía Valle Hermoso', color: '#ef4444' },
    'sector14': { id: 'valle_hermoso', name: 'Subalcaldía Valle Hermoso', color: '#ef4444' },
    'sector9': { id: 'itocta', name: 'Subalcaldía Itocta', color: '#f59e0b' },
    'sector10': { id: 'adela_zamudio', name: 'Subalcaldía Adela Zamudio', color: '#ec4899' },
    'sector11': { id: 'adela_zamudio', name: 'Subalcaldía Adela Zamudio', color: '#ec4899' },
    'sector12': { id: 'adela_zamudio', name: 'Subalcaldía Adela Zamudio', color: '#ec4899' },
  };

  // Helper to determine heat color
  const getHeatmapColor = (weight) => {
    if (weight > 0.8) return '#ef4444'; // Red - high
    if (weight > 0.6) return '#f59e0b'; // Amber
    if (weight > 0.4) return '#10b981'; // Emerald
    return '#06b6d4'; // Cyan - low
  };

  // Click handler that performs distance-based mapping for subdistritos and zonas
  const handlePolygonClick = (distItem, e) => {
    const clickedLat = e.latlng.lat;
    const clickedLng = e.latlng.lng;

    const cleanDistName = distItem.name.toLowerCase().trim();

    // Find the closest subdistrito inside this district
    const subdistritosInDistrict = subdistritosCochabamba.filter(
      sub => sub.district && sub.district.toLowerCase().trim() === cleanDistName
    );
    const targetSubdists = subdistritosInDistrict.length > 0 ? subdistritosInDistrict : subdistritosCochabamba;

    let closestSubdist = null;
    let minSubdistDist = Infinity;
    targetSubdists.forEach(sub => {
      const p = sub.polygonPath && sub.polygonPath[0];
      if (p) {
        const coord = Array.isArray(p) ? p[0] : p;
        if (coord && coord.lat !== undefined && coord.lng !== undefined) {
          const distance = Math.pow(coord.lat - clickedLat, 2) + Math.pow(coord.lng - clickedLng, 2);
          if (distance < minSubdistDist) {
            minSubdistDist = distance;
            closestSubdist = sub;
          }
        }
      }
    });

    // Find the closest zone inside this district
    const zonesInDistrict = zonasCochabamba.filter(
      z => z.district && z.district.toLowerCase().trim() === cleanDistName
    );
    const targetZones = zonesInDistrict.length > 0 ? zonesInDistrict : zonasCochabamba;

    let closestZone = null;
    let minZoneDist = Infinity;
    targetZones.forEach(z => {
      const p = z.polygonPath && z.polygonPath[0];
      if (p) {
        const coord = Array.isArray(p) ? p[0] : p;
        if (coord && coord.lat !== undefined && coord.lng !== undefined) {
          const distance = Math.pow(coord.lat - clickedLat, 2) + Math.pow(coord.lng - clickedLng, 2);
          if (distance < minZoneDist) {
            minZoneDist = distance;
            closestZone = z;
          }
        }
      }
    });

    const subAlcaldiaName = DISTRICT_TO_SUBALCALDIA[distItem.key]?.name || 'Desconocido';

    setClickedInfo({
      district: distItem.name,
      subAlcaldia: subAlcaldiaName,
      subdistrito: closestSubdist ? closestSubdist.name : 'No identificado',
      zona: closestZone ? closestZone.name : 'No identificada',
      lat: clickedLat,
      lng: clickedLng
    });
  };

  // Helper to dynamically calculate polygon geometry representing the requested layer mode
  const getRenderPolygons = () => {
    return districtsCochabamba.map(item => ({
      key: item.id,
      name: item.name,
      color: item.color,
      district: null,
      sub_alcaldia: DISTRICT_TO_SUBALCALDIA[item.id]?.name || 'Desconocido',
      positions: item.polygonPath.map(p => [p.lat, p.lng]),
      weight: dashboardMockData.heatmapData[item.id] || (parseInt(item.id.replace('sector', '')) % 5) / 5
    }));
  };

  return (
    <div className="map-container glass">
      {/* Controls panel */}
      <div className="map-controls" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '0.6rem', top: '10px', right: '10px', width: '230px' }}>

        {/* View Mode Selector */}
        <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.4rem' }}>
          <button
            className={`map-btn ${viewMode === 'normal' ? 'active' : ''}`}
            onClick={() => setViewMode('normal')}
            style={{ fontSize: '0.7rem', padding: '0.3rem 0.5rem', flex: 1 }}
          >
            Normal
          </button>
          <button
            className={`map-btn ${viewMode === 'heatmap' ? 'active' : ''}`}
            onClick={() => setViewMode('heatmap')}
            style={{ fontSize: '0.7rem', padding: '0.3rem 0.5rem', flex: 1 }}
          >
            Consumo
          </button>
        </div>

        {/* Property Addresses Toggle */}
        <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              {loadingInfras ? "Cargando..." : "Mostrar Direcciones"}
            </span>
            <input
              type="checkbox"
              checked={showInfras}
              onChange={(e) => setShowInfras(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
          </div>
          {showInfras && currentZoom < 15 && (
            <span style={{ fontSize: '0.65rem', color: '#f59e0b', fontWeight: 500 }}>
              ⚠️ Acerque el mapa para ver las direcciones
            </span>
          )}
          {showInfras && currentZoom >= 15 && (
            <span style={{ fontSize: '0.65rem', color: '#10b981', fontWeight: 500 }}>
              ✓ Direcciones visibles
            </span>
          )}
        </div>

        {/* Address Search Bar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Buscar Dirección/Avenida
          </span>
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            <input
              type="text"
              placeholder="Ej. América, Beijing, Blanco..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              style={{
                background: 'var(--field-bg)',
                border: '1px solid var(--field-border)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                padding: '0.35rem 0.5rem',
                fontSize: '0.7rem',
                width: '100%',
                outline: 'none'
              }}
            />
            <button
              className="map-btn"
              onClick={handleSearch}
              style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem' }}
            >
              🔍
            </button>
          </div>
        </div>
      </div>

      <MapContainer
        center={[-17.3935, -66.1570]}
        zoom={12}
        style={{ height: '100%', width: '100%', background: '#eef7ff', borderRadius: '12px' }}
      >
        <ChangeView center={searchCenter} />
        <MapEventsHandler onZoomChange={setCurrentZoom} onBoundsChange={setMapBounds} />

        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; OpenStreetMap contributors &copy; CARTO'
        />

        {/* Info Popup when clicking inside a District */}
        {clickedInfo && (
          <Popup
            position={[clickedInfo.lat, clickedInfo.lng]}
            onClose={() => setClickedInfo(null)}
          >
            <div style={{ color: '#111827', fontSize: '0.8rem', fontFamily: 'sans-serif', minWidth: '180px', padding: '2px' }}>
              <strong style={{ color: '#a855f7', display: 'block', fontSize: '0.85rem', marginBottom: '6px', borderBottom: '1px solid #e5e7eb', paddingBottom: '3px' }}>
                UBICACIÓN REGISTRADA
              </strong>
              <div style={{ marginBottom: '3px' }}><strong>Distrito:</strong> {clickedInfo.district}</div>
              <div style={{ marginBottom: '3px' }}><strong>Subalcaldía:</strong> {clickedInfo.subAlcaldia}</div>
              <div style={{ marginBottom: '3px' }}><strong>Subdistrito:</strong> {clickedInfo.subdistrito}</div>
              <div style={{ marginBottom: '3px' }}><strong>Zona:</strong> {clickedInfo.zona}</div>
            </div>
          </Popup>
        )}

        {getRenderPolygons().map((item) => {
          const fillColor = viewMode === 'heatmap' ? getHeatmapColor(item.weight) : item.color;
          return (
            <Polygon
              key={item.key}
              positions={item.positions}
              eventHandlers={{
                click: (e) => handlePolygonClick(item, e)
              }}
              pathOptions={{
                color: viewMode === 'heatmap' ? 'rgba(0,0,0,0.10)' : item.color,
                fillColor: fillColor,
                fillOpacity: viewMode === 'heatmap' ? 0.6 : 0.2,
                weight: 1.5
              }}
            >
              <Tooltip>
                <div style={{ padding: '4px', color: '#111827', fontFamily: 'sans-serif' }}>
                  <strong style={{ display: 'block', fontSize: '0.9rem', marginBottom: '2px' }}>{item.name}</strong>
                  <span style={{ fontSize: '0.75rem', color: '#a855f7', fontWeight: 'bold' }}>Click para ver información</span>
                </div>
              </Tooltip>
            </Polygon>
          );
        })}

        {/* Render Infrastructure Properties as small glowing dots only when zoomed in close (zoom >= 15) and visible within the map viewport */}
        {showInfras && currentZoom >= 14 && visibleInfras.map((infra, idx) => (
          <CircleMarker
            key={infra.numero_catastro || idx}
            center={[infra.latitud, infra.longitud]}
            radius={4}
            pathOptions={{
              color: '#06b6d4',
              fillColor: '#22d3ee',
              fillOpacity: 0.9,
              weight: 1.5
            }}
          >
            <Popup>
              <div style={{ color: '#111827', fontSize: '0.75rem', fontFamily: 'sans-serif', minWidth: '150px' }}>
                <strong style={{ color: 'var(--accent-purple)', display: 'block', marginBottom: '2px' }}>VIVIENDA REGISTRADA</strong>
                <strong>Catastro:</strong> <span style={{ fontFamily: 'monospace' }}>{infra.numero_catastro}</span><br />
                <strong>Dirección:</strong> {infra.direccion}
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}


