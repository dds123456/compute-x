import { useEffect, useState } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Button, Progress, Tag, Space, Card, Badge, List, message, Popconfirm, Segmented, Input, Select, Avatar, Empty, Modal, Form, Switch, Descriptions, Divider, Statistic, Row, Col, Spin } from 'antd';
import {
  HomeOutlined, CloudServerOutlined, FileTextOutlined, UserOutlined, BellOutlined,
  ArrowLeftOutlined, ThunderboltOutlined, WalletOutlined, AuditOutlined, AlertOutlined,
  PoweroffOutlined, SyncOutlined, DollarOutlined, DeleteOutlined, CheckCircleOutlined, CloseCircleOutlined,
} from '@ant-design/icons';
import api, { fmtMoney, STATUS_COLOR } from '../api.js';

export default function AppLayout() {
  const nav = useNavigate();
  const loc = useLocation();
  const [me, setMe] = useState(null);
  const [unread, setUnread] = useState(0);
  const [tab, setTab] = useState(loc.pathname.startsWith('/app/instances') ? 'inst' : loc.pathname.startsWith('/app/bills') ? 'bill' : loc.pathname.startsWith('/app/me') ? 'me' : 'home');

  useEffect(() => {
    api.get('/auth/me').then(({ member }) => setMe(member));
    api.get('/auth/unread').then(({ count }) => setUnread(count));
  }, []);

  const goto = (t) => { setTab(t); nav(`/app/${t === 'home' ? '' : t}`); };

  const tabs = [
    { key: 'home', label: '工作台', icon: <HomeOutlined />, path: '/app' },
    { key: 'instances', label: '实例', icon: <CloudServerOutlined />, path: '/app/instances' },
    { key: 'bills', label: '账单', icon: <FileTextOutlined />, path: '/app/bills' },
    { key: 'me', label: '我的', icon: <UserOutlined />, path: '/app/me' },
  ];

  // 手机模拟外壳
  return (
    <div style={{ minHeight: '100vh', background: '#e8ecf3', display: 'flex', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: 400, maxWidth: '100%', background: '#f5f6f8', borderRadius: 28, overflow: 'hidden', boxShadow: '0 12px 48px rgba(0,0,0,.18)', position: 'relative', minHeight: 'calc(100vh - 32px)' }}>
        <div style={{ height: 44, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#a6b0c0', borderBottom: '1px solid #eef0f4' }}>
          {loc.pathname === '/app' ? 'ComputeX · 移动端协同' : 'ComputeX'}
        </div>

        {/* 顶部栏：企业名 + 铃铛 */}
        <div style={{ background: 'linear-gradient(135deg,#2f54eb,#13c2c2)', color: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{me?.name || ''} · {me?.role || ''}</div>
            <div style={{ fontSize: 11, opacity: .85 }}>星云智能科技有限公司</div>
          </div>
          <Badge count={unread} size="small">
            <div onClick={() => nav('/app/messages')} style={{ cursor: 'pointer' }}><BellOutlined style={{ fontSize: 20 }} /></div>
          </Badge>
        </div>

        <div style={{ paddingBottom: 64, minHeight: 'calc(100vh - 220px)' }}>
          <Routes>
            <Route index element={<Home me={me} nav={nav} />} />
            <Route path="instances" element={<InstList nav={nav} />} />
            <Route path="instances/:id" element={<InstDetail nav={nav} />} />
            <Route path="bills" element={<Bills nav={nav} />} />
            <Route path="bills/:id" element={<BillDetail nav={nav} />} />
            <Route path="me" element={<Me me={me} nav={nav} />} />
            <Route path="messages" element={<Messages nav={nav} />} />
            <Route path="approvals" element={<Approvals nav={nav} />} />
            <Route path="members" element={<Members nav={nav} />} />
            <Route path="tickets/new" element={<NewTicket nav={nav} />} />
          </Routes>
        </div>

        {/* 底部 Tab */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '1px solid #eef0f4', display: 'flex', padding: '6px 0', paddingBottom: 10 }}>
          {tabs.map(t => (
            <div key={t.key} onClick={() => goto(t.key)} style={{ flex: 1, textAlign: 'center', cursor: 'pointer', color: tab === t.key ? '#2f54eb' : '#a6b0c0' }}>
              <div style={{ fontSize: 20 }}>{t.icon}</div>
              <div style={{ fontSize: 10 }}>{t.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============ 工作台 ============
function Home({ me, nav }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get('/dashboard/overview', { params: { enterpriseId: localStorage.getItem('cx_enterprise') } }).then(({ overview }) => setData(overview));
  }, []);
  if (!data) return <Spin style={{ display: 'block', margin: '60px auto' }} />;

  const cards = [
    { label: '本月消费', value: fmtMoney(data.monthCost), color: '#2f54eb', icon: <WalletOutlined /> },
    { label: '运行中', value: data.running, color: '#13c2c2', icon: <CloudServerOutlined /> },
    { label: '异常', value: data.error, color: '#f5222d', icon: <AlertOutlined /> },
    { label: '待续费', value: data.expiring, color: '#fa8c16', icon: <DollarOutlined /> },
  ];

  return (
    <div style={{ padding: 12 }}>
      {/* 费用概览卡 */}
      <Card size="small" style={{ borderRadius: 12, marginBottom: 12 }} onClick={() => nav('/app/bills')}>
        <Row align="middle">
          <Col span={10}><div style={{ color: '#7a8699', fontSize: 12 }}>本月累计消费</div><div style={{ fontSize: 24, fontWeight: 700, color: '#2f54eb' }}>¥{fmtMoney(data.monthCost)}</div><div style={{ fontSize: 11, color: '#a6b0c0' }}>余额 ¥{fmtMoney(data.balance)}</div></Col>
          <Col span={14}>
            <div style={{ fontSize: 12, color: '#7a8699', marginBottom: 4 }}>项目预算使用</div>
            {data.projects.slice(0, 2).map(p => (
              <div key={p.id} style={{ marginBottom: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}><span>{p.name}</span><span>{p.percent}%</span></div>
                <Progress percent={p.percent} size="small" showInfo={false} strokeColor={p.percent >= 100 ? '#f5222d' : p.percent >= 80 ? '#faad14' : '#2f54eb'} />
              </div>
            ))}
          </Col>
        </Row>
      </Card>

      {/* 实例概览卡 */}
      <Card size="small" style={{ borderRadius: 12, marginBottom: 12 }}>
        <Row gutter={8}>
          {cards.map(c => (
            <Col span={6} key={c.label} onClick={() => nav('/app/instances')} style={{ cursor: 'pointer', textAlign: 'center' }}>
              <div style={{ fontSize: 20, color: c.color }}>{c.icon}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: c.color }}>{c.value}</div>
              <div style={{ fontSize: 11, color: '#7a8699' }}>{c.label}</div>
            </Col>
          ))}
        </Row>
      </Card>

      {/* 待办审批卡 */}
      <Card size="small" style={{ borderRadius: 12, marginBottom: 12 }} title={<Space><AuditOutlined style={{ color: '#faad14' }} />待办审批</Space>} extra={<a onClick={() => nav('/app/approvals')}>全部待办</a>}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#4a5568' }}>
          <span>待我审批 <b style={{ color: '#faad14' }}>{data.pendingApprovals}</b> 条</span>
          <span style={{ color: '#a6b0c0', fontSize: 11 }}>实例购买 · 李算法 · 2 小时前</span>
        </div>
      </Card>

      {/* 告警动态卡 */}
      <Card size="small" style={{ borderRadius: 12, marginBottom: 12 }} title={<Space><AlertOutlined style={{ color: '#f5222d' }} />告警动态</Space>}>
        {data.unreadAlerts > 0 ? (
          <List size="small" dataSource={[
            { t: '实例告警', i: 'test-l40s-sandbox', time: '14:20' },
            { t: '过载提醒', i: 'llm-train-a100-01', time: '13:00' },
            { t: '到期提醒', i: 'llm-train-4090-01', time: '18:00' },
          ].slice(0, data.unreadAlerts)} renderItem={x => (
            <List.Item style={{ padding: '6px 0' }} onClick={() => nav('/app/instances')}>
              <Space><Tag color="red">{x.t}</Tag><span style={{ fontSize: 13 }}>{x.i}</span><span style={{ fontSize: 11, color: '#a6b0c0' }}>{x.time}</span></Space>
            </List.Item>
          )} />
        ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无告警" />}
      </Card>

      {/* 快捷操作 */}
      <Card size="small" style={{ borderRadius: 12 }} title="快捷操作">
        <Space direction="vertical" style={{ width: '100%' }}>
          <Button block icon={<DollarOutlined />} onClick={() => nav('/app/bills')}>立即续费</Button>
          <Button block icon={<FileTextOutlined />} onClick={() => message.success('开票入口（演示，Web 端可完整操作）')}>申请开票</Button>
          <Button block icon={<BellOutlined />} onClick={() => nav('/app/tickets/new')}>联系客服（新建工单）</Button>
        </Space>
      </Card>
    </div>
  );
}

// ============ 实例列表 ============
function InstList({ nav }) {
  const [list, setList] = useState([]);
  const [status, setStatus] = useState('全部');
  const load = () => api.get('/orders/instances', { params: { enterpriseId: localStorage.getItem('cx_enterprise'), status } }).then(({ instances }) => setList(instances));
  useEffect(load, [status]);

  const act = async (id, a, name) => {
    const { msg } = await api.post(`/orders/instances/${id}/action`, { action: a });
    message.success(`${name}成功`);
    load();
  };

  return (
    <div style={{ padding: 12 }}>
      <Segmented block value={status} onChange={setStatus} options={['全部', '运行中', '已停止', '异常', '待续费'].map(s => ({ value: s, label: s }))} style={{ marginBottom: 12 }} />
      {list.length === 0 && <Empty description={status === '全部' ? '暂无实例，去 Web 端创建吧' : `暂无${status}实例`} />}
      {list.map(i => (
        <Card key={i.id} size="small" style={{ borderRadius: 12, marginBottom: 10 }} onClick={() => nav(`/app/instances/${i.id}`)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{i.name}</div>
              <div style={{ fontSize: 12, color: '#7a8699' }}>{i.spec} · {i.region}</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                <Tag color={STATUS_COLOR[i.status]} style={{ marginRight: 4 }}>{i.status}</Tag>
                <span style={{ color: '#f5222d', fontWeight: 600 }}>¥{fmtMoney(i.current_cost)}</span>
                <span style={{ color: '#a6b0c0' }}> 累计</span>
              </div>
            </div>
            <Space direction="vertical" size={4} onClick={e => e.stopPropagation()}>
              {i.status === '运行中' && <Button size="small" icon={<PoweroffOutlined />} onClick={() => act(i.id, '停止', '停止')}>停止</Button>}
              {i.status === '已停止' && <Button size="small" type="primary" icon={<SyncOutlined />} onClick={() => act(i.id, '启动', '启动')}>启动</Button>}
              {i.status === '待续费' && <Button size="small" type="primary" icon={<DollarOutlined />} onClick={() => act(i.id, '续费', '续费')}>续费</Button>}
            </Space>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ============ 实例详情 ============
function InstDetail({ nav }) {
  const id = window.location.pathname.split('/').pop();
  const [data, setData] = useState(null);
  const load = () => api.get(`/orders/instances/${id}`).then(({ instance }) => setData(instance));
  useEffect(load, [id]);

  if (!data) return <Spin style={{ display: 'block', margin: '60px auto' }} />;
  const i = data;
  const sshCmd = `ssh -p ${i.ssh_port} ${i.ssh_user}@${i.ssh_host}`;

  const act = async (a, label) => {
    if (a === '释放') {
      const name = prompt('请输入实例名确认释放：' + i.name);
      if (name !== i.name) return message.warning('实例名不匹配，已取消');
    }
    const { msg } = await api.post(`/orders/instances/${id}/action`, { action: a });
    message.success(label === '释放' ? '释放中，数据将擦除' : msg);
    load();
  };

  return (
    <div style={{ padding: 12 }}>
      {i.status === '异常' && <div style={{ background: '#fff1f0', color: '#cf1322', padding: '8px 12px', borderRadius: 8, marginBottom: 10, fontSize: 12 }}>实例异常：宿主机网络故障，工单处理中，故障费用已减免</div>}
      <Card size="small" style={{ borderRadius: 12, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><b style={{ fontSize: 15 }}>{i.name}</b> <Tag color={STATUS_COLOR[i.status]}>{i.status}</Tag></div>
          <div style={{ color: '#f5222d', fontWeight: 700 }}>¥{fmtMoney(i.current_cost)}</div>
        </div>
        <div style={{ fontSize: 12, color: '#7a8699', marginTop: 6 }}>{i.spec} · {i.image}</div>
        <div style={{ fontSize: 12, color: '#7a8699' }}>到期：{i.expires_at || '-'}</div>
        <div style={{ background: '#f0f1f5', padding: '8px 10px', borderRadius: 6, marginTop: 10, fontSize: 12, fontFamily: 'monospace' }}>{sshCmd}</div>
      </Card>

      <Card size="small" title="监控（近 1 小时）" style={{ borderRadius: 12, marginBottom: 12 }}>
        {['gpu', 'vram', 'cpu', 'mem'].map(k => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ width: 40, fontSize: 12, color: '#7a8699' }}>{k === 'gpu' ? 'GPU' : k === 'vram' ? '显存' : k === 'cpu' ? 'CPU' : '内存'}</span>
            <div style={{ flex: 1, height: 8, background: '#eef0f4', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${data.monitor[k][data.monitor[k].length - 1]?.v || 0}%`, height: '100%', background: '#2f54eb', borderRadius: 4, transition: 'width .5s' }} />
            </div>
            <span style={{ fontSize: 12, width: 40, textAlign: 'right' }}>{data.monitor[k][data.monitor[k].length - 1]?.v || 0}%</span>
          </div>
        ))}
      </Card>

      <Card size="small" title="费用信息" style={{ borderRadius: 12, marginBottom: 12 }}>
        <Row>
          <Col span={8}><div style={{ fontSize: 11, color: '#a6b0c0' }}>单价</div><div>¥{i.price_hour}/时</div></Col>
          <Col span={8}><div style={{ fontSize: 11, color: '#a6b0c0' }}>预计日费</div><div>¥{fmtMoney(i.price_hour * 24)}</div></Col>
          <Col span={8}><div style={{ fontSize: 11, color: '#a6b0c0' }}>断点保护</div><div>{i.checkpoint ? '已启用' : '未启用'}</div></Col>
        </Row>
      </Card>

      <Card size="small" title="历史告警" style={{ borderRadius: 12, marginBottom: 12 }}>
        {i.alerts.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无告警" /> : i.alerts.map(a => (
          <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0' }}>
            <span><Tag color={STATUS_COLOR[a.level]}>{a.type}</Tag>{a.message}</span><span style={{ color: '#a6b0c0' }}>{a.triggered_at?.slice(11, 16)}</span>
          </div>
        ))}
      </Card>

      {/* 底部操作栏 */}
      <div style={{ position: 'sticky', bottom: 56, background: '#fff', borderRadius: 12, padding: 10, display: 'flex', gap: 8, boxShadow: '0 -2px 12px rgba(0,0,0,.06)' }}>
        {i.status === '运行中' && <Button block type="primary" icon={<PoweroffOutlined />} onClick={() => act('停止', '停止')}>停止</Button>}
        {i.status === '已停止' && <Button block type="primary" icon={<SyncOutlined />} onClick={() => act('启动', '启动')}>启动</Button>}
        {i.status === '待续费' && <Button block type="primary" icon={<DollarOutlined />} onClick={() => act('续费', '续费')}>续费</Button>}
        <Button block danger icon={<DeleteOutlined />} onClick={() => act('释放', '释放')}>释放</Button>
        <Button block icon={<ArrowLeftOutlined />} onClick={() => nav('/app/instances')}>返回</Button>
      </div>
    </div>
  );
}

// ============ 账单 ============
function Bills({ nav }) {
  const [list, setList] = useState([]);
  const [status, setStatus] = useState('全部');
  useEffect(() => {
    api.get('/billing/bills', { params: { enterpriseId: localStorage.getItem('cx_enterprise'), status } }).then(({ bills }) => setList(bills));
  }, [status]);

  return (
    <div style={{ padding: 12 }}>
      <Segmented block value={status} onChange={setStatus} options={['全部', '待支付', '已支付'].map(s => ({ value: s, label: s }))} style={{ marginBottom: 12 }} />
      {list.length === 0 && <Empty description="暂无账单" />}
      {list.map(b => (
        <Card key={b.id} size="small" style={{ borderRadius: 12, marginBottom: 10 }} onClick={() => nav(`/app/bills/${b.id}`)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{b.bill_no}</div>
              <div style={{ fontSize: 12, color: '#7a8699' }}>账期 {b.period} · {b.created_at}</div>
              <div style={{ marginTop: 4 }}><Tag color={STATUS_COLOR[b.status]}>{b.status}</Tag><Tag color={STATUS_COLOR[b.invoice_status]} style={{ marginLeft: 4 }}>开票：{b.invoice_status}</Tag></div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700, color: '#f5222d', fontSize: 16 }}>¥{fmtMoney(b.amount)}</div>
              <div style={{ fontSize: 11, color: '#2f54eb' }}>查看明细 ›</div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function BillDetail({ nav }) {
  const id = window.location.pathname.split('/').pop();
  const [data, setData] = useState(null);
  useEffect(() => api.get(`/billing/bills/${id}`).then(({ bill }) => setData(bill)), [id]);
  if (!data) return <Spin style={{ display: 'block', margin: '60px auto' }} />;

  const pay = async () => {
    try { const { msg } = await api.post(`/billing/bills/${id}/pay`); message.success(msg); setData({ ...data, status: '已支付' }); }
    catch (e) { message.error(e.message); }
  };

  return (
    <div style={{ padding: 12 }}>
      <Card size="small" style={{ borderRadius: 12, marginBottom: 12 }}>
        <div style={{ color: '#7a8699', fontSize: 12 }}>账单 {data.bill_no} · {data.period}</div>
        <div style={{ fontSize: 32, fontWeight: 700, color: '#f5222d' }}>¥{fmtMoney(data.amount)}</div>
        <Tag color={STATUS_COLOR[data.status]}>{data.status}</Tag> <Tag>{data.paid_at ? '余额支付' : '待支付'}</Tag>
      </Card>
      <Card size="small" title="费用明细" style={{ borderRadius: 12, marginBottom: 12 }}>
        {data.items.map(x => (
          <div key={x.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, borderBottom: '1px solid #f0f1f5' }}>
            <div>{x.name}<div style={{ fontSize: 11, color: '#a6b0c0' }}>{x.spec}</div></div>
            <b>¥{fmtMoney(x.amount)}</b>
          </div>
        ))}
      </Card>
      {data.status === '待支付' && <Button block type="primary" size="large" style={{ borderRadius: 10 }} onClick={pay}>立即支付</Button>}
      <Button block style={{ marginTop: 8, borderRadius: 10 }} icon={<ArrowLeftOutlined />} onClick={() => nav('/app/bills')}>返回</Button>
    </div>
  );
}

// ============ 我的 ============
function Me({ me, nav }) {
  return (
    <div style={{ padding: 12 }}>
      <Card size="small" style={{ borderRadius: 12, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar size={48} style={{ background: '#2f54eb', fontSize: 20 }}>{me?.name?.[0]}</Avatar>
          <div>
            <div style={{ fontWeight: 700 }}>{me?.name}</div>
            <div style={{ fontSize: 12, color: '#7a8699' }}>{me?.role} · 星云智能科技有限公司</div>
            <Tag color="green" style={{ marginTop: 4 }}>已认证</Tag>
          </div>
        </div>
      </Card>
      <Card size="small" style={{ borderRadius: 12, marginBottom: 12 }}>
        {[
          { icon: <UserOutlined />, label: '成员管理', onlyAdmin: true, to: '/app/members' },
          { icon: <BellOutlined />, label: '消息中心', to: '/app/messages' },
          { icon: <AuditOutlined />, label: '待办审批', to: '/app/approvals' },
          { icon: <FileTextOutlined />, label: '通知偏好设置', onClick: () => message.info('通知偏好（演示）') },
          { icon: <ThunderboltOutlined />, label: '帮助与客服', to: '/app/tickets/new' },
          { icon: <ArrowLeftOutlined />, label: '返回 Web 管理台', to: '/console' },
        ].filter(x => !x.onlyAdmin || me?.role === '企业管理员').map(x => (
          <div key={x.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid #f0f1f5', cursor: 'pointer', fontSize: 14 }} onClick={() => (x.to ? nav(x.to) : x.onClick?.())}>
            <span style={{ color: '#2f54eb' }}>{x.icon}</span>{x.label}<span style={{ marginLeft: 'auto', color: '#a6b0c0' }}>›</span>
          </div>
        ))}
      </Card>
      <Button block danger onClick={() => { localStorage.removeItem('cx_uid'); nav('/login'); }} style={{ borderRadius: 10 }}>退出登录</Button>
    </div>
  );
}

// ============ 消息中心 ============
function Messages({ nav }) {
  const [list, setList] = useState([]);
  const [cat, setCat] = useState('全部');
  useEffect(() => {
    api.get('/notify/notifications', { params: { userId: localStorage.getItem('cx_uid'), category: cat } }).then(({ notifications }) => setList(notifications));
  }, [cat]);

  return (
    <div style={{ padding: 12 }}>
      <Segmented block value={cat} onChange={setCat} options={['全部', '告警', '审批', '账单', '系统'].map(c => ({ value: c, label: c }))} style={{ marginBottom: 12 }} />
      <Card size="small" style={{ borderRadius: 12 }}>
        {list.length === 0 ? <Empty description="暂无消息" /> : list.map(n => (
          <div key={n.id} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid #f0f1f5', cursor: 'pointer', opacity: n.is_read ? .6 : 1 }}
            onClick={() => { if (!n.is_read) api.post('/notify/notifications/read', { ids: [n.id] }); if (n.category === '审批') nav('/app/approvals'); else if (n.category === '账单') nav('/app/bills'); else if (n.category === '告警') nav('/app/instances'); }}>
            <span style={{ color: n.is_read ? '#a6b0c0' : '#f5222d' }}>{n.is_read ? '●' : '●'}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{n.title} <Tag style={{ marginLeft: 4 }}>{n.category}</Tag></div>
              <div style={{ fontSize: 12, color: '#7a8699' }}>{n.content}</div>
              <div style={{ fontSize: 11, color: '#a6b0c0' }}>{n.created_at}</div>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ============ 审批列表 ============
function Approvals({ nav }) {
  const [list, setList] = useState([]);
  useEffect(() => {
    api.get('/org/approvals', { params: { userId: localStorage.getItem('cx_uid') } }).then(({ approvals }) => setList(approvals));
  }, []);

  const decide = async (id, action) => {
    await api.post(`/org/approvals/${id}/decide`, { action, note: '' });
    message.success(action === '通过' ? '已通过' : '已驳回');
    setList(list.filter(a => a.id !== id));
  };

  return (
    <div style={{ padding: 12 }}>
      {list.length === 0 && <Empty description="暂无审批" />}
      {list.filter(a => a.status === '待审批').map(a => (
        <Card key={a.id} size="small" style={{ borderRadius: 12, marginBottom: 10 }}>
          <Tag color={a.type === '实例购买' ? 'blue' : 'orange'}>{a.type}</Tag>
          <div style={{ fontWeight: 600, marginTop: 4 }}>{a.title}</div>
          <div style={{ fontSize: 12, color: '#7a8699', margin: '6px 0' }}>{a.created_at}</div>
          <Space>
            <Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={() => decide(a.id, '通过')}>通过</Button>
            <Button size="small" danger icon={<CloseCircleOutlined />} onClick={() => decide(a.id, '驳回')}>驳回</Button>
          </Space>
        </Card>
      ))}
    </div>
  );
}

// ============ 成员管理 ============
function Members({ nav }) {
  const [list, setList] = useState([]);
  useEffect(() => { api.get('/org/members', { params: { enterpriseId: localStorage.getItem('cx_enterprise') } }).then(({ members }) => setList(members)); }, []);
  return (
    <div style={{ padding: 12 }}>
      <Card size="small" style={{ borderRadius: 12 }}>
        {list.map(m => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid #f0f1f5' }}>
            <Avatar size={36} style={{ background: '#13c2c2' }}>{m.name?.[0]}</Avatar>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{m.name}</div>
              <div style={{ fontSize: 12, color: '#7a8699' }}>{m.phone}</div>
            </div>
            <Tag color={STATUS_COLOR[m.role]}>{m.role}</Tag>
          </div>
        ))}
      </Card>
      <Button block style={{ marginTop: 12, borderRadius: 10 }} icon={<ArrowLeftOutlined />} onClick={() => nav('/app/me')}>返回</Button>
    </div>
  );
}

// ============ 新建工单 ============
function NewTicket({ nav }) {
  const [form] = Form.useForm();
  const submit = async () => {
    const v = await form.validateFields();
    await api.post('/tickets/tickets', { enterpriseId: localStorage.getItem('cx_enterprise'), userId: localStorage.getItem('cx_uid'), type: v.type, content: v.content });
    message.success('工单已提交，将在 SLA 内响应');
    nav('/app/me');
  };
  return (
    <div style={{ padding: 12 }}>
      <Card size="small" style={{ borderRadius: 12 }}>
        <Form form={form} layout="vertical" initialValues={{ type: '故障' }}>
          <Form.Item name="type" label="工单类型" rules={[{ required: true }]}>
            <Select options={['故障', '性能争议', '计费争议', '发票', '退款', '投诉'].map(t => ({ value: t, label: t }))} />
          </Form.Item>
          <Form.Item name="content" label="问题描述" rules={[{ required: true }]}><Input.TextArea rows={4} /></Form.Item>
          <Button type="primary" block onClick={submit}>提交工单</Button>
        </Form>
      </Card>
      <Button block style={{ marginTop: 8, borderRadius: 10 }} icon={<ArrowLeftOutlined />} onClick={() => nav('/app/me')}>返回</Button>
    </div>
  );
}
