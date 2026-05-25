import { useEffect, useState, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Droplet, Activity, AlertTriangle, Search, ChevronDown, Calendar } from 'lucide-react';
import SemapaMap from '../components/SemapaMap';
import { dashboardMockData } from '../mockData';

// SVG Gauge Component - Consumo promedio vs OMS
function GaugeChart({ value, max, omsStandard }) {
  const percentage = Math.min(value / max, 1);
  const angle = percentage * 180; // 0-180 degrees
  const omsAngle = (omsStandard / max) * 180;
  
  // Color based on how close to OMS standard
  const getColor = () => {
    if (value <= omsStandard * 0.8) return '#22c55e';
    if (value <= omsStandard) return '#f59e0b';
    if (value <= omsStandard * 1.3) return '#f97316';
    return '#ef4444';
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
        <text x="55" y="40" fontSize="11" fill="var(--text-secondary)" textAnchor="middle">50</text>
        <text x="100" y="18" fontSize="11" fill="var(--text-secondary)" textAnchor="middle">100</text>
        <text x="155" y="40" fontSize="11" fill="var(--text-secondary)" textAnchor="middle">150</text>
        <text x="188" y="115" fontSize="11" fill="var(--text-secondary)" textAnchor="middle">180</text>
        
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

export default function AlcaldiaDashboard() {
  const { apiUrl, apiConnected } = useOutletContext();
  const [data, setData] = useState(dashboardMockData.alcaldia);
  const [isMocked, setIsMocked] = useState(true);
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
          const mappedEstres = (apiData.estres_hidrico || []).slice(0, 3).map(dist => {
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

          // Weather comparison
          let weatherComparison = dashboardMockData.alcaldia.weatherComparison;
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
            medidoresReportando: (stats.medidores_reportando || stats.total_medidores || 109309).toLocaleString(),
            medidoresErrores: (stats.medidores_con_errores || stats.total_anomalias || 9122).toLocaleString(),
            distribucionMensual: mappedMonthly.length > 0 ? mappedMonthly : dashboardMockData.alcaldia.distribucionMensual,
            topZonasConsumo: mappedTopZonas.length > 0 ? mappedTopZonas : dashboardMockData.alcaldia.topZonasConsumo,
            promedioConsumoHabitante: stats.promedio_consumo_habitante || dashboardMockData.alcaldia.promedioConsumoHabitante,
            estandarOMS: 100,
            estresHidrico: mappedEstres.length > 0 ? mappedEstres : dashboardMockData.alcaldia.estresHidrico,
            weatherComparison: weatherComparison
          });
          setIsMocked(false);
        } else {
          setData(dashboardMockData.alcaldia);
          setIsMocked(true);
        }
      } catch (err) {
        console.error("Error fetching president dashboard:", err);
        setData(dashboardMockData.alcaldia);
        setIsMocked(true);
      }
    };

    fetchData();
  }, [apiConnected, apiUrl]);

  const effectiveIsMocked = !apiConnected || isMocked;
  const effectiveData = !apiConnected ? dashboardMockData.alcaldia : data;

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
              <span className="metric-label">Consumo de la Ciudad m3/hora</span>
              <Droplet className="metric-icon" size={20} />
            </div>
            <span className="metric-value" style={{ fontSize: '2.6rem', color: 'var(--accent-cyan)' }}>
              {effectiveData.consumoCiudad}
            </span>
          </div>

          {/* Medidores Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="metric-card glass accent-emerald">
              <div className="metric-header">
                <span className="metric-label">Medidores Reportando</span>
                <Activity className="metric-icon" size={18} style={{ color: 'var(--accent-emerald)', background: 'rgba(16, 185, 129, 0.1)' }} />
              </div>
              <span className="metric-value" style={{ color: 'var(--accent-emerald)' }}>
                {effectiveData.medidoresReportando}
              </span>
            </div>
            <div className="metric-card glass accent-red">
              <div className="metric-header">
                <span className="metric-label">Medidores con errores</span>
                <AlertTriangle className="metric-icon" size={18} style={{ color: 'var(--accent-red)', background: 'rgba(239, 68, 68, 0.1)' }} />
              </div>
              <span className="metric-value" style={{ color: 'var(--accent-red)' }}>
                {effectiveData.medidoresErrores}
              </span>
            </div>
          </div>

          {/* Monthly Distribution Chart */}
          <div className="data-card glass">
            <h3>Distribución mensual de consumo</h3>
            <div className="monthly-chart">
              {(effectiveData.distribucionMensual || []).map((item, idx) => {
                const height = (item.consumo / maxConsumo) * 100;
                return (
                  <div key={idx} className="monthly-bar-col">
                    <div className="monthly-bar-wrapper">
                      <div 
                        className="monthly-bar"
                        style={{ 
                          height: `${height}%`,
                          background: item.color || '#f59e0b',
                          animationDelay: `${idx * 0.08}s`
                        }} 
                        title={`${item.mes}: ${formatNumber(item.consumo)} m³`}
                      />
                    </div>
                    <span className="monthly-label">{item.mes}</span>
                  </div>
                );
              })}
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
            max={180} 
            omsStandard={effectiveData.estandarOMS || 100} 
          />
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
    </div>
  );
}
