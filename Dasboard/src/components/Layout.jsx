import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Server, Building2, BarChart3, Settings2 } from 'lucide-react';

export default function Layout() {
  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="brand">
          <h1>SEMAPA <span>Distribución Big Data</span></h1>
        </div>
        <nav className="nav-menu">
          <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Server /> Monitoreo Clúster
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
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
