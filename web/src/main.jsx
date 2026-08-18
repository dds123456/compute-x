import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#0e9f66',
          colorInfo: '#31b8c8',
          colorSuccess: '#0e9f66',
          colorWarning: '#d99412',
          colorError: '#d64b43',
          colorText: '#14221d',
          colorTextSecondary: '#667a71',
          colorBorder: '#dce6e1',
          colorBgLayout: '#f3f6f4',
          borderRadius: 8,
          borderRadiusLG: 12,
          fontFamily: "'CX Instrument','PingFang SC','Microsoft YaHei',sans-serif",
        },
        components: {
          Button: { controlHeight: 36, fontWeight: 600 },
          Card: { headerFontSize: 14 },
          Menu: { itemBorderRadius: 7 },
          Table: { headerBorderRadius: 8 },
        },
      }}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>
);
