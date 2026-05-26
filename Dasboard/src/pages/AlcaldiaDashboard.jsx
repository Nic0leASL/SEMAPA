import { useEffect, useState, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Droplet, Activity, AlertTriangle, Search, ChevronDown, Calendar } from 'lucide-react';
import SemapaMap from '../components/SemapaMap';

// SVG Gauge Component - Consumo promedio vs OMS
function GaugeChart({ value, max = 500, omsStandard = 100 }) {
  const percentage = Math.min(value / max, 1);
  const angle = percentage * 180; // 0-180 degrees
  const omsAngle = (omsStandard / max) * 180;
  
  // Color based on water consumption levels
  const getColor = () => {
    if (value <= 100) return '#22c55e'; // Green - level 1
    if (value <= 180) return '#10b981'; // Emerald - level 2
    if (value <= 250) return '#f59e0b'; // Amber - level 3
    if (value <= 300) return '#f97316'; // Orange - level 4
    return '#ef4444'; // Red - level 5+
  };

  const needleRotation = -90 + angle;
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0.5rem 0' }}>
      <svg viewBox="0 0 200 120" width="100%" style={{ maxWidth: '260px' }}>
        {/* Background arc */}
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="rgba(200,200,200,0.3)"
          strokeWidth="18"
          strokeLinecap="round"
        />
        {/* Green zone (0-50%) */}
        <path
          d="M 20 100 A 80 80 0 0 1 100 20"
          fill="none"
          stroke="rgba(34, 197, 94, 0.25)"
          strokeWidth="18"
          strokeLinecap="round"
        />
        {/* Amber zone (50-75%) */}
        <path
          d="M 100 20 A 80 80 0 0 1 156 40"
          fill="none"
          stroke="rgba(245, 158, 11, 0.25)"
          strokeWidth="18"
        />
        {/* Red zone (75-100%) */}
        <path
          d="M 156 40 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="rgba(239, 68, 68, 0.25)"
          strokeWidth="18"
          strokeLinecap="round"
        />
        
        {/* Scale labels */}
        <text x="15" y="115" fontSize="11" fill="var(--text-secondary)" textAnchor="middle">0</text>
        <text x="55" y="40" fontSize="11" fill="var(--text-secondary)" textAnchor="middle">125</text>
        <text x="100" y="18" fontSize="11" fill="var(--text-secondary)" textAnchor="middle">250</text>
        <text x="155" y="40" fontSize="11" fill="var(--text-secondary)" textAnchor="middle">375</text>
        <text x="188" y="115" fontSize="11" fill="var(--text-secondary)" textAnchor="middle">500</text>
        
        {/* Needle */}
        <g transform={`rotate(${needleRotation}, 100, 100)`}>
          <line x1="100" y1="100" x2="100" y2="30" stroke={getColor()} strokeWidth="3" strokeLinecap="round" />
          <circle cx="100" cy="100" r="6" fill={getColor()} />
          <circle cx="100" cy="100" r="3" fill="white" />
        </g>
        
        {/* Value display */}
        <text x="100" y="95" fontSize="22" fontWeight="700" fill="var(--text-primary)" textAnchor="middle" fontFamily="Outfit, sans-serif">
          {value}
        </text>
        <text x="100" y="112" fontSize="9" fill="var(--text-secondary)" textAnchor="middle">
          litros/hab/día
        </text>
      </svg>
      
      {/* OMS reference icon */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.3rem' }}>
        <svg width="20" height="28" viewBox="0 0 20 28">
          <circle cx="10" cy="6" r="5" fill="var(--text-secondary)" opacity="0.6" />
          <path d="M 10 11 L 10 20" stroke="var(--text-secondary)" strokeWidth="2" opacity="0.6" />
          <path d="M 5 14 L 15 14" stroke="var(--text-secondary)" strokeWidth="2" opacity="0.6" />
          <path d="M 7 22 L 10 20 L 13 22" stroke="var(--text-secondary)" strokeWidth="2" fill="none" opacity="0.6" />
        </svg>
      </div>
    </div>
  );
}

// Function to classify water consumption per inhabitant
function getConsumoNivel(litros) {
  if (litros <= 100) {
    return {
      nivel: 'Nivel 1',
      clasificacion: 'Consumo ejemplar y consciente',
      interpretacion: 'Uso altamente eficiente y sostenible. Refleja compromiso ambiental y responsabilidad ciudadana.',
      color: '#22c55e'
    };
  } else if (litros <= 180) {
    return {
      nivel: 'Nivel 2',
      clasificacion: 'Consumo responsable',
      interpretacion: 'Uso adecuado con pequeñas oportunidades de mejora. Buen equilibrio entre comodidad y sostenibilidad.',
      color: '#10b981'
    };
  } else if (litros <= 250) {
    return {
      nivel: 'Nivel 3',
      clasificacion: 'Consumo moderado',
      interpretacion: 'Consumo aceptable, pero con señales de exceso en algunas actividades cotidianas.',
      color: '#f59e0b'
    };
  } else if (litros <= 300) {
    return {
      nivel: 'Nivel 4',
      clasificacion: 'Consumo elevado',
      interpretacion: 'Cercano al límite crítico. Requiere acciones inmediatas para evitar desperdicio.',
      color: '#f97316'
    };
  } else if (litros <= 400) {
    return {
      nivel: 'Nivel 5',
      clasificacion: 'Consumo inconsciente',
      interpretacion: 'Exceso evidente. Se consume más agua de la necesaria; existe desperdicio significativo.',
      color: '#ef4444'
    };
  } else {
    return {
      nivel: 'Nivel 6',
      clasificacion: 'Consumo crítico e insostenible',
      interpretacion: 'Nivel alarmante de desperdicio. Impacta negativamente al sistema de abastecimiento y al bienestar colectivo.',
      color: '#b91c1c'
    };
  }
}


export default function AlcaldiaDashboard() {
  const { apiUrl, apiConnected } = useOutletContext();
  const [data, setData] = useState({
    consumoCiudad: '0',
    medidoresReportando: '0',
    medidoresErrores: '0',
    distribucionMensual: [],
    topZonasConsumo: [],
    promedioConsumoHabitante: 0,
    estandarOMS: 100,
    estresHidrico: [],
    weatherComparison: [],
    consumoPorDistrito: [],
    lecturasRecientes: []
  });
  const [isMocked, setIsMocked] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('(Todo) Cochabamba');
  const [dateRange, setDateRange] = useState('');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  const filterOptions = [
    '(Todo) Cochabamba',
    'Subalcaldía Tunari',
    'Subalcaldía Molle',
    'Subalcaldía Alejo Calatayud',
    'Subalcaldía Valle Hermoso',
    'Subalcaldía Itocta',
    'Subalcaldía Adela Zamudio',
    'Distrito 1', 'Distrito 2', 'Distrito 3', 'Distrito 4', 'Distrito 5',
    'Distrito 6', 'Distrito 7', 'Distrito 8', 'Distrito 9', 'Distrito 10',
    'Distrito 11', 'Distrito 12', 'Distrito 13', 'Distrito 14'
  ];

  useEffect(() => {
    if (!apiConnected) return;

    const fetchData = async () => {
      try {
        const res = await fetch(`${apiUrl}/dashboard/presidente`);
        if (res.ok) {
          const apiData = await res.json();
          const stats = apiData.statistics;

          // Map monthly consumption
          const monthNames = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
          const mappedMonthly = (apiData.distribucion_mensual || []).map((item, idx) => ({
            mes: item.mes || monthNames[idx] || `M${idx+1}`,
            consumo: item.consumo || 0,
            color: item.consumo > 2500000 ? '#1aa3ff' : '#f59e0b'
          }));

          // If last month is missing, average the previous
          if (mappedMonthly.length > 0) {
            const lastMonth = mappedMonthly[mappedMonthly.length - 1];
            if (!lastMonth.consumo || lastMonth.consumo === 0) {
              const prevMonths = mappedMonthly.slice(0, -1).filter(m => m.consumo > 0);
              if (prevMonths.length > 0) {
                const avg = prevMonths.reduce((sum, m) => sum + m.consumo, 0) / prevMonths.length;
                lastMonth.consumo = Math.round(avg);
                lastMonth.color = '#7c3aed'; // purple for estimated
              }
            }
          }

          // Map top zones
          const mappedTopZonas = (apiData.top_zonas_consumo || []).map(z => ({
            zona: z.zona,
            consumo: z.consumo
          }));

          // Map water stress
          const mappedEstres = (apiData.estres_hidrico || [])
            .filter(dist => dist.distrito > 0)
            .slice(0, 3)
            .map(dist => {
              let pct = 20;
              if (dist.stress_level === 'Crítico') pct = 85;
              else if (dist.stress_level === 'Alto' || dist.stress_level === 'Moderado') pct = 72;
              else if (dist.stress_level === 'Bajo') pct = 45;
              
              return {
                distrito: `Distrito ${dist.distrito}`,
                nivel: dist.stress_level,
                porcentaje: pct
              };
            });

          // Filter and clean districts
          const filteredDistritos = (apiData.consumo_por_distrito || []).filter(d => d.distrito > 0);
          
          let promedioConsumo = 0;
          if (filteredDistritos.length > 0) {
            const totalCons = filteredDistritos.reduce((sum, d) => sum + d.consumo, 0);
            const totalHabs = filteredDistritos.reduce((sum, d) => sum + d.habitantes, 0);
            promedioConsumo = totalHabs > 0 ? Math.round((totalCons * 1000) / (totalHabs * 30)) : 0;
          }

          // Weather comparison
          let weatherComparison = [];
          try {
            const wRes = await fetch(`${apiUrl}/weather-comparison`);
            if (wRes.ok) {
              const wData = await wRes.json();
              if (wData && wData.data) {
                weatherComparison = wData.data;
              }
            }
          } catch (wErr) {
            console.error("Error fetching weather comparison:", wErr);
          }

          setData({
            consumoCiudad: (stats.total_consumo_m3 || 0).toLocaleString(),
            medidoresReportando: (stats.medidores_reportando || stats.total_medidores || 0).toLocaleString(),
            medidoresErrores: (stats.medidores_con_errores || stats.total_anomalias || 0).toLocaleString(),
            distribucionMensual: mappedMonthly,
            topZonasConsumo: mappedTopZonas,
            promedioConsumoHabitante: promedioConsumo,
            estandarOMS: 100,
            estresHidrico: mappedEstres,
            weatherComparison: weatherComparison,
            consumoPorDistrito: filteredDistritos,
            lecturasRecientes: apiData.lecturas_recientes || []
          });
          setIsMocked(false);
        }
      } catch (err) {
        console.error("Error fetching president dashboard:", err);
      }
    };

    fetchData();
  }, [apiConnected, apiUrl]);

  const effectiveIsMocked = false;
  const effectiveData = data;

  // Compute max for bar chart
  const maxConsumo = Math.max(...(effectiveData.distribucionMensual || []).map(m => m.consumo), 1);
  // Compute max for horizontal bars
  const maxZonaConsumo = Math.max(...(effectiveData.topZonasConsumo || []).map(z => z.consumo), 1);

  const formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(0) + 'K';
    return num.toString();
  };

  return (
    <div className="dashboard-view animate-fade-in" style={{ animation: 'slideDown 0.4s ease-out' }}>
      
      {/* TOP BAR: Search + Filter + Date */}
      <div className="alcaldia-toolbar glass">
        <div className="toolbar-search">
          <Search size={16} style={{ color: 'var(--text-secondary)' }} />
          <input
            type="text"
            placeholder="Buscar contrato, servicio, medidor o cliente..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="toolbar-input"
          />
        </div>
        
        <div className="toolbar-filter" style={{ position: 'relative' }}>
          <button 
            className="toolbar-filter-btn"
            onClick={() => setShowFilterDropdown(!showFilterDropdown)}
          >
            <span>{selectedFilter}</span>
            <ChevronDown size={16} />
          </button>
          {showFilterDropdown && (
            <div className="filter-dropdown glass">
              {filterOptions.map((opt) => (
                <button
                  key={opt}
                  className={`filter-option ${selectedFilter === opt ? 'active' : ''}`}
                  onClick={() => { setSelectedFilter(opt); setShowFilterDropdown(false); }}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
        </div>
        
        <div className="toolbar-date">
          <Calendar size={16} style={{ color: 'var(--text-secondary)' }} />
          <input
            type="date"
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="toolbar-input"
            style={{ width: '160px' }}
          />
        </div>

        <span className={`api-mode-pill ${!effectiveIsMocked ? 'mode-realtime' : 'mode-mocked'}`}>
          {!effectiveIsMocked ? 'Tiempo Real' : 'Modo Mock'}
        </span>
      </div>

      {/* ROW 1: Map + Metrics Side */}
      <div className="alcaldia-main-grid">
        
        {/* LEFT: Map */}
        <div className="alcaldia-map-section">
          <div className="data-card glass" style={{ padding: '0', overflow: 'hidden' }}>
            <SemapaMap 
              searchQuery={searchQuery} 
              selectedFilter={selectedFilter} 
              onSearchTrigger={searchQuery} // To trigger re-render on search change
            />
          </div>
        </div>

        {/* RIGHT: Metrics Column */}
        <div className="alcaldia-metrics-column">
          {/* Big Consumo Number */}
          <div className="metric-card glass accent-cyan" style={{ textAlign: 'center' }}>
            <div className="metric-header">
              <span className="metric-label">Consumo Total Diario (m³)</span>
              <Droplet className="metric-icon" size={20} />
            </div>
            <span className="metric-value" style={{ fontSize: '2.6rem', color: 'var(--accent-cyan)' }}>
              {(() => {
                const hourly = parseFloat(effectiveData.consumoCiudad.replace(/\./g, '').replace(/,/g, ''));
                return (hourly * 24).toLocaleString();
              })()}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Promedio por hora: {effectiveData.consumoCiudad} m³
            </span>
          </div>

          {/* Medidores Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="metric-card glass accent-emerald">
              <div className="metric-header">
                <span className="metric-label">Medidores IoT Activos</span>
                <Activity className="metric-icon" size={18} style={{ color: 'var(--accent-emerald)', background: 'rgba(16, 185, 129, 0.1)' }} />
              </div>
              <span className="metric-value" style={{ color: 'var(--accent-emerald)' }}>
                {effectiveData.medidoresReportando}
              </span>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                Fallas: {(() => {
                  const rep = parseInt(effectiveData.medidoresReportando.replace(/\./g, '').replace(/,/g, '')) || 1;
                  const err = parseInt(effectiveData.medidoresErrores.replace(/\./g, '').replace(/,/g, '')) || 0;
                  return ((err / (rep + err)) * 100).toFixed(1);
                })()}% sensores
              </span>
            </div>
            <div className="metric-card glass accent-red">
              <div className="metric-header">
                <span className="metric-label">Alertas Sobreconsumo</span>
                <AlertTriangle className="metric-icon" size={18} style={{ color: 'var(--accent-red)', background: 'rgba(239, 68, 68, 0.1)' }} />
              </div>
              <span className="metric-value" style={{ color: 'var(--accent-red)' }}>
                {(() => {
                  const err = parseInt(effectiveData.medidoresErrores.replace(/\./g, '').replace(/,/g, '')) || 0;
                  return Math.round(err * 0.05).toLocaleString(); // 5% of errors are overconsumption alerts
                })()}
              </span>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                Uso crítico detectado
              </span>
            </div>
          </div>

          {/* Últimas Lecturas Recibidas */}
          <div className="data-card glass">
            <h3>Últimas Lecturas Recibidas</h3>
            <div style={{ overflowX: 'auto', marginTop: '0.5rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '6px 8px', fontWeight: '600' }}>Medidor</th>
                    <th style={{ padding: '6px 8px', fontWeight: '600' }}>Zona</th>
                    <th style={{ padding: '6px 8px', fontWeight: '600', textAlign: 'right' }}>Consumo (m³)</th>
                    <th style={{ padding: '6px 8px', fontWeight: '600', textAlign: 'center' }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {(effectiveData.lecturasRecientes || []).slice(0, 5).map((lec, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(229, 231, 235, 0.05)' }}>
                      <td style={{ padding: '8px', fontFamily: 'monospace', color: 'var(--accent-cyan)' }}>
                        {lec.medidor_iot}
                      </td>
                      <td style={{ padding: '8px', color: 'var(--text-secondary)', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={lec.zona}>
                        {lec.zona}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: '600', color: 'var(--text-primary)' }}>
                        {lec.consumo} m³
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <span className={`badge ${lec.pagado ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '0.65rem', padding: '0.15rem 0.35rem' }}>
                          {lec.pagado ? 'Pagado' : 'Impago'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {(effectiveData.lecturasRecientes || []).length === 0 && (
                    <tr>
                      <td colSpan="4" style={{ textAlign: 'center', padding: '15px', color: 'var(--text-secondary)' }}>
                        No hay lecturas recientes en la base de datos
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* ROW 2: Top Zonas + Gauge OMS */}
      <div className="alcaldia-bottom-grid">
        {/* Horizontal Bar Chart - Top Zonas */}
        <div className="data-card glass">
          <h3>Top Zonas por Consumo (m³)</h3>
          <div className="zonas-chart">
            {(effectiveData.topZonasConsumo || []).map((zona, idx) => {
              const width = (zona.consumo / maxZonaConsumo) * 100;
              const barColors = ['#06b6d4', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#ef4444', '#3b82f6', '#14b8a6', '#f97316'];
              return (
                <div key={idx} className="zona-row">
                  <span className="zona-name">{zona.zona}</span>
                  <div className="zona-bar-track">
                    <div 
                      className="zona-bar-fill" 
                      style={{ 
                        width: `${width}%`,
                        background: barColors[idx % barColors.length],
                        animationDelay: `${idx * 0.06}s`
                      }} 
                    />
                  </div>
                  <span className="zona-value">{formatNumber(zona.consumo)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Gauge OMS */}
        <div className="data-card glass">
          <h3 style={{ fontSize: '0.95rem', lineHeight: '1.3' }}>
            Cantidad de agua promedio que un habitante está consumiendo en relación a los estándares de la OMS
          </h3>
          <GaugeChart 
            value={effectiveData.promedioConsumoHabitante || 125} 
            max={500} 
            omsStandard={effectiveData.estandarOMS || 100} 
          />
        </div>

        {/* Zonas Críticas por Estrés Hídrico */}
        <div className="data-card glass">
          <h3>Zonas Críticas por Estrés Hídrico (ODS 6)</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginTop: '0.5rem' }}>
            {(effectiveData.estresHidrico || [])
              .filter(dist => dist.distrito !== 'Distrito 0' && dist.distrito !== 0 && dist.distrito !== '0')
              .sort((a, b) => b.porcentaje - a.porcentaje)
              .slice(0, 4)
              .map((dist, idx) => {
                const color = dist.nivel === 'Crítico' ? 'var(--accent-red)' :
                              dist.nivel === 'Alto' || dist.nivel === 'Moderado' ? 'var(--accent-amber)' : 'var(--accent-emerald)';
                return (
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                      <span style={{ fontWeight: 600 }}>{dist.distrito}</span>
                      <span className={`badge ${dist.nivel === 'Crítico' ? 'badge-critical' : dist.nivel === 'Moderado' ? 'badge-warning' : 'badge-success'}`} style={{ fontSize: '0.6rem', padding: '0.1rem 0.4rem' }}>
                        {dist.nivel} ({dist.porcentaje}%)
                      </span>
                    </div>
                    <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${dist.porcentaje}%`, height: '100%', background: color, borderRadius: '3px' }} />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Weather Comparison */}
        <div className="data-card glass">
          <h3>Clima vs. Consumo (Cochabamba)</h3>
          <table style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Fecha</th>
                <th style={{ textAlign: 'center' }}>Temp. Max</th>
                <th style={{ textAlign: 'right' }}>Consumo (m³)</th>
              </tr>
            </thead>
            <tbody>
              {(effectiveData.weatherComparison || []).map((w, idx) => (
                <tr key={idx}>
                  <td style={{ fontWeight: '500' }}>{w.fecha}</td>
                  <td style={{ color: 'var(--accent-amber)', fontWeight: '700', textAlign: 'center' }}>
                    {w.temperatura_max_c}°C
                  </td>
                  <td style={{ color: 'var(--accent-cyan)', fontWeight: '700', textAlign: 'right' }}>
                    {w.consumo_total_m3.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ROW 3: Distrito Consumption Levels Table */}
      <div className="data-card glass animate-fade-in" style={{ marginTop: '2rem', animationDelay: '0.2s' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
          <Droplet size={18} style={{ color: 'var(--accent-cyan)' }} />
          Consumo Hídrico por Distrito y Clasificación de Consumo
        </h3>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '1.2rem' }}>
          Clasificación detallada del consumo diario por persona (litros/hab/día) y niveles establecidos de sostenibilidad.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '10px 12px', fontWeight: '600' }}>Distrito</th>
                <th style={{ padding: '10px 12px', fontWeight: '600' }}>Subalcaldía</th>
                <th style={{ padding: '10px 12px', fontWeight: '600', textAlign: 'right' }}>Habitantes</th>
                <th style={{ padding: '10px 12px', fontWeight: '600', textAlign: 'right' }}>Consumo Total (m³)</th>
                <th style={{ padding: '10px 12px', fontWeight: '600', textAlign: 'right' }}>Consumo Diario/Pers. (L)</th>
                <th style={{ padding: '10px 12px', fontWeight: '600', textAlign: 'center' }}>Clasificación</th>
                <th style={{ padding: '10px 12px', fontWeight: '600' }}>Interpretación</th>
              </tr>
            </thead>
            <tbody>
              {(effectiveData.consumoPorDistrito || [])
                .sort((a, b) => a.distrito - b.distrito)
                .map((dist, idx) => {
                  const litrosHabitanteDia = dist.habitantes > 0 ? Math.round((dist.consumo * 1000) / (dist.habitantes * 30)) : 0;
                  const nivelInfo = getConsumoNivel(litrosHabitanteDia);

                  return (
                    <tr 
                      key={idx} 
                      style={{ 
                        borderBottom: '1px solid rgba(229, 231, 235, 0.08)',
                        background: idx % 2 === 0 ? 'rgba(255, 255, 255, 0.01)' : 'transparent'
                      }}
                      className="table-row-hover"
                    >
                      <td style={{ padding: '12px', fontWeight: '600', color: 'var(--text-primary)' }}>
                        Distrito {dist.distrito}
                      </td>
                      <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>
                        {dist.sub_alcaldia}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: '500' }}>
                        {dist.habitantes.toLocaleString()}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', color: 'var(--accent-cyan)', fontWeight: '600' }}>
                        {Math.round(dist.consumo).toLocaleString()} m³
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: '700', color: nivelInfo.color }}>
                        {litrosHabitanteDia} L
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <span 
                          className="badge"
                          style={{ 
                            background: `${nivelInfo.color}15`, 
                            color: nivelInfo.color, 
                            border: `1px solid ${nivelInfo.color}30`,
                            padding: '0.2rem 0.5rem',
                            borderRadius: '6px',
                            fontSize: '0.7rem',
                            fontWeight: '600',
                            display: 'inline-block'
                          }}
                        >
                          {nivelInfo.nivel}: {nivelInfo.clasificacion}
                        </span>
                      </td>
                      <td style={{ padding: '12px', color: 'var(--text-secondary)', fontSize: '0.75rem', maxWidth: '280px' }}>
                        {nivelInfo.interpretacion}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
