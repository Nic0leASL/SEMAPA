import { useEffect, useMemo, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Polygon, Tooltip, CircleMarker, Popup, useMap, useMapEvents } from 'react-leaflet';
import { useOutletContext } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import { districtsCochabamba } from '../../distritos_cochabamba (1)';
import { subdistritosCochabamba } from '../../subdistritos_cochabamba';
import { zonasCochabamba } from '../../zonas_cochabamba';

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

// Known avenue corridors in Cochabamba with REAL coordinates for validation
const AVENUE_CORRIDORS = {
  'av. america': { latRange: [-17.382, -17.372], lngRange: [-66.185, -66.130] },
  'av. américa': { latRange: [-17.382, -17.372], lngRange: [-66.185, -66.130] },
  'av. beijing': { latRange: [-17.425, -17.360], lngRange: [-66.185, -66.175] },
  'av. blanco galindo': { latRange: [-17.402, -17.390], lngRange: [-66.220, -66.165] },
  'av. melchor perez': { latRange: [-17.410, -17.360], lngRange: [-66.180, -66.170] },
  'av. melchor pérez': { latRange: [-17.410, -17.360], lngRange: [-66.180, -66.170] },
  'av. circunvalacion': { latRange: [-17.370, -17.355], lngRange: [-66.190, -66.130] },
  'av. circunvalación': { latRange: [-17.370, -17.355], lngRange: [-66.190, -66.130] },
  'av. villazon': { latRange: [-17.390, -17.360], lngRange: [-66.150, -66.100] },
  'av. villazón': { latRange: [-17.390, -17.360], lngRange: [-66.150, -66.100] },
  'av. heroinas': { latRange: [-17.396, -17.388], lngRange: [-66.180, -66.145] },
  'av. heroínas': { latRange: [-17.396, -17.388], lngRange: [-66.180, -66.145] },
  'av. ayacucho': { latRange: [-17.405, -17.375], lngRange: [-66.162, -66.152] },
  'av. oquendo': { latRange: [-17.410, -17.375], lngRange: [-66.154, -66.146] },
  'av. aroma': { latRange: [-17.400, -17.392], lngRange: [-66.165, -66.145] },
  'av. simon lopez': { latRange: [-17.385, -17.370], lngRange: [-66.185, -66.160] },
  'av. pando': { latRange: [-17.382, -17.370], lngRange: [-66.156, -66.150] },
  'av. papa paulo': { latRange: [-17.388, -17.382], lngRange: [-66.152, -66.140] },
  'av. petrolera': { latRange: [-17.460, -17.405], lngRange: [-66.145, -66.110] },
  'av. panamericana': { latRange: [-17.440, -17.405], lngRange: [-66.160, -66.152] }
};

// District center coordinates (real ones for Cochabamba)
const DISTRICT_CENTERS = {
  1: { lat: -17.3950, lng: -66.1570 },
  2: { lat: -17.3830, lng: -66.1520 },
  3: { lat: -17.3750, lng: -66.1600 },
  4: { lat: -17.3700, lng: -66.1650 },
  5: { lat: -17.3900, lng: -66.1700 },
  6: { lat: -17.4000, lng: -66.1550 },
  7: { lat: -17.3950, lng: -66.1400 },
  8: { lat: -17.3850, lng: -66.1450 },
  9: { lat: -17.4100, lng: -66.1600 },
  10: { lat: -17.3900, lng: -66.1580 },
  11: { lat: -17.4000, lng: -66.1650 },
  12: { lat: -17.3780, lng: -66.1550 },
  13: { lat: -17.3850, lng: -66.1680 },
  14: { lat: -17.4050, lng: -66.1480 },
  15: { lat: -17.4100, lng: -66.1700 }
};

// Validate and correct coordinates based on avenue name and district
function validateCoordinates(infra) {
  let { latitud, longitud, direccion, distrito } = infra;
  
  // Repair double UTF-8 encoding in direccion if present
  if (direccion) {
    try {
      // Decode double encoded UTF-8 strings
      direccion = decodeURIComponent(escape(direccion));
    } catch (e) {
      // Fallback manual replacement for common double-encoded chars
      direccion = direccion
        .replace(/Ã©/g, 'é')
        .replace(/Ã³/g, 'ó')
        .replace(/Ã¡/g, 'á')
        .replace(/Ã­/g, 'í')
        .replace(/Ãº/g, 'ú')
        .replace(/Ã±/g, 'ñ')
        .replace(/Ã‘/g, 'Ñ')
        .replace(/Â°/g, '°')
        .replace(/Ã¼/g, 'ü');
    }
  }

  const randomShow = Math.random() < 0.5;

  // Basic bounds check for Cochabamba city
  const CBBA_BOUNDS = {
    latMin: -17.47, latMax: -17.33,
    lngMin: -66.22, lngMax: -66.10
  };
  
  // If coordinates are completely outside Cochabamba, relocate to district center
  if (latitud < CBBA_BOUNDS.latMin || latitud > CBBA_BOUNDS.latMax ||
      longitud < CBBA_BOUNDS.lngMin || longitud > CBBA_BOUNDS.lngMax) {
    const center = DISTRICT_CENTERS[distrito] || DISTRICT_CENTERS[1];
    return {
      ...infra,
      direccion,
      latitud: center.lat + (Math.random() - 0.5) * 0.008,
      longitud: center.lng + (Math.random() - 0.5) * 0.008,
      corrected: true,
      randomShow
    };
  }
  
  // Check if the address mentions a known avenue
  if (direccion) {
    const dirLower = direccion.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    for (const [aveName, corridor] of Object.entries(AVENUE_CORRIDORS)) {
      const aveNorm = aveName.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (dirLower.includes(aveNorm.replace('av. ', ''))) {
        // Check if coordinates are within reasonable distance of the avenue corridor
        const latInRange = latitud >= corridor.latRange[0] - 0.015 && latitud <= corridor.latRange[1] + 0.015;
        const lngInRange = longitud >= corridor.lngRange[0] - 0.015 && longitud <= corridor.lngRange[1] + 0.015;
        
        if (!latInRange || !lngInRange) {
          // Relocate to the avenue corridor with some random offset
          const newLat = corridor.latRange[0] + Math.random() * (corridor.latRange[1] - corridor.latRange[0]);
          const newLng = corridor.lngRange[0] + Math.random() * (corridor.lngRange[1] - corridor.lngRange[0]);
          // Add small offset based on house number if available
          const numMatch = direccion.match(/(\d+)/);
          const numOffset = numMatch ? (parseInt(numMatch[1]) % 100) * 0.00005 : 0;
          
          return {
            ...infra,
            direccion,
            latitud: newLat + (Math.random() - 0.5) * 0.003,
            longitud: newLng + numOffset + (Math.random() - 0.5) * 0.003,
            corrected: true,
            randomShow
          };
        }
      }
    }
  }
  
  return {
    ...infra,
    direccion,
    randomShow
  };
}



export default function SemapaMap({ searchQuery: externalSearchQuery = '', selectedFilter = '(Todo) Cochabamba', onSearchTrigger }) {
  const { apiUrl, apiConnected } = useOutletContext();
  const [medidores, setMedidores] = useState([]);
  const [showMedidores, setShowMedidores] = useState(true);

  const [viewMode, setViewMode] = useState('normal'); // 'normal' | 'heatmap'
  const [currentZoom, setCurrentZoom] = useState(12); // Track map zoom level!
  const [infras, setInfras] = useState([]);
  const [loadingInfras, setLoadingInfras] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [backendSearchCatastros, setBackendSearchCatastros] = useState(new Set());
  const [searchCenter, setSearchCenter] = useState(null);
  const [clickedInfo, setClickedInfo] = useState(null);
  const [mapBounds, setMapBounds] = useState(null);
  const [selectedProperty, setSelectedProperty] = useState(null);

  const [districtConsumptions, setDistrictConsumptions] = useState({});
  const [activeCatastroId, setActiveCatastroId] = useState(null);
  const [activeMedidorId, setActiveMedidorId] = useState(null);

  const showInfras = !!(activeQuery || backendSearchCatastros.size > 0);

  const districtPropertyCounts = useMemo(() => {
    const counts = {};
    infras.forEach(infra => {
      const dist = infra.distrito;
      if (dist !== undefined && dist !== null) {
        const key = String(dist);
        counts[key] = (counts[key] || 0) + 1;
      }
    });
    return counts;
  }, [infras]);


  // Fetch real medidores from backend
  useEffect(() => {
    if (!apiConnected || !showMedidores) return;
    const fetchMedidores = async () => {
      try {
        const res = await fetch(`${apiUrl}/dashboard/mapa/medidores`);
        if (res.ok) {
          const data = await res.json();
          // Filter valid coordinates
          const validData = data.filter(m => m.latitud && m.longitud);
          setMedidores(validData);
        }
      } catch (err) {
        console.error("Error fetching medidores:", err);
      }
    };
    fetchMedidores();
  }, [apiConnected, apiUrl, showMedidores]);

  // Fetch real district consumption weights from backend
  useEffect(() => {
    if (!apiConnected) {
      setDistrictConsumptions({});
      return;
    }
    const fetchDistrictConsumptions = async () => {
      try {
        const res = await fetch(`${apiUrl}/consumo/distrito`);
        if (res.ok) {
          const data = await res.json();
          const mapped = {};
          data.forEach(item => {
            mapped[item.distrito] = item.consumo_total_m3;
          });
          setDistrictConsumptions(mapped);
        }
      } catch (err) {
        console.error("Error fetching district consumptions:", err);
      }
    };
    fetchDistrictConsumptions();
  }, [apiConnected, apiUrl]);

  // Load properties dynamically in a background Web Worker (subhilo) to prevent blocking the UI
  useEffect(() => {
    if (infras.length > 0) return;

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
        // Validate and correct coordinates
        const corrected = data.map(validateCoordinates);
        setInfras(corrected);
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
  }, [infras.length]);


  // Trigger backend search when external search query changes
  useEffect(() => {
    setActiveQuery(externalSearchQuery.trim().toLowerCase());
    if (!apiConnected || !externalSearchQuery.trim()) {
      setBackendSearchCatastros(new Set());
      return;
    }
    
    // Use an abort controller to handle rapid typing
    const controller = new AbortController();
    
    const performSearch = async () => {
      try {
        const res = await fetch(`${apiUrl}/dashboard/buscar?q=${encodeURIComponent(externalSearchQuery)}`, { signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          
          const newSet = new Set();
          
          if (data.contratos) {
             data.contratos.forEach(c => newSet.add(c.numero_catastro));
          }
          if (data.infraestructuras) {
             data.infraestructuras.forEach(i => newSet.add(i.numero_catastro));
          }
          if (data.medidores) {
             data.medidores.forEach(m => newSet.add(m.numero_catastro));
          }
          
          setBackendSearchCatastros(newSet);
          
          // Try to center on first contract/infra found
          if (data.contratos && data.contratos.length > 0) {
            const catId = data.contratos[0].numero_catastro;
            const infra = infras.find(i => i.numero_catastro === catId);
            if (infra) {
              setSearchCenter([infra.latitud, infra.longitud]);
              setCurrentZoom(17);
              return;
            }
          }
          if (data.infraestructuras && data.infraestructuras.length > 0) {
            setSearchCenter([data.infraestructuras[0].latitud, data.infraestructuras[0].longitud]);
            setCurrentZoom(17);
            return;
          }
          if (data.medidores && data.medidores.length > 0) {
            setSearchCenter([data.medidores[0].latitud, data.medidores[0].longitud]);
            setCurrentZoom(17);
            return;
          }
        }
      } catch (e) {
        if (e.name !== 'AbortError') {
           console.error("Search error", e);
        }
      }
    };
    
    const timeoutId = setTimeout(performSearch, 300); // Debounce
    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [onSearchTrigger, apiConnected, apiUrl, externalSearchQuery, infras]);

  const filteredInfras = useMemo(() => {
    if (!activeQuery && backendSearchCatastros.size === 0) {
      return [];
    }
    return infras
      .filter((infra) => {
         const matchesAddress = activeQuery && infra.direccion && infra.direccion.toLowerCase().includes(activeQuery);
         const matchesBackend = backendSearchCatastros.has(infra.numero_catastro);
         return matchesAddress || matchesBackend;
      })
      .slice(0, 1000);
  }, [infras, activeQuery, backendSearchCatastros]);


  // Trigger centering when selectedFilter changes
  useEffect(() => {
    if (selectedFilter.startsWith('Distrito')) {
      const distNum = selectedFilter.replace('Distrito ', '');
      const center = DISTRICT_CENTERS[distNum];
      if (center) {
        setSearchCenter([center.lat, center.lng]);
        setCurrentZoom(14);
      }
    } else if (selectedFilter !== '(Todo) Cochabamba') {
      // It's a subalcaldia
      const distKeys = Object.keys(DISTRICT_TO_SUBALCALDIA).filter(k => DISTRICT_TO_SUBALCALDIA[k].name === selectedFilter);
      if (distKeys.length > 0) {
        const firstDistNum = distKeys[0].replace('sector', '');
        const center = DISTRICT_CENTERS[firstDistNum];
        if (center) {
          setSearchCenter([center.lat, center.lng]);
          setCurrentZoom(13);
        }
      }
    } else {
      setSearchCenter([-17.3935, -66.1570]);
      setCurrentZoom(12);
    }
  }, [selectedFilter]);

  // Compute visible markers in current viewport bounds
  const visibleInfras = useMemo(() => {
    if (!showInfras || !mapBounds) {
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
  }, [showInfras, mapBounds, filteredInfras]);

  // Handle address searches in-memory
  const handleSearch = () => {
    const raw = searchQuery.trim();
    if (!raw) {
      setActiveQuery('');
      setBackendSearchCatastros(new Set());
      setSearchCenter(null);
      return;
    }

    const query = raw.toLowerCase();
    setActiveQuery(query);
    const firstMatch = infras.find((infra) => infra.direccion && infra.direccion.toLowerCase().includes(query));
    if (firstMatch) {
      setSearchCenter([firstMatch.latitud, firstMatch.longitud]);
      setCurrentZoom(17);
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
      lng: clickedLng,
      infraCount: distItem.infraCount
    });
  };

  // Handle property click - show detailed client info
  const handlePropertyClick = useCallback((infra) => {
    const clientData = getEmptyClientData(infra);
    setSelectedProperty({
      ...infra,
      client: clientData
    });
  }, []);

  // Helper to dynamically calculate polygon geometry representing the requested layer mode
  const getRenderPolygons = () => {
    const values = Object.values(districtConsumptions);
    const maxCons = values.length > 0 ? Math.max(...values, 1) : 1;

    return districtsCochabamba.map(item => {
      const distNum = parseInt(item.id.replace('sector', ''), 10);
      const consumption = districtConsumptions[distNum] || 0;
      const weight = consumption / maxCons;
      const infraCount = districtPropertyCounts[String(distNum)] || 0;

      return {
        key: item.id,
        name: item.name,
        color: item.color,
        district: distNum,
        infraCount: infraCount,
        sub_alcaldia: DISTRICT_TO_SUBALCALDIA[item.id]?.name || 'Desconocido',
        positions: item.polygonPath.map(p => [p.lat, p.lng]),
        weight: weight
      };
    });
  };


  const PropertyPopupContent = ({ infra }) => {
    const [clientData, setClientData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      if (!apiConnected || !infra.numero_catastro) {
        setClientData(getEmptyClientData(infra));
        setLoading(false);
        return;
      }
      const fetchClient = async () => {
        try {
          const res = await fetch(`${apiUrl}/dashboard/mapa/vivienda/${infra.numero_catastro}`);
          if (res.ok) {
            const data = await res.json();
            if (data.client) {
               setClientData({
                 cuenta: data.client.numero_contrato,
                 nombre: data.client.titular,
                 distrito: data.distrito,
                 categoria: data.client.categoria,
                 categoriaDesc: data.client.subcategoria,
                 medidor: data.client.medidor_iot,
                 consumoHora: data.client.historial && data.client.historial.length > 0 ? (data.client.historial[0].consumo_m3 / 720).toFixed(2) : "0.0",
                 consumoMensual: data.client.historial ? data.client.historial.map(h => h.consumo_m3).reverse() : [],
                 direccion: data.direccion
               });
            } else {
               setClientData(getEmptyClientData(infra));
            }
          } else {
            setClientData(getEmptyClientData(infra));
          }
        } catch (e) {
          setClientData(getEmptyClientData(infra));
        } finally {
          setLoading(false);
        }
      };
      fetchClient();
    }, [infra, apiConnected, apiUrl]);

    if (loading) return <div style={{padding: '10px', textAlign: 'center'}}>Cargando datos del cliente...</div>;
    if (!clientData) return null;

    return (
      <div style={{ color: '#111827', fontSize: '0.78rem', fontFamily: "'Plus Jakarta Sans', sans-serif", padding: '4px', minWidth: '240px' }}>
        <div style={{ background: 'linear-gradient(135deg, #7c3aed, #06b6d4)', color: 'white', padding: '8px 10px', borderRadius: '8px', marginBottom: '8px' }}>
          <strong style={{ fontSize: '0.85rem', display: 'block' }}>VIVIENDA REGISTRADA</strong>
          <span style={{ fontSize: '0.7rem', opacity: 0.9 }}>{infra.direccion || 'Sin dirección'}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px', marginBottom: '8px' }}>
          <div><strong style={{ color: '#6b7280', fontSize: '0.65rem' }}>CUENTA</strong><br/><span style={{ fontFamily: 'monospace', color: '#7c3aed', fontWeight: '700' }}>{clientData.cuenta}</span></div>
          <div><strong style={{ color: '#6b7280', fontSize: '0.65rem' }}>SEÑOR</strong><br/><span style={{ fontWeight: '600' }}>{clientData.nombre}</span></div>
          <div><strong style={{ color: '#6b7280', fontSize: '0.65rem' }}>DISTRITO</strong><br/><span>{clientData.distrito}</span></div>
          <div><strong style={{ color: '#6b7280', fontSize: '0.65rem' }}>CATEGORÍA</strong><br/><span style={{ fontWeight: '600' }}>{clientData.categoria}</span> <span style={{ fontSize: '0.6rem', color: '#9ca3af' }}>{clientData.categoriaDesc}</span></div>
          <div><strong style={{ color: '#6b7280', fontSize: '0.65rem' }}>MEDIDOR</strong><br/><span style={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>{clientData.medidor}</span></div>
          <div><strong style={{ color: '#6b7280', fontSize: '0.65rem' }}>CONSUMO/HORA</strong><br/><span style={{ color: '#06b6d4', fontWeight: '700', fontSize: '1rem' }}>{clientData.consumoHora} m³</span></div>
        </div>
        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '6px' }}>
          <strong style={{ color: '#6b7280', fontSize: '0.65rem' }}>CONSUMO MENSUAL</strong>
          {clientData.consumoMensual && clientData.consumoMensual.length > 0 ? <MiniConsumptionChart data={clientData.consumoMensual} /> : <div style={{fontSize:'0.65rem', color:'#9ca3af'}}>Sin historial</div>}
        </div>
        <div style={{ marginTop: '6px', padding: '4px 0', borderTop: '1px solid #e5e7eb' }}>
          <strong style={{ color: '#6b7280', fontSize: '0.65rem' }}>CATASTRO</strong>
          <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', marginLeft: '4px' }}>{infra.numero_catastro}</span>
        </div>
      </div>
    );
  };

  // Mini bar chart for consumption history
  const MiniConsumptionChart = ({ data }) => {
    const max = Math.max(...data, 1);
    const months = ['E', 'F', 'M', 'A', 'M', 'J'];
    return (
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '35px', marginTop: '4px' }}>
        {data.map((val, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
            <div style={{
              width: '100%',
              height: `${(val / max) * 30}px`,
              background: val === Math.max(...data) ? '#ef4444' : '#06b6d4',
              borderRadius: '2px 2px 0 0',
              minHeight: '3px'
            }} />
            <span style={{ fontSize: '7px', color: '#6b7280', marginTop: '1px' }}>{months[i]}</span>
          </div>
        ))}
      </div>
    );
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

        
        {/* Medidores Toggle */}
        <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Mostrar Medidores IoT
            </span>
            <input
              type="checkbox"
              checked={showMedidores}
              onChange={(e) => setShowMedidores(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
          </div>
          {showMedidores && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
               <span style={{ fontSize: '0.6rem', color: '#10b981' }}>● Operativos</span>
               <span style={{ fontSize: '0.6rem', color: '#ef4444' }}>● Dañados</span>
               <span style={{ fontSize: '0.6rem', color: '#f59e0b' }}>● Mantenimiento</span>
            </div>
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
              <div style={{ marginTop: '4px', borderTop: '1px solid #e5e7eb', paddingTop: '4px' }}>
                <strong>Infraestructuras:</strong> {clickedInfo.infraCount}
              </div>
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
                  <div style={{ fontSize: '0.75rem', marginBottom: '2px' }}>
                    Infraestructuras: <strong>{item.infraCount}</strong>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#a855f7', fontWeight: 'bold' }}>Click para ver información</span>
                </div>
              </Tooltip>
            </Polygon>
          );
        })}

        {/* Render Infrastructure Properties as small glowing dots only when searched */}
        {showInfras && visibleInfras.map((infra, idx) => (
          <CircleMarker
            key={infra.numero_catastro || idx}
            center={[infra.latitud, infra.longitud]}
            radius={currentZoom >= 17 ? 8 : 5}
            pathOptions={{
              color: infra.corrected ? '#f59e0b' : '#06b6d4',
              fillColor: infra.corrected ? '#fbbf24' : '#22d3ee',
              fillOpacity: 0.9,
              weight: 1.5
            }}
            eventHandlers={{
              click: () => {
                handlePropertyClick(infra);
                setActiveCatastroId(infra.numero_catastro);
              }
            }}
          >
            <Popup maxWidth={320} minWidth={260} onClose={() => setActiveCatastroId(null)}>
              <div style={{ color: '#111827', fontSize: '0.78rem', fontFamily: "'Plus Jakarta Sans', sans-serif", padding: '4px', minWidth: '240px' }}>
                {activeCatastroId === infra.numero_catastro && (
                  <PropertyPopupContent infra={infra} />
                )}
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {/* Render Medidores IoT */}
        {showMedidores && currentZoom >= 13 && medidores.map((med, idx) => {
           let mColor = '#10b981'; // Operativo
           if (med.estado === 'Dañado') mColor = '#ef4444';
           else if (med.estado === 'Mantenimiento') mColor = '#f59e0b';
           else if (med.estado === 'Nuevo' || med.estado === 'Reacondicionado') mColor = '#8b5cf6';
           
           const isSearched = med.medidor_iot && med.medidor_iot.toLowerCase() === activeQuery;
           
           return (
            <CircleMarker
              key={`med-${med.medidor_iot}-${idx}`}
              center={[med.latitud, med.longitud]}
              radius={isSearched ? 10 : (currentZoom >= 16 ? 5 : 3)}
              pathOptions={{
                color: isSearched ? '#f43f5e' : '#ffffff',
                fillColor: isSearched ? '#f43f5e' : mColor,
                fillOpacity: 1,
                weight: isSearched ? 3 : 1
              }}
              eventHandlers={{
                click: () => setActiveMedidorId(med.medidor_iot)
              }}
            >
              <Popup maxWidth={320} minWidth={260} onClose={() => setActiveMedidorId(null)}>
                 {activeMedidorId === med.medidor_iot && (
                   <PropertyPopupContent 
                     infra={{ 
                       numero_catastro: med.numero_catastro, 
                       direccion: med.zona ? `Zona: ${med.zona}` : 'Ubicación del medidor', 
                       distrito: med.distrito
                     }} 
                   />
                 )}
              </Popup>
            </CircleMarker>
          );
        })}

      </MapContainer>
    </div>
  );
}
