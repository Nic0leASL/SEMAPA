import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ShieldAlert, ShieldCheck, Cpu } from 'lucide-react';

export default function ClusterMonitor() {
  const { apiUrl, apiConnected } = useOutletContext();
  const mockClusterData = useMemo(() => ({
    database_connected: false,
    hosts: [],
    nodetool_status: 'Desconectado del API'
  }), []);
  const [clusterData, setClusterData] = useState({
    database_connected: false,
    hosts: [],
    nodetool_status: 'Esperando conexión con el API para obtener el estado del clúster...'
  });
  const [loading, setLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    if (!apiConnected) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/dashboard/cluster-status`);
      if (res.ok) {
        const data = await res.json();
        setClusterData(data);
      }
    } catch (err) {
      console.error("Error fetching cluster status:", err);
    } finally {
      setLoading(false);
    }
  }, [apiConnected, apiUrl]);

  useEffect(() => {
    if (!apiConnected) return;
    const initialTimeout = setTimeout(() => {
      fetchStatus();
    }, 0);
    const interval = setInterval(fetchStatus, 8000);
    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [apiConnected, fetchStatus]);

  const effectiveClusterData = apiConnected ? clusterData : mockClusterData;

  // Find statuses in loaded data
  const node1 = effectiveClusterData.hosts.find(h => h.address === '100.114.64.8') || { is_up: false };
  const node2 = effectiveClusterData.hosts.find(h => h.address === '100.71.121.5') || { is_up: false };

  const isDegraded = !node2.is_up;

  return (
    <div className="dashboard-view animate-fade-in" style={{ animation: 'slideDown 0.4s ease-out' }}>
      <div className="top-header">
        <h2 className="page-title">Monitoreo de Clúster Cassandra</h2>
        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
          <span className={`api-mode-pill ${apiConnected ? 'mode-realtime' : 'mode-mocked'}`}>
            {apiConnected ? 'Tiempo Real' : 'Modo Mock'}
          </span>
          <div className="connection-status">
            <span className={`status-dot ${isDegraded ? 'status-warning' : 'status-online'}`}></span>
            <span>{isDegraded ? 'Clúster Degradado - RF=1' : 'Clúster Saludable (2 Nodos UN)'}</span>
          </div>
        </div>
      </div>

      {isDegraded ? (
        <div className="warning-panel warning-amber" style={{ display: 'flex', gap: '1rem', alignItems: 'center', margin: '1rem 0' }}>
          <ShieldAlert size={28} />
          <div>
            <strong>ADVERTENCIA ACADÉMICA (Caída de Nodo en RF=1):</strong>
            <p style={{ margin: 0, fontSize: '0.85rem', marginTop: '4px' }}>
              El <strong>Nodo 2 (IP: 100.71.121.5)</strong> se encuentra desconectado. Dado que el factor de replicación está configurado en <strong>RF = 1 (Sharding horizontal puro sin copias redundantes)</strong>, cualquier consulta o dato perteneciente a los rangos de tokens asignados a la PC Secundaria fallará. El Nodo 1 sigue operativo.
            </p>
          </div>
        </div>
      ) : (
        <div className="warning-panel" style={{ display: 'flex', gap: '1rem', alignItems: 'center', margin: '1rem 0', backgroundColor: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)', color: '#a7f3d0' }}>
          <ShieldCheck size={28} style={{ color: 'var(--accent-emerald)' }} />
          <div>
            <strong>CLÚSTER OPERATIVO Y BALANCEADO (RF=1):</strong>
            <p style={{ margin: 0, fontSize: '0.85rem', marginTop: '4px' }}>
              Ambos nodos están conectados al anillo y compartiendo el particionamiento de datos (50% de rango de tokens cada uno). Las escrituras y lecturas se resuelven de forma transparente en el clúster distribuido.
            </p>
          </div>
        </div>
      )}

      <div className="section-grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: '1rem' }}>
        {/* Node 1 */}
        <div className="node-card glass" style={{ borderTop: '3px solid var(--accent-cyan)' }}>
          <div className="node-header">
            <div className="node-info">
              <h4>PC 1 (Principal - Tuya)</h4>
              <p>Servicios: Cassandra Nodo 1 + Backend API + Frontend</p>
            </div>
            <span className={`badge ${node1.is_up ? 'badge-success' : 'badge-critical'}`}>
              {node1.is_up ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>
          <div className="node-details">
            <div className="detail-item">
              <span className="detail-label">IP Tailscale</span>
              <span>100.114.64.8</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Puerto Cassandra</span>
              <span>9042</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Rol en el Anillo</span>
              <span>Seed / Coordinador</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Rango de Tokens</span>
              <span>Tokens [-2^63 a 0]</span>
            </div>
          </div>
        </div>

        {/* Node 2 */}
        <div className="node-card glass" style={{ borderTop: `3px solid ${node2.is_up ? 'var(--accent-purple)' : 'var(--accent-red)'}` }}>
          <div className="node-header">
            <div className="node-info">
              <h4>PC 2 (Secundaria)</h4>
              <p>Servicios: Cassandra Nodo 2</p>
            </div>
            <span className={`badge ${node2.is_up ? 'badge-success' : 'badge-critical'}`}>
              {node2.is_up ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>
          <div className="node-details">
            <div className="detail-item">
              <span className="detail-label">IP Tailscale</span>
              <span>100.71.121.5</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Puerto Cassandra</span>
              <span>9042</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Rol en el Anillo</span>
              <span>Miembro del Anillo</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Rango de Tokens</span>
              <span>Tokens [1 a 2^63-1]</span>
            </div>
          </div>
        </div>
      </div>

      <div className="data-card glass" style={{ marginTop: '2rem' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Cpu size={18} /> Verificación Nodetool Status
          {loading && <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-secondary)' }}>(actualizando...)</span>}
        </h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'monospace', marginBottom: '0.5rem' }}>
          docker exec -it cassandra-node1 nodetool status
        </p>
        <div className="terminal-box" style={{ whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
          {effectiveClusterData.nodetool_status}
        </div>
      </div>
    </div>
  );
}

