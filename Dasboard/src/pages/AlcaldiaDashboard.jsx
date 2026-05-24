import React from 'react';
import { Droplet, DollarSign, Wallet, Users } from 'lucide-react';
import SemapaMap from '../components/SemapaMap';
import { dashboardMockData } from '../mockData';

export default function AlcaldiaDashboard() {
  const data = dashboardMockData.alcaldia;

  return (
    <div className="dashboard-view">
      <div className="top-header">
        <h2 className="page-title">Dashboard Alcaldía (Smart City)</h2>
      </div>

      <div className="metrics-grid">
        <div className="metric-card glass">
          <div className="metric-header">
            <span className="metric-label">Consumo Total Hídrico</span>
            <Droplet className="metric-icon" size={20} />
          </div>
          <span className="metric-value">{data.consumoTotal} m³</span>
          <span className="metric-trend trend-down">Metropolitana Cochabamba</span>
        </div>
        
        <div className="metric-card glass">
          <div className="metric-header">
            <span className="metric-label">Monto Facturado</span>
            <DollarSign className="metric-icon" size={20} />
          </div>
          <span className="metric-value">{data.facturacionTotal} Bs</span>
          <span className="metric-trend trend-up">Facturación General</span>
        </div>
        
        <div className="metric-card glass">
          <div className="metric-header">
            <span className="metric-label">Ingresos Recaudados</span>
            <Wallet className="metric-icon" size={20} />
          </div>
          <span className="metric-value">{data.recaudado} Bs</span>
          <span className="metric-trend trend-up">Efectividad: {data.efectividadCobro}%</span>
        </div>
        
        <div className="metric-card glass">
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
          <SemapaMap />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <div className="data-card glass">
            <h3>Estrés Hídrico por Distrito</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
              {data.estresHidrico.map((dist, idx) => (
                <div key={idx}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.3rem' }}>
                    <span>{dist.distrito}</span>
                    <span style={{ color: dist.nivel === 'Crítico' ? 'var(--accent-red)' : dist.nivel === 'Alto' ? 'var(--accent-amber)' : 'var(--accent-emerald)' }}>
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
                    <td>{z.zona}</td>
                    <td>{z.consumo}</td>
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
