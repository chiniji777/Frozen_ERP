import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import CustomerPage from './pages/CustomerPage';
import ProductPage from './pages/ProductPage';
import RawMaterialPage from './pages/RawMaterialPage';
import BomPage from './pages/BomPage';
import ProductionPage from './pages/ProductionPage';
import CostPage from './pages/CostPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<Layout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/customers" element={<CustomerPage />} />
            <Route path="/products" element={<ProductPage />} />
            <Route path="/raw-materials" element={<RawMaterialPage />} />
            <Route path="/bom" element={<BomPage />} />
            <Route path="/production" element={<ProductionPage />} />
            <Route path="/costs" element={<CostPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
