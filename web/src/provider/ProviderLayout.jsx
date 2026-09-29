import { useEffect, useState } from 'react';
import { Layout, Menu, Dropdown, Avatar, Space, Button, message, Statistic, Row, Col, Card, Table, Tag, Progress, Modal, Form, InputNumber } from 'antd';
import { DashboardOutlined, AppstoreOutlined, FileTextOutlined, MessageOutlined, SafetyCertificateOutlined, ThunderboltOutlined, ArrowLeftOutlined, LineChartOutlined } from '@ant-design/icons';
import { Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import api from '../api.js';
import { fmtMoney, fmtInt, STATUS_COLOR } from '../api.js';
import { LineChart } from '../components/charts.jsx';

const { Sider, Header, Content } = Layout;

export default function ProviderLayout() {
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [resources, setResources] = useState([]);
  const [orders, setOrders] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [priceModal, setPriceModal] = useState(null);
  const [form] = Form.useForm();
  const providerId = localStorage.getItem('cx_provider') || 'prv-cloud';

  const loadAll = () => {
    api.get('/provider/overview', { params: { providerId } }).then(({ overview }) => setData(overview));
    api.get('/provider/resources', { params: { providerId } }).then(({ resources }) => setResources(resources));
    api.get('/provider/orders', { params: { providerId } }).then(({ orders }) => setOrders(orders));
    api.get('/billing/settlements', { params: { providerId } }).then(({ settlements }) => setSettlements(settlements));
    api.get('/provider/tickets', { params: { providerId } }).then(({ tickets }) => setTickets(tickets));
  };
  useEffect(loadAll, []);

  const setStatus = async (id, status) => {
    await api.post(`/provider/resources/${id}/status`, { status });
    message.success(status === '可售' ? '已上架' : '已下架');
    loadAll();
  };

  const savePrice = async () => {
    const v = await form.validateFields();
    await api.post(`/provider/resources/${priceModal.id}/price`, v);
    message.success('报价已更新');
    setPriceModal(null);
    loadAll();
  };

  const menuItems = [
    { key: 'ov', icon: <DashboardOutlined />, label: '概览' },
    { key: 'res', icon: <AppstoreOutlined />, label: '资源管理' },
    { key: 'ord', icon: <FileTextOutlined />, label: '订单与结算' },
    { key: 'tk', icon: <MessageOutlined />, label: '工单协同' },
    { key: 'acct', icon: <SafetyCertificateOutlined />, label: '账户与资质' },
  ];
  const [tab, setTab] = useState('ov');

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={200} theme="light" style={{ borderRight: '1px solid #eef0f4' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 16px' }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: 'linear-gradient(135deg,#13c2c2,#2f54eb)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18 }}>
            <ThunderboltOutlined />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>ComputeX · 资源方</div>
            <div style={{ fontSize: 10, color: '#a6b0c0' }}>华东智算中心</div>
          </div>
        </div>
        <Menu mode="inline" items={menuItems} selectedKeys={[tab]} onClick={({ key }) => setTab(key)} style={{ border: 'none' }} />
        <div style={{ position: 'absolute', bottom: 16, left: 16, right: 16 }}>
          <Button block icon={<ArrowLeftOutlined />} onClick={() => nav('/console')}>返回需求方控制台</Button>
        </div>
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #eef0f4' }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>资源方后台 · {menuItems.find(m => m.key === tab)?.label}</div>
          <Dropdown menu={{ items: [{ key: 'logout', label: '退出登录', onClick: () => { localStorage.removeItem('cx_provider'); nav('/login'); } }] }}>
            <Space style={{ cursor: 'pointer' }}><Avatar style={{ background: '#13c2c2' }}>华</Avatar>华东智算中心</Space>
          </Dropdown>
        </Header>
        <Content style={{ padding: 24, background: '#f5f6f8' }}>
          {tab === 'ov' && data && (
            <div>
              <Row gutter={[16, 16]}>
                <Col span={6}><Card><Statistic title="运行中实例" value={data.overview.running} valueStyle={{ color: '#13c2c2' }} /></Card></Col>
                <Col span={6}><Card><Statistic title="本月结算收益" value={data.overview.monthRevenue} precision={2} prefix="¥" valueStyle={{ color: '#2f54eb' }} /></Card></Col>
                <Col span={6}><Card><Statistic title="累计结算收益" value={data.overview.totalRevenue} precision={2} prefix="¥" /></Card></Col>
                <Col span={6}><Card><Statistic title="资源利用率" value={data.overview.utilization} suffix="%" valueStyle={{ color: '#fa8c16' }} /></Card></Col>
              </Row>
              <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                <Col span={12}><Card title="近 6 周结算收益趋势" size="small"><LineChart data={data.overview.trend} height={220} color="#13c2c2" label="单位：元" /></Card></Col>
                <Col span={6}>
                  <Card title="库存概览" size="small">
                    <Statistic title="可售库存" value={data.overview.stockTotal} suffix="台" />
                    <div style={{ marginTop: 12, color: '#7a8699' }}>上架资源 <b>{data.overview.resourcesCount}</b> 个 · 异常实例 <b style={{ color: '#f5222d' }}>{data.overview.faultCount}</b></div>
                    <div style={{ marginTop: 8, color: '#7a8699' }}>待结算 <b style={{ color: '#faad14' }}>{data.overview.settlementPending}</b> 笔</div>
                  </Card>
                </Col>
                <Col span={6}><Card title="本月收益预估" size="small"><Statistic title="按当前利用率估算" value={data.overview.trend[5]?.v * 1.15 || 0} precision={0} prefix="¥" valueStyle={{ color: '#52c41a' }} /></Card></Col>
              </Row>
            </div>
          )}

          {tab === 'res' && (
            <Card size="small" title="资源管理（上架 / 报价 / 库存）">
              <Table rowKey="id" dataSource={resources} pagination={false} columns={[
                { title: '规格', dataIndex: 'spec', render: v => <b>{v}</b> },
                { title: 'GPU', dataIndex: 'gpu_model' },
                { title: '地域', dataIndex: 'region', width: 80 },
                { title: '状态', dataIndex: 'status', width: 90, render: v => <Tag color={STATUS_COLOR[v]}>{v}</Tag> },
                { title: '运行实例', dataIndex: 'running', width: 90, render: v => <Tag color={v > 0 ? 'green' : 'default'}>{v} 台</Tag> },
                { title: '库存', dataIndex: 'stock', width: 80, render: v => <b>{v}</b> },
                { title: '时价/包日/包月', key: 'price', width: 170, render: (_, r) => <span>¥{r.price_hour} / ¥{r.price_day} / ¥{fmtInt(r.price_month)}</span> },
                { title: '健康分', dataIndex: 'health', width: 110, render: v => <Progress percent={v} size="small" strokeColor={v >= 90 ? '#52c41a' : v >= 80 ? '#faad14' : '#f5222d'} /> },
                { title: '操作', key: 'op', width: 170, render: (_, r) => (
                  <Space>
                    <Button size="small" onClick={() => { setPriceModal(r); form.setFieldsValue({ price_hour: r.price_hour, price_day: r.price_day, price_month: r.price_month }); }}>调整报价</Button>
                    {r.status === '可售' ? <Button size="small" danger onClick={() => setStatus(r.id, '已下架')}>下架</Button> : <Button size="small" type="primary" onClick={() => setStatus(r.id, '可售')}>上架</Button>}
                  </Space>
                )},
              ]} />
            </Card>
          )}

          {tab === 'ord' && (
            <div>
              <Card size="small" title="订单" style={{ marginBottom: 16 }}>
                <Table rowKey="id" size="small" dataSource={orders} pagination={false} columns={[
                  { title: '订单号', dataIndex: 'order_no', render: v => <b>{v}</b> },
                  { title: '规格', dataIndex: 'spec' },
                  { title: '数量', dataIndex: 'quantity', width: 60 },
                  { title: '计费', dataIndex: 'billing_type', width: 80 },
                  { title: '金额', dataIndex: 'amount', width: 120, render: v => <b style={{ color: '#f5222d' }}>¥{fmtMoney(v)}</b> },
                  { title: '状态', dataIndex: 'status', width: 90, render: v => <Tag color={STATUS_COLOR[v]}>{v}</Tag> },
                  { title: '下单时间', dataIndex: 'created_at', width: 150, render: v => <span style={{ fontSize: 12 }}>{v}</span> },
                ]} />
              </Card>
              <Card size="small" title="结算明细（T+7 结算 · 平台佣金 7%）">
                <Table rowKey="id" dataSource={settlements} pagination={false} columns={[
                  { title: '结算单号', dataIndex: 'settle_no', render: v => <b>{v}</b> },
                  { title: '账期', dataIndex: 'period', width: 100 },
                  { title: '成交金额(GMV)', dataIndex: 'gmv', width: 130, render: v => `¥${fmtMoney(v)}` },
                  { title: '平台佣金', dataIndex: 'commission', width: 130, render: v => <span style={{ color: '#faad14' }}>¥{fmtMoney(v)}</span> },
                  { title: '结算金额', dataIndex: 'amount', width: 130, render: v => <b style={{ color: '#52c41a' }}>¥{fmtMoney(v)}</b> },
                  { title: '状态', dataIndex: 'status', width: 90, render: v => <Tag color={STATUS_COLOR[v]}>{v}</Tag> },
                  { title: '操作', key: 'op', width: 110, render: (_, s) => s.status === '已结算' ? <Button size="small" type="primary" onClick={async () => { await api.post(`/billing/settlements/${s.id}/withdraw`); message.success('提现申请成功'); loadAll(); }}>提现</Button> : '-' },
                ]} />
                <div style={{ color: '#a6b0c0', fontSize: 12, marginTop: 8 }}>结算周期 T+7；最低提现 100 元，提现手续费由平台承担；保证金 ¥50,000 用于先行赔付。</div>
              </Card>
            </div>
          )}

          {tab === 'tk' && (
            <Card size="small" title="运维协同工单（平台派单）">
              <Table rowKey="id" dataSource={tickets} pagination={false} columns={[
                { title: '工单号', dataIndex: 'ticket_no', render: v => <b>{v}</b> },
                { title: '类型', dataIndex: 'type', width: 100, render: v => <Tag color={v === '故障' ? 'red' : 'orange'}>{v}</Tag> },
                { title: '问题', dataIndex: 'content', ellipsis: true },
                { title: '状态', dataIndex: 'status', width: 90, render: v => <Tag color={STATUS_COLOR[v]}>{v}</Tag> },
                { title: '优先级', dataIndex: 'priority', width: 80, render: v => <Tag color={v === '紧急' ? 'red' : 'default'}>{v}</Tag> },
                { title: 'SLA', dataIndex: 'sla_at', width: 150, render: v => <span style={{ fontSize: 12 }}>{v}</span> },
                { title: '操作', key: 'op', width: 120, render: (_, t) => <Button size="small" type="primary" onClick={async () => { await api.post(`/tickets/tickets/${t.id}/status`, { status: '处理中', handler: '华东智算中心-运维' }); message.success('已接单，SLA 计时中'); loadAll(); }}>接单处理</Button> },
              ]} />
            </Card>
          )}

          {tab === 'acct' && (
            <div>
              <Card size="small" title="账户与资质" style={{ marginBottom: 16 }}>
                <Row gutter={16}>
                  <Col span={8}><Card size="small"><Statistic title="保证金" value={50000} precision={0} prefix="¥" suffix={<Tag color="blue">已缴纳</Tag>} /></Card></Col>
                  <Col span={8}><Card size="small"><Statistic title="结算费率" value={7} suffix="%" valueStyle={{ color: '#fa8c16' }} /></Card></Col>
                  <Col span={8}><Card size="small"><Statistic title="综合评分" value={4.9} precision={1} suffix="/5" valueStyle={{ color: '#52c41a' }} /></Card></Col>
                </Row>
              </Card>
              <Card size="small" title="资质认证">
                <Space wrap>
                  <Tag color="green" style={{ padding: '4px 12px', fontSize: 13 }}>✓ 营业执照（已认证）</Tag>
                  <Tag color="green" style={{ padding: '4px 12px', fontSize: 13 }}>✓ 机房资质（等保三级）</Tag>
                  <Tag color="green" style={{ padding: '4px 12px', fontSize: 13 }}>✓ 网络与安全能力</Tag>
                  <Tag color="green" style={{ padding: '4px 12px', fontSize: 13 }}>✓ 开票资质（增值税专票）</Tag>
                  <Tag color="orange" style={{ padding: '4px 12px', fontSize: 13 }}>● 年度复检（2026-09 到期）</Tag>
                </Space>
              </Card>
            </div>
          )}
        </Content>
      </Layout>

      <Modal title={`调整报价：${priceModal?.spec || ''}`} open={!!priceModal} onCancel={() => setPriceModal(null)} onOk={savePrice} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="price_hour" label="时价（元）"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
          <Form.Item name="price_day" label="包日价（元）"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
          <Form.Item name="price_month" label="包月价（元）"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
}
