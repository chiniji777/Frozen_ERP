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
// CostPage removed per user request
const SalesOrderPage = lazy(() => import('./pages/SalesOrderPage'));
const DeliveryNotePage = lazy(() => import('./pages/DeliveryNotePage'));
const InvoicePage = lazy(() => import('./pages/InvoicePage'));
const PaymentPage = lazy(() => import('./pages/PaymentPage'));
const ReceiptPage = lazy(() => import('./pages/ReceiptPage'));
const ExpensePage = lazy(() => import('./pages/ExpensePage'));
const RecurringExpensePage = lazy(() => import('./pages/RecurringExpensePage'));
const UserManagementPage = lazy(() => import('./pages/UserManagementPage'));
const SupplierPage = lazy(() => import('./pages/SupplierPage'));
const PurchaseOrderPage = lazy(() => import('./pages/PurchaseOrderPage'));
// UomPage merged into SettingsPage as tab
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

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
              {/* CostPage removed */}
              <Route path="/sales-orders" element={<SalesOrderPage />} />
              <Route path="/delivery-notes" element={<DeliveryNotePage />} />
              <Route path="/invoices" element={<InvoicePage />} />
              <Route path="/payments" element={<PaymentPage />} />
              <Route path="/receipts" element={<ReceiptPage />} />
              <Route path="/expenses" element={<ExpensePage />} />
              <Route path="/recurring-expenses" element={<RecurringExpensePage />} />
              <Route path="/suppliers" element={<SupplierPage />} />
              <Route path="/purchase-orders" element={<PurchaseOrderPage />} />
              <Route path="/users" element={<UserManagementPage />} />
              {/* UomPage merged into SettingsPage */}
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
