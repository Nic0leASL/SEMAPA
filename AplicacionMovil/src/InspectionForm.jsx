/**
 * InspectionForm.jsx — SEMAPA Mobile Inspection App
 *
 * Formulario de inspección de medidores de agua para técnicos de campo.
 * Conectado con la base de datos Cassandra a través de API y con soporte de configuración local.
 */

import { useState, useEffect, useRef } from "react";

const OVERCONSUMPTION_LIMIT = 45; // m³ — umbral ONU/SEMAPA
const INSPECTOR_ID_MOCK = "TECH-001";
const LS_KEY = "semapa_inspections";

/** Banner de advertencia de consumo atípico */
const OverconsumptionBanner = ({ reading }) => {
  if (reading === "" || reading === null) return null;
  const val = parseFloat(reading);
  if (Number.isNaN(val)) return null;
  if (val <= 0 || val > OVERCONSUMPTION_LIMIT) {
    const msg =
      val <= 0
        ? "Lectura de 0 m³ detectada. Verifique si el medidor está bloqueado o el contador fue reiniciado."
        : `Consumo de ${val} m³ supera el límite normal de ${OVERCONSUMPTION_LIMIT} m³. Posible fuga o medidor alterado.`;
    return (
      <div
        role="alert"
        aria-live="polite"
        className="flex items-start gap-3 rounded-xl border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-sm"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="mt-0.5 h-5 w-5 shrink-0 text-amber-500"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z"
            clipRule="evenodd"
          />
        </svg>
        <div>
          <p className="font-semibold">Consumo atípico detectado</p>
          <p className="mt-0.5 leading-snug">{msg}</p>
          <p className="mt-1 text-xs text-amber-600">
            Puede continuar guardando, pero documente bien la situación.
          </p>
        </div>
      </div>
    );
  }
  return null;
};

/** Tarjeta de coordenadas GPS */
const GpsCard = ({ gps }) => {
  if (!gps) return null;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-5 w-5 shrink-0 text-sky-500"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="m11.54 22.351.07.04.028.016a.76.76 0 0 0 .723 0l.028-.015.071-.041a16.975 16.975 0 0 0 1.144-.742 19.58 19.58 0 0 0 2.683-2.282c1.944-2.003 3.5-4.697 3.5-8.327a8.25 8.25 0 0 0-16.5 0c0 3.63 1.556 6.324 3.5 8.327a19.58 19.58 0 0 0 2.682 2.282 16.975 16.975 0 0 0 1.144.742ZM12 13.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
          clipRule="evenodd"
        />
      </svg>
      <div className="min-w-0">
        <p className="font-semibold">Ubicación capturada</p>
        <p className="truncate font-mono text-xs">
          Lat: {gps.latitude.toFixed(6)} · Lon: {gps.longitude.toFixed(6)}
        </p>
      </div>
    </div>
  );
};

/** Toast de éxito */
const SuccessToast = ({ visible }) => {
  if (!visible) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-medium text-white shadow-xl"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-5 w-5 shrink-0"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z"
          clipRule="evenodd"
        />
      </svg>
      <span>
        Lectura subida con éxito y sincronizada con la base de datos.
      </span>
    </div>
  );
};

export default function InspectionForm() {
  // ── Configuración de API ────────────────────────────────────────────────────
  const [apiUrl, setApiUrl] = useState(localStorage.getItem("semapa_api_url") || "https://manupc.tailf34d29.ts.net/");
  const [inputUrl, setInputUrl] = useState(apiUrl);
  const [showSettings, setShowSettings] = useState(false);

  // ── Estado del formulario ───────────────────────────────────────────────────
  const [contractId, setContractId] = useState("");
  const [manualReading, setManualReading] = useState("");
  const [gps, setGps] = useState(null); // { latitude, longitude } | null
  const [photo, setPhoto] = useState(null); // string base64 | null
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Estado de UI ────────────────────────────────────────────────────────────
  const [gpsError, setGpsError] = useState("");
  const [gpsLoading, setGpsLoading] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [formError, setFormError] = useState("");

  const cameraInputRef = useRef(null);

  useEffect(() => {
    if (!showToast) return;
    const timer = setTimeout(() => setShowToast(false), 4000);
    return () => clearTimeout(timer);
  }, [showToast]);

  const handleCaptureGps = () => {
    if (!navigator.geolocation) {
      setGpsError("Geolocalización no soportada en este dispositivo.");
      return;
    }
    setGpsLoading(true);
    setGpsError("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGps({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setGpsLoading(false);
      },
      (error) => {
        setGpsLoading(false);
        const messages = {
          1: "Permiso de ubicación denegado. Habilítelo en la configuración del navegador.",
          2: "No se pudo determinar la posición. Verifique la señal GPS.",
          3: "Tiempo de espera agotado. Intente nuevamente al aire libre.",
        };
        setGpsError(messages[error.code] || "Error desconocido de geolocalización.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setFormError("El archivo seleccionado no es una imagen válida.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setFormError("La imagen supera el límite de 10 MB.");
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = () => {
        setPhoto(reader.result);
        setFormError("");
      };
      reader.readAsDataURL(file);
    } catch {
      setFormError("Error al procesar la imagen. Intente de nuevo.");
    }
  };

  const isFormValid =
    contractId.trim() !== "" &&
    manualReading !== "" &&
    !Number.isNaN(parseFloat(manualReading)) &&
    gps !== null;

  const handleSaveSettings = () => {
    let cleanUrl = inputUrl.trim().replace(/\/$/, "");
    if (cleanUrl && !cleanUrl.startsWith("http")) {
      cleanUrl = "http://" + cleanUrl;
    }
    setApiUrl(cleanUrl);
    localStorage.setItem("semapa_api_url", cleanUrl);
    setShowSettings(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    if (!isFormValid) {
      setFormError("Complete todos los campos requeridos antes de guardar.");
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Buscar el catastro correspondiente al medidor
      let catastro = null;
      try {
        const searchRes = await fetch(`${apiUrl}/buscar?q=${encodeURIComponent(contractId.trim())}`);
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const matchedContract = searchData.contratos?.find(c => c.medidor_iot === contractId.trim());
          catastro = matchedContract?.numero_catastro || null;
        }
      } catch (err) {
        console.warn("No se pudo conectar a la base de datos para buscar el catastro:", err);
      }

      // 2. Subir lectura de medidor
      const lecturaRes = await fetch(`${apiUrl}/movil/lectura`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          medidor_iot: contractId.trim(),
          lectura_actual: parseFloat(manualReading),
          radiobase: 1,
          fecha_hora_lectura: new Date().toISOString()
        })
      });

      if (!lecturaRes.ok) {
        const errData = await lecturaRes.json();
        throw new Error(errData.detail || "Error al subir la lectura a la base de datos.");
      }

      // 3. Si se encontró catastro, actualizar coordenadas GPS
      if (catastro) {
        try {
          await fetch(`${apiUrl}/movil/gps`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              numero_catastro: catastro,
              latitud: gps.latitude,
              longitud: gps.longitude
            })
          });
        } catch (gpsErr) {
          console.warn("Error al actualizar coordenadas GPS en la base de datos:", gpsErr);
        }
      }

      // 3.5 Si hay foto, subirla al backend para guardarla en el frontend uploads
      if (photo) {
        try {
          await fetch(`${apiUrl}/movil/upload-foto`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              medidor_iot: contractId.trim(),
              photoBase64: photo
            })
          });
        } catch (photoErr) {
          console.warn("Error al guardar la foto del medidor:", photoErr);
        }
      }

      // 4. Guardar copia local de respaldo
      const newRecord = {
        id: crypto.randomUUID(),
        contractId: contractId.trim(),
        manualReading: parseFloat(manualReading),
        coordinates: {
          latitude: gps.latitude,
          longitude: gps.longitude,
        },
        photoBase64: photo,
        timestamp: new Date().toISOString(),
        inspectorId: INSPECTOR_ID_MOCK,
        syncStatus: "synced",
      };
      const currentData = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
      localStorage.setItem(LS_KEY, JSON.stringify([...currentData, newRecord]));

      // Resetear
      setContractId("");
      setManualReading("");
      setGps(null);
      setPhoto(null);
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      setShowToast(true);
    } catch (err) {
      setFormError(err.message || "Error de red al conectar con el servidor.");
      console.error("[InspectionForm] Error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <SuccessToast visible={showToast} />

      <div className="min-h-screen bg-slate-100 px-4 py-6 sm:px-6">
        <div className="mx-auto w-full max-w-lg">
          {/* ── Cabecera institucional ──────────────────────────────────── */}
          <header className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-700 shadow-md">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="white"
                  className="h-7 w-7"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M11.484 2.17a.75.75 0 0 1 1.032 0 11.209 11.209 0 0 0 7.877 3.08.75.75 0 0 1 .722.515 12.74 12.74 0 0 1 .635 3.985c0 5.942-4.064 10.933-9.563 12.348a.749.749 0 0 1-.374 0C6.314 20.683 2.25 15.692 2.25 9.75c0-1.39.223-2.73.635-3.985a.75.75 0 0 1 .722-.516l.143.001c2.996 0 5.718-1.17 7.734-3.08Z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold leading-tight text-sky-900">
                  SEMAPA Inspecciones
                </h1>
                <p className="text-xs text-slate-500">
                  Registro de Lectura de Medidor
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 hover:text-sky-700 transition"
              aria-label="Configurar conexión API"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-5 w-5"
              >
                <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                <path
                  fillRule="evenodd"
                  d="M1.328 12.75a.75.75 0 0 1 0-1.5 9 9 0 0 1 2.274-5.32 9.002 9.002 0 0 1 12.825 0 9 9 0 0 1 2.274 5.32.75.75 0 0 1 0 1.5 9 9 0 0 1-2.274 5.32 9.002 9.002 0 0 1-12.825 0 9 9 0 0 1-2.274-5.32Zm16.711-2.6a6.002 6.002 0 0 0-11.97 0 6.002 6.002 0 0 0 11.97 0Z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </header>

          {/* ── Barra de configuración rápida ───────────────────────────── */}
          {showSettings && (
            <div className="mb-5 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 animate-fade-in space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">
                  URL DEL BACKEND API:
                </label>
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
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  className="rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-800"
                >
                  Guardar
                </button>
              </div>
            </div>
          )}

          {/* ── Formulario ──────────────────────────────────────────────── */}
          <form
            onSubmit={handleSubmit}
            noValidate
            className="space-y-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
          >
            {formError && (
              <div
                role="alert"
                className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 font-medium"
              >
                {formError}
              </div>
            )}

            <div>
              <label
                htmlFor="contractId"
                className="mb-1.5 block text-sm font-semibold text-slate-700"
              >
                N° de Medidor
                <span className="ml-1 text-red-500">*</span>
              </label>
              <input
                id="contractId"
                type="text"
                placeholder="Ej: MED-101"
                value={contractId}
                onChange={(e) => setContractId(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-800 placeholder-slate-400 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-200"
              />
            </div>

            <div>
              <label
                htmlFor="manualReading"
                className="mb-1.5 block text-sm font-semibold text-slate-700"
              >
                Lectura del Medidor (m³)
                <span className="ml-1 text-red-500">*</span>
              </label>
              <input
                id="manualReading"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="Ej: 23.50"
                value={manualReading}
                onChange={(e) => setManualReading(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-800 placeholder-slate-400 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-200"
              />

              <div className="mt-2">
                <OverconsumptionBanner reading={manualReading} />
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-sm font-semibold text-slate-700">
                Ubicación GPS
                <span className="ml-1 text-red-500">*</span>
              </p>

              <button
                type="button"
                onClick={handleCaptureGps}
                disabled={gpsLoading}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-sky-300 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-700 transition hover:border-sky-500 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {gpsLoading ? (
                  <svg
                    className="h-5 w-5 animate-spin text-sky-600"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4Z"
                    />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="h-5 w-5"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M11.54 22.351l.07.04.028.016a.76.76 0 0 0 .723 0l.028-.015.071-.041a16.975 16.975 0 0 0 1.144-.742 19.58 19.58 0 0 0 2.683-2.282c1.944-2.003 3.5-4.697 3.5-8.327a8.25 8.25 0 0 0-16.5 0c0 3.63 1.556 6.324 3.5 8.327a19.58 19.58 0 0 0 2.682 2.282 16.975 16.975 0 0 0 1.144.742ZM12 13.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
                {gpsLoading ? "Obteniendo ubicación..." : "Capturar Ubicación GPS"}
              </button>

              {gpsError && (
                <p role="alert" className="mt-2 text-xs text-red-600">
                  {gpsError}
                </p>
              )}

              <div className="mt-2">
                <GpsCard gps={gps} />
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-sm font-semibold text-slate-700">
                Foto del Medidor (Opcional)
              </p>

              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoChange}
                className="hidden"
                id="camera-input"
              />

              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600 transition hover:border-sky-400 hover:bg-sky-50 hover:text-sky-700"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="h-5 w-5"
                  aria-hidden="true"
                >
                  <path d="M12 9a3.75 3.75 0 1 0 0 7.5A3.75 3.75 0 0 0 12 9Z" />
                  <path
                    fillRule="evenodd"
                    d="M9.344 3.071a49.52 49.52 0 0 1 5.312 0c.967.052 1.83.585 2.332 1.39l.821 1.317c.24.383.645.643 1.11.71.386.054.77.113 1.152.177 1.432.239 2.429 1.493 2.429 2.909V18a3 3 0 0 1-3 3h-15a3 3 0 0 1-3-3V9.574c0-1.416.997-2.67 2.429-2.909.382-.064.766-.123 1.151-.178a1.56 1.56 0 0 0 1.11-.71l.822-1.315c.502-.806 1.365-1.34 2.332-1.39Zm6.156 5.679a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM6.75 12.75a5.25 5.25 0 1 1 10.5 0 5.25 5.25 0 0 1-10.5 0Z"
                    clipRule="evenodd"
                  />
                </svg>
                {photo ? "Cambiar Foto" : "Tomar Foto del Medidor"}
              </button>

              {photo && (
                <div className="relative mt-3 overflow-hidden rounded-xl border border-slate-200 shadow-sm">
                  <img
                    src={photo}
                    alt="Vista previa"
                    className="h-48 w-full object-cover"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-2">
                    <p className="text-xs font-medium text-white">
                      Foto capturada ✓
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPhoto(null);
                      if (cameraInputRef.current) cameraInputRef.current.value = "";
                    }}
                    className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-red-600"
                    aria-label="Eliminar foto"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="h-4 w-4"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.47 5.47a.75.75 0 0 1 1.06 0L12 10.94l5.47-5.47a.75.75 0 1 1 1.06 1.06L13.06 12l5.47 5.47a.75.75 0 1 1-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 0 1-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 0 1 0-1.06Z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-2.5 text-xs text-slate-500">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-4 w-4 shrink-0"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z"
                  clipRule="evenodd"
                />
              </svg>
              Inspector: <span className="font-medium text-slate-700">{INSPECTOR_ID_MOCK}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { label: "Medidor", ok: contractId.trim() !== "" },
                {
                  label: "Lectura",
                  ok:
                    manualReading !== "" &&
                    !Number.isNaN(parseFloat(manualReading)),
                },
                { label: "GPS", ok: gps !== null },
                { label: "Foto (Opcional)", ok: photo !== null },
              ].map(({ label, ok }) => (
                <div
                  key={label}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium ${
                    ok
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate-400"
                  }`}
                >
                  <span>{ok ? "✓" : "○"}</span>
                  {label}
                </div>
              ))}
            </div>

            <button
              type="submit"
              disabled={!isFormValid || isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-4 text-sm font-bold text-white shadow-md transition hover:bg-sky-800 active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            >
              {isSubmitting ? (
                <>
                  <svg
                    className="h-5 w-5 animate-spin"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4Z"
                    />
                  </svg>
                  Guardando...
                </>
              ) : (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="h-5 w-5"
                    aria-hidden="true"
                  >
                    <path d="M12 1.5a.75.75 0 0 1 .75.75V7.5h-1.5V2.25A.75.75 0 0 1 12 1.5ZM11.25 7.5v5.69l-1.72-1.72a.75.75 0 0 0-1.06 1.06l3 3a.75.75 0 0 0 1.06 0l3-3a.75.75 0 1 0-1.06-1.06l-1.72 1.72V7.5h3.75a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3v-9a3 3 0 0 1 3-3h3.75Z" />
                  </svg>
                  Guardar Inspección
                </>
              )}
            </button>

            {!gps && (
              <p className="text-center text-xs text-slate-400">
                El GPS es obligatorio para habilitar el guardado.
              </p>
            )}
          </form>

          <p className="mt-6 text-center text-xs text-slate-400">
            SEMAPA · Sistema de Gestión Hídrica · v1.0.0-database
          </p>
        </div>
      </div>
    </>
  );
}
