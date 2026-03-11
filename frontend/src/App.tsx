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
import SalesOrderPage from './pages/SalesOrderPage';
import DeliveryNotePage from './pages/DeliveryNotePage';
import InvoicePage from './pages/InvoicePage';
import PaymentPage from './pages/PaymentPage';
import ReceiptPage from './pages/ReceiptPage';
import ExpensePage from './pages/ExpensePage';

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
            <Route path="/sales-orders" element={<SalesOrderPage />} />
            <Route path="/delivery-notes" element={<DeliveryNotePage />} />
            <Route path="/invoices" element={<InvoicePage />} />
            <Route path="/payments" element={<PaymentPage />} />
            <Route path="/receipts" element={<ReceiptPage />} />
            <Route path="/expenses" element={<ExpensePage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
