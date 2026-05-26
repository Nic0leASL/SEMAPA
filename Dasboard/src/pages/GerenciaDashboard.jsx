import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Activity, AlertTriangle, Search, Zap, Gauge, Droplet, Smartphone } from 'lucide-react';
import SemapaMap from '../components/SemapaMap';

export default function GerenciaDashboard() {
  const { apiUrl, apiConnected } = useOutletContext();
  const [data, setData] = useState({
    medidoresActivos: '0',
    medidoresDanados: '0',
    lecturasHoy: '0',
    alertasAnomalias: 0,
    erroresTop: [],
    zonasConFallas: [],
    topMedidoresFallas: [],
    distribucionAgua: [],
    lecturasRecientes: []
  });
  const [recentErrors, setRecentErrors] = useState([]);
  const [isMocked, setIsMocked] = useState(false);

  useEffect(() => {
    if (!apiConnected) return;

    const fetchData = async () => {
      try {
        const res = await fetch(`${apiUrl}/dashboard/administrador`);
        if (res.ok) {
          const apiData = await res.json();
          const stats = apiData.meters_status || {};
          
          setData({
            medidoresActivos: (stats.activos || 0).toLocaleString(),
            medidoresDanados: (stats.danados || 0).toLocaleString(),
            lecturasHoy: (apiData.total_lecturas || 0).toLocaleString(),
            alertasAnomalias: stats.total_anomalias_lectura || 0,
            erroresTop: [
              { id: 1, tipo: 'Medidores Dañados', cantidad: stats.danados || 0, estado: 'Crítico' },
              { id: 2, tipo: 'En Mantenimiento', cantidad: stats.mantenimiento || 0, estado: 'Pendiente' },
              { id: 3, tipo: 'Anomalías de Lectura', cantidad: stats.total_anomalias_lectura || 0, estado: 'Crítico' }
            ],
            zonasConFallas: apiData.zonas_con_fallas || [],
            topMedidoresFallas: apiData.top_medidores_fallas || [],
            distribucionAgua: apiData.distribucion_agua || [],
            lecturasRecientes: apiData.lecturas_recientes || []
          });
          setRecentErrors(apiData.errores_iot_recientes || []);
          setIsMocked(false);
        }
      } catch (err) {
        console.error("Error fetching admin dashboard:", err);
      }
    };

    fetchData();
  }, [apiConnected, apiUrl]);

  const effectiveIsMocked = false;
  const effectiveData = data;
  const effectiveRecentErrors = recentErrors;

  // For the medidores fallas bar chart
  const topMedidores = effectiveData.topMedidoresFallas || [];
  const maxErrores = Math.max(...topMedidores.map(m => m.errores), 1);

  return (
    <div className="dashboard-view animate-fade-in" style={{ animation: 'slideDown 0.4s ease-out' }}>
      <div className="top-header">
        <h2 className="page-title">Dashboard Gerencia Operativa</h2>
        <span className={`api-mode-pill ${!effectiveIsMocked ? 'mode-realtime' : 'mode-mocked'}`}>
          {!effectiveIsMocked ? 'Tiempo Real' : 'Modo Mock'}
        </span>
      </div>

      <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <div className="metric-card glass accent-cyan">
          <div className="metric-header">
            <span className="metric-label">Medidores IoT Activos</span>
            <Activity className="metric-icon" size={20} />
          </div>
          <span className="metric-value">{effectiveData.medidoresActivos}</span>
          <span className="metric-trend trend-up">Transmitiendo Señal</span>
        </div>
        
        <div className="metric-card glass accent-red">
          <div className="metric-header">
            <span className="metric-label">Sensores con Errores</span>
            <AlertTriangle className="metric-icon" size={20} style={{ color: 'var(--accent-red)', background: 'rgba(239, 68, 68, 0.1)' }} />
          </div>
          <span className="metric-value">{effectiveData.medidoresDanados}</span>
          <span className="metric-trend trend-down">Requieren inspección</span>
        </div>
        
        <div className="metric-card glass accent-purple">
          <div className="metric-header">
            <span className="metric-label">Lecturas Recibidas Hoy</span>
            <Zap className="metric-icon" size={20} style={{ color: 'var(--accent-purple)', background: 'rgba(139, 92, 246, 0.1)' }} />
          </div>
          <span className="metric-value">{effectiveData.lecturasHoy}</span>
          <span className="metric-trend trend-up">Volumen Diario ETL</span>
        </div>

        <div className="metric-card glass accent-amber">
          <div className="metric-header">
            <span className="metric-label">Anomalías Detectadas</span>
            <Search className="metric-icon" size={20} style={{ color: 'var(--accent-amber)', background: 'rgba(245, 158, 11, 0.1)' }} />
          </div>
          <span className="metric-value">{effectiveData.alertasAnomalias}</span>
          <span className="metric-trend trend-down">Posibles fugas/fraudes</span>
        </div>

        <div className="metric-card glass accent-blue">
          <div className="metric-header">
            <span className="metric-label">Total Consumo Acumulado</span>
            <Droplet className="metric-icon" size={20} style={{ color: '#3b82f6', background: 'rgba(59, 130, 246, 0.1)' }} />
          </div>
          <span className="metric-value" style={{ color: '#3b82f6' }}>
            {(() => {
              if (effectiveData.distribucionAgua) {
                const total = effectiveData.distribucionAgua.reduce((sum, z) => sum + z.consumo_m3, 0);
                return Math.round(total).toLocaleString();
              }
              return "0";
            })()} m³
          </span>
          <span className="metric-trend trend-up">Acumulado del periodo</span>
        </div>

        <div className="metric-card glass accent-orange">
          <div className="metric-header">
            <span className="metric-label">Lecturas App Móvil</span>
            <Smartphone className="metric-icon" size={20} style={{ color: '#f97316', background: 'rgba(249, 115, 22, 0.1)' }} />
          </div>
          <span className="metric-value" style={{ color: '#f97316' }}>
            {(() => {
              return "0";
            })()}
          </span>
          <span className="metric-trend trend-up">Sincronización manual</span>
        </div>
      </div>

      <div className="section-grid" style={{ marginTop: '2rem' }}>
        <div className="data-card glass">
          <h3>Mapa Operativo (Alertas & Fallas)</h3>
          <SemapaMap />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Top Medidores que más fallan */}
          <div className="data-card glass">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Gauge size={18} style={{ color: 'var(--accent-red)' }} />
              Medidores que Más Fallan
            </h3>
            <div className="medidores-fallas-list">
              {topMedidores.slice(0, 6).map((med, idx) => (
                <div key={idx} className="medidor-falla-row">
                  <div className="medidor-falla-info">
                    <span className="medidor-falla-id">{med.medidor}</span>
                    <span className="medidor-falla-zona">{med.zona}</span>
                  </div>
                  <div className="medidor-falla-bar-track">
                    <div 
                      className="medidor-falla-bar" 
                      style={{ 
                        width: `${(med.errores / maxErrores) * 100}%`,
                        background: med.estado === 'Crítico' ? 'var(--accent-red)' : 
                                   med.estado === 'Investigación' ? 'var(--accent-amber)' : 'var(--accent-purple)',
                        animationDelay: `${idx * 0.1}s`
                      }} 
                    />
                  </div>
                  <div className="medidor-falla-meta">
                    <span className="medidor-falla-count">{med.errores}</span>
                    <span className={`badge ${med.estado === 'Crítico' ? 'badge-critical' : med.estado === 'Pendiente' ? 'badge-warning' : 'badge-success'}`}
                      style={{ fontSize: '0.6rem', padding: '0.1rem 0.4rem' }}
                    >
                      {med.estado}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Existing: Errors Table or Zonas */}
          <div className="data-card glass">
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
                      {(effectiveData.zonasConFallas || []).slice(0, 3).map((z, idx) => (
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
                      {effectiveRecentErrors.slice(0, 3).map((err, idx) => (
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

                <div>
                  <h3 style={{ fontSize: '1.05rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Últimas Lecturas Recibidas</h3>
                  <table style={{ marginTop: '0.5rem' }}>
                    <thead>
                      <tr>
                        <th>Medidor</th>
                        <th>Zona</th>
                        <th style={{ textAlign: 'right' }}>Consumo</th>
                        <th style={{ textAlign: 'center' }}>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(effectiveData.lecturasRecientes || []).slice(0, 3).map((lec, idx) => (
                        <tr key={idx}>
                          <td style={{ fontFamily: 'monospace', color: 'var(--accent-cyan)' }}>{lec.medidor_iot}</td>
                          <td style={{ fontSize: '0.75rem', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={lec.zona}>
                            {lec.zona}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: '600' }}>{lec.consumo} m³</td>
                          <td style={{ textAlign: 'center' }}>
                            <span className={`badge ${lec.pagado ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '0.6rem', padding: '0.1rem 0.3rem' }}>
                              {lec.pagado ? 'Pagado' : 'Impago'}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {(effectiveData.lecturasRecientes || []).length === 0 && (
                        <tr>
                          <td colSpan="4" style={{ textAlign: 'center', padding: '10px', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                            Sin lecturas recientes
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
          </div>
        </div>
      </div>

      {/* ROW 3: Top Zonas y Distribución Tarifaria */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem', marginTop: '2rem' }}>
        {/* Top 10 Zonas de Mayor Demanda */}
        <div className="data-card glass">
          <h3>Top 10 Zonas de Mayor Demanda (m³)</h3>
          <div className="zonas-chart" style={{ marginTop: '1rem' }}>
            {(effectiveData.distribucionAgua || []).slice(0, 10).map((z, idx) => {
              const maxVal = Math.max(...(effectiveData.distribucionAgua || []).map(item => item.consumo_m3), 1);
              const width = (z.consumo_m3 / maxVal) * 100;
              const color = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#ef4444', '#06b6d4', '#14b8a6', '#f97316', '#a855f7'][idx % 10];
              return (
                <div key={idx} className="zona-row" style={{ display: 'flex', alignItems: 'center', marginBottom: '0.8rem' }}>
                  <span className="zona-name" style={{ fontSize: '0.75rem', fontWeight: '500', width: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{z.zona}</span>
                  <div className="zona-bar-track" style={{ flex: 1, height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', margin: '0 0.8rem', overflow: 'hidden' }}>
                    <div className="zona-bar-fill" style={{ width: `${width}%`, height: '100%', background: color, borderRadius: '4px' }} />
                  </div>
                  <span className="zona-value" style={{ fontSize: '0.75rem', fontWeight: '600', minWidth: '120px', textAlign: 'right' }}>
                    {Math.round(z.consumo_m3).toLocaleString()} m³ ({z.porcentaje}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
