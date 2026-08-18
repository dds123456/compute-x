import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Spin } from 'antd';

const Login = lazy(() => import('./pages/Login.jsx'));
const ConsoleLayout = lazy(() => import('./console/ConsoleLayout.jsx'));
const ProviderLayout = lazy(() => import('./provider/ProviderLayout.jsx'));
const AdminLayout = lazy(() => import('./admin/AdminLayout.jsx'));
const AppLayout = lazy(() => import('./app/AppLayout.jsx'));

export default function App() {
  const loc = useLocation();
  const token = localStorage.getItem('cx_token');
  // 未登录跳登录页（App 与登录页除外）
  if (!token && loc.pathname !== '/login') return <Navigate to="/login" replace />;
  if (token && loc.pathname === '/login') return <Navigate to="/console" replace />;

  return (
    <Suspense fallback={<Spin size="large" fullscreen tip="正在加载 ComputeX" />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/console/*" element={<ConsoleLayout />} />
        <Route path="/provider/*" element={<ProviderLayout />} />
        <Route path="/admin/*" element={<AdminLayout />} />
        <Route path="/app/*" element={<AppLayout />} />
        <Route path="*" element={<Navigate to="/console" replace />} />
      </Routes>
    </Suspense>
  );
}
