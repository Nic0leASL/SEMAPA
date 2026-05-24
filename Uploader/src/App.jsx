import React, { useState, useEffect } from 'react';
import { 
  UploadCloud, Database, CheckCircle2, AlertCircle, Server, 
  Activity, RefreshCw, Trash2, Filter, MapPin, FileText, 
  Home, Cpu, BarChart3, Settings, ShieldAlert, Sparkles
} from 'lucide-react';
import './App.css';

function App() {
  const [apiUrl, setApiUrl] = useState(() => {
    const saved = localStorage.getItem('semapa_api_url');
    if (saved) return saved;
    // Auto-configure default based on current page host
    if (window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      return `http://${window.location.hostname}:8000`;
    }
    return 'http://localhost:8000';
  });

  const [showSettings, setShowSettings] = useState(false);
  const [tempApiUrl, setTempApiUrl] = useState(apiUrl);
  
  // Connection states
  const [apiConnected, setApiConnected] = useState(false);
  const [assignedNode, setAssignedNode] = useState('');
  const [node1Status, setNode1Status] = useState('OFFLINE');
  const [node2Status, setNode2Status] = useState('OFFLINE');
  const [cassandraLogs, setCassandraLogs] = useState('');
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [simulatedFailure, setSimulatedFailure] = useState(false);

  // Ingestion states
  const [steps, setSteps] = useState([
    { id: 1, name: 'Paso 1: Distritos Geográficos', filePattern: 'Distritos.csv', endpoint: '/upload/distritos', icon: MapPin, status: 'idle', result: null, progress: 0 },
    { id: 2, name: 'Paso 2: Catastro Urbano', filePattern: 'infraestructuras_cochabamba.csv', endpoint: '/upload/infraestructura', icon: Home, status: 'disabled', result: null, progress: 0 },
    { id: 3, name: 'Paso 3: Padrón de Contratos', filePattern: 'contratos_agua.csv', endpoint: '/upload/contratos', icon: FileText, status: 'disabled', result: null, progress: 0 },
    { id: 4, name: 'Paso 4: Padrón de Medidores', filePattern: 'medidores_iot.csv', endpoint: '/upload/medidores', icon: Cpu, status: 'disabled', result: null, progress: 0 },
    { id: 5, name: 'Paso 5: Lecturas IoT Masivas', filePattern: 'lecturas_iot.csv', endpoint: '/upload/lecturas', icon: BarChart3, status: 'disabled', result: null, progress: 0 },
  ]);

  const [files, setFiles] = useState({}); // { stepId: FileObject }
  
  // Client-side filtering states for Step 5
  const [applyClientFilter, setApplyClientFilter] = useState(true);
  const [filterStats, setFilterStats] = useState(null); // { total, valid, duplicate, percentRemoved, timeMs }
  const [isFiltering, setIsFiltering] = useState(false);
  const [dragOverStep, setDragOverStep] = useState(null);

  // Check connection on mount and interval
  useEffect(() => {
    checkConnection();
    const interval = setInterval(checkConnection, 10000);
    return () => clearInterval(interval);
  }, [apiUrl]);

  const checkConnection = async () => {
    if (checkingConnection) return;
    setCheckingConnection(true);
    try {
      const res = await fetch(`${apiUrl}/`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json();
        setApiConnected(true);
        setAssignedNode(data.node_assigned || 'Desconocido');
        
        // Node Statuses
        if (data.database_connected) {
          setNode1Status('UP (Normal)');
          
          if (simulatedFailure) {
            setNode2Status('DOWN (Falla)');
            setCassandraLogs(
`Datacenter: datacenter1
=======================
Status=Up/Down
|/ State=Normal/Leaving/Joining/Moving
--  Address       Load       Tokens  Owns (effective)  Host ID                               Rack
UN  100.71.121.5  354.21 KiB 16      100.0%            8b5d3c8d-3921-4b1c-99d9-11c67e72ff08  rack1
DN  100.114.64.8  0.00 KiB   16      0.0%              fa2c8db2-2321-482a-a921-77ee8ca41cc2  rack1`
            );
          } else {
            setNode2Status('UP (Normal)');
            setCassandraLogs(
`Datacenter: datacenter1
=======================
Status=Up/Down
|/ State=Normal/Leaving/Joining/Moving
--  Address       Load       Tokens  Owns (effective)  Host ID                               Rack
UN  100.71.121.5  354.21 KiB 16      50.0%             8b5d3c8d-3921-4b1c-99d9-11c67e72ff08  rack1
UN  100.114.64.8  324.95 KiB 16      50.0%             fa2c8db2-2321-482a-a921-77ee8ca41cc2  rack1`
            );
          }
        } else {
          setNode1Status('SIN BD');
          setNode2Status('SIN BD');
          setCassandraLogs('Error: Cassandra desconectado de la API.');
        }
      } else {
        throw new Error('Response not OK');
      }
    } catch {
      setApiConnected(false);
      setNode1Status('OFFLINE');
      setNode2Status('OFFLINE');
      setCassandraLogs('API del Backend no disponible. Verifica que docker-compose esté encendido y la IP sea correcta.');
    } finally {
      setCheckingConnection(false);
    }
  };

  const handleApplyApiUrl = () => {
    let cleanUrl = tempApiUrl.trim().replace(/\/$/, "");
    if (cleanUrl && !cleanUrl.startsWith('http')) {
      cleanUrl = 'http://' + cleanUrl;
    }
    setApiUrl(cleanUrl);
    localStorage.setItem('semapa_api_url', cleanUrl);
    setShowSettings(false);
  };

  const handleFileChange = (stepId, file) => {
    if (!file) return;
    if (!file.name.endsWith('.csv')) {
      alert('Solo se permiten archivos con extensión .csv');
      return;
    }
    setFiles(prev => ({ ...prev, [stepId]: file }));
    
    // Clear previous results or stats if selecting new file
    if (stepId === 5) {
      setFilterStats(null);
    }

    setSteps(prev => prev.map(s => {
      if (s.id === stepId) {
        return { ...s, status: 'idle', result: null };
      }
      return s;
    }));
  };

  // Drag and Drop helpers
  const handleDragOver = (e, stepId) => {
    e.preventDefault();
    setDragOverStep(stepId);
  };

  const handleDragLeave = () => {
    setDragOverStep(null);
  };

  const handleDrop = (e, stepId) => {
    e.preventDefault();
    setDragOverStep(null);
    const filesList = e.dataTransfer.files;
    if (filesList.length > 0) {
      handleFileChange(stepId, filesList[0]);
    }
  };

  // Helper parser for custom date matching
  const parseCustomDate = (dateStr) => {
    try {
      if (!dateStr) return 0;
      // "02/28/26 21:39"
      const parts = dateStr.trim().split(' ');
      const datePart = parts[0];
      const timePart = parts[1] || '00:00';
      
      const [m, d, y] = datePart.split('/');
      const [h, min] = timePart.split(':');
      
      // Assume year is 2000+
      const year = 2000 + parseInt(y, 10);
      const month = parseInt(m, 10) - 1;
      const day = parseInt(d, 10);
      const hour = parseInt(h, 10);
      const minute = parseInt(min, 10);
      
      return new Date(year, month, day, hour, minute).getTime();
    } catch {
      return 0;
    }
  };

  // Client side filtering algorithm
  const processLecturasCSV = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const text = e.target.result;
        const startTime = performance.now();
        
        // Split by lines
        const lines = text.split(/\r?\n/);
        if (lines.length < 2) {
          reject(new Error("El archivo CSV está vacío o tiene un formato inválido."));
          return;
        }

        const header = lines[0];
        const headers = header.split(',');
        
        // Find indexes
        const idxMedidor = headers.findIndex(h => h.trim() === 'medidor_iot');
        const idxFecha = headers.findIndex(h => h.trim() === 'fechaHoraLectura');
        
        if (idxMedidor === -1 || idxFecha === -1) {
          reject(new Error("Columnas 'medidor_iot' y/or 'fechaHoraLectura' no encontradas en el CSV."));
          return;
        }

        // Parse data rows
        const records = [];
        const invalidLines = [];
        
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          // Split ignoring commas inside quotes if any (simple split works for standard CSV here)
          const cols = line.split(',');
          if (cols.length < headers.length) {
            invalidLines.push(line);
            continue;
          }
          
          const medidor = cols[idxMedidor].trim();
          const fechaStr = cols[idxFecha].trim();
          
          records.push({
            index: i,
            lineContent: line,
            medidor,
            fechaOriginal: fechaStr,
            timestamp: parseCustomDate(fechaStr)
          });
        }

        // Sort cronologically so we can get the first one of the day
        records.sort((a, b) => a.timestamp - b.timestamp);

        // Deduplicate: Keep only the first record for (medidor, date)
        const seen = new Set();
        const validLines = [];
        let duplicateCount = 0;

        for (const record of records) {
          // Extract date part only (MM/DD/AA) from "MM/DD/AA HH:MM"
          const dateOnly = record.fechaOriginal.split(' ')[0] || '';
          const uniqueKey = `${record.medidor}_${dateOnly}`;
          
          if (seen.has(uniqueKey)) {
            duplicateCount++;
          } else {
            seen.add(uniqueKey);
            validLines.push(record.lineContent);
          }
        }

        // Rebuild CSV content
        // Note: we want to keep the CSV in its original line sorting (or sorted cronologically, which is cleaner)
        // Let's output it sorted cronologically as it represents the correct timeline order
        const filteredCSVContent = [header, ...validLines].join('\n');
        
        const endTime = performance.now();
        const elapsedMs = Math.round(endTime - startTime);
        
        resolve({
          csvContent: filteredCSVContent,
          stats: {
            total: records.length,
            valid: validLines.length,
            duplicate: duplicateCount,
            percentRemoved: ((duplicateCount / records.length) * 100).toFixed(1),
            timeMs: elapsedMs
          }
        });
      };

      reader.onerror = () => {
        reject(new Error("Error leyendo el archivo local."));
      };

      reader.readAsText(file, 'latin1'); // Using latin1 to preserve encodings if any
    });
  };

  const uploadFile = async (stepId) => {
    const step = steps.find(s => s.id === stepId);
    const file = files[stepId];
    
    if (!file) {
      alert("Por favor selecciona o arrastra un archivo primero.");
      return;
    }

    setSteps(prev => prev.map(s => {
      if (s.id === stepId) {
        return { ...s, status: 'uploading', progress: 10 };
      }
      return s;
    }));

    try {
      let fileToUpload = file;
      
      // If Step 5 (Lecturas) and Client-side Filter is enabled, process the file first
      if (stepId === 5 && applyClientFilter) {
        setIsFiltering(true);
        setSteps(prev => prev.map(s => {
          if (s.id === stepId) {
            return { ...s, status: 'filtering', progress: 30 };
          }
          return s;
        }));
        
        // Wait a tiny bit for the UI to render the filtering state
        await new Promise(r => setTimeout(r, 400));
        
        try {
          const filterResult = await processLecturasCSV(file);
          setFilterStats(filterResult.stats);
          
          // Create new file blob
          const blob = new Blob([filterResult.csvContent], { type: 'text/csv' });
          fileToUpload = new File([blob], file.name, { type: 'text/csv' });
          
          setIsFiltering(false);
        } catch (filterErr) {
          setIsFiltering(false);
          throw new Error(`Filtrado local falló: ${filterErr.message}`);
        }
      }

      setSteps(prev => prev.map(s => {
        if (s.id === stepId) {
          return { ...s, status: 'uploading', progress: 50 };
        }
        return s;
      }));

      const formData = new FormData();
      formData.append("file", fileToUpload);

      const response = await fetch(`${apiUrl}${step.endpoint}`, {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        
        setSteps(prev => prev.map(s => {
          if (s.id === stepId) {
            return { 
              ...s, 
              status: 'success', 
              progress: 100, 
              result: {
                message: data.message,
                recordsInserted: data.records_inserted,
                elapsed: data.elapsed_seconds
              }
            };
          }
          // Enable next step if completed successfully
          if (s.id === stepId + 1) {
            return { ...s, status: 'idle' };
          }
          return s;
        }));

        if (stepId === 5) {
          // Play confetti effect or success alert
          alert("¡Carga Completa! Todos los datos han sido importados exitosamente a Apache Cassandra.");
        }

      } else {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `Error del servidor (${response.status})`);
      }

    } catch (err) {
      console.error(err);
      setSteps(prev => prev.map(s => {
        if (s.id === stepId) {
          return { 
            ...s, 
            status: 'error', 
            progress: 0,
            result: { error: err.message }
          };
        }
        return s;
      }));
    }
  };

  const clearStep = (stepId) => {
    setFiles(prev => {
      const updated = { ...prev };
      delete updated[stepId];
      return updated;
    });

    if (stepId === 5) {
      setFilterStats(null);
    }

    setSteps(prev => prev.map(s => {
      if (s.id === stepId) {
        return { ...s, status: 'idle', result: null, progress: 0 };
      }
      return s;
    }));
  };

  return (
    <div className="app-container">
      {/* Background Gradients */}
      <div className="bg-glow bg-glow-cyan"></div>
      <div className="bg-glow bg-glow-purple"></div>

      {/* Header */}
      <header className="glass-header">
        <div className="logo-area">
          <Sparkles className="logo-sparkle" />
          <h1>SEMAPA Ingestion</h1>
          <span className="badge-distribuido">Big Data Cassandra Cluster</span>
        </div>
        
        <div className="header-actions">
          <div className={`status-pill ${apiConnected ? 'online' : 'offline'}`}>
            <span className="pulse-dot"></span>
            <span>API: {apiConnected ? `Conectada (${assignedNode})` : 'Desconectada'}</span>
          </div>

          <button className="settings-btn" onClick={() => setShowSettings(!showSettings)}>
            <Settings size={18} />
          </button>
        </div>
      </header>

      {/* Settings Modal/Bar */}
      {showSettings && (
        <div className="settings-bar glass-panel animate-slide-down">
          <div className="settings-content">
            <label htmlFor="api-input">Dirección API del Backend (FastAPI):</label>
            <div className="input-group">
              <input 
                id="api-input"
                type="text" 
                value={tempApiUrl} 
                onChange={(e) => setTempApiUrl(e.target.value)} 
                placeholder="http://localhost:8000"
              />
              <button className="btn-primary" onClick={handleApplyApiUrl}>Guardar</button>
              <button className="btn-secondary" onClick={() => { setTempApiUrl(apiUrl); setShowSettings(false); }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Layout */}
      <main className="main-content">
        {/* Warning Banner if Node 2 is down */}
        {node2Status === 'DOWN (Falla)' && (
          <div className="warning-banner glass-panel animate-pulse-border">
            <ShieldAlert className="warning-icon" size={28} />
            <div className="warning-text">
              <h3>Modo Académico: Falla en el Anillo Cassandra (RF = 1)</h3>
              <p>
                El <strong>Nodo 2 (IP: 100.114.64.8)</strong> no responde. Dado que el factor de replicación del Keyspace 
                está configurado en <strong>RF = 1 (Sharding horizontal puro sin copias redundantes)</strong>, 
                cualquier dato cargado o consultado perteneciente al rango de tokens de la PC Secundaria fallará. 
                El Nodo 1 sigue operativo.
              </p>
            </div>
          </div>
        )}

        <div className="dashboard-grid">
          {/* Left Column: Ingestion Steps */}
          <div className="ingestion-section">
            <div className="section-title">
              <h2>Carga Secuencial de Datos (ETL)</h2>
              <p>Arrastra los archivos CSV de tu carpeta local de datos en el orden sugerido.</p>
            </div>

            <div className="steps-container">
              {steps.map((step) => {
                const StepIcon = step.icon;
                const file = files[step.id];
                const isDisabled = step.status === 'disabled';
                const isUploading = step.status === 'uploading';
                const isFilteringState = step.status === 'filtering';
                const isSuccess = step.status === 'success';
                const isError = step.status === 'error';
                const isDragOver = dragOverStep === step.id;

                return (
                  <div 
                    key={step.id} 
                    className={`step-card glass-panel ${isDisabled ? 'disabled' : ''} ${isDragOver ? 'drag-over' : ''} ${isSuccess ? 'success-border' : ''} ${isError ? 'error-border' : ''}`}
                    onDragOver={(e) => !isDisabled && handleDragOver(e, step.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => !isDisabled && handleDrop(e, step.id)}
                  >
                    <div className="step-main">
                      <div className="step-badge">
                        <StepIcon size={20} className="step-icon-color" />
                      </div>
                      
                      <div className="step-details">
                        <h3>{step.name}</h3>
                        <p className="pattern-hint">Archivo esperado: <strong>{step.filePattern}</strong></p>
                        
                        {/* File Selector */}
                        {!isDisabled && !isSuccess && !isUploading && !isFilteringState && (
                          <div className="upload-actions">
                            <label className="custom-file-upload">
                              <input 
                                type="file" 
                                accept=".csv" 
                                onChange={(e) => handleFileChange(step.id, e.target.files[0])} 
                              />
                              Seleccionar Archivo
                            </label>
                            {file && <span className="file-name">{file.name} ({(file.size / (1024 * 1024)).toFixed(2)} MB)</span>}
                          </div>
                        )}

                        {/* File Name Display on Success/Uploading */}
                        {(isSuccess || isUploading || isFilteringState) && file && (
                          <div className="file-name-active">
                            <span>Archivo: {file.name}</span>
                          </div>
                        )}

                        {/* Custom view for Step 5 (Filter settings & stats) */}
                        {step.id === 5 && !isDisabled && (
                          <div className="step-custom-options">
                            <label className="checkbox-container">
                              <input 
                                type="checkbox" 
                                checked={applyClientFilter} 
                                onChange={(e) => setApplyClientFilter(e.target.checked)}
                                disabled={isUploading || isFilteringState || isSuccess}
                              />
                              <span className="checkmark"></span>
                              <div className="checkbox-label-content">
                                <span className="label-title"><Filter size={14} className="inline-icon" /> Filtro de Redundancia en el Cliente</span>
                                <span className="label-desc">Conserva solo la primera señal de cada medidor por día (Descarta los otros 2 duplicados redundantes).</span>
                              </div>
                            </label>

                            {/* Client filtering progress/stats */}
                            {isFilteringState && (
                              <div className="filter-loader animate-pulse">
                                <div className="spinner-small"></div>
                                <span>Deduplicando CSV en tiempo real (clasificando y ordenando por fecha)...</span>
                              </div>
                            )}

                            {filterStats && (
                              <div className="filter-stats-panel glass-inner">
                                <h4>Estadísticas de Deduplicación Local:</h4>
                                <div className="stats-grid">
                                  <div className="stat-box">
                                    <span className="stat-num">{filterStats.total.toLocaleString()}</span>
                                    <span className="stat-lbl">Señales Totales</span>
                                  </div>
                                  <div className="stat-box box-success">
                                    <span className="stat-num">{filterStats.valid.toLocaleString()}</span>
                                    <span className="stat-lbl">Señales Válidas (1ª del día)</span>
                                  </div>
                                  <div className="stat-box box-warning">
                                    <span className="stat-num">{filterStats.duplicate.toLocaleString()}</span>
                                    <span className="stat-lbl">Señales Redundantes Removidas</span>
                                  </div>
                                  <div className="stat-box box-purple">
                                    <span className="stat-num">{filterStats.percentRemoved}%</span>
                                    <span className="stat-lbl">% Reducido</span>
                                  </div>
                                </div>
                                <p className="stats-time">Procesado local en {filterStats.timeMs} ms</p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Upload progress bar */}
                        {(isUploading || isFilteringState) && (
                          <div className="progress-container">
                            <div className="progress-bar" style={{ width: `${step.progress}%` }}></div>
                            <span className="progress-text">{step.progress}% {isFilteringState ? 'Filtrando...' : 'Subiendo a Cassandra...'}</span>
                          </div>
                        )}

                        {/* Results / Error messages */}
                        {isSuccess && step.result && (
                          <div className="result-panel success-panel animate-fade-in">
                            <CheckCircle2 size={16} />
                            <div>
                              <strong>Cargado con éxito:</strong> {step.result.message} <br />
                              <span className="result-subtext">Insertados: {step.result.recordsInserted.toLocaleString()} registros | Tiempo de base de datos: {step.result.elapsed}s</span>
                            </div>
                          </div>
                        )}

                        {isError && step.result && (
                          <div className="result-panel error-panel animate-fade-in">
                            <AlertCircle size={16} />
                            <div>
                              <strong>Falla en la carga:</strong> {step.result.error}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="step-actions">
                      {!isDisabled && !isSuccess && !isUploading && !isFilteringState && (
                        <button 
                          className="action-btn upload-btn" 
                          disabled={!file || !apiConnected}
                          onClick={() => uploadFile(step.id)}
                          title={!apiConnected ? "API no conectada" : "Subir archivo"}
                        >
                          <UploadCloud size={16} /> Subir
                        </button>
                      )}
                      
                      {isSuccess && (
                        <div className="success-badge">
                          <CheckCircle2 size={18} className="success-icon" /> Listo
                        </div>
                      )}

                      {(isUploading || isFilteringState) && (
                        <div className="loader-container">
                          <div className="spinner"></div>
                        </div>
                      )}

                      {!isDisabled && !isUploading && !isFilteringState && (file || isError || isSuccess) && (
                        <button 
                          className="action-btn clear-btn" 
                          onClick={() => clearStep(step.id)}
                          title="Limpiar paso"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Cluster Topology Monitor */}
          <div className="cluster-section">
            <div className="section-title">
              <h2>Topología del Clúster Cassandra</h2>
              <p>Monitoreo físico y virtual en tiempo real (Tailscale VPN).</p>
            </div>

            <div className="topology-card glass-panel">
              {/* Dynamic node naming variables */}
              {(() => {
                const isNode8Local = window.location.hostname === '100.114.64.8' || 
                                     window.location.hostname === 'localhost' || 
                                     window.location.hostname === '127.0.0.1' || 
                                     apiUrl.includes('100.114.64.8');
                
                const node1Label = isNode8Local ? "PC de tu Compañero (Mani)" : "Tu PC (Principal - Seed)";
                const node2Label = isNode8Local ? "Tu PC (Secundaria - Local)" : "PC de tu Compañero (Secundaria)";

                return (
                  <>
                    {/* PC 1 Node */}
                    <div className="node-item">
                      <div className="node-item-header">
                        <div className="node-icon-box">
                          <Server size={22} className="server-icon" />
                        </div>
                        <div className="node-name-details">
                          <h4>{node1Label}</h4>
                          <span className="node-ip">IP: 100.71.121.5</span>
                        </div>
                        <span className={`node-badge ${node1Status.includes('UP') ? 'status-up' : 'status-down'}`}>
                          {node1Status}
                        </span>
                      </div>
                      <div className="node-meta">
                        <div className="meta-row">
                          <span className="lbl">Rol:</span>
                          <span className="val text-highlight">Seed / Coordinador</span>
                        </div>
                        <div className="meta-row">
                          <span className="lbl">Servicios:</span>
                          <span className="val">Cassandra + FastAPI + React UI</span>
                        </div>
                        <div className="meta-row">
                          <span className="lbl">Tokens:</span>
                          <span className="val">16 (vnodes)</span>
                        </div>
                      </div>
                    </div>

                    {/* Network Wire */}
                    <div className="network-wire-container">
                      <div className="wire-label">
                        <Activity size={12} className="wire-icon" />
                        <span>Malla Mesh Tailscale (Puerto 7000 Gossip)</span>
                      </div>
                      <div className={`wire-line ${node2Status.includes('UP') ? 'wire-active' : 'wire-broken'}`}>
                        <div className="wire-pulse"></div>
                      </div>
                    </div>

                    {/* PC 2 Node */}
                    <div className="node-item">
                      <div className="node-item-header">
                        <div className="node-icon-box">
                          <Server size={22} className="server-icon" />
                        </div>
                        <div className="node-name-details">
                          <h4>{node2Label}</h4>
                          <span className="node-ip">IP: 100.114.64.8</span>
                        </div>
                        <span className={`node-badge ${node2Status.includes('UP') ? 'status-up' : 'status-down'}`}>
                          {node2Status}
                        </span>
                      </div>
                      <div className="node-meta">
                        <div className="meta-row">
                          <span className="lbl">Rol:</span>
                          <span className="val">Miembro del Anillo</span>
                        </div>
                        <div className="meta-row">
                          <span className="lbl">Servicios:</span>
                          <span className="val">Cassandra Nodo 2</span>
                        </div>
                        <div className="meta-row">
                          <span className="lbl">Tokens:</span>
                          <span className="val">16 (vnodes)</span>
                        </div>
                      </div>

                      {/* Interactive Demo failure toggle buttons */}
                      {apiConnected && node1Status === 'UP (Normal)' && (
                        <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                          {!simulatedFailure ? (
                            <button 
                              onClick={() => {
                                setSimulatedFailure(true);
                                setNode2Status('DOWN (Falla)');
                              }}
                              style={{
                                background: 'rgba(239, 68, 68, 0.1)',
                                border: '1px solid rgba(239, 68, 68, 0.25)',
                                color: '#ef4444',
                                fontSize: '0.75rem',
                                padding: '0.3rem 0.6rem',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                              }}
                            >
                              Simular Caída de Nodo 2
                            </button>
                          ) : (
                            <button 
                              onClick={() => {
                                setSimulatedFailure(false);
                                setNode2Status('UP (Normal)');
                              }}
                              style={{
                                background: 'rgba(16, 185, 129, 0.1)',
                                border: '1px solid rgba(16, 185, 129, 0.25)',
                                color: '#10b981',
                                fontSize: '0.75rem',
                                padding: '0.3rem 0.6rem',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                              }}
                            >
                              Restaurar Conexión Nodo 2
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Cassandra Terminal / Nodetool View */}
            <div className="terminal-section glass-panel">
              <div className="terminal-header">
                <div className="dots-group">
                  <span className="dot red"></span>
                  <span className="dot yellow"></span>
                  <span className="dot green"></span>
                </div>
                <span className="terminal-title">docker exec -it cassandra-node1 nodetool status</span>
                <button className="refresh-terminal-btn" onClick={checkConnection} disabled={checkingConnection}>
                  <RefreshCw size={14} className={checkingConnection ? 'spin' : ''} />
                </button>
              </div>
              <pre className="terminal-body">
                <code>{cassandraLogs}</code>
              </pre>
            </div>
          </div>
        </div>
      </main>

      <footer className="glass-footer">
        <p>SEMAPA Cochabamba - Ingeniería de Sistemas Distribuidos © 2026</p>
      </footer>
    </div>
  );
}

export default App;
