/**
 * CitizenKiosk.jsx — Tótem de Autoservicio Ciudadano SEMAPA
 *
 * Diseño Kiosk-First: botones ≥ 64px de alto, tipografía grande, sin teclado físico.
 * Colores institucionales: azul oscuro (sky-900), celeste (sky-600), blanco.
 *
 * Conectado con la base de datos de SEMAPA mediante API.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

const IDLE_TIMEOUT_MS = 60_000; // 60s sin interacción → volver a home
const STRESS_LIMIT_M3 = 45;     // m³/mes — umbral estrés hídrico

const KIOSK_LOCATION = 'Oficina Central SEMAPA — Av. Uyuni';

// ── Componentes de UI reutilizables ─────────────────────────────────────────────

const KioskButton = ({ onClick, children, variant = 'primary', className = '', disabled = false }) => {
  const base = 'min-h-[72px] px-8 py-4 rounded-2xl font-extrabold text-xl transition-all active:scale-95 select-none flex items-center justify-center gap-3 shadow-lg';
  const variants = {
    primary:   'bg-sky-600 hover:bg-sky-700 text-white',
    secondary: 'bg-slate-700 hover:bg-slate-800 text-white',
    success:   'bg-emerald-600 hover:bg-emerald-700 text-white',
    danger:    'bg-red-600 hover:bg-red-700 text-white',
    outline:   'border-4 border-sky-600 text-sky-700 hover:bg-sky-50 bg-white',
    warning:   'bg-amber-500 hover:bg-amber-600 text-white',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variants[variant]} ${disabled ? 'opacity-40 cursor-not-allowed' : ''} ${className}`}
    >
      {children}
    </button>
  );
};

const TopBar = ({ title, onBack, onExit }) => (
  <div className="flex items-center justify-between mb-8 gap-4">
    <button
      onClick={onBack}
      className="min-h-[64px] shrink-0 flex items-center gap-2 bg-slate-700 hover:bg-slate-800 text-white px-6 py-3 rounded-2xl text-xl font-bold transition active:scale-95 shadow"
    >
      ← Volver al Menú
    </button>
    <h2 className="text-2xl sm:text-3xl font-extrabold text-sky-900 text-center flex-1 leading-tight">
      {title}
    </h2>
    <button
      onClick={onExit}
      className="min-h-[64px] shrink-0 flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-2xl text-xl font-bold transition active:scale-95 shadow"
      aria-label="Salir y volver al inicio"
    >
      ✕ Salir
    </button>
  </div>
);

const NumericKeypad = ({ value, onChange, maxLength = 8 }) => {
  const press = (key) => {
    if (key === 'del') return onChange(value.slice(0, -1));
    if (value.length < maxLength) onChange(value + key);
  };

  return (
    <div className="w-full max-w-xs mx-auto select-none">
      <div className="grid grid-cols-3 gap-3">
        {['1','2','3','4','5','6','7','8','9'].map(k => (
          <button
            key={k}
            onClick={() => press(k)}
            className="h-20 rounded-2xl bg-sky-700 hover:bg-sky-800 text-white text-3xl font-extrabold shadow active:scale-95 transition"
          >
            {k}
          </button>
        ))}
        <button
          onClick={() => press('del')}
          className="h-20 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white text-2xl font-extrabold shadow active:scale-95 transition"
        >
          ⌫
        </button>
        <button
          onClick={() => press('0')}
          className="h-20 rounded-2xl bg-sky-700 hover:bg-sky-800 text-white text-3xl font-extrabold shadow active:scale-95 transition"
        >
          0
        </button>
        <div />
      </div>
    </div>
  );
};

const ExtensionSelector = ({ value, onChange }) => {
  const EXTENSIONES = ['LP', 'SC', 'CBBA'];
  return (
    <div className="w-full max-w-xs mx-auto select-none">
      <p className="text-center text-slate-500 text-sm mb-2 font-semibold">
        Extensión C.I. <span className="font-normal">(opcional)</span>
      </p>
      <div className="flex gap-2 justify-center">
        {EXTENSIONES.map(ext => (
          <button
            key={ext}
            onClick={() => onChange(value === ext ? '' : ext)}
            className={`flex-1 py-3 rounded-xl text-lg font-bold border-2 transition active:scale-95
              ${value === ext
                ? 'bg-sky-700 text-white border-sky-700 shadow-lg'
                : 'bg-white text-slate-700 border-slate-300 hover:border-sky-400'
              }`}
          >
            {ext}
          </button>
        ))}
      </div>
    </div>
  );
};

// ── 1. HOME / SALVAPANTALLAS ──────────────────────────────────────────────────
const HomeScreen = ({ onStart, onToggleSettings, showSettings, inputUrl, setInputUrl, onSaveSettings }) => (
  <div
    className="min-h-screen bg-gradient-to-b from-sky-800 via-sky-900 to-slate-900 flex flex-col items-center justify-center gap-10 px-8 cursor-pointer select-none relative"
    onClick={(e) => {
      // Don't trigger start if clicking settings container
      if (e.target.closest('.settings-container')) return;
      onStart();
    }}
    role="button"
    aria-label="Toque para comenzar"
  >
    {/* Botón de configuración */}
    <div className="absolute top-6 right-6 settings-container">
      <button
        onClick={onToggleSettings}
        className="p-3 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-2xl shadow-xl transition"
        aria-label="Configuración de API"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
          <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
          <path fillRule="evenodd" d="M1.328 12.75a.75.75 0 0 1 0-1.5 9 9 0 0 1 2.274-5.32 9.002 9.002 0 0 1 12.825 0 9 9 0 0 1 2.274 5.32.75.75 0 0 1 0 1.5 9 9 0 0 1-2.274 5.32 9.002 9.002 0 0 1-12.825 0 9 9 0 0 1-2.274-5.32Zm16.711-2.6a6.002 6.002 0 0 0-11.97 0 6.002 6.002 0 0 0 11.97 0Z" clipRule="evenodd" />
        </svg>
      </button>

      {showSettings && (
        <div className="absolute right-0 mt-3 w-80 bg-white text-slate-800 rounded-3xl p-5 shadow-2xl border border-slate-200 z-50 animate-fade-in space-y-4">
          <h3 className="font-extrabold text-lg text-sky-900">Configuración de API</h3>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">URL BACKEND API:</label>
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-sky-500"
              placeholder="http://localhost:8000"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={onSaveSettings}
              className="px-4 py-2 bg-sky-700 text-white font-bold text-sm rounded-xl hover:bg-sky-800"
            >
              Guardar
            </button>
          </div>
        </div>
      )}
    </div>

    <div className="flex flex-col items-center gap-4">
      <div className="w-36 h-36 rounded-full bg-white/10 border-4 border-white/20 flex items-center justify-center shadow-2xl">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" className="w-24 h-24" aria-hidden="true">
          <path fillRule="evenodd" d="M11.484 2.17a.75.75 0 0 1 1.032 0 11.209 11.209 0 0 0 7.877 3.08.75.75 0 0 1 .722.515 12.74 12.74 0 0 1 .635 3.985c0 5.942-4.064 10.933-9.563 12.348a.749.749 0 0 1-.374 0C6.314 20.683 2.25 15.692 2.25 9.75c0-1.39.223-2.73.635-3.985a.75.75 0 0 1 .722-.516l.143.001c2.996 0 5.718-1.17 7.734-3.08Z" clipRule="evenodd" />
        </svg>
      </div>
      <span className="text-white/60 text-2xl font-bold tracking-[.3em] uppercase">SEMAPA</span>
    </div>

    <div className="text-center space-y-3 max-w-2xl">
      <h1 className="text-5xl sm:text-6xl font-extrabold text-white leading-tight drop-shadow-xl">
        Bienvenido al Sistema de Autoservicio SEMAPA
      </h1>
      <p className="text-sky-300 text-2xl">
        Servicio Municipal de Agua Potable y Alcantarillado — Cochabamba
      </p>
    </div>

    <button className="mt-6 bg-white text-sky-900 px-14 py-8 rounded-3xl text-3xl font-extrabold shadow-2xl animate-pulse">
      Toque la pantalla para comenzar
    </button>

    <p className="text-sky-400 text-lg">{KIOSK_LOCATION}</p>
  </div>
);

// ── 2. MENÚ PRINCIPAL ──────────────────────────────────────────────────────────
const MenuScreen = ({ onSelect, onExit }) => {
  const options = [
    {
      id: 'debt',
      lines: ['Consulta de Deuda e', 'Impresión de Preaviso'],
      emoji: '💧',
      bg: 'bg-sky-700 hover:bg-sky-800',
    },
    {
      id: 'history',
      lines: ['Historial de Consumo'],
      emoji: '📊',
      bg: 'bg-sky-600 hover:bg-sky-700',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-sky-700 flex items-center justify-center shadow-md">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" className="w-8 h-8" aria-hidden="true">
              <path fillRule="evenodd" d="M11.484 2.17a.75.75 0 0 1 1.032 0 11.209 11.209 0 0 0 7.877 3.08.75.75 0 0 1 .722.515 12.74 12.74 0 0 1 .635 3.985c0 5.942-4.064 10.933-9.563 12.348a.749.749 0 0 1-.374 0C6.314 20.683 2.25 15.692 2.25 9.75c0-1.39.223-2.73.635-3.985a.75.75 0 0 1 .722-.516l.143.001c2.996 0 5.718-1.17 7.734-3.08Z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-sky-900">Autoservicio SEMAPA</h1>
            <p className="text-slate-500 text-base">{KIOSK_LOCATION}</p>
          </div>
        </div>
        <button
          onClick={onExit}
          className="min-h-[64px] bg-red-600 hover:bg-red-700 text-white px-8 py-3 rounded-2xl text-xl font-extrabold shadow active:scale-95 transition"
        >
          ✕ Salir
        </button>
      </div>

      <h2 className="text-2xl font-bold text-slate-500 mb-6 pl-1">¿Qué desea hacer hoy?</h2>

      <div className="grid grid-cols-2 gap-5 flex-1 items-stretch">
        {options.map(({ id, lines, emoji, bg }) => (
          <button
            key={id}
            onClick={() => onSelect(id)}
            className={`${bg} text-white rounded-3xl shadow-xl p-8 flex flex-col items-center justify-center gap-5 text-2xl font-extrabold leading-snug active:scale-95 transition-transform min-h-[300px] text-center`}
          >
            <span className="text-6xl">{emoji}</span>
            {lines.map((l, i) => <span key={i} className="block">{l}</span>)}
          </button>
        ))}
      </div>

      <p className="text-center text-slate-400 text-sm mt-5">
        La sesión se cerrará automáticamente tras 60 s de inactividad.
      </p>
    </div>
  );
};

// ── 3. FLUJO DE CONSULTA DE DEUDA Y PREAVISO ─────────────────────────────────────
const DebtScreen = ({ onBack, onExit, apiUrl }) => {
  const [carnet, setCarnet] = useState('');
  const [extension, setExtension] = useState('');
  const [result, setResult] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedContract, setSelectedContract] = useState(null);
  
  // Enviar factura por correo
  const [emailAddress, setEmailAddress] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState({ success: false, msg: '' });

  const ciDisplay = carnet + (extension ? ` ${extension}` : '');

  const hasMultipleContracts = result && result.contracts && result.contracts.length > 1;

  let totalLastConsumo = 0;
  let totalLastMonto = 0;
  let contractsWithLecturaCount = 0;
  let totalMonthsUnpaid = 0;

  if (result && result.contracts) {
    result.contracts.forEach(c => {
      totalMonthsUnpaid += c.meses_impagos || 0;
      if (c.ultima_lectura) {
        totalLastConsumo += c.ultima_lectura.consumo_m3 || 0;
        totalLastMonto += c.ultima_lectura.monto_facturado_bs || 0;
        contractsWithLecturaCount++;
      }
    });
  }

  const handleSearch = async () => {
    setLoading(true);
    setNotFound(false);
    setResult(null);
    setSelectedContract(null);

    try {
      const formattedCi = carnet + (extension ? ` ${extension}` : '');
      const res = await fetch(`${apiUrl}/totem/deuda/${encodeURIComponent(formattedCi)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.contracts && data.contracts.length > 0) {
          setResult(data);
          setSelectedContract(data.contracts[0]); // Seleccionar el primero por defecto
        } else {
          setNotFound(true);
        }
      } else {
        setNotFound(true);
      }
    } catch (err) {
      console.error(err);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = async (contract) => {
    try {
      setLoading(true);
      const res = await fetch(`${apiUrl}/totem/preaviso/${encodeURIComponent(contract.numero_contrato)}`);
      if (res.ok) {
        const data = await res.json();
        // Mostrar alerta simulando la impresión térmica
        alert(
          `🖨️ IMPRIMIENDO PREAVISO DE COBRANZA\n` +
          `==================================\n` +
          `Contrato: ${data.numero_contrato}\n` +
          `Titular: ${data.titular_contrato}\n` +
          `Último Consumo: ${data.ultimo_consumo_m3} m³\n` +
          `Monto Último Mes: Bs. ${data.monto_ultimo_mes_bs.toFixed(2)}\n` +
          `Deuda Exigible: Bs. ${data.deuda_total_bs.toFixed(2)}\n` +
          `==================================\n` +
          `Descargas oficiales de preaviso:\n` +
          `- Formato Rollo 55mm: ${data.pdf_descarga_roll_55mm}\n` +
          `- Formato Media Carta: ${data.pdf_descarga_media_carta}`
        );
      } else {
        alert("Error al generar el preaviso de cobranza.");
      }
    } catch (err) {
      alert("Error al conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  const handleSendEmail = async () => {
    if (!emailAddress.trim()) {
      setEmailResult({ success: false, msg: 'Por favor ingrese un correo válido.' });
      return;
    }
    
    setEmailSending(true);
    setEmailResult({ success: false, msg: '' });

    try {
      const res = await fetch(`${apiUrl}/totem/enviar-preaviso`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contrato: selectedContract.numero_contrato,
          email: emailAddress.trim()
        })
      });

      if (res.ok) {
        const data = await res.json();
        setEmailResult({
          success: true,
          msg: data.message || `Factura y preavisos (Rollo + Media Carta) enviados con éxito a: ${emailAddress}`
        });
      } else {
        const err = await res.json();
        setEmailResult({
          success: false,
          msg: err.detail || 'Ocurrió un error al enviar el correo.'
        });
      }
    } catch (err) {
      setEmailResult({
        success: false,
        msg: 'No se pudo conectar con el servidor.'
      });
    } finally {
      setEmailSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col px-6 py-8">
      <TopBar title="Consulta de Deuda y Preaviso" onBack={onBack} onExit={onExit} />

      {/* Pantalla 1: Ingreso de C.I. */}
      {!result && (
        <div className="flex flex-col gap-6 items-center max-w-sm mx-auto w-full">
          <div className="bg-white rounded-3xl shadow p-6 text-center w-full">
            <p className="text-xl text-slate-600 font-semibold mb-1">Ingrese su número de Carnet de Identidad</p>
            <p className="text-slate-400 text-base">Use el teclado numérico de la pantalla</p>
            {notFound && (
              <div role="alert" className="mt-4 bg-red-50 border-2 border-red-300 rounded-2xl p-4 text-red-700 text-lg font-semibold">
                ⚠ CI no registrado con ningun contrato de agua.
              </div>
            )}
          </div>

          {/* Display & Search Button side-by-side */}
          <div className="flex gap-3 w-full max-w-sm mb-2 items-stretch">
            <div className="bg-white border-4 border-sky-400 rounded-2xl px-6 py-4 text-center shadow-inner flex-1 flex items-center justify-center min-h-[72px]">
              {carnet ? (
                <span className="text-3xl font-mono font-bold text-sky-900 tracking-widest">{ciDisplay}</span>
              ) : (
                <span className="text-3xl font-mono text-slate-300">_ _ _ _ _ _</span>
              )}
            </div>
            <button
              onClick={handleSearch}
              disabled={carnet.length < 5 || loading}
              className="min-h-[72px] px-6 bg-sky-600 hover:bg-sky-700 text-white rounded-2xl font-extrabold text-xl shadow-lg transition active:scale-95 disabled:opacity-40"
            >
              {loading ? "..." : "Buscar"}
            </button>
          </div>

          <NumericKeypad value={carnet} onChange={setCarnet} maxLength={8} />
          <ExtensionSelector value={extension} onChange={setExtension} />
        </div>
      )}

      {/* Pantalla 2: Listado de contratos y Deuda */}
      {result && (
        <div className="flex flex-col gap-6 max-w-3xl mx-auto w-full">
          <div className="bg-white rounded-3xl shadow-xl p-8 space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-3 h-14 rounded-full bg-sky-600 shrink-0" />
              <div>
                <p className="text-3xl font-extrabold text-sky-900">{result.titular_contrato}</p>
                <p className="text-slate-500 text-lg">C.I. {result.ci_titular}</p>
              </div>
            </div>

            {/* Total Consolidado / Resumen de Gastos */}
            {hasMultipleContracts ? (
              <div className="bg-sky-50 border-2 border-sky-200 rounded-3xl p-6 space-y-4">
                <h3 className="text-xl font-extrabold text-sky-900 flex items-center gap-2">
                  <span>🏢</span> Resumen Consolidado de Gastos (Cuentas Múltiples)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-sky-100 flex flex-col justify-center min-h-[100px]">
                    <span className="text-xs font-bold text-slate-400 block uppercase tracking-wider">Consumo Total del Mes</span>
                    <span className="text-2xl font-black text-sky-800">{totalLastConsumo} m³</span>
                    <span className="text-xs text-slate-400 block mt-1">({contractsWithLecturaCount} de {result.contracts.length} medidores)</span>
                  </div>
                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-sky-100 flex flex-col justify-center min-h-[100px]">
                    <span className="text-xs font-bold text-slate-400 block uppercase tracking-wider">Gasto Total del Mes</span>
                    <span className="text-2xl font-black text-emerald-600">Bs. {totalLastMonto.toFixed(2)}</span>
                    <span className="text-xs text-slate-400 block mt-1">(Último período)</span>
                  </div>
                  <div className={`p-4 rounded-2xl shadow-sm border flex flex-col justify-center min-h-[100px] ${result.total_debt_bs > 0 ? 'bg-red-50/80 border-red-200' : 'bg-emerald-50/80 border-emerald-200'}`}>
                    <span className="text-xs font-bold text-slate-400 block uppercase tracking-wider">Deuda Total Exigible</span>
                    <span className={`text-2xl font-black ${result.total_debt_bs > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {result.total_debt_bs > 0 ? `Bs. ${result.total_debt_bs.toFixed(2)}` : '✓ Al día'}
                    </span>
                    {result.total_debt_bs > 0 && (
                      <span className="text-xs text-red-500 font-bold block mt-1">({totalMonthsUnpaid} meses impagos)</span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className={`rounded-2xl p-6 text-center ${result.total_debt_bs > 0 ? 'bg-red-50 border-2 border-red-300' : 'bg-emerald-50 border-2 border-emerald-300'}`}>
                <p className="text-xl text-slate-500 mb-1">Monto Total Exigible</p>
                <p className={`text-5xl font-extrabold ${result.total_debt_bs > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {result.total_debt_bs > 0 ? `Bs. ${result.total_debt_bs.toFixed(2)}` : '✓ Al día'}
                </p>
              </div>
            )}

            {/* Listado de Contratos */}
            <div>
              <p className="text-lg font-extrabold text-slate-700 mb-3">Seleccione el contrato para preaviso/factura:</p>
              <div className="grid grid-cols-1 gap-3">
                {result.contracts.map((c) => (
                  <button
                    key={c.numero_contrato}
                    onClick={() => {
                      setSelectedContract(c);
                      setEmailResult({ success: false, msg: '' });
                    }}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between p-5 rounded-2xl border-4 text-left transition ${
                      selectedContract?.numero_contrato === c.numero_contrato
                        ? 'border-sky-600 bg-sky-50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <p className="font-extrabold text-sky-900 text-lg">Contrato: {c.numero_contrato}</p>
                      <p className="text-sm text-slate-500">Medidor: {c.medidor_iot || 'N/A'} · Categoria: {c.categoria} ({c.subcategoria})</p>
                      {c.ultima_lectura && (
                        <p className="text-xs text-slate-500 mt-1 font-semibold">
                          Última lectura: <span className="text-sky-700 font-bold">{c.ultima_lectura.lectura_actual} m³</span> ({new Date(c.ultima_lectura.fecha_hora).toLocaleDateString('es-BO')})
                        </p>
                      )}
                    </div>
                    <div className="text-right mt-2 sm:mt-0">
                      <span className={`text-lg font-extrabold ${c.deuda_contrato_bs > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {c.deuda_contrato_bs > 0 ? `Bs. ${c.deuda_contrato_bs.toFixed(2)}` : '✓ Sin Deuda'}
                      </span>
                      {c.meses_impagos > 0 && (
                        <p className="text-xs text-red-500 font-bold mt-0.5">({c.meses_impagos} {c.meses_impagos === 1 ? 'mes impago' : 'meses impagos'})</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Detalles de la última lectura para el contrato seleccionado */}
          {selectedContract && (
            <div className="bg-white rounded-3xl shadow-xl p-8 space-y-4">
              <h4 className="text-xl font-extrabold text-sky-900 flex items-center gap-2">
                <span>📊</span> Datos de la Última Lectura de Agua
              </h4>
              {selectedContract.ultima_lectura ? (
                <div className="grid grid-cols-2 gap-4 bg-sky-50/50 border-2 border-sky-100 rounded-2xl p-5 text-sm">
                  <div>
                    <span className="font-semibold text-slate-500 block">Fecha de Lectura:</span>
                    <span className="font-bold text-slate-800 text-base">
                      {new Date(selectedContract.ultima_lectura.fecha_hora).toLocaleDateString('es-BO')}
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-500 block">Lectura Registrada (m³):</span>
                    <span className="font-bold text-slate-800 text-base">
                      {selectedContract.ultima_lectura.lectura_actual}
                    </span>
                  </div>
                  <div className="col-span-2 border-t border-sky-100/75 my-1" />
                  <div>
                    <span className="font-semibold text-slate-500 block">Consumo del Período:</span>
                    <span className="font-bold text-sky-800 text-lg">
                      {selectedContract.ultima_lectura.consumo_m3} m³
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-500 block">Monto del Mes:</span>
                    <span className="font-bold text-emerald-600 text-lg">
                      Bs. {selectedContract.ultima_lectura.monto_facturado_bs.toFixed(2)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="border border-dashed border-slate-300 rounded-2xl p-6 text-center text-slate-400 text-base font-semibold">
                  No se registran lecturas en la base de datos para este medidor.
                </div>
              )}
            </div>
          )}

          {/* Acciones para el contrato seleccionado */}
          {selectedContract && (
            <div className="flex flex-col gap-6">
              {/* Sección de envío de correo */}
              <div className="bg-white rounded-3xl p-6 shadow-xl border border-slate-200 space-y-4">
                <h4 className="text-xl font-extrabold text-sky-900 flex items-center gap-2">
                  <span>✉️</span> Enviar Preaviso a su Correo Electrónico
                </h4>
                <p className="text-slate-500 text-sm">Ingrese su dirección de correo electrónico real para recibir el preaviso de cobro con los 2 PDFs oficiales adjuntos (Rollo 55mm + Media Carta):</p>
                
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={emailAddress}
                    onChange={(e) => setEmailAddress(e.target.value)}
                    placeholder="ejemplo@correo.com"
                    className="flex-1 rounded-2xl border-4 border-sky-200 px-4 py-3 text-lg text-slate-800 outline-none focus:border-sky-600"
                  />
                  <KioskButton
                    variant="success"
                    onClick={handleSendEmail}
                    disabled={emailSending}
                    className="shrink-0 min-h-[56px] px-6"
                  >
                    {emailSending ? "Enviando..." : "Enviar Ahora"}
                  </KioskButton>
                </div>

                {emailResult.msg && (
                  <div className={`p-4 rounded-xl border-2 font-semibold ${emailResult.success ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-red-50 border-red-300 text-red-700'}`}>
                    {emailResult.msg}
                  </div>
                )}
              </div>

              <KioskButton variant="outline" onClick={() => { setResult(null); setCarnet(''); setExtension(''); setNotFound(false); setSelectedContract(null); setEmailResult({ success: false, msg: '' }); }} className="w-full text-xl">
                🔄 Consultar Otro C.I.
              </KioskButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── 4. FLUJO DE HISTORIAL DE CONSUMO ──────────────────────────────────────────────
const HistoryScreen = ({ onBack, onExit, apiUrl }) => {
  const [carnet, setCarnet] = useState('');
  const [extension, setExtension] = useState('');
  const [contractsResult, setContractsResult] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Contrato seleccionado e historial
  const [selectedContract, setSelectedContract] = useState(null);
  const [consumptionHistory, setConsumptionHistory] = useState(null);
  const [historyError, setHistoryError] = useState('');

  // Enviar factura/preaviso por correo
  const [emailAddress, setEmailAddress] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState({ success: false, msg: '' });

  const ciDisplay = carnet + (extension ? ` ${extension}` : '');

  const hasMultipleContracts = contractsResult && contractsResult.contracts && contractsResult.contracts.length > 1;

  let totalLastConsumo = 0;
  let totalLastMonto = 0;
  let contractsWithLecturaCount = 0;
  let totalMonthsUnpaid = 0;

  if (contractsResult && contractsResult.contracts) {
    contractsResult.contracts.forEach(c => {
      totalMonthsUnpaid += c.meses_impagos || 0;
      if (c.ultima_lectura) {
        totalLastConsumo += c.ultima_lectura.consumo_m3 || 0;
        totalLastMonto += c.ultima_lectura.monto_facturado_bs || 0;
        contractsWithLecturaCount++;
      }
    });
  }

  const handleSearchContracts = async () => {
    setLoading(true);
    setNotFound(false);
    setContractsResult(null);
    setSelectedContract(null);
    setConsumptionHistory(null);
    setEmailAddress('');
    setEmailResult({ success: false, msg: '' });

    try {
      const formattedCi = carnet + (extension ? ` ${extension}` : '');
      const res = await fetch(`${apiUrl}/totem/deuda/${encodeURIComponent(formattedCi)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.contracts && data.contracts.length > 0) {
          setContractsResult(data);
        } else {
          setNotFound(true);
        }
      } else {
        setNotFound(true);
      }
    } catch (err) {
      console.error(err);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectContract = async (contract) => {
    setSelectedContract(contract);
    setConsumptionHistory(null);
    setHistoryError('');
    setLoading(true);
    setEmailAddress('');
    setEmailResult({ success: false, msg: '' });

    try {
      const res = await fetch(`${apiUrl}/totem/consumo/${encodeURIComponent(contract.numero_contrato)}`);
      if (res.ok) {
        const data = await res.json();
        // El historial llega en historial_consumos. Invertimos el orden para mostrar el más antiguo primero en la gráfica
        const cleanHistory = (data.historial_consumos || []).reverse();
        setConsumptionHistory(cleanHistory);
      } else {
        setHistoryError("No se pudo obtener el historial para este contrato.");
      }
    } catch (err) {
      setHistoryError("Error al conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  const handleSendEmail = async () => {
    if (!emailAddress.trim()) {
      setEmailResult({ success: false, msg: 'Por favor ingrese un correo válido.' });
      return;
    }
    
    setEmailSending(true);
    setEmailResult({ success: false, msg: '' });

    try {
      const res = await fetch(`${apiUrl}/totem/enviar-preaviso`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contrato: selectedContract.numero_contrato,
          email: emailAddress.trim()
        })
      });

      if (res.ok) {
        const data = await res.json();
        setEmailResult({
          success: true,
          msg: data.message || `Factura y preavisos (Rollo + Media Carta) enviados con éxito a: ${emailAddress}`
        });
      } else {
        const err = await res.json();
        setEmailResult({
          success: false,
          msg: err.detail || 'Ocurrió un error al enviar el correo.'
        });
      }
    } catch (err) {
      setEmailResult({
        success: false,
        msg: 'No se pudo conectar con el servidor.'
      });
    } finally {
      setEmailSending(false);
    }
  };

  // Preparar cálculos de gráficos
  const maxM3 = consumptionHistory && consumptionHistory.length > 0
    ? Math.max(...consumptionHistory.map(d => d.consumo_m3), 1)
    : 1;

  const totalM3 = consumptionHistory
    ? consumptionHistory.reduce((s, d) => s + d.consumo_m3, 0)
    : 0;

  const hasAlert = consumptionHistory
    ? consumptionHistory.some(d => d.consumo_m3 > STRESS_LIMIT_M3)
    : false;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col px-6 py-8">
      <TopBar title="Historial de Consumo" onBack={onBack} onExit={onExit} />

      {/* Pantalla 1: Ingreso de C.I. */}
      {!contractsResult && (
        <div className="flex flex-col gap-6 items-center max-w-sm mx-auto w-full">
          <div className="bg-white rounded-3xl shadow p-6 text-center w-full">
            <p className="text-xl text-slate-600 font-semibold mb-1">Ingrese su número de Carnet de Identidad</p>
            <p className="text-slate-400 text-base font-normal">Para listar sus contratos y ver consumos</p>
            {notFound && (
              <div role="alert" className="mt-4 bg-red-50 border-2 border-red-300 rounded-2xl p-4 text-red-700 text-lg font-semibold">
                ⚠ CI no registrado con ningun contrato de agua.
              </div>
            )}
          </div>

          {/* Display & Search Button side-by-side */}
          <div className="flex gap-3 w-full max-w-sm mb-2 items-stretch">
            <div className="bg-white border-4 border-sky-400 rounded-2xl px-6 py-4 text-center shadow-inner flex-1 flex items-center justify-center min-h-[72px]">
              {carnet ? (
                <span className="text-3xl font-mono font-bold text-sky-900 tracking-widest">{ciDisplay}</span>
              ) : (
                <span className="text-3xl font-mono text-slate-300">_ _ _ _ _ _</span>
              )}
            </div>
            <button
              onClick={handleSearchContracts}
              disabled={carnet.length < 5 || loading}
              className="min-h-[72px] px-6 bg-sky-600 hover:bg-sky-700 text-white rounded-2xl font-extrabold text-xl shadow-lg transition active:scale-95 disabled:opacity-40"
            >
              {loading ? "..." : "Buscar"}
            </button>
          </div>

          <NumericKeypad value={carnet} onChange={setCarnet} />
          <ExtensionSelector value={extension} onChange={setExtension} />
        </div>
      )}

      {/* Pantalla 2: Selección de Contrato */}
      {contractsResult && !consumptionHistory && (
        <div className="flex flex-col gap-5 max-w-2xl mx-auto w-full">
          <div className="bg-white rounded-3xl shadow-xl p-8">
            <h3 className="text-2xl font-extrabold text-sky-900 mb-2">Seleccione un Contrato</h3>
            <p className="text-slate-500 mb-6">Titular: {contractsResult.titular_contrato}</p>

            {hasMultipleContracts && (
              <div className="bg-sky-50 border-2 border-sky-200 rounded-3xl p-6 mb-6 space-y-4">
                <h3 className="text-xl font-extrabold text-sky-900 flex items-center gap-2">
                  <span>🏢</span> Resumen Consolidado de Gastos (Cuentas Múltiples)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-sky-100 flex flex-col justify-center min-h-[100px]">
                    <span className="text-xs font-bold text-slate-400 block uppercase tracking-wider">Consumo Total del Mes</span>
                    <span className="text-2xl font-black text-sky-800">{totalLastConsumo} m³</span>
                    <span className="text-xs text-slate-400 block mt-1">({contractsWithLecturaCount} de {contractsResult.contracts.length} medidores)</span>
                  </div>
                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-sky-100 flex flex-col justify-center min-h-[100px]">
                    <span className="text-xs font-bold text-slate-400 block uppercase tracking-wider">Gasto Total del Mes</span>
                    <span className="text-2xl font-black text-emerald-600">Bs. {totalLastMonto.toFixed(2)}</span>
                    <span className="text-xs text-slate-400 block mt-1">(Último período)</span>
                  </div>
                  <div className={`p-4 rounded-2xl shadow-sm border flex flex-col justify-center min-h-[100px] ${contractsResult.total_debt_bs > 0 ? 'bg-red-50/80 border-red-200' : 'bg-emerald-50/80 border-emerald-200'}`}>
                    <span className="text-xs font-bold text-slate-400 block uppercase tracking-wider">Deuda Total Exigible</span>
                    <span className={`text-2xl font-black ${contractsResult.total_debt_bs > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {contractsResult.total_debt_bs > 0 ? `Bs. ${contractsResult.total_debt_bs.toFixed(2)}` : '✓ Al día'}
                    </span>
                    {contractsResult.total_debt_bs > 0 && (
                      <span className="text-xs text-red-500 font-bold block mt-1">({totalMonthsUnpaid} meses impagos)</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3">
              {contractsResult.contracts.map(c => (
                <button
                  key={c.numero_contrato}
                  onClick={() => handleSelectContract(c)}
                  className="flex justify-between items-center p-6 bg-white border-4 border-slate-200 hover:border-sky-600 rounded-2xl transition text-left"
                >
                  <div>
                    <p className="font-extrabold text-sky-900 text-lg">Contrato: {c.numero_contrato}</p>
                    <p className="text-sm text-slate-500">Medidor: {c.medidor_iot || 'N/A'}</p>
                    {c.ultima_lectura && (
                      <p className="text-xs text-slate-500 mt-1 font-semibold">
                        Última lectura: <span className="text-sky-700 font-bold">{c.ultima_lectura.lectura_actual} m³</span> ({new Date(c.ultima_lectura.fecha_hora).toLocaleDateString('es-BO')})
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-sky-600 font-extrabold">Ver Historial →</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <KioskButton variant="outline" onClick={() => { setContractsResult(null); setCarnet(''); setExtension(''); }} className="w-full text-xl">
            ← Cambiar C.I.
          </KioskButton>
        </div>
      )}

      {/* Pantalla 3: Gráfica de Historial */}
      {consumptionHistory && (
        <div className="flex flex-col gap-6 max-w-2xl mx-auto w-full">
          <div className="bg-white rounded-3xl shadow-xl p-8">
            <h3 className="text-2xl font-extrabold text-sky-900 mb-2">
              Consumo Histórico — Contrato {selectedContract?.numero_contrato}
            </h3>
            <p className="text-slate-400 text-base mb-8">Volumen medido en metros cúbicos (m³)</p>

            {consumptionHistory.length === 0 ? (
              <div className="p-8 text-center text-slate-500 font-bold">
                No hay registros de lecturas previas para este medidor.
              </div>
            ) : (
              <>
                {/* Gráfica de barras simple */}
                <div className="flex items-end justify-around gap-4 h-52 mb-6 px-2">
                  {consumptionHistory.map((d, i) => {
                    const pct = Math.round((d.consumo_m3 / maxM3) * 100);
                    const formattedDate = d.fecha_hora_lectura 
                      ? new Date(d.fecha_hora_lectura).toLocaleDateString('es-BO', { month: 'short', year: '2-digit' })
                      : `Lec ${i+1}`;
                    
                    return (
                      <div key={i} className="flex flex-col items-center gap-2 flex-1">
                        <span className={`text-sm font-extrabold ${d.consumo_m3 > STRESS_LIMIT_M3 ? 'text-amber-600' : 'text-slate-700'}`}>
                          {d.consumo_m3} m³
                        </span>
                        <div
                          className={`w-full rounded-t-xl shadow-md ${
                            d.consumo_m3 > STRESS_LIMIT_M3 ? 'bg-amber-500' : 'bg-sky-500'
                          }`}
                          style={{ height: `${pct}%`, minHeight: '8px', transition: 'height 0.6s ease' }}
                        />
                        <span className="text-xs font-semibold text-slate-500 capitalize">{formattedDate}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between border-t-2 border-dashed border-slate-200 pt-4">
                  <span className="text-slate-500 text-lg">Total consumo histórico:</span>
                  <span className="text-2xl font-extrabold text-sky-800">{totalM3} m³</span>
                </div>
                <div className="flex items-center justify-between pt-2">
                  <span className="text-slate-400 text-base">Límite normal mensual de referencia:</span>
                  <span className="text-xl font-bold text-slate-500">{STRESS_LIMIT_M3} m³</span>
                </div>

                {hasAlert && (
                  <div role="alert" className="mt-6 bg-amber-50 border-2 border-amber-400 rounded-2xl p-5 flex gap-4 items-start">
                    <span className="text-4xl">⚠️</span>
                    <div>
                      <p className="text-xl font-extrabold text-amber-800">Consumo Atípico Detectado</p>
                      <p className="text-amber-700 text-lg mt-1 leading-snug">
                        Se registran períodos donde el consumo supera el umbral normal de {STRESS_LIMIT_M3} m³. 
                        Es recomendable verificar el medidor o inspeccionar las cañerías del inmueble para descartar filtraciones internas.
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Sección de envío de correo en Historial */}
          <div className="bg-white rounded-3xl p-6 shadow-xl border border-slate-200 space-y-4">
            <h4 className="text-xl font-extrabold text-sky-900 flex items-center gap-2">
              <span>✉️</span> Enviar Preaviso a su Correo Electrónico
            </h4>
            <p className="text-slate-500 text-sm">Ingrese su dirección de correo electrónico real para recibir el preaviso de cobro con los 2 PDFs oficiales adjuntos (Rollo 55mm + Media Carta):</p>
            
            <div className="flex gap-2">
              <input
                type="email"
                value={emailAddress}
                onChange={(e) => setEmailAddress(e.target.value)}
                placeholder="ejemplo@correo.com"
                className="flex-1 rounded-2xl border-4 border-sky-200 px-4 py-3 text-lg text-slate-800 outline-none focus:border-sky-600"
              />
              <KioskButton
                variant="success"
                onClick={handleSendEmail}
                disabled={emailSending}
                className="shrink-0 min-h-[56px] px-6"
              >
                {emailSending ? "Enviando..." : "Enviar Ahora"}
              </KioskButton>
            </div>

            {emailResult.msg && (
              <div className={`p-4 rounded-xl border-2 font-semibold ${emailResult.success ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-red-50 border-red-300 text-red-700'}`}>
                {emailResult.msg}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <KioskButton variant="secondary" onClick={() => { setConsumptionHistory(null); setEmailAddress(''); setEmailResult({ success: false, msg: '' }); }} className="w-full text-xl">
              ← Seleccionar Otro Contrato
            </KioskButton>
            <KioskButton variant="outline" onClick={() => { setContractsResult(null); setSelectedContract(null); setConsumptionHistory(null); setCarnet(''); setExtension(''); setEmailAddress(''); setEmailResult({ success: false, msg: '' }); }} className="w-full text-xl">
              🔄 Consultar Otro C.I.
            </KioskButton>
          </div>
        </div>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENTE RAÍZ
// ══════════════════════════════════════════════════════════════════════════════

export default function CitizenKiosk() {
  const [apiUrl, setApiUrl] = useState(localStorage.getItem("semapa_api_url") || "https://manupc.tailf34d29.ts.net/");
  const [inputUrl, setInputUrl] = useState(apiUrl);
  const [showSettings, setShowSettings] = useState(false);

  const [currentScreen, setCurrentScreen] = useState('home');
  const idleRef = useRef(null);

  const resetIdle = useCallback(() => {
    clearTimeout(idleRef.current);
    if (currentScreen !== 'home') {
      idleRef.current = setTimeout(() => setCurrentScreen('home'), IDLE_TIMEOUT_MS);
    }
  }, [currentScreen]);

  useEffect(() => {
    resetIdle();
    const events = ['click', 'touchstart', 'keydown', 'mousemove'];
    events.forEach(ev => window.addEventListener(ev, resetIdle, { passive: true }));
    return () => {
      clearTimeout(idleRef.current);
      events.forEach(ev => window.removeEventListener(ev, resetIdle));
    };
  }, [resetIdle]);

  const goHome = () => setCurrentScreen('home');
  const goMenu = () => setCurrentScreen('menu');

  const handleSaveSettings = () => {
    let cleanUrl = inputUrl.trim().replace(/\/$/, "");
    if (cleanUrl && !cleanUrl.startsWith("http")) {
      cleanUrl = "http://" + cleanUrl;
    }
    setApiUrl(cleanUrl);
    localStorage.setItem("semapa_api_url", cleanUrl);
    setShowSettings(false);
  };

  const screens = {
    home: (
      <HomeScreen
        onStart={goMenu}
        onToggleSettings={() => setShowSettings(!showSettings)}
        showSettings={showSettings}
        inputUrl={inputUrl}
        setInputUrl={setInputUrl}
        onSaveSettings={handleSaveSettings}
      />
    ),
    menu: <MenuScreen onSelect={setCurrentScreen} onExit={goHome} />,
    debt: <DebtScreen onBack={goMenu} onExit={goHome} apiUrl={apiUrl} />,
    history: <HistoryScreen onBack={goMenu} onExit={goHome} apiUrl={apiUrl} />,
  };

  return (
    <div className="font-sans antialiased text-slate-800">
      {screens[currentScreen] ?? <HomeScreen onStart={goMenu} />}
    </div>
  );
}
