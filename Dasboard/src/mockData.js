export const dashboardMockData = {
  // Presidente Dashboard
  alcaldia: {
    consumoTotal: '124,530',
    facturacionTotal: '850,200',
    recaudado: '780,000',
    deudaMora: '70,200',
    efectividadCobro: 91.7,
    clientesMora: 143,
    topZonas: [
      { id: 1, zona: 'Centro Histórico (Distrito 10)', consumo: '12,500', facturado: '85,000' },
      { id: 2, zona: 'Cala Cala (Distrito 12)', consumo: '10,200', facturado: '72,400' },
      { id: 3, zona: 'Queru Queru (Distrito 12)', consumo: '9,800', facturado: '69,000' },
      { id: 4, zona: 'Sarco (Distrito 3)', consumo: '8,500', facturado: '60,200' },
      { id: 5, zona: 'Temporal (Distrito 2)', consumo: '7,100', facturado: '49,800' }
    ],
    estresHidrico: [
      { distrito: 'Distrito 8', nivel: 'Crítico', porcentaje: 85 },
      { distrito: 'Distrito 9', nivel: 'Alto', porcentaje: 72 },
      { distrito: 'Distrito 1', nivel: 'Moderado', porcentaje: 45 }
    ],
    weatherComparison: [
      { fecha: '2026-02-28', consumo_total_m3: 2250187.0, temperatura_max_c: 25.5, ubicacion: 'Cochabamba, Bolivia' },
      { fecha: '2026-03-31', consumo_total_m3: 2228679.0, temperatura_max_c: 26.8, ubicacion: 'Cochabamba, Bolivia' },
      { fecha: '2026-04-30', consumo_total_m3: 2207534.0, temperatura_max_c: 27.2, ubicacion: 'Cochabamba, Bolivia' }
    ]
  },
  
  // Administrador / Gerencia
  gerencia: {
    medidoresActivos: '115,400',
    medidoresDanados: '4,600',
    alertasAnomalias: 342,
    lecturasHoy: '450,200',
    erroresTop: [
      { id: 1, tipo: 'Falla Batería', cantidad: 2100, estado: 'Pendiente' },
      { id: 2, tipo: 'Sin Señal RF', cantidad: 1850, estado: 'Crítico' },
      { id: 3, tipo: 'Posible Fuga', cantidad: 342, estado: 'Crítico' },
      { id: 4, tipo: 'Tampering (Fraude)', cantidad: 56, estado: 'Investigación' }
    ]
  },
  
  // Finanzas
  finanzas: {
    ingresoMensual: '2,450,000',
    proyeccionCierre: '3,100,000',
    tasaCrecimiento: '+5.2%',
    facturasEmitidas: '120,500',
    pagosDigitales: '68%',
    tendencia: [
      { mes: 'Ene', ingresos: 2100000 },
      { mes: 'Feb', ingresos: 2150000 },
      { mes: 'Mar', ingresos: 2300000 },
      { mes: 'Abr', ingresos: 2280000 },
      { mes: 'May', ingresos: 2450000 }
    ]
  },

  // Heatmap weights
  heatmapData: {
    "sector1": 0.4,
    "sector2": 0.6,
    "sector3": 0.8,
    "sector4": 0.5,
    "sector5": 0.3,
    "sector6": 0.9,
    "sector7": 0.2,
    "sector8": 0.7,
    "sector9": 0.6,
    "sector10": 0.95,
    "sector11": 0.5,
    "sector12": 0.85,
    "sector13": 0.4,
    "sector14": 0.75
  }
};
