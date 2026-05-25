import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Building2, BarChart3, Settings2, Settings, Wifi, WifiOff } from 'lucide-react';

export default function Layout() {
  const [showSettings, setShowSettings] = useState(false);
  const [apiUrl, setApiUrl] = useState(localStorage.getItem('semapa_api_url') || 'http://localhost:8000');
  const [inputUrl, setInputUrl] = useState(apiUrl);
  const [apiConnected, setApiConnected] = useState(false);
  const location = useLocation();
  const [isRouting, setIsRouting] = useState(false);
  const routingShowTimeoutRef = useRef(null);
  const routingTimeoutRef = useRef(null);

  useEffect(() => {
    let active = true;
    const checkConnection = async () => {
      try {
        const res = await fetch(`${apiUrl}/`);
        if (res.ok) {
          await res.json();
          if (active) setApiConnected(true);
        } else {
          if (active) setApiConnected(false);
        }
      } catch {
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

  useEffect(() => {
    if (routingShowTimeoutRef.current) {
      clearTimeout(routingShowTimeoutRef.current);
    }
    routingShowTimeoutRef.current = setTimeout(() => {
      setIsRouting(true);
      routingShowTimeoutRef.current = null;
    }, 0);
    if (routingTimeoutRef.current) {
      clearTimeout(routingTimeoutRef.current);
    }
    routingTimeoutRef.current = setTimeout(() => {
      setIsRouting(false);
      routingTimeoutRef.current = null;
    }, 420);
    return () => {
      if (routingShowTimeoutRef.current) {
        clearTimeout(routingShowTimeoutRef.current);
        routingShowTimeoutRef.current = null;
      }
      if (routingTimeoutRef.current) {
        clearTimeout(routingTimeoutRef.current);
        routingTimeoutRef.current = null;
      }
    };
  }, [location.pathname]);

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
      <header className="topbar">
        <div className="topbar-inner glass">
          <div className="topbar-center">
            <img className="topbar-logo" src="/logo.png" alt="SEMAPA" />
            <nav className="top-tabs" aria-label="Secciones">
              <NavLink to="/alcaldia" className={({ isActive }) => `top-tab ${isActive ? 'active' : ''}`}>
                <Building2 size={18} /> Alcaldía
              </NavLink>
              <NavLink to="/gerencia" className={({ isActive }) => `top-tab ${isActive ? 'active' : ''}`}>
                <Settings2 size={18} /> Gerencia
              </NavLink>
              <NavLink to="/finanzas" className={({ isActive }) => `top-tab ${isActive ? 'active' : ''}`}>
                <BarChart3 size={18} /> Finanzas
              </NavLink>
            </nav>
          </div>

        </div>
      </header>

      <div className="app-body">
        
        {isRouting && (
          <div className="route-loader" role="status" aria-live="polite" aria-label="Cargando">
            <div className="route-loader-card glass">
              <img className="route-loader-logo" src="/logo.png" alt="SEMAPA" />
              <div className="route-loader-spinner" />
              <div className="route-loader-text">Cargando…</div>
            </div>
          </div>
        )}

        <main className="main-content">
          <Outlet context={{ apiUrl, apiConnected }} />
        </main>
      </div>
    </div>
  );
}

