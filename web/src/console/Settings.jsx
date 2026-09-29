import { useEffect, useState } from 'react';
import { Card, Descriptions, Table, Button, Space, message, Tag, Switch, Form, Input, Divider, Alert } from 'antd';
import { KeyOutlined, SafetyCertificateOutlined, BellOutlined, CopyOutlined } from '@ant-design/icons';
import api from '../api.js';

export default function Settings({ me, ent }) {
  const [keys, setKeys] = useState([]);
  const [form] = Form.useForm();
  const [newKey, setNewKey] = useState(null);

  const load = () => api.get('/notify/api-keys', { params: { enterpriseId: localStorage.getItem('cx_enterprise') } }).then(({ keys }) => setKeys(keys));
  useEffect(load, []);

  const createKey = async () => {
    const v = await form.validateFields();
    const { key } = await api.post('/notify/api-keys', { enterpriseId: localStorage.getItem('cx_enterprise'), name: v.name, webhook: v.webhook });
    setNewKey(key);
    message.success('API 密钥已创建（仅显示一次）');
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
        <Alert type="info" showIcon message="登录方式" description="演示环境支持密码登录（123456）；企业版支持 OAuth2.0 / SAML 单点登录与企业微信/钉钉/飞书（M2 开放）。" />
      </Card>

      <Card size="small" title={<Space><BellOutlined />通知偏好</Space>} style={{ marginBottom: 16 }}>
        <Space direction="vertical" size={8}>
          {[
            ['实例告警（掉线/过载/性能/费用）', true, '关键告警不可退订'],
            ['预算超支提醒（80%/100%）', true, '关键告警不可退订'],
            ['到期提醒 / 欠费提醒', true, '关键告警不可退订'],
            ['审批待办 / 审批结果', false, ''],
            ['账单出账 / 工单进展', false, ''],
            ['系统公告 / 营销消息', false, ''],
          ].map(([label, fixed, tip]) => (
            <Space key={label}>
              <Switch defaultChecked={fixed} disabled={fixed} />
              <span>{label}</span>
              {tip && <Tag color="orange">{tip}</Tag>}
            </Space>
          ))}
        </Space>
      </Card>

      <Card size="small" title={<Space><KeyOutlined />API 密钥（开放平台）</Space>} style={{ marginBottom: 16 }}
        extra={<Button size="small" onClick={() => { form.resetFields(); setNewKey(null); }}>生成新密钥</Button>}>
        <Form form={form} layout="inline" style={{ marginBottom: 12 }}>
          <Form.Item name="name" rules={[{ required: true }]}><Input placeholder="密钥名称，如 生产环境" style={{ width: 180 }} /></Form.Item>
          <Form.Item name="webhook"><Input placeholder="Webhook 回调地址（可选）" style={{ width: 260 }} /></Form.Item>
          <Form.Item><Button type="primary" onClick={createKey}>创建</Button></Form.Item>
        </Form>
        {newKey && <Alert style={{ marginBottom: 12 }} type="success" showIcon message={<Space>新密钥：<code>{newKey}</code><Button size="small" icon={<CopyOutlined />} onClick={() => { navigator.clipboard?.writeText(newKey); message.success('已复制'); }}>复制</Button></Space>} description="请妥善保存，密钥仅显示一次" />}
        <Table rowKey="id" size="small" dataSource={keys} pagination={false} columns={[
          { title: '名称', dataIndex: 'name' },
          { title: '密钥', dataIndex: 'key', render: v => <code>{v.slice(0, 16)}••••••</code> },
          { title: 'Webhook', dataIndex: 'webhook', render: v => v || '-' },
          { title: '创建时间', dataIndex: 'created_at' },
          { title: '操作', key: 'op', render: () => <Button size="small" danger>删除</Button> },
        ]} />
        <div style={{ color: '#a6b0c0', fontSize: 12, marginTop: 8 }}>开放平台：REST + 幂等键 + Webhook 签名；Python/Go/Java SDK 与 CLI 工具（M2 开放，演示环境提供 Webhook 配置）。</div>
      </Card>
    </div>
  );
}
