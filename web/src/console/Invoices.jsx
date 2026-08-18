import { useEffect, useState } from 'react';
import { Card, Table, Tag, Button, Space, Modal, Form, Input, Select, message, Popconfirm, Statistic, Row, Col, Progress, Empty, Tabs } from 'antd';
import { PlusOutlined, SwapOutlined, DownloadOutlined } from '@ant-design/icons';
import api from '../api.js';
import { fmtMoney, STATUS_COLOR } from '../api.js';
import { printInvoiceReceipt } from '../utils/download.js';

export default function Invoices() {
  const [list, setList] = useState([]);
  const [bills, setBills] = useState([]);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const [ent, setEnt] = useState(null);

  const load = () => {
    api.get('/billing/invoices', { params: { enterpriseId: localStorage.getItem('cx_enterprise') } }).then(({ invoices }) => setList(invoices));
    api.get('/billing/bills', { params: { enterpriseId: localStorage.getItem('cx_enterprise') } }).then(({ bills }) => setBills(bills.filter(b => b.invoice_status === '未开票')));
    api.get('/auth/me').then(({ enterprise }) => setEnt(enterprise));
  };
  useEffect(load, []);

  const submit = async () => {
    const v = await form.validateFields();
    const billIds = Array.isArray(v.billIds) ? v.billIds : [v.billIds];
    const { msg } = await api.post('/billing/invoices', {
      enterpriseId: localStorage.getItem('cx_enterprise'), billIds, title: v.title, taxNo: v.taxNo, email: v.email, type: v.type,
    });
    message.success(msg);
    setOpen(false);
    load();
  };

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={8}><Card size="small"><Statistic title="累计开票金额" value={list.reduce((s, i) => s + i.amount, 0)} precision={2} prefix="¥" valueStyle={{ color: '#2f54eb' }} /></Card></Col>
        <Col span={8}><Card size="small"><Statistic title="已开具发票" value={list.filter(i => i.status === '已开具').length} suffix="张" /></Card></Col>
        <Col span={8}><Card size="small"><Statistic title="待开票账单" value={bills.length} suffix="张" /></Card></Col>
      </Row>

      <Card size="small" style={{ marginBottom: 16 }}
        title="发票抬头管理"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>申请开票</Button>}>
        <Space>
          <Tag color="blue">默认抬头：{ent?.name || '-'}</Tag>
          <Tag>税号：{ent ? '91110000MA01XXXXXX' : '-'}</Tag>
          <Tag>收票邮箱：fin@xingyun.ai</Tag>
        </Space>
      </Card>

      <Card size="small" title="发票列表">
        <Table rowKey="id" dataSource={list} pagination={false} columns={[
          { title: '发票号', dataIndex: 'invoice_no', render: v => <b>{v}</b> },
          { title: '类型', dataIndex: 'type', width: 110, render: v => <Tag color={v.includes('专票') ? 'gold' : 'blue'}>{v}</Tag> },
          { title: '抬头', dataIndex: 'title' },
          { title: '金额', dataIndex: 'amount', width: 140, render: v => <b>¥{fmtMoney(v)}</b> },
          { title: '状态', dataIndex: 'status', width: 100, render: v => <Tag color={STATUS_COLOR[v]}>{v}</Tag> },
          { title: '申请时间', dataIndex: 'created_at', width: 160, render: v => <span style={{ fontSize: 12 }}>{v}</span> },
          { title: '操作', key: 'op', width: 180, render: (_, inv) => (
            <Space>
              <Button size="small" icon={<DownloadOutlined />} onClick={() => { try { printInvoiceReceipt(inv); } catch (e) { message.error(e.message); } }}>查看凭证</Button>
            </Space>
          )},
        ]} />
      </Card>

      <Modal title="申请开票" open={open} onCancel={() => setOpen(false)} onOk={submit} destroyOnClose>
        <Form form={form} layout="vertical" initialValues={{ type: '电子普票', title: ent?.name, taxNo: '91110000MA01XXXXXX', email: 'fin@xingyun.ai' }}>
          <Form.Item name="billIds" label="选择账单（可多选）" rules={[{ required: true, message: '请选择账单' }]}>
            <Select mode="multiple" placeholder="选择待开票账单" options={bills.map(b => ({ value: b.id, label: `${b.bill_no}（¥${fmtMoney(b.amount)}）` }))} />
          </Form.Item>
          <Form.Item name="type" label="发票类型" rules={[{ required: true }]}>
            <Select options={[{ value: '电子普票', label: '电子普票' }, { value: '增值税专票', label: '增值税专票（需企业开票资质）' }]} />
          </Form.Item>
          <Form.Item name="title" label="抬头（企业名）" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="taxNo" label="税号" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="email" label="收票邮箱" rules={[{ required: true }]}><Input /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
