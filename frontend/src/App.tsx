import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/Layout';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const CustomerPage = lazy(() => import('./pages/CustomerPage'));
const ProductPage = lazy(() => import('./pages/ProductPage'));
const RawMaterialPage = lazy(() => import('./pages/RawMaterialPage'));
const BomPage = lazy(() => import('./pages/BomPage'));
const ProductionPage = lazy(() => import('./pages/ProductionPage'));
const CostPage = lazy(() => import('./pages/CostPage'));
const SalesOrderPage = lazy(() => import('./pages/SalesOrderPage'));
const DeliveryNotePage = lazy(() => import('./pages/DeliveryNotePage'));
const InvoicePage = lazy(() => import('./pages/InvoicePage'));
const PaymentPage = lazy(() => import('./pages/PaymentPage'));
const ReceiptPage = lazy(() => import('./pages/ReceiptPage'));
const ExpensePage = lazy(() => import('./pages/ExpensePage'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin rounded-full h-8 w-8 border-4 border-indigo-500 border-t-transparent" />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<PageLoader />}>
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
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
