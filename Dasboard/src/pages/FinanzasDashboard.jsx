import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { DollarSign, TrendingUp, CreditCard, Building2, Percent } from 'lucide-react';

export default function FinanzasDashboard() {
  const { apiUrl, apiConnected } = useOutletContext();
  const [data, setData] = useState({
    ingresoMensual: '0',
    proyeccionCierre: '0',
    tasaCrecimiento: '0%',
    facturasEmitidas: '0',
    montoFacturado: '0',
    carteraVencida: '0',
    tendencia: [],
    facturacionPorDistrito: []
  });
  const [morososList, setMorososList] = useState([]);
  const [isMocked, setIsMocked] = useState(false);
  const [hoveredBar, setHoveredBar] = useState(null);

  useEffect(() => {
    if (!apiConnected) return;

    const fetchData = async () => {
      try {
        const res = await fetch(`${apiUrl}/dashboard/finanzas`);
        if (res.ok) {
          const apiData = await res.json();
          const summary = apiData.financial_summary || {};
          
          setData({
            ingresoMensual: (summary.ingresos_recaudados_bs || 0).toLocaleString(),
            proyeccionCierre: (summary.ingresos_proyectados_proximo_mes_bs || 0).toLocaleString(),
            tasaCrecimiento: `${summary.efectividad_cobro_porcentaje || 0}%`,
            facturasEmitidas: (summary.clientes_morosos_total || 0).toLocaleString(),
            montoFacturado: (summary.total_facturado_bs || 0).toLocaleString(),
            carteraVencida: (summary.deuda_pendiente_bs || 0).toLocaleString(),
            tendencia: [
              { label: 'Facturado', valor: summary.total_facturado_bs || 0, color: '#8b5cf6' },
              { label: 'Recaudado', valor: summary.ingresos_recaudados_bs || 0, color: '#10b981' },
              { label: 'Mora', valor: summary.deuda_pendiente_bs || 0, color: '#ef4444' }
            ],
            facturacionPorDistrito: apiData.facturacion_por_distrito || []
          });
          setMorososList(apiData.contratos_con_deuda_recientes || []);
          setIsMocked(false);
        }
      } catch (err) {
        console.error("Error fetching finance dashboard:", err);
      }
    };

    fetchData();
  }, [apiConnected, apiUrl]);

  const effectiveIsMocked = false;
  const effectiveData = data;
  const effectiveMorososList = morososList;

  // Calculate max value for chart scaling
  const maxVal = Math.max(...(effectiveData.tendencia || []).map(t => t.valor), 1);

  return (
    <div className="dashboard-view animate-fade-in" style={{ animation: 'slideDown 0.4s ease-out' }}>
      <div className="top-header">
        <h2 className="page-title">Dashboard Finanzas y Proyecciones</h2>
        <span className={`api-mode-pill ${!effectiveIsMocked ? 'mode-realtime' : 'mode-mocked'}`}>
          {!effectiveIsMocked ? 'Tiempo Real' : 'Modo Mock'}
        </span>
      </div>

      <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {/* Monto Facturado */}
        <div className="metric-card glass accent-purple">
          <div className="metric-header">
            <span className="metric-label">Monto Facturado Mensual</span>
            <DollarSign className="metric-icon" size={20} style={{ color: 'var(--accent-purple)', background: 'rgba(139, 92, 246, 0.1)' }} />
          </div>
          <span className="metric-value">{effectiveData.montoFacturado} Bs</span>
          <span className="metric-trend trend-up">Preavisos emitidos</span>
        </div>

        {/* Monto Recaudado */}
        <div className="metric-card glass accent-emerald">
          <div className="metric-header">
            <span className="metric-label">Monto Recaudado Mensual</span>
            <DollarSign className="metric-icon" size={20} style={{ color: 'var(--accent-emerald)', background: 'rgba(16, 185, 129, 0.1)' }} />
          </div>
          <span className="metric-value">{effectiveData.ingresoMensual} Bs</span>
          <span className="metric-trend trend-up">Efectividad: {effectiveData.tasaCrecimiento}</span>
        </div>
        
        {/* Cartera Vencida (Mora) */}
        <div className="metric-card glass accent-red">
          <div className="metric-header">
            <span className="metric-label">Cartera Vencida (Mora)</span>
            <DollarSign className="metric-icon" size={20} style={{ color: 'var(--accent-red)', background: 'rgba(239, 68, 68, 0.1)' }} />
          </div>
          <span className="metric-value" style={{ color: 'var(--accent-red)' }}>{effectiveData.carteraVencida} Bs</span>
          <span className="metric-trend trend-down">Riesgo financiero actual</span>
        </div>
        
        {/* Total Preavisos Emitidos */}
        <div className="metric-card glass accent-cyan">
          <div className="metric-header">
            <span className="metric-label">Total Preavisos Emitidos</span>
            <CreditCard className="metric-icon" size={20} style={{ color: 'var(--accent-cyan)', background: 'rgba(6, 182, 212, 0.1)' }} />
          </div>
          <span className="metric-value">{effectiveData.facturasEmitidas}</span>
          <span className="metric-trend trend-up">Ciclo de facturación digital</span>
        </div>
      </div>
      <div className="section-grid" style={{ marginTop: '2rem', gridTemplateColumns: '2fr 1.2fr' }}>
        <div className="data-card glass">
          <h3>Resumen Financiero Mensual</h3>
          
          {/* Interactive Chart */}
          <div className="finanzas-chart">
            {/* Y-axis labels */}
            <div className="finanzas-y-axis">
              <span>{(maxVal / 1000).toFixed(0)}K</span>
              <span>{(maxVal * 0.75 / 1000).toFixed(0)}K</span>
              <span>{(maxVal * 0.5 / 1000).toFixed(0)}K</span>
              <span>{(maxVal * 0.25 / 1000).toFixed(0)}K</span>
              <span>0</span>
            </div>

            {/* Bars area */}
            <div className="finanzas-bars-area">
              {/* Grid lines */}
              <div className="finanzas-gridlines">
                <div className="finanzas-gridline" />
                <div className="finanzas-gridline" />
                <div className="finanzas-gridline" />
                <div className="finanzas-gridline" />
              </div>

              {(effectiveData.tendencia || []).map((item, idx) => {
                const height = (item.valor / maxVal) * 100;
                const isHovered = hoveredBar === idx;
                return (
                  <div 
                    key={idx} 
                    className="finanzas-bar-col"
                    onMouseEnter={() => setHoveredBar(idx)}
                    onMouseLeave={() => setHoveredBar(null)}
                  >
                    {/* Tooltip */}
                    {isHovered && (
                      <div className="finanzas-tooltip glass">
                        <strong>{item.label}</strong>
                        <span>{item.valor.toLocaleString()} Bs</span>
                      </div>
                    )}
                    <div className="finanzas-bar-wrapper">
                      <div 
                        className="finanzas-bar"
                        style={{ 
                          height: `${height}%`,
                          background: item.color || 'var(--accent-purple)',
                          transform: isHovered ? 'scaleX(1.1)' : 'scaleX(1)',
                          boxShadow: isHovered ? `0 0 20px ${item.color}60` : 'none'
                        }} 
                      />
                    </div>
                    <span className="finanzas-bar-label">{item.label}</span>
                    <span className="finanzas-bar-value">{item.valor.toLocaleString()} Bs</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="data-card glass">
          <h3>Deudores Críticos Recientes</h3>
          <table style={{ marginTop: '0.5rem' }}>
            <thead>
              <tr>
                <th>Contrato</th>
                <th>Titular</th>
                <th>Monto</th>
              </tr>
            </thead>
            <tbody>
              {(effectiveMorososList || []).slice(0, 5).map((m, idx) => (
                <tr key={idx}>
                  <td style={{ fontFamily: 'monospace', color: 'var(--accent-cyan)', fontSize: '0.8rem' }}>{m.numero_contrato}</td>
                  <td style={{ fontSize: '0.75rem', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.titular}>
                    {m.titular}
                  </td>
                  <td style={{ color: 'var(--accent-red)', fontWeight: '600' }}>{m.monto_deuda_bs} Bs</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ROW 3: Facturación por Distrito */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem', marginTop: '2rem' }}>
        {/* Facturación por Distrito */}
        <div className="data-card glass">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.8rem' }}>
            <Building2 size={18} style={{ color: 'var(--accent-cyan)' }} />
            Facturación Total por Distrito (Bs)
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '8px' }}>Distrito</th>
                  <th style={{ padding: '8px' }}>Subalcaldía</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Monto Facturado</th>
                </tr>
              </thead>
              <tbody>
                {(effectiveData.facturacionPorDistrito || []).map((d, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', background: idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                    <td style={{ padding: '8px', fontWeight: '600' }}>Distrito {d.distrito}</td>
                    <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>{d.sub_alcaldia}</td>
                    <td style={{ padding: '8px', textAlign: 'right', color: 'var(--accent-cyan)', fontWeight: '600' }}>{d.facturacion_total.toLocaleString()} Bs</td>
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
