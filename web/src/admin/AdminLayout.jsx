import { useEffect, useState } from 'react';
import { Layout, Menu, Dropdown, Avatar, Space, Button, message, Statistic, Row, Col, Card, Table, Tag, Modal, Form, Input, Rate, Popconfirm, Alert } from 'antd';
import { DashboardOutlined, SafetyCertificateOutlined, AppstoreOutlined, TeamOutlined, FileTextOutlined, MessageOutlined, DollarOutlined, NotificationOutlined, ThunderboltOutlined, ArrowLeftOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../api.js';
import { fmtMoney, fmtInt, STATUS_COLOR } from '../api.js';
import { LineChart } from '../components/charts.jsx';

const { Sider, Header, Content } = Layout;

export default function AdminLayout() {
  const nav = useNavigate();
  const [tab, setTab] = useState('ov');
  const [data, setData] = useState(null);
  const [providers, setProviders] = useState([]);
  const [resources, setResources] = useState([]);
  const [enterprises, setEnterprises] = useState([]);
  const [orders, setOrders] = useState([]);
  const [bills, setBills] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeForm] = Form.useForm();

  const loadAll = () => {
    api.get('/admin/overview').then(({ overview }) => setData(overview));
    api.get('/admin/providers').then(({ providers }) => setProviders(providers));
    api.get('/admin/resources').then(({ resources }) => setResources(resources));
    api.get('/admin/enterprises').then(({ enterprises }) => setEnterprises(enterprises));
    api.get('/admin/orders').then(({ orders }) => setOrders(orders));
    api.get('/admin/bills').then(({ bills }) => setBills(bills));
    api.get('/admin/tickets').then(({ tickets }) => setTickets(tickets));
    api.get('/admin/settlements').then(({ settlements }) => setSettlements(settlements));
  };
  useEffect(loadAll, []);

  const auditProvider = async (id, status) => {
    await api.post(`/admin/providers/${id}/audit`, { status });
    message.success(`审核结果：${status}`);
    loadAll();
  };

  const publish = async () => {
    const v = await noticeForm.validateFields();
    await api.post('/admin/announcement', v);
    message.success('公告已发布至全体用户');
    setNoticeOpen(false);
    loadAll();
  };

  const menuItems = [
    { key: 'ov', icon: <DashboardOutlined />, label: '平台概览' },
    { key: 'prv', icon: <SafetyCertificateOutlined />, label: '资源方审核' },
    { key: 'res', icon: <AppstoreOutlined />, label: '市场管理' },
    { key: 'ent', icon: <TeamOutlined />, label: '企业管理' },
    { key: 'ord', icon: <FileTextOutlined />, label: '订单管理' },
    { key: 'bill', icon: <DollarOutlined />, label: '账单与结算' },
    { key: 'tk', icon: <MessageOutlined />, label: '工单与售后' },
    { key: 'notice', icon: <NotificationOutlined />, label: '公告发布' },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={200} theme="light" style={{ borderRight: '1px solid #eef0f4' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 16px' }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: 'linear-gradient(135deg,#fa8c16,#f5222d)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18 }}>
            <ThunderboltOutlined />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>ComputeX · 平台</div>
            <div style={{ fontSize: 10, color: '#a6b0c0' }}>运营管理后台</div>
          </div>
        </div>
        <Menu mode="inline" items={menuItems} selectedKeys={[tab]} onClick={({ key }) => setTab(key)} style={{ border: 'none' }} />
        <div style={{ position: 'absolute', bottom: 16, left: 16, right: 16 }}>
          <Button block icon={<ArrowLeftOutlined />} onClick={() => nav('/console')}>返回控制台</Button>
        </div>
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #eef0f4' }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>平台管理后台 · {menuItems.find(m => m.key === tab)?.label}</div>
          <Dropdown menu={{ items: [{ key: 'logout', label: '退出登录', onClick: async () => { try { await api.post('/auth/logout'); } finally { ['cx_token', 'cx_uid', 'cx_enterprise', 'cx_guest', 'cx_provider'].forEach(k => localStorage.removeItem(k)); nav('/login'); } } }] }}>
            <Space style={{ cursor: 'pointer' }}><Avatar style={{ background: '#fa8c16' }}>平</Avatar>平台运营</Space>
          </Dropdown>
        </Header>
        <Content style={{ padding: 24, background: '#f5f6f8' }}>
          {tab === 'ov' && data && (
            <div>
              <Row gutter={[16, 16]}>
                <Col span={6}><Card><Statistic title="累计 GMV" value={data.overview.gmv} precision={2} prefix="¥" valueStyle={{ color: '#f5222d' }} /></Card></Col>
                <Col span={6}><Card><Statistic title="本月 GMV" value={data.overview.monthGmv} precision={2} prefix="¥" valueStyle={{ color: '#2f54eb' }} /></Card></Col>
                <Col span={6}><Card><Statistic title="企业数" value={data.overview.enterpriseCount} suffix="家" /></Card></Col>
                <Col span={6}><Card><Statistic title="资源方" value={data.overview.providerCount} suffix={`家（待审核 ${data.overview.pendingProviders}）`} valueStyle={{ color: data.overview.pendingProviders ? '#faad14' : undefined }} /></Card></Col>
              </Row>
              <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                <Col span={14}><Card title="GMV 趋势（近 6 个月）" size="small"><LineChart data={data.overview.trend} height={240} color="#f5222d" label="单位：万元" /></Card></Col>
                <Col span={10}>
                  <Card title="供给与运行" size="small">
                    <Row gutter={12}>
                      <Col span={12}><Statistic title="运行中实例" value={data.overview.activeInstances} suffix="台" valueStyle={{ color: '#13c2c2' }} /></Col>
                      <Col span={12}><Statistic title="资源利用率" value={data.overview.utilization} suffix="%" valueStyle={{ color: '#fa8c16' }} /></Col>
                    </Row>
                    <Alert style={{ marginTop: 16 }} type="info" showIcon message="治理红线" description="计费差错率 ≤0.1%；核心实例可用性 ≥99.9%；供给方结算逾期率 ≤1%——突破即触发管理层复盘。" />
                  </Card>
                </Col>
              </Row>
            </div>
          )}

          {tab === 'prv' && (
            <Card size="small" title="资源方入驻审核">
              <Table rowKey="id" dataSource={providers} pagination={false} columns={[
                { title: '资源方', dataIndex: 'name', render: (v, r) => <div><b>{v}</b><div style={{ fontSize: 12, color: '#a6b0c0' }}>{r.location}</div></div> },
                { title: '资质状态', dataIndex: 'cert_status', width: 100, render: v => <Tag color={STATUS_COLOR[v]}>{v}</Tag> },
                { title: '保证金', dataIndex: 'deposit', width: 110, render: v => `¥${fmtInt(v)}` },
                { title: '结算费率', dataIndex: 'fee_rate', width: 90, render: v => `${Math.round(v * 100)}%` },
                { title: '评分', dataIndex: 'rating', width: 120, render: v => v ? <Rate disabled defaultValue={v} style={{ fontSize: 12 }} /> : '-' },
                { title: '联系人', dataIndex: 'contacts', width: 160, render: v => { const c = JSON.parse(v || '{}'); return c.contact ? `${c.contact} ${c.phone}` : '-'; } },
                { title: '操作', key: 'op', width: 170, render: (_, p) => p.cert_status === '审核中' ? (
                  <Space>
                    <Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={() => auditProvider(p.id, '已通过')}>通过</Button>
                    <Button size="small" danger icon={<CloseCircleOutlined />} onClick={() => auditProvider(p.id, '已驳回')}>驳回</Button>
                  </Space>
                ) : p.cert_status === '已通过' ? <Button size="small" danger onClick={() => auditProvider(p.id, '已停用')}>停用</Button> : <span style={{ color: '#a6b0c0' }}>已处理</span> },
              ]} />
              <div style={{ color: '#a6b0c0', fontSize: 12, marginTop: 8 }}>准入流程：资质审核 → 机房/网络/安全核验 → 基准测试 → 上架；新入驻资源方缴纳 1-3 个月预期收益保证金。</div>
            </Card>
          )}

          {tab === 'res' && (
            <Card size="small" title="资源市场管理（上下架 / 状态）">
              <Table rowKey="id" dataSource={resources} pagination={false} columns={[
                { title: '规格', dataIndex: 'spec', render: v => <b>{v}</b> },
                { title: '资源方', dataIndex: 'provider_name', width: 130 },
                { title: '地域', dataIndex: 'region', width: 70 },
                { title: '状态', dataIndex: 'status', width: 90, render: v => <Tag color={STATUS_COLOR[v]}>{v}</Tag> },
                { title: '库存', dataIndex: 'stock', width: 70 },
                { title: '时价', dataIndex: 'price_hour', width: 90, render: v => <b style={{ color: '#f5222d' }}>¥{v}</b> },
                { title: '基准分', dataIndex: 'benchmark', width: 80, render: v => <b style={{ color: '#2f54eb' }}>{v}</b> },
                { title: '健康分', dataIndex: 'health', width: 90, render: v => <Tag color={v >= 90 ? 'green' : v >= 80 ? 'orange' : 'red'}>{v}</Tag> },
                { title: '操作', key: 'op', width: 150, render: (_, r) => (
                  <Space>
                    {r.status === '可售' ? <Button size="small" danger onClick={async () => { await api.post(`/provider/resources/${r.id}/status`, { status: '已下架' }); message.success('已下架'); loadAll(); }}>下架</Button>
                      : <Button size="small" type="primary" onClick={async () => { await api.post(`/provider/resources/${r.id}/status`, { status: '可售' }); message.success('已上架'); loadAll(); }}>上架</Button>}
                  </Space>
                )},
              ]} />
            </Card>
          )}

          {tab === 'ent' && (
            <Card size="small" title="企业管理">
              <Table rowKey="id" dataSource={enterprises} pagination={false} columns={[
                { title: '企业', dataIndex: 'name', render: (v, r) => <div><b>{v}</b><div style={{ fontSize: 12, color: '#a6b0c0' }}>ID: {r.id}</div></div> },
                { title: '认证', dataIndex: 'cert_status', width: 100, render: v => <Tag color={STATUS_COLOR[v]}>{v}</Tag> },
                { title: '成员', dataIndex: 'memberCount', width: 70 },
                { title: '项目', dataIndex: 'projectCount', width: 70 },
                { title: '余额', dataIndex: 'balance', width: 130, render: v => `¥${fmtMoney(v)}` },
                { title: '授信', dataIndex: 'credit_limit', width: 130, render: v => `¥${fmtInt(v)}` },
                { title: '开票资质', dataIndex: 'invoice_qualification', width: 100, render: v => <Tag color={v ? 'green' : 'default'}>{v ? '可开专票' : '仅普票'}</Tag> },
                { title: '创建时间', dataIndex: 'created_at', width: 160, render: v => <span style={{ fontSize: 12 }}>{v}</span> },
              ]} />
            </Card>
          )}

          {tab === 'ord' && (
            <Card size="small" title="全部订单">
              <Table rowKey="id" dataSource={orders} pagination={false} columns={[
                { title: '订单号', dataIndex: 'order_no', render: v => <b>{v}</b> },
                { title: '企业', dataIndex: 'enterprise_name', width: 140 },
                { title: '规格', dataIndex: 'spec' },
                { title: '数量', dataIndex: 'quantity', width: 60 },
                { title: '金额', dataIndex: 'amount', width: 120, render: v => <b style={{ color: '#f5222d' }}>¥{fmtMoney(v)}</b> },
                { title: '状态', dataIndex: 'status', width: 90, render: v => <Tag color={STATUS_COLOR[v]}>{v}</Tag> },
                { title: '支付方式', dataIndex: 'pay_method', width: 90 },
                { title: '下单时间', dataIndex: 'created_at', width: 150, render: v => <span style={{ fontSize: 12 }}>{v}</span> },
              ]} />
            </Card>
          )}

          {tab === 'bill' && (
            <div>
              <Card size="small" title="账单（财务对账）" style={{ marginBottom: 16 }}>
                <Table rowKey="id" size="small" dataSource={bills} pagination={false} columns={[
                  { title: '账单号', dataIndex: 'bill_no', render: v => <b>{v}</b> },
                  { title: '企业', dataIndex: 'enterprise_name', width: 140 },
                  { title: '账期', dataIndex: 'period', width: 90 },
                  { title: '金额', dataIndex: 'amount', width: 120, render: v => <b>¥{fmtMoney(v)}</b> },
                  { title: '状态', dataIndex: 'status', width: 90, render: v => <Tag color={STATUS_COLOR[v]}>{v}</Tag> },
                  { title: '开票', dataIndex: 'invoice_status', width: 90, render: v => <Tag color={STATUS_COLOR[v]}>{v}</Tag> },
                ]} />
              </Card>
              <Card size="small" title="供给方结算（平台佣金 7%-9% 差异化）">
                <Table rowKey="id" size="small" dataSource={settlements} pagination={false} columns={[
                  { title: '结算单', dataIndex: 'settle_no', render: v => <b>{v}</b> },
                  { title: '资源方', dataIndex: 'provider_name', width: 140 },
                  { title: '账期', dataIndex: 'period', width: 90 },
                  { title: 'GMV', dataIndex: 'gmv', width: 110, render: v => `¥${fmtMoney(v)}` },
                  { title: '平台佣金', dataIndex: 'commission', width: 110, render: v => <span style={{ color: '#faad14' }}>¥{fmtMoney(v)}</span> },
                  { title: '结算金额', dataIndex: 'amount', width: 110, render: v => <b>¥{fmtMoney(v)}</b> },
                  { title: '状态', dataIndex: 'status', width: 90, render: v => <Tag color={STATUS_COLOR[v]}>{v}</Tag> },
                  { title: '结算周期', dataIndex: 'cycle', width: 90 },
                ]} />
                <div style={{ color: '#a6b0c0', fontSize: 12, marginTop: 8 }}>资金隔离：客户资金与平台资金分账管理；坏账由平台统一计提与追偿；对账 T+1。</div>
              </Card>
            </div>
          )}

          {tab === 'tk' && (
            <Card size="small" title="工单与售后（SLA 监控）">
              <Table rowKey="id" dataSource={tickets} pagination={false} columns={[
                { title: '工单号', dataIndex: 'ticket_no', render: v => <b>{v}</b> },
                { title: '企业', dataIndex: 'enterprise_name', width: 140 },
                { title: '类型', dataIndex: 'type', width: 100, render: v => <Tag color={v === '故障' ? 'red' : v === '计费争议' ? 'orange' : 'blue'}>{v}</Tag> },
                { title: '问题', dataIndex: 'content', ellipsis: true },
                { title: '状态', dataIndex: 'status', width: 90, render: v => <Tag color={STATUS_COLOR[v]}>{v}</Tag> },
                { title: 'SLA 时限', dataIndex: 'sla_at', width: 150, render: v => <span style={{ fontSize: 12 }}>{v}</span> },
                { title: '处理人', dataIndex: 'handler', width: 130, render: v => v || <Tag color="red">未分配</Tag> },
                { title: '操作', key: 'op', width: 140, render: (_, t) => t.status === '待处理' ? (
                  <Button size="small" type="primary" onClick={async () => { await api.post(`/tickets/tickets/${t.id}/status`, { status: '处理中', handler: '平台客服-小王' }); message.success('已接单'); loadAll(); }}>分配处理</Button>
                ) : <Button size="small" onClick={async () => { await api.post(`/tickets/tickets/${t.id}/status`, { status: '已解决', handler: t.handler }); message.success('已关闭'); loadAll(); }}>关闭</Button> },
              ]} />
              <div style={{ color: '#a6b0c0', fontSize: 12, marginTop: 8 }}>首次响应达标率目标 ≥95%；工单超时自动升级至上级处理人并计入客服考核；可用性未达 SLA 自动触发补偿。</div>
            </Card>
          )}

          {tab === 'notice' && (
            <Card size="small" title="发布系统公告" style={{ maxWidth: 600 }}>
              <Form form={noticeForm} layout="vertical">
                <Form.Item name="title" label="公告标题" rules={[{ required: true }]}><Input placeholder="如：8 月 20 日平台维护升级通知" /></Form.Item>
                <Form.Item name="content" label="公告内容" rules={[{ required: true }]}><Input.TextArea rows={5} placeholder="公告内容将推送至全体用户的站内信 / App / 邮件" /></Form.Item>
                <Button type="primary" onClick={publish}>发布公告</Button>
              </Form>
            </Card>
          )}
        </Content>
      </Layout>
    </Layout>
  );
}
