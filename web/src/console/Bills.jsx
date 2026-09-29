import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Table, Tag, Button, Space, Segmented, Statistic, Row, Col, message, Popconfirm, Input } from 'antd';
import { PayCircleOutlined, FileTextOutlined, DownloadOutlined } from '@ant-design/icons';
import api from '../api.js';
import { fmtMoney, STATUS_COLOR } from '../api.js';

export default function Bills() {
  const nav = useNavigate();
  const [list, setList] = useState([]);
  const [status, setStatus] = useState('全部');
  const [ent, setEnt] = useState(null);

  const load = () => {
    api.get('/billing/bills', { params: { enterpriseId: localStorage.getItem('cx_enterprise'), status } }).then(({ bills }) => setList(bills));
    api.get('/auth/me').then(({ enterprise }) => setEnt(enterprise));
  };
  useEffect(load, [status]);

  const pay = async (id) => {
    try {
      const { msg } = await api.post(`/billing/bills/${id}/pay`);
      message.success(msg);
      load();
    } catch (e) { message.error(e.message); }
  };

  const recharge = async () => {
    const amount = prompt('请输入充值金额（元）');
    if (!amount || Number(amount) <= 0) return;
    const { msg, balance } = await api.post('/billing/recharge', { enterpriseId: localStorage.getItem('cx_enterprise'), amount: Number(amount) });
    message.success(`${msg}，当前余额 ¥${fmtMoney(balance)}`);
    load();
  };

  const pending = list.filter(b => b.status === '待支付').reduce((s, b) => s + b.amount, 0);

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={8}><Card size="small"><Statistic title="本月账单金额" value={list[0]?.amount || 0} precision={2} prefix="¥" valueStyle={{ color: '#2f54eb' }} /></Card></Col>
        <Col span={8}><Card size="small"><Statistic title="待支付总额" value={pending} precision={2} prefix="¥" valueStyle={{ color: '#f5222d' }} /></Card></Col>
        <Col span={8}><Card size="small"><Statistic title="账户余额" value={ent?.balance || 0} precision={2} prefix="¥" suffix={<Button size="small" type="link" onClick={recharge}>充值</Button>} valueStyle={{ color: '#13c2c2' }} /></Card></Col>
      </Row>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space>
          <Segmented value={status} onChange={setStatus} options={['全部', '待支付', '已支付', '已开票', '有争议'].map(s => ({ value: s, label: s }))} />
        </Space>
      </Card>

      <Card size="small">
        <Table rowKey="id" dataSource={list} pagination={false} columns={[
          { title: '账单号', dataIndex: 'bill_no', render: v => <a onClick={() => nav(`/console/bills/${list.find(b => b.bill_no === v).id}`)} style={{ fontWeight: 600 }}>{v}</a> },
          { title: '账期', dataIndex: 'period', width: 110 },
          { title: '金额（含税）', dataIndex: 'amount', width: 150, render: v => <b style={{ color: '#f5222d' }}>¥{fmtMoney(v)}</b> },
          { title: '状态', dataIndex: 'status', width: 100, render: v => <Tag color={STATUS_COLOR[v]}>{v}</Tag> },
          { title: '开票状态', dataIndex: 'invoice_status', width: 100, render: v => <Tag color={STATUS_COLOR[v]}>{v}</Tag> },
          { title: '出账时间', dataIndex: 'created_at', width: 160, render: v => <span style={{ fontSize: 12 }}>{v}</span> },
          { title: '操作', key: 'op', width: 200, render: (_, b) => (
            <Space size={4}>
              {b.status === '待支付' && <Popconfirm title="确认支付该账单？" onConfirm={() => pay(b.id)}><Button size="small" type="primary" icon={<PayCircleOutlined />}>支付</Button></Popconfirm>}
              {b.invoice_status === '未开票' && <Button size="small" icon={<FileTextOutlined />} onClick={() => nav('/console/invoices')}>开票</Button>}
              <Button size="small" onClick={() => nav(`/console/bills/${b.id}`)}>明细</Button>
              <Button size="small" icon={<DownloadOutlined />} onClick={() => message.success('账单明细已导出 CSV（演示）')}>导出</Button>
            </Space>
          )},
        ]} />
      </Card>
    </div>
  );
}
