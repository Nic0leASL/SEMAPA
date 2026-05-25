import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Droplet, DollarSign, Wallet, Users } from 'lucide-react';
import SemapaMap from '../components/SemapaMap';
import { dashboardMockData } from '../mockData';

export default function AlcaldiaDashboard() {
  const { apiUrl, apiConnected } = useOutletContext();
  const [data, setData] = useState(dashboardMockData.alcaldia);
  const [isMocked, setIsMocked] = useState(true);

  useEffect(() => {
    if (!apiConnected) return;

    const fetchData = async () => {
      try {
        const res = await fetch(`${apiUrl}/dashboard/presidente`);
        if (res.ok) {
          const apiData = await res.json();
          const stats = apiData.statistics;
          
          // Calculate effectiveness
          const totalRecaudado = stats.total_recaudado_bs || 0;
          const totalDeuda = stats.total_deuda_bs || 0;
          const totalFacturado = totalRecaudado + totalDeuda;
          const effectiveness = totalFacturado > 0 ? ((totalRecaudado / totalFacturado) * 100).toFixed(1) : 0.0;

          // Map top zones
          const mappedTopZonas = (apiData.top_zonas_consumo || []).map((z, idx) => ({
            id: idx + 1,
            zona: z.zona,
            consumo: z.consumo.toLocaleString(),
            facturado: z.facturacion.toLocaleString()
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

          // Fetch weather comparison data
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
            consumoTotal: stats.total_consumo_m3.toLocaleString(),
            facturacionTotal: stats.total_facturacion_bs.toLocaleString(),
            recaudado: stats.total_recaudado_bs.toLocaleString(),
            deudaMora: stats.total_deuda_bs.toLocaleString(),
            efectividadCobro: effectiveness,
            clientesMora: stats.clientes_morosos_count,
            topZonas: mappedTopZonas.length > 0 ? mappedTopZonas : dashboardMockData.alcaldia.topZonas,
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

  return (
    <div className="dashboard-view animate-fade-in" style={{ animation: 'slideDown 0.4s ease-out' }}>
      <div className="top-header">
        <h2 className="page-title">Dashboard Alcaldía (Smart City)</h2>
        <span className={`api-mode-pill ${!effectiveIsMocked ? 'mode-realtime' : 'mode-mocked'}`}>
          {!effectiveIsMocked ? 'Tiempo Real' : 'Modo Mock'}
        </span>
      </div>

      <div className="metrics-grid">
        <div className="metric-card glass accent-cyan">
          <div className="metric-header">
            <span className="metric-label">Consumo Total Hídrico</span>
            <Droplet className="metric-icon" size={20} />
          </div>
          <span className="metric-value">{effectiveData.consumoTotal} m³</span>
          <span className="metric-trend trend-down">Metropolitana Cochabamba</span>
        </div>
        
        <div className="metric-card glass accent-purple">
          <div className="metric-header">
            <span className="metric-label">Monto Facturado</span>
            <DollarSign className="metric-icon" size={20} />
          </div>
          <span className="metric-value">{effectiveData.facturacionTotal} Bs</span>
          <span className="metric-trend trend-up">Facturación General</span>
        </div>
        
        <div className="metric-card glass accent-emerald">
          <div className="metric-header">
            <span className="metric-label">Ingresos Recaudados</span>
            <Wallet className="metric-icon" size={20} />
          </div>
          <span className="metric-value">{effectiveData.recaudado} Bs</span>
          <span className="metric-trend trend-up">Efectividad: {effectiveData.efectividadCobro}%</span>
        </div>
        
        <div className="metric-card glass accent-red">
          <div className="metric-header">
            <span className="metric-label">Deuda Pendiente (Mora)</span>
            <Users className="metric-icon" size={20} style={{ color: 'var(--accent-red)', background: 'rgba(239, 68, 68, 0.1)' }} />
          </div>
          <span className="metric-value">{effectiveData.deudaMora} Bs</span>
          <span className="metric-trend trend-down">{effectiveData.clientesMora} Clientes en mora</span>
        </div>
      </div>

      <div className="section-grid" style={{ marginTop: '2rem' }}>
        <div className="data-card glass">
          <h3>Mapa de Consumo</h3>
          <SemapaMap />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <div className="data-card glass">
            <h3>Estrés Hídrico por Distrito</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
              {effectiveData.estresHidrico.map((dist, idx) => (
                <div key={idx}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.3rem' }}>
                    <span>{dist.distrito}</span>
                    <span style={{ fontWeight: '600', color: dist.nivel === 'Crítico' ? 'var(--accent-red)' : dist.nivel === 'Alto' ? 'var(--accent-amber)' : 'var(--accent-emerald)' }}>
                      {dist.nivel} ({dist.porcentaje}%)
                    </span>
                  </div>
                  <div className="progress-bg">
                    <div 
                      className="progress-fill" 
                      style={{ 
                        width: `${dist.porcentaje}%`,
                        background: dist.nivel === 'Crítico' ? 'var(--accent-red)' : dist.nivel === 'Alto' ? 'var(--accent-amber)' : 'var(--accent-emerald)'
                      }} 
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="data-card glass">
            <h3>Top Zonas Consumo</h3>
            <table>
              <thead>
                <tr>
                  <th>Zona</th>
                  <th>Consumo (m³)</th>
                </tr>
              </thead>
              <tbody>
                {effectiveData.topZonas.slice(0, 3).map((z) => (
                  <tr key={z.id}>
                    <td style={{ fontWeight: '500' }}>{z.zona}</td>
                    <td style={{ color: 'var(--accent-cyan)', fontWeight: '600' }}>{z.consumo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="data-card glass">
            <h3>Clima vs. Consumo (Cochabamba)</h3>
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Fecha de Lectura</th>
                  <th style={{ textAlign: 'center' }}>Max. Calor (Temp)</th>
                  <th style={{ textAlign: 'right' }}>Consumo Hídrico (m³)</th>
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
    </div>
  );
}
