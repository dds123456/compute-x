import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('cx_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    if (err.response?.status === 401 && window.location.pathname !== '/login') {
      localStorage.removeItem('cx_token');
      localStorage.removeItem('cx_uid');
      window.location.assign('/login?expired=1');
    }
    const msg = err.response?.data?.msg || err.message || '网络异常';
    return Promise.reject(new Error(msg));
  }
);

export default api;

// 通用工具
export const fmtMoney = (v) => Number(v || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtInt = (v) => Number(v || 0).toLocaleString('zh-CN');

export const STATUS_COLOR = {
  运行中: 'green',
  创建中: 'processing',
  已停止: 'default',
  待续费: 'orange',
  异常: 'red',
  释放中: 'warning',
  已释放: 'default',
  被回收: 'purple',
  可售: 'green',
  售罄: 'red',
  维护中: 'orange',
  已下架: 'default',
  审核中: 'processing',
  已通过: 'green',
  已驳回: 'red',
  已停用: 'default',
  待支付: 'orange',
  已支付: 'blue',
  已完成: 'green',
  已取消: 'default',
  已退款: 'purple',
  待处理: 'orange',
  处理中: 'processing',
  待确认: 'warning',
  已解决: 'green',
  已关闭: 'default',
  待审批: 'orange',
  已通过: 'green',
  已驳回: 'red',
  待结算: 'orange',
  已结算: 'blue',
  已提现: 'green',
  已受理: 'processing',
  开票中: 'processing',
  已开具: 'green',
  未开票: 'default',
  已开票: 'green',
  正常: 'green',
  禁用: 'red',
  待激活: 'orange',
  预警: 'orange',
  超支: 'red',
  提示: 'blue',
  警告: 'orange',
  严重: 'red',
  触发中: 'red',
  已恢复: 'default',
  已支付: 'green',
  有争议: 'red',
};
