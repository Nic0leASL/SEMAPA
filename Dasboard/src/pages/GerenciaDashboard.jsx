import React from 'react';
import { Activity, AlertTriangle, Search, Zap } from 'lucide-react';
import SemapaMap from '../components/SemapaMap';
import { dashboardMockData } from '../mockData';

export default function GerenciaDashboard() {
  const data = dashboardMockData.gerencia;

  return (
    <div className="dashboard-view">
      <div className="top-header">
        <h2 className="page-title">Dashboard Gerencia Operativa</h2>
      </div>

      <div className="metrics-grid">
        <div className="metric-card glass">
          <div className="metric-header">
            <span className="metric-label">Medidores IoT Operativos</span>
            <Activity className="metric-icon" size={20} />
          </div>
          <span className="metric-value">{data.medidoresActivos}</span>
          <span className="metric-trend trend-up">Transmitiendo Señal</span>
        </div>
        
        <div className="metric-card glass">
          <div className="metric-header">
            <span className="metric-label">Medidores Dañados / Críticos</span>
            <AlertTriangle className="metric-icon" size={20} style={{ color: 'var(--accent-red)', background: 'rgba(239, 68, 68, 0.1)' }} />
          </div>
          <span className="metric-value">{data.medidoresDanados}</span>
          <span className="metric-trend trend-down">Requieren Mantenimiento</span>
        </div>
        
        <div className="metric-card glass">
          <div className="metric-header">
            <span className="metric-label">Lecturas Recibidas Hoy</span>
            <Zap className="metric-icon" size={20} style={{ color: 'var(--accent-purple)', background: 'rgba(139, 92, 246, 0.1)' }} />
          </div>
          <span className="metric-value">{data.lecturasHoy}</span>
          <span className="metric-trend trend-up">Volumen Diario ETL</span>
        </div>

        <div className="metric-card glass">
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
          {/* We reuse the map, conceptually an operator would see faults here */}
          <SemapaMap />
        </div>

        <div className="data-card glass">
          <h3>Top Errores de Infraestructura IoT</h3>
          <table style={{ marginTop: '1rem' }}>
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
                  <td>{err.tipo}</td>
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
        </div>
      </div>
    </div>
  );
}
