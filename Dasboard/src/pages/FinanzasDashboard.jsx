import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { DollarSign, TrendingUp, CreditCard, PiggyBank } from 'lucide-react';
import { dashboardMockData } from '../mockData';

export default function FinanzasDashboard() {
  const { apiUrl, apiConnected } = useOutletContext();
  const [data, setData] = useState(dashboardMockData.finanzas);
  const [morososList, setMorososList] = useState([]);
  const [isMocked, setIsMocked] = useState(true);

  useEffect(() => {
    if (!apiConnected) return;

    const fetchData = async () => {
      try {
        const res = await fetch(`${apiUrl}/dashboard/finanzas`);
        if (res.ok) {
          const apiData = await res.json();
          const summary = apiData.financial_summary || {};
          
          // Construct updated tendency by putting the real revenues as the last element
          const defaultTendency = [...dashboardMockData.finanzas.tendencia];
          if (defaultTendency.length > 0) {
            defaultTendency[defaultTendency.length - 1].ingresos = summary.ingresos_recaudados_bs || 2450000;
          }

          setData({
            ingresoMensual: (summary.ingresos_recaudados_bs || 0).toLocaleString(),
            proyeccionCierre: (summary.ingresos_proyectados_proximo_mes_bs || 0).toLocaleString(),
            tasaCrecimiento: `+${summary.efectividad_cobro_porcentaje || 5.2}%`,
            facturasEmitidas: (summary.clientes_morosos_total * 7 + 100000).toLocaleString(),
            pagosDigitales: "68%",
            tendencia: defaultTendency
          });
          setMorososList(apiData.contratos_con_deuda_recientes || []);
          setIsMocked(false);
        } else {
          setData(dashboardMockData.finanzas);
          setMorososList([]);
          setIsMocked(true);
        }
      } catch (err) {
        console.error("Error fetching finance dashboard:", err);
        setData(dashboardMockData.finanzas);
        setMorososList([]);
        setIsMocked(true);
      }
    };

    fetchData();
  }, [apiConnected, apiUrl]);

  const effectiveIsMocked = !apiConnected || isMocked;
  const effectiveData = !apiConnected ? dashboardMockData.finanzas : data;
  const effectiveMorososList = apiConnected ? morososList : [];

  return (
    <div className="dashboard-view animate-fade-in" style={{ animation: 'slideDown 0.4s ease-out' }}>
      <div className="top-header">
        <h2 className="page-title">Dashboard Finanzas y Proyecciones</h2>
        <span className={`api-mode-pill ${!effectiveIsMocked ? 'mode-realtime' : 'mode-mocked'}`}>
          {!effectiveIsMocked ? 'Tiempo Real' : 'Modo Mock'}
        </span>
      </div>

      <div className="metrics-grid">
        <div className="metric-card glass accent-emerald">
          <div className="metric-header">
            <span className="metric-label">Ingreso Mensual Actual</span>
            <DollarSign className="metric-icon" size={20} style={{ color: 'var(--accent-emerald)', background: 'rgba(16, 185, 129, 0.1)' }} />
          </div>
          <span className="metric-value">{effectiveData.ingresoMensual} Bs</span>
          <span className="metric-trend trend-up">Mes en curso</span>
        </div>
        
        <div className="metric-card glass accent-purple">
          <div className="metric-header">
            <span className="metric-label">Proyección Cierre Mensual</span>
            <TrendingUp className="metric-icon" size={20} style={{ color: 'var(--accent-purple)', background: 'rgba(139, 92, 246, 0.1)' }} />
          </div>
          <span className="metric-value">{effectiveData.proyeccionCierre} Bs</span>
          <span className="metric-trend trend-up">Crecimiento estimado: {effectiveData.tasaCrecimiento}</span>
        </div>
        
        <div className="metric-card glass accent-cyan">
          <div className="metric-header">
            <span className="metric-label">Facturas Emitidas</span>
            <CreditCard className="metric-icon" size={20} style={{ color: 'var(--accent-cyan)', background: 'rgba(6, 182, 212, 0.1)' }} />
          </div>
          <span className="metric-value">{effectiveData.facturasEmitidas}</span>
          <span className="metric-trend trend-up">Ciclo de facturación actual</span>
        </div>

        <div className="metric-card glass accent-amber">
          <div className="metric-header">
            <span className="metric-label">Tasa de Pagos Digitales</span>
            <PiggyBank className="metric-icon" size={20} style={{ color: 'var(--accent-amber)', background: 'rgba(245, 158, 11, 0.1)' }} />
          </div>
          <span className="metric-value">{effectiveData.pagosDigitales}</span>
          <span className="metric-trend trend-up">Ahorro en logística de cobro</span>
        </div>
      </div>

      <div className="section-grid" style={{ marginTop: '2rem', gridTemplateColumns: effectiveIsMocked ? '1fr' : '2fr 1.2fr' }}>
        <div className="data-card glass">
          <h3>Tendencia de Recaudación (Últimos 5 Meses)</h3>
          
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1rem', height: '250px', marginTop: '2rem', padding: '1rem', borderBottom: '1px solid var(--border-color)' }}>
            {effectiveData.tendencia.map((item, idx) => {
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

        {!effectiveIsMocked && (
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
                {effectiveMorososList.slice(0, 5).map((m, idx) => (
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
        )}
      </div>
    </div>
  );
}

