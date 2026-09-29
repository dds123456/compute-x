import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Login from './pages/Login.jsx';
import ConsoleLayout from './console/ConsoleLayout.jsx';
import ProviderLayout from './provider/ProviderLayout.jsx';
import AdminLayout from './admin/AdminLayout.jsx';
import AppLayout from './app/AppLayout.jsx';

export default function App() {
  const loc = useLocation();
  const uid = localStorage.getItem('cx_uid');
  // 未登录跳登录页（App 与登录页除外）
  if (!uid && loc.pathname !== '/login') return <Navigate to="/login" replace />;
  if (uid && loc.pathname === '/login') return <Navigate to="/console" replace />;

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/console/*" element={<ConsoleLayout />} />
      <Route path="/provider/*" element={<ProviderLayout />} />
      <Route path="/admin/*" element={<AdminLayout />} />
      <Route path="/app/*" element={<AppLayout />} />
      <Route path="*" element={<Navigate to="/console" replace />} />
    </Routes>
  );
}
