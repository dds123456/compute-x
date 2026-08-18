import { useEffect, useState } from 'react';
import { Card, Descriptions, Table, Button, Space, message, Tag, Switch, Form, Input, Divider, Alert, Popconfirm } from 'antd';
import { KeyOutlined, SafetyCertificateOutlined, BellOutlined, CopyOutlined } from '@ant-design/icons';
import api from '../api.js';

export default function Settings({ me, ent }) {
  const [keys, setKeys] = useState([]);
  const [form] = Form.useForm();
  const [newKey, setNewKey] = useState(null);
  const [preferences, setPreferences] = useState(null);
  const canManageKeys = me?.role === '企业管理员';

  const load = () => {
    api.get('/notify/api-keys', { params: { enterpriseId: localStorage.getItem('cx_enterprise') } }).then(({ keys }) => setKeys(keys));
    api.get('/notify/preferences').then(({ preferences }) => setPreferences(preferences));
  };
  useEffect(load, []);

  const createKey = async () => {
    const v = await form.validateFields();
    const { key } = await api.post('/notify/api-keys', { enterpriseId: localStorage.getItem('cx_enterprise'), name: v.name, webhook: v.webhook });
    setNewKey(key);
    message.success('API 密钥已创建（仅显示一次）');
    load();
  };

  const savePreferences = async () => {
    const { msg } = await api.post('/notify/preferences', preferences);
    message.success(msg);
  };

  const revokeKey = async (id) => {
    const { msg } = await api.delete(`/notify/api-keys/${id}`);
    message.success(msg);
    load();
  };

  return (
    <div style={{ maxWidth: 900 }}>
      <Card size="small" title={<Space><SafetyCertificateOutlined />账号安全</Space>} style={{ marginBottom: 16 }}>
        <Descriptions column={2} size="small">
          <Descriptions.Item label="账号">{me?.name}</Descriptions.Item>
          <Descriptions.Item label="角色">{me?.role}</Descriptions.Item>
          <Descriptions.Item label="手机号">{me?.phone}</Descriptions.Item>
          <Descriptions.Item label="邮箱">{me?.email}</Descriptions.Item>
        </Descriptions>
        <Divider style={{ margin: '12px 0' }} />
        <Alert type="success" showIcon message="会话安全已启用" description="当前使用服务端随机会话令牌；生产环境将关闭游客与一键体验入口。SSO / MFA 仍需在正式部署前接入企业身份提供商。" />
      </Card>

      <Card size="small" title={<Space><BellOutlined />通知偏好</Space>} style={{ marginBottom: 16 }}>
        {preferences && <Space direction="vertical" size={10}>
          <Space><Switch checked disabled /><span>实例故障、资损与安全告警</span><Tag color="orange">关键告警不可退订</Tag></Space>
          {[
            ['email', '邮件通知'],
            ['app_push', 'App 推送'],
            ['approval', '审批待办与结果'],
            ['billing', '账单、到期与工单进展'],
            ['marketing', '产品动态与活动'],
          ].map(([key, label]) => <Space key={key}>
            <Switch checked={Boolean(preferences[key])} onChange={checked => setPreferences(p => ({ ...p, [key]: checked }))} />
            <span>{label}</span>
          </Space>)}
          <Button type="primary" onClick={savePreferences}>保存通知偏好</Button>
        </Space>}
      </Card>

      <Card size="small" title={<Space><KeyOutlined />API 密钥（开放平台）</Space>} style={{ marginBottom: 16 }}
        extra={<Button size="small" onClick={() => { form.resetFields(); setNewKey(null); }}>生成新密钥</Button>}>
        <Form form={form} layout="inline" style={{ marginBottom: 12 }}>
          <Form.Item name="name" rules={[{ required: true }]}><Input placeholder="密钥名称，如 生产环境" style={{ width: 180 }} /></Form.Item>
          <Form.Item name="webhook"><Input placeholder="Webhook 回调地址（可选）" style={{ width: 260 }} /></Form.Item>
          <Form.Item><Button type="primary" disabled={!canManageKeys} onClick={createKey}>创建</Button></Form.Item>
        </Form>
        {newKey && <Alert style={{ marginBottom: 12 }} type="success" showIcon message={<Space>新密钥：<code>{newKey}</code><Button size="small" icon={<CopyOutlined />} onClick={() => { navigator.clipboard?.writeText(newKey); message.success('已复制'); }}>复制</Button></Space>} description="请妥善保存，密钥仅显示一次" />}
        <Table rowKey="id" size="small" dataSource={keys} pagination={false} columns={[
          { title: '名称', dataIndex: 'name' },
          { title: '密钥', dataIndex: 'key_preview', render: v => <code>{v}</code> },
          { title: 'Webhook', dataIndex: 'webhook', render: v => v || '-' },
          { title: '创建时间', dataIndex: 'created_at' },
          { title: '操作', key: 'op', render: (_, row) => <Popconfirm title="撤销后调用方将立即失效，确认继续？" onConfirm={() => revokeKey(row.id)}><Button size="small" danger disabled={!canManageKeys}>撤销</Button></Popconfirm> },
        ]} />
        <div style={{ color: '#667a71', fontSize: 12, marginTop: 8 }}>密钥只在创建时显示一次，列表仅展示指纹；生产接入还需启用 IP 白名单、调用审计、签名轮换与速率限制。</div>
      </Card>
    </div>
  );
}
