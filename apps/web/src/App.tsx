import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { I18nProvider } from './lib/i18n';
import { AuthProvider } from './lib/auth';
import { BasketProvider } from './lib/basket';
import { Layout } from './ui/Layout';
import { Loading } from './ui/components';
import { AppErrorBoundary } from './ui/ErrorBoundary';

const Home = lazy(() => import('./pages/Home'));
const Events = lazy(() => import('./pages/Events'));
const EventDetail = lazy(() => import('./pages/EventDetail'));
const Booking = lazy(() => import('./pages/Booking'));
const Checkout = lazy(() => import('./pages/Checkout'));
const Order = lazy(() => import('./pages/Order'));
const Tickets = lazy(() => import('./pages/Tickets'));
const Bookings = lazy(() => import('./pages/Bookings'));
const Login = lazy(() => import('./pages/Login'));
const Support = lazy(() => import('./pages/Support'));
const Exhibition = lazy(() => import('./pages/Exhibition'));
const QuickEvent = lazy(() => import('./pages/QuickEvent'));
const OrgPortal = lazy(() => import('./pages/org/OrgPortal'));
const AdminPortal = lazy(() => import('./pages/admin/AdminPortal'));
const NotFound = lazy(() => import('./pages/NotFound'));

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <BrowserRouter>
          <BasketProvider>
            <Layout>
              <AppErrorBoundary>
              <Suspense fallback={<Loading />}>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/events" element={<Events />} />
                  <Route path="/events/:slug" element={<EventDetail />} />
                  <Route path="/book/:performanceId" element={<Booking />} />
                  <Route path="/checkout" element={<Checkout />} />
                  <Route path="/orders/:ref" element={<Order />} />
                  <Route path="/tickets" element={<Tickets />} />
                  <Route path="/bookings" element={<Bookings />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/support" element={<Support />} />
                  <Route path="/exhibitions/:slug" element={<Exhibition />} />
                  <Route path="/quick-event" element={<QuickEvent />} />
                  <Route path="/org/*" element={<OrgPortal />} />
                  <Route path="/admin/*" element={<AdminPortal />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
              </AppErrorBoundary>
            </Layout>
          </BasketProvider>
        </BrowserRouter>
      </AuthProvider>
    </I18nProvider>
  );
}
