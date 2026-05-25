import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Activity, AlertTriangle, Search, Zap, Cpu } from 'lucide-react';
import SemapaMap from '../components/SemapaMap';
import { dashboardMockData } from '../mockData';

export default function GerenciaDashboard() {
  const { apiUrl, apiConnected } = useOutletContext();
  const [data, setData] = useState(dashboardMockData.gerencia);
  const [recentErrors, setRecentErrors] = useState([]);
  const [isMocked, setIsMocked] = useState(true);

  useEffect(() => {
    if (!apiConnected) {
      setData(dashboardMockData.gerencia);
      setRecentErrors([]);
      setIsMocked(true);
      return;
    }

    const fetchData = async () => {
      try {
        const res = await fetch(`${apiUrl}/dashboard/administrador`);
        if (res.ok) {
          const apiData = await res.json();
          const stats = apiData.meters_status || {};
          
          setData({
            medidoresActivos: (stats.activos || 0).toLocaleString(),
            medidoresDanados: (stats.danados || 0).toLocaleString(),
            lecturasHoy: ((stats.activos || 0) * 4).toLocaleString(), // 4 readings per day average
            alertasAnomalias: stats.total_anomalias_lectura || 0,
            erroresTop: dashboardMockData.gerencia.erroresTop,
            zonasConFallas: apiData.zonas_con_fallas || []
          });
          setRecentErrors(apiData.errores_iot_recientes || []);
          setIsMocked(false);
        } else {
          setData(dashboardMockData.gerencia);
          setRecentErrors([]);
          setIsMocked(true);
        }
      } catch (err) {
        console.error("Error fetching admin dashboard:", err);
        setData(dashboardMockData.gerencia);
        setRecentErrors([]);
        setIsMocked(true);
      }
    };

    fetchData();
  }, [apiConnected, apiUrl]);

  return (
    <div className="dashboard-view animate-fade-in" style={{ animation: 'slideDown 0.4s ease-out' }}>
      <div className="top-header">
        <h2 className="page-title">Dashboard Gerencia Operativa</h2>
        <span className={`api-mode-pill ${!isMocked ? 'mode-realtime' : 'mode-mocked'}`}>
          {!isMocked ? 'Tiempo Real' : 'Modo Mock'}
        </span>
      </div>

      <div className="metrics-grid">
        <div className="metric-card glass accent-cyan">
          <div className="metric-header">
            <span className="metric-label">Medidores IoT Operativos</span>
            <Activity className="metric-icon" size={20} />
          </div>
          <span className="metric-value">{data.medidoresActivos}</span>
          <span className="metric-trend trend-up">Transmitiendo Señal</span>
        </div>
        
        <div className="metric-card glass accent-red">
          <div className="metric-header">
            <span className="metric-label">Medidores Dañados / Críticos</span>
            <AlertTriangle className="metric-icon" size={20} style={{ color: 'var(--accent-red)', background: 'rgba(239, 68, 68, 0.1)' }} />
          </div>
          <span className="metric-value">{data.medidoresDanados}</span>
          <span className="metric-trend trend-down">Requieren Mantenimiento</span>
        </div>
        
        <div className="metric-card glass accent-purple">
          <div className="metric-header">
            <span className="metric-label">Lecturas Recibidas Hoy</span>
            <Zap className="metric-icon" size={20} style={{ color: 'var(--accent-purple)', background: 'rgba(139, 92, 246, 0.1)' }} />
          </div>
          <span className="metric-value">{data.lecturasHoy}</span>
          <span className="metric-trend trend-up">Volumen Diario ETL</span>
        </div>

        <div className="metric-card glass accent-amber">
          <div className="metric-header">
            <span className="metric-label">Anomalías Detectadas</span>
            <Search className="metric-icon" size={20} style={{ color: 'var(--accent-amber)', background: 'rgba(245, 158, 11, 0.1)' }} />
          </div>
          <span className="metric-value">{data.alertasAnomalias}</span>
          <span className="metric-trend trend-down">Fugas o fraudes posibles</span>
        </div>
      </div>

      <div className="section-grid" style={{ marginTop: '2rem' }}>
        <div className="data-card glass">
          <h3>Mapa Operativo (Alertas & Fallas)</h3>
          <SemapaMap apiUrl={apiUrl} apiConnected={apiConnected} />
        </div>

        <div className="data-card glass">
          {isMocked ? (
            <>
              <h3>Top Errores de Infraestructura IoT</h3>
              <table style={{ marginTop: '0.5rem' }}>
                <thead>
                  <tr>
                    <th>Tipo de Error</th>
                    <th>Eventos</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.erroresTop.map((err) => (
                    <tr key={err.id}>
                      <td style={{ fontWeight: '500' }}>{err.tipo}</td>
                      <td>{err.cantidad}</td>
                      <td>
                        <span className={`badge ${err.estado === 'Crítico' ? 'badge-critical' : err.estado === 'Pendiente' ? 'badge-warning' : 'badge-success'}`}>
                          {err.estado}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div>
                <h3 style={{ fontSize: '1.05rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Zonas con Más Fallas</h3>
                <table style={{ marginTop: '0.5rem' }}>
                  <thead>
                    <tr>
                      <th>Zona</th>
                      <th>Errores</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.zonasConFallas.slice(0, 3).map((z, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: '500' }}>{z.zona}</td>
                        <td style={{ color: 'var(--accent-red)', fontWeight: '600' }}>{z.cantidad_errores}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <h3 style={{ fontSize: '1.05rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Últimas Alertas IoT</h3>
                <table style={{ marginTop: '0.5rem' }}>
                  <thead>
                    <tr>
                      <th>Medidor</th>
                      <th>Código</th>
                      <th>Descripción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentErrors.slice(0, 3).map((err, idx) => (
                      <tr key={idx}>
                        <td style={{ fontFamily: 'monospace', color: 'var(--accent-cyan)' }}>{err.medidor_iot}</td>
                        <td>
                          <span className="badge badge-critical" style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem' }}>
                            {err.codigo_error}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.75rem', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={err.descripcion}>
                          {err.descripcion}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

