import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App.jsx';
import { SpeedInsights } from '@vercel/speed-insights/react';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#2f54eb',
          borderRadius: 6,
        },
      }}
    >
      <BrowserRouter>
        <App />
        <SpeedInsights />
      </BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>
);
