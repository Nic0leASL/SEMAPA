import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ClusterMonitor from './pages/ClusterMonitor';
import AlcaldiaDashboard from './pages/AlcaldiaDashboard';
import GerenciaDashboard from './pages/GerenciaDashboard';
import FinanzasDashboard from './pages/FinanzasDashboard';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/alcaldia" replace />} />
          <Route path="alcaldia" element={<AlcaldiaDashboard />} />
          <Route path="gerencia" element={<GerenciaDashboard />} />
          <Route path="finanzas" element={<FinanzasDashboard />} />
          <Route path="cluster" element={<ClusterMonitor />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
