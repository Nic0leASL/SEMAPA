export const dashboardMockData = {
  // Presidente / Alcaldía Dashboard - Enfocado en consumo y medidores
  alcaldia: {
    consumoCiudad: '25.254.325',
    medidoresReportando: '109.309',
    medidoresErrores: '9.122',
    // Distribución mensual de consumo (m3)
    distribucionMensual: [
      { mes: 'Ene', consumo: 1800000, color: '#f59e0b' },
      { mes: 'Feb', consumo: 1950000, color: '#f59e0b' },
      { mes: 'Mar', consumo: 2100000, color: '#f59e0b' },
      { mes: 'Abr', consumo: 2350000, color: '#f59e0b' },
      { mes: 'May', consumo: 2800000, color: '#1aa3ff' },
      { mes: 'Jun', consumo: 3200000, color: '#1aa3ff' },
      { mes: 'Jul', consumo: 2900000, color: '#f59e0b' },
      { mes: 'Ago', consumo: 2600000, color: '#22c55e' }
    ],
    // Top zonas por consumo (m3)
    topZonasConsumo: [
      { zona: 'QUERU QUERU ALTO', consumo: 1500000 },
      { zona: 'ARANJUEZ ALTO', consumo: 2800000 },
      { zona: 'TEMPORAL', consumo: 3400000 },
      { zona: 'CALA CALA', consumo: 4500000 },
      { zona: 'SARCO', consumo: 13100000 },
      { zona: 'COCHABAMBA', consumo: 95100000 },
      { zona: 'PAMPA', consumo: 11200000 },
      { zona: 'QUERU QUERU ALTO', consumo: 2300000 },
      { zona: 'SARCO', consumo: 111700000 }
    ],
    // Gauge: litros promedio por habitante por día vs OMS (100 l/día)
    promedioConsumoHabitante: 125,
    estandarOMS: 100,
    // Estrés hídrico
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
    ],
    topMedidoresFallas: [
      { medidor: 'MED-IOT-00482', zona: 'Queru Queru', errores: 47, ultimoError: 'Sin Señal RF', estado: 'Crítico' },
      { medidor: 'MED-IOT-01293', zona: 'Temporal', errores: 38, ultimoError: 'Falla Batería', estado: 'Crítico' },
      { medidor: 'MED-IOT-00871', zona: 'Cala Cala', errores: 31, ultimoError: 'Lectura Anómala', estado: 'Pendiente' },
      { medidor: 'MED-IOT-02104', zona: 'Sarco', errores: 28, ultimoError: 'Sin Señal RF', estado: 'Crítico' },
      { medidor: 'MED-IOT-00156', zona: 'Villa Busch', errores: 25, ultimoError: 'Tampering', estado: 'Investigación' },
      { medidor: 'MED-IOT-03387', zona: 'Pampa', errores: 22, ultimoError: 'Falla Batería', estado: 'Pendiente' },
      { medidor: 'MED-IOT-01749', zona: 'Aranjuez', errores: 19, ultimoError: 'Posible Fuga', estado: 'Crítico' },
      { medidor: 'MED-IOT-00623', zona: 'Jaihuayco', errores: 17, ultimoError: 'Sin Señal RF', estado: 'Pendiente' }
    ]
  },
  
  // Finanzas
  finanzas: {
    ingresoMensual: '2,450,000',
    proyeccionCierre: '3,100,000',
    tasaCrecimiento: '+5.2%',
    facturasEmitidas: '120,500',
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
