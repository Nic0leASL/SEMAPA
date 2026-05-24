import React, { useState } from 'react';
import { MapContainer, TileLayer, Polygon, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { districtsCochabamba } from '../../distritos_cochabamba (1)';
import { dashboardMockData } from '../mockData';

export default function SemapaMap() {
  const [mode, setMode] = useState('normal'); // 'normal' | 'heatmap'

  // Helper to determine color based on heatmap data
  const getHeatmapColor = (districtId) => {
    const weight = dashboardMockData.heatmapData[districtId] || 0;
    // Map weight 0-1 to a color scale
    if (weight > 0.8) return '#ef4444'; // Red - high consumption
    if (weight > 0.6) return '#f59e0b'; // Amber
    if (weight > 0.4) return '#10b981'; // Emerald
    return '#06b6d4'; // Cyan - low consumption
  };

  return (
    <div className="map-container glass">
      <div className="map-controls">
        <button 
          className={`map-btn ${mode === 'normal' ? 'active' : ''}`}
          onClick={() => setMode('normal')}
        >
          Mapa Distritos
        </button>
        <button 
          className={`map-btn ${mode === 'heatmap' ? 'active' : ''}`}
          onClick={() => setMode('heatmap')}
        >
          Mapa de Calor (Consumo)
        </button>
      </div>

      <MapContainer 
        center={[-17.3935, -66.1570]} 
        zoom={12} 
        style={{ height: '100%', width: '100%', background: '#0b0f19', borderRadius: '12px' }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; OpenStreetMap contributors &copy; CARTO'
        />

        {districtsCochabamba.map((district) => {
          const path = district.polygonPath.map(p => [p.lat, p.lng]);
          const fillColor = mode === 'heatmap' ? getHeatmapColor(district.id) : district.color;
          const weight = dashboardMockData.heatmapData[district.id] || 0;
          
          return (
            <Polygon 
              key={district.id}
              positions={path}
              pathOptions={{ 
                color: mode === 'heatmap' ? 'rgba(255,255,255,0.2)' : district.color, 
                fillColor: fillColor,
                fillOpacity: mode === 'heatmap' ? 0.7 : 0.3,
                weight: 1
              }}
            >
              <Tooltip>
                <div style={{ padding: '8px', color: '#333' }}>
                  <strong style={{ display: 'block', fontSize: '1rem', marginBottom: '4px' }}>{district.name}</strong>
                  {mode === 'heatmap' && (
                    <div style={{ fontSize: '0.85rem' }}>
                      Índice de Consumo: {(weight * 100).toFixed(0)}%
                    </div>
                  )}
                </div>
              </Tooltip>
            </Polygon>
          );
        })}
      </MapContainer>
    </div>
  );
}
