import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, Table, Tag, Button, Space, Modal, Form, Input, Select, message, Segmented, Statistic, Row, Col } from 'antd';
import { PlusOutlined, MessageOutlined } from '@ant-design/icons';
import api from '../api.js';
import { STATUS_COLOR } from '../api.js';

export default function Tickets({ me }) {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [list, setList] = useState([]);
  const [status, setStatus] = useState('全部');
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const load = () => {
    api.get('/tickets/tickets', { params: { enterpriseId: localStorage.getItem('cx_enterprise'), status } }).then(({ tickets }) => setList(tickets));
  };
  useEffect(load, [status]);
  useEffect(() => {
    if (params.get('bill')) { setOpen(true); form.setFieldValue('related', `账单 ${params.get('bill')}`); form.setFieldValue('type', '计费争议'); }
  }, [params]);

  const create = async () => {
    const v = await form.validateFields();
    const { msg, id } = await api.post('/tickets/tickets', {
      enterpriseId: localStorage.getItem('cx_enterprise'), userId: localStorage.getItem('cx_uid'),
      type: v.type, related: v.related, content: v.content, priority: v.priority,
    });
    message.success(msg);
    setOpen(false);
    nav(`/console/tickets/${id}`);
  };

  const pending = list.filter(t => ['待处理', '处理中'].includes(t.status)).length;

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={8}><Card size="small"><Statistic title="全部工单" value={list.length} /></Card></Col>
        <Col span={8}><Card size="small"><Statistic title="处理中" value={list.filter(t => t.status === '处理中').length} valueStyle={{ color: '#2f54eb' }} /></Card></Col>
        <Col span={8}><Card size="small"><Statistic title="待处理（含 SLA 计时）" value={list.filter(t => t.status === '待处理').length} valueStyle={{ color: '#faad14' }} /></Card></Col>
      </Row>

      <Card size="small" style={{ marginBottom: 16 }}
        title={`工单中心（${pending} 条进行中）`}
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>新建工单</Button>}>
        <Segmented style={{ marginBottom: 12 }} value={status} onChange={setStatus} options={['全部', '待处理', '处理中', '待确认', '已解决', '已关闭'].map(s => ({ value: s, label: s }))} />
        <Table rowKey="id" dataSource={list} pagination={false} columns={[
          { title: '工单号', dataIndex: 'ticket_no', render: (v, r) => <a style={{ fontWeight: 600 }} onClick={() => nav(`/console/tickets/${r.id}`)}>{v}</a> },
          { title: '类型', dataIndex: 'type', width: 110, render: v => <Tag color={v === '故障' ? 'red' : v === '计费争议' ? 'orange' : v === '发票' ? 'blue' : 'default'}>{v}</Tag> },
          { title: '问题', dataIndex: 'content', ellipsis: true },
          { title: '关联', dataIndex: 'related', width: 150, render: v => v || '-' },
          { title: '状态', dataIndex: 'status', width: 90, render: v => <Tag color={STATUS_COLOR[v]}>{v}</Tag> },
          { title: '优先级', dataIndex: 'priority', width: 80, render: v => <Tag color={v === '紧急' ? 'red' : 'default'}>{v}</Tag> },
          { title: 'SLA 首次响应', dataIndex: 'sla_at', width: 150, render: v => <span style={{ fontSize: 12 }}>{v}</span> },
          { title: '创建时间', dataIndex: 'created_at', width: 150, render: v => <span style={{ fontSize: 12 }}>{v}</span> },
          { title: '操作', key: 'op', width: 90, render: (_, t) => <Button size="small" icon={<MessageOutlined />} onClick={() => nav(`/console/tickets/${t.id}`)}>详情</Button> },
        ]} />
      </Card>

      <Modal title="新建工单" open={open} onCancel={() => setOpen(false)} onOk={create} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="type" label="工单类型" rules={[{ required: true }]}>
            <Select options={['故障', '性能争议', '计费争议', '发票', '退款', '投诉'].map(t => ({ value: t, label: t }))} />
          </Form.Item>
          <Form.Item name="priority" label="优先级" initialValue="普通">
            <Select options={[{ value: '普通', label: '普通' }, { value: '紧急', label: '紧急（故障类建议选择）' }]} />
          </Form.Item>
          <Form.Item name="related" label="关联资源/账单（可选）"><Input placeholder="如实例 ID / 账单号" /></Form.Item>
          <Form.Item name="content" label="问题描述" rules={[{ required: true, message: '请描述问题' }]}><Input.TextArea rows={4} placeholder="请详细描述遇到的问题，可附实例 ID、时间点等信息" /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
