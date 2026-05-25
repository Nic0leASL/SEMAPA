import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Droplet, DollarSign, Wallet, Users } from 'lucide-react';
import SemapaMap from '../components/SemapaMap';
import { dashboardMockData } from '../mockData';

export default function AlcaldiaDashboard() {
  const { apiUrl, apiConnected } = useOutletContext();
  const [data, setData] = useState(dashboardMockData.alcaldia);
  const [isMocked, setIsMocked] = useState(true);

  useEffect(() => {
    if (!apiConnected) {
      setData(dashboardMockData.alcaldia);
      setIsMocked(true);
      return;
    }

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

          setData({
            consumoTotal: stats.total_consumo_m3.toLocaleString(),
            facturacionTotal: stats.total_facturacion_bs.toLocaleString(),
            recaudado: stats.total_recaudado_bs.toLocaleString(),
            deudaMora: stats.total_deuda_bs.toLocaleString(),
            efectividadCobro: effectiveness,
            clientesMora: stats.clientes_morosos_count,
            topZonas: mappedTopZonas.length > 0 ? mappedTopZonas : dashboardMockData.alcaldia.topZonas,
            estresHidrico: mappedEstres.length > 0 ? mappedEstres : dashboardMockData.alcaldia.estresHidrico
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

  return (
    <div className="dashboard-view animate-fade-in" style={{ animation: 'slideDown 0.4s ease-out' }}>
      <div className="top-header">
        <h2 className="page-title">Dashboard Alcaldía (Smart City)</h2>
        <span className={`api-mode-pill ${!isMocked ? 'mode-realtime' : 'mode-mocked'}`}>
          {!isMocked ? 'Tiempo Real' : 'Modo Mock'}
        </span>
      </div>

      <div className="metrics-grid">
        <div className="metric-card glass accent-cyan">
          <div className="metric-header">
            <span className="metric-label">Consumo Total Hídrico</span>
            <Droplet className="metric-icon" size={20} />
          </div>
          <span className="metric-value">{data.consumoTotal} m³</span>
          <span className="metric-trend trend-down">Metropolitana Cochabamba</span>
        </div>
        
        <div className="metric-card glass accent-purple">
          <div className="metric-header">
            <span className="metric-label">Monto Facturado</span>
            <DollarSign className="metric-icon" size={20} />
          </div>
          <span className="metric-value">{data.facturacionTotal} Bs</span>
          <span className="metric-trend trend-up">Facturación General</span>
        </div>
        
        <div className="metric-card glass accent-emerald">
          <div className="metric-header">
            <span className="metric-label">Ingresos Recaudados</span>
            <Wallet className="metric-icon" size={20} />
          </div>
          <span className="metric-value">{data.recaudado} Bs</span>
          <span className="metric-trend trend-up">Efectividad: {data.efectividadCobro}%</span>
        </div>
        
        <div className="metric-card glass accent-red">
          <div className="metric-header">
            <span className="metric-label">Deuda Pendiente (Mora)</span>
            <Users className="metric-icon" size={20} style={{ color: 'var(--accent-red)', background: 'rgba(239, 68, 68, 0.1)' }} />
          </div>
          <span className="metric-value">{data.deudaMora} Bs</span>
          <span className="metric-trend trend-down">{data.clientesMora} Clientes en mora</span>
        </div>
      </div>

      <div className="section-grid" style={{ marginTop: '2rem' }}>
        <div className="data-card glass">
          <h3>Mapa de Consumo</h3>
          <SemapaMap apiUrl={apiUrl} apiConnected={apiConnected} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <div className="data-card glass">
            <h3>Estrés Hídrico por Distrito</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
              {data.estresHidrico.map((dist, idx) => (
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
                {data.topZonas.slice(0, 3).map((z) => (
                  <tr key={z.id}>
                    <td style={{ fontWeight: '500' }}>{z.zona}</td>
                    <td style={{ color: 'var(--accent-cyan)', fontWeight: '600' }}>{z.consumo}</td>
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

