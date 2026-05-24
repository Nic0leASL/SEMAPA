import React from 'react';
import { Server, ShieldAlert } from 'lucide-react';

export default function ClusterMonitor() {
  return (
    <div className="dashboard-view">
      <div className="top-header">
        <h2 className="page-title">Monitoreo de Clúster Cassandra</h2>
        <div className="connection-status">
          <span className="status-dot status-warning"></span>
          <span>Nodo 2 Offline - RF=1</span>
        </div>
      </div>

      <div className="glass" style={{ padding: '1rem 1.5rem', marginBottom: '2rem', display: 'flex', gap: '1rem', alignItems: 'center', backgroundColor: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', color: 'var(--accent-amber)' }}>
        <ShieldAlert />
        <div>
          <strong>ADVERTENCIA ACADÉMICA (Caída de Nodo en RF=1):</strong>
          <p style={{ margin: 0, fontSize: '0.9rem', marginTop: '4px' }}>El Nodo 2 (100.114.64.8) se encuentra desconectado. Las consultas para las particiones almacenadas en dicho nodo fallarán debido a que no hay replicación redundante (RF=1). El Nodo 1 sigue operando normalmente.</p>
        </div>
      </div>

      <div className="section-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="node-card glass">
          <div className="node-header">
            <div className="node-info">
              <h4>PC Principal (Mani)</h4>
              <p>Servicios: Cassandra Nodo 1 + Backend API + Frontend</p>
            </div>
            <span className="badge badge-success">ONLINE</span>
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
              <span className="detail-label">Tipo de Nodo</span>
              <span>Seed / Coordinador</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Rango de Anillo</span>
              <span>Tokens [-2^63 a 0]</span>
            </div>
          </div>
        </div>

        <div className="node-card glass">
          <div className="node-header">
            <div className="node-info">
              <h4>PC Secundaria</h4>
              <p>Servicios: Cassandra Nodo 2</p>
            </div>
            <span className="badge badge-critical">OFFLINE</span>
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
              <span className="detail-label">Tipo de Nodo</span>
              <span>Unido (Gossip)</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Rango de Anillo</span>
              <span>Tokens [1 a 2^63-1]</span>
            </div>
          </div>
        </div>
      </div>

      <div className="data-card glass" style={{ marginTop: '2rem' }}>
        <h3><Server size={18} /> Verificación Nodetool (Mock)</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>docker exec -it cassandra-node1 nodetool status</p>
        <div className="terminal-box" style={{ color: '#10b981' }}>
{`--  Address       Load       Tokens  Owns (effective)  Host ID                               Rack
UN  100.71.121.5  354.21 KiB 16      50.0%             8b5d3c8d-3921-4b1c-99d9-11c67e72ff08  rack1
DN  100.114.64.8  324.95 KiB 16      50.0%             fa2c8db2-2321-482a-a921-77ee8ca41cc2  rack1`}
        </div>
      </div>
    </div>
  );
}
