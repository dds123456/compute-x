import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Tag, Button, Space, Input, message, Timeline, Spin, Alert } from 'antd';
import { ArrowLeftOutlined, SendOutlined, CheckCircleOutlined } from '@ant-design/icons';
import api from '../api.js';
import { STATUS_COLOR } from '../api.js';

export default function TicketDetail({ me }) {
  const { id } = useParams();
  const nav = useNavigate();
  const [t, setT] = useState(null);
  const [reply, setReply] = useState('');

  const load = () => api.get(`/tickets/tickets/${id}`).then(({ ticket }) => setT(ticket));
  useEffect(load, [id]);

  if (!t) return <Spin style={{ display: 'block', margin: '80px auto' }} />;

  const send = async () => {
    if (!reply.trim()) return message.warning('请输入回复内容');
    await api.post(`/tickets/tickets/${id}/reply`, { content: reply, who: me?.name || '我' });
    setReply('');
    message.success('回复成功');
    load();
  };

  const close = async () => {
    await api.post(`/tickets/tickets/${id}/status`, { status: '已解决', handler: t.handler });
    message.success('工单已标记解决');
    load();
  };

  return (
    <div>
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space size={12}>
            <Button icon={<ArrowLeftOutlined />} onClick={() => nav('/console/tickets')} />
            <div style={{ fontSize: 17, fontWeight: 700 }}>{t.ticket_no}</div>
            <Tag color={STATUS_COLOR[t.type]}>{t.type}</Tag>
            <Tag color={STATUS_COLOR[t.status]}>{t.status}</Tag>
            <Tag color={t.priority === '紧急' ? 'red' : 'default'}>{t.priority}</Tag>
          </Space>
          {t.status !== '已解决' && t.status !== '已关闭' && (
            <Button type="primary" icon={<CheckCircleOutlined />} onClick={close}>标记已解决</Button>
          )}
        </Space>
      </Card>

      {t.status === '待处理' && <Alert style={{ marginBottom: 12 }} type="warning" showIcon message={`SLA 首次响应时限：${t.sla_at}（超时将自动升级至上级处理人）`} />}

      <Card size="small" title="问题描述" style={{ marginBottom: 12 }}>
        <Descriptions column={2} size="small">
          <Descriptions.Item label="关联">{t.related || '-'}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{t.created_at}</Descriptions.Item>
        </Descriptions>
        <div style={{ background: '#f7f8fa', padding: 12, borderRadius: 6, marginTop: 8 }}>{t.content}</div>
      </Card>

      <Card size="small" title={`处理进度（${t.replies.length} 条回复）`} style={{ marginBottom: 12 }}>
        <Timeline items={t.replies.map((r, i) => ({
          color: i === t.replies.length - 1 ? 'blue' : 'gray',
          children: <div><b>{r.who}</b> <span style={{ color: '#a6b0c0', fontSize: 12, marginLeft: 8 }}>{r.at}</span><div style={{ marginTop: 4 }}>{r.msg}</div></div>,
        }))} />
        {t.replies.length === 0 && <div style={{ color: '#a6b0c0' }}>暂无回复，等待处理人首次响应…</div>}
      </Card>

      <Card size="small">
        <Space.Compact style={{ width: '100%' }}>
          <Input.TextArea rows={3} placeholder="输入回复内容…" value={reply} onChange={e => setReply(e.target.value)} />
          <Button type="primary" icon={<SendOutlined />} onClick={send} style={{ height: 'auto' }}>发送</Button>
        </Space.Compact>
      </Card>
    </div>
  );
}
