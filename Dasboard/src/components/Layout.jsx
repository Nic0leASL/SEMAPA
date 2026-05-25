import React, { useState, useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Server, Building2, BarChart3, Settings2, Settings, Wifi, WifiOff } from 'lucide-react';

export default function Layout() {
  const [showSettings, setShowSettings] = useState(false);
  const [apiUrl, setApiUrl] = useState(localStorage.getItem('semapa_api_url') || 'http://localhost:8000');
  const [inputUrl, setInputUrl] = useState(apiUrl);
  const [apiConnected, setApiConnected] = useState(false);

  useEffect(() => {
    let active = true;
    const checkConnection = async () => {
      try {
        const res = await fetch(`${apiUrl}/`);
        if (res.ok) {
          const data = await res.json();
          if (active) setApiConnected(true);
        } else {
          if (active) setApiConnected(false);
        }
      } catch (err) {
        if (active) setApiConnected(false);
      }
    };
    
    checkConnection();
    const interval = setInterval(checkConnection, 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [apiUrl]);

  const handleSave = () => {
    let cleanUrl = inputUrl.trim().replace(/\/$/, "");
    if (cleanUrl && !cleanUrl.startsWith("http")) {
      cleanUrl = "http://" + cleanUrl;
    }
    setApiUrl(cleanUrl);
    localStorage.setItem('semapa_api_url', cleanUrl);
    setShowSettings(false);
  };

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="brand">
          <h1>SEMAPA <span>Big Data</span></h1>
        </div>
        <nav className="nav-menu">
          <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Server /> Clúster Monitor
          </NavLink>
          <NavLink to="/alcaldia" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Building2 /> Alcaldía
          </NavLink>
          <NavLink to="/gerencia" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Settings2 /> Gerencia
          </NavLink>
          <NavLink to="/finanzas" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <BarChart3 /> Finanzas
          </NavLink>
        </nav>
        <div style={{ marginTop: 'auto' }}>
          <button className="settings-toggle-btn" onClick={() => setShowSettings(!showSettings)} style={{ width: '100%', gap: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Settings size={16} /> Configurar API
          </button>
        </div>
      </aside>
      
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        {showSettings && (
          <div className="settings-bar">
            <div className="settings-input-group">
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>API URL:</span>
              <input 
                type="text" 
                className="settings-input" 
                value={inputUrl} 
                onChange={(e) => setInputUrl(e.target.value)} 
                placeholder="http://localhost:8000"
              />
              <button className="settings-btn" onClick={handleSave}>Guardar</button>
              <button className="settings-btn-secondary" onClick={() => { setInputUrl(apiUrl); setShowSettings(false); }}>Cancelar</button>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              {apiConnected ? <Wifi size={14} className="trend-up" /> : <WifiOff size={14} className="trend-down" />}
              <span>
                Estado: <strong className={apiConnected ? "trend-up" : "trend-down"}>
                  {apiConnected ? "Conectado" : "Modo Mock"}
                </strong>
              </span>
            </div>
          </div>
        )}
        
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <Outlet context={{ apiUrl, apiConnected }} />
        </div>
      </div>
    </div>
  );
}

