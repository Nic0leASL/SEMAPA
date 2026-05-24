import React from 'react';
import { DollarSign, TrendingUp, CreditCard, PiggyBank } from 'lucide-react';
import { dashboardMockData } from '../mockData';

export default function FinanzasDashboard() {
  const data = dashboardMockData.finanzas;

  return (
    <div className="dashboard-view">
      <div className="top-header">
        <h2 className="page-title">Dashboard Finanzas y Proyecciones</h2>
      </div>

      <div className="metrics-grid">
        <div className="metric-card glass">
          <div className="metric-header">
            <span className="metric-label">Ingreso Mensual Actual</span>
            <DollarSign className="metric-icon" size={20} style={{ color: 'var(--accent-emerald)', background: 'rgba(16, 185, 129, 0.1)' }} />
          </div>
          <span className="metric-value">{data.ingresoMensual} Bs</span>
          <span className="metric-trend trend-up">Mes en curso</span>
        </div>
        
        <div className="metric-card glass">
          <div className="metric-header">
            <span className="metric-label">Proyección Cierre Mensual</span>
            <TrendingUp className="metric-icon" size={20} style={{ color: 'var(--accent-purple)', background: 'rgba(139, 92, 246, 0.1)' }} />
          </div>
          <span className="metric-value">{data.proyeccionCierre} Bs</span>
          <span className="metric-trend trend-up">Crecimiento estimado: {data.tasaCrecimiento}</span>
        </div>
        
        <div className="metric-card glass">
          <div className="metric-header">
            <span className="metric-label">Facturas Emitidas</span>
            <CreditCard className="metric-icon" size={20} style={{ color: 'var(--accent-cyan)', background: 'rgba(6, 182, 212, 0.1)' }} />
          </div>
          <span className="metric-value">{data.facturasEmitidas}</span>
          <span className="metric-trend trend-up">Ciclo de facturación actual</span>
        </div>

        <div className="metric-card glass">
          <div className="metric-header">
            <span className="metric-label">Tasa de Pagos Digitales</span>
            <PiggyBank className="metric-icon" size={20} style={{ color: 'var(--accent-amber)', background: 'rgba(245, 158, 11, 0.1)' }} />
          </div>
          <span className="metric-value">{data.pagosDigitales}</span>
          <span className="metric-trend trend-up">Ahorro en logística de cobro</span>
        </div>
      </div>

      <div className="section-grid" style={{ marginTop: '2rem', gridTemplateColumns: '1fr' }}>
        <div className="data-card glass">
          <h3>Tendencia de Recaudación (Últimos 5 Meses)</h3>
          
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1rem', height: '250px', marginTop: '2rem', padding: '1rem', borderBottom: '1px solid var(--border-color)' }}>
            {data.tendencia.map((item, idx) => {
              const maxVal = 2500000;
              const height = (item.ingresos / maxVal) * 100;
              return (
                <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ position: 'relative', width: '60%', height: '100%', display: 'flex', alignItems: 'flex-end' }}>
                    <div 
                      style={{ 
                        width: '100%', 
                        height: `${height}%`, 
                        background: 'linear-gradient(0deg, rgba(6, 182, 212, 0.3) 0%, rgba(139, 92, 246, 0.8) 100%)',
                        borderRadius: '6px 6px 0 0',
                        transition: 'height 1s ease-out'
                      }} 
                    />
                  </div>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{item.mes}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: '500' }}>{(item.ingresos / 1000000).toFixed(2)}M Bs</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
