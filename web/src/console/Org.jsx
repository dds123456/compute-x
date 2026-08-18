import { useEffect, useState } from 'react';
import { Card, Table, Tag, Button, Space, Modal, Form, Input, Select, message, Popconfirm, Progress, Descriptions, Timeline } from 'antd';
import { PlusOutlined, SwapOutlined, DownloadOutlined, UserAddOutlined } from '@ant-design/icons';
import api from '../api.js';
import { fmtMoney, STATUS_COLOR } from '../api.js';
import { downloadCsv } from '../utils/download.js';

const ROLE_COLOR = { '企业管理员': 'blue', 财务: 'purple', 项目负责人: 'geekblue', 工程师: 'green', 只读成员: 'default' };

export default function Org({ me, tab = 'members' }) {
  const [active, setActive] = useState(tab);
  const [members, setMembers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [audit, setAudit] = useState([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [projOpen, setProjOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferFrom, setTransferFrom] = useState(null);
  const [form] = Form.useForm();
  const [pform] = Form.useForm();
  const entId = localStorage.getItem('cx_enterprise');

  const load = () => {
    api.get('/org/members', { params: { enterpriseId: entId } }).then(({ members }) => setMembers(members));
    api.get('/org/budget-status', { params: { enterpriseId: entId } }).then(({ projects }) => setProjects(projects));
    api.get('/org/audit', { params: { enterpriseId: entId } }).then(({ logs }) => setAudit(logs));
  };
  useEffect(() => { setActive(tab); load(); }, [tab]);

  const invite = async () => {
    const v = await form.validateFields();
    const { msg } = await api.post('/org/members', { enterpriseId: entId, ...v });
    message.success(msg);
    setInviteOpen(false);
    load();
  };

  const setStatus = async (id, status) => {
    const m = members.find(x => x.id === id);
    if (status === '禁用') {
      setTransferFrom(m);
      setTransferOpen(true);
      return;
    }
    await api.post(`/org/members/${id}/status`, { status });
    message.success('已更新');
    load();
  };

  const transfer = async (toId) => {
    await api.post(`/org/members/${transferFrom.id}/transfer`, { toId });
    message.success('交接完成，原成员已禁用');
    setTransferOpen(false);
    load();
  };

  const createProj = async () => {
    const v = await pform.validateFields();
    const { msg } = await api.post('/org/projects', { enterpriseId: entId, ownerId: v.ownerId, name: v.name, budget: v.budget, threshold: v.threshold });
    message.success(msg);
    setProjOpen(false);
    load();
  };

  const isAdmin = me?.role === '企业管理员';
  const exportAudit = () => {
    downloadCsv(`ComputeX-审计日志-${new Date().toISOString().slice(0, 10)}.csv`, audit, [
      ['时间', 'created_at'], ['操作者', 'user_name'], ['用户ID', 'user_id'], ['操作', 'action'], ['对象', 'target'],
    ]);
    message.success('审计日志已导出');
  };

  const tabs = [
    { key: 'members', label: '成员管理' },
    { key: 'projects', label: '项目管理' },
    { key: 'audit', label: '审计日志' },
  ];

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16 }}
        title={<Space>组织与项目</Space>}
        tabList={tabs} activeTabKey={active} onTabChange={setActive}
        extra={active === 'members' ? (
          <Button type="primary" icon={<UserAddOutlined />} disabled={!isAdmin} onClick={() => setInviteOpen(true)}>邀请成员</Button>
        ) : active === 'projects' ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setProjOpen(true)}>创建项目</Button>
        ) : (
          <Button icon={<DownloadOutlined />} onClick={exportAudit}>导出日志</Button>
        )}>
        {active === 'members' && (
          <Table rowKey="id" dataSource={members} pagination={false} columns={[
            { title: '姓名', dataIndex: 'name', render: (v, r) => <b>{v}{r.is_demo === 1 ? <Tag style={{ marginLeft: 6 }} color="green">演示</Tag> : null}</b> },
            { title: '角色', dataIndex: 'role', render: v => <Tag color={ROLE_COLOR[v]}>{v}</Tag> },
            { title: '联系方式', key: 'contact', render: (_, r) => <span style={{ fontSize: 12 }}>{r.phone}<br />{r.email}</span> },
            { title: '状态', dataIndex: 'status', render: v => <Tag color={STATUS_COLOR[v]}>{v}</Tag> },
            { title: '操作', key: 'op', render: (_, r) => (
              <Space>
                <Button size="small" disabled={!isAdmin || r.role === '企业管理员'} onClick={() => { setTransferFrom(r); setTransferOpen(true); }} icon={<SwapOutlined />}>交接</Button>
                <Popconfirm title={r.status === '禁用' ? '启用该成员？' : '禁用该成员？（需先交接）'} onConfirm={() => setStatus(r.id, r.status === '禁用' ? '正常' : '禁用')}>
                  <Button size="small" danger disabled={!isAdmin || r.role === '企业管理员'}>{r.status === '禁用' ? '启用' : '禁用'}</Button>
                </Popconfirm>
              </Space>
            )},
          ]} />
        )}

        {active === 'projects' && (
          <div>
            <Table rowKey="id" dataSource={projects} pagination={false} columns={[
              { title: '项目名', dataIndex: 'name', render: v => <b>{v}</b> },
              { title: '负责人', dataIndex: 'owner_id', render: v => members.find(m => m.id === v)?.name || v },
              { title: '预算', dataIndex: 'budget', render: v => `¥${fmtMoney(v)}` },
              { title: '已用', dataIndex: 'used', render: (v, r) => (
                <Space direction="vertical" size={0} style={{ width: 200 }}>
                  <span>¥{fmtMoney(v)} / ¥{fmtMoney(r.budget)}</span>
                  <Progress percent={r.percent} size="small" status={r.level === '超支' ? 'exception' : r.level === '预警' ? 'active' : 'normal'} strokeColor={r.level === '超支' ? '#f5222d' : r.level === '预警' ? '#faad14' : '#2f54eb'} />
                </Space>
              )},
              { title: '状态', dataIndex: 'level', render: v => <Tag color={STATUS_COLOR[v]}>{v === '预警' ? '已达80%' : v}</Tag> },
              { title: '审批规则', dataIndex: 'approval_rule', render: v => {
                const rule = JSON.parse(v || '{}');
                return rule.threshold > 0 ? <Tag color="orange">超 ¥{fmtMoney(rule.threshold)} 审批</Tag> : <Tag>免审批</Tag>;
              }},
            ]} />
          </div>
        )}

        {active === 'audit' && (
          <Timeline items={audit.map(l => ({
            color: 'blue',
            children: <div><b>{l.user_name}</b> <span style={{ color: '#4a5568' }}>{l.action}</span>「{l.target}」<span style={{ color: '#a6b0c0', fontSize: 12, marginLeft: 8 }}>{l.created_at}</span></div>,
          }))} />
        )}
      </Card>

      <Modal title="邀请成员" open={inviteOpen} onCancel={() => setInviteOpen(false)} onOk={invite} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="姓名" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="phone" label="手机号" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="email" label="邮箱"><Input /></Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true }]}>
            <Select options={['项目负责人', '工程师', '只读成员', '财务'].map(r => ({ value: r, label: r }))} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="创建项目" open={projOpen} onCancel={() => setProjOpen(false)} onOk={createProj} destroyOnClose>
        <Form form={pform} layout="vertical" initialValues={{ budget: 10000, threshold: 5000 }}>
          <Form.Item name="name" label="项目名" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="ownerId" label="负责人" rules={[{ required: true }]}>
            <Select options={members.filter(m => ['企业管理员', '项目负责人'].includes(m.role)).map(m => ({ value: m.id, label: m.name }))} />
          </Form.Item>
          <Form.Item name="budget" label="预算额度（元）"><Input type="number" /></Form.Item>
          <Form.Item name="threshold" label="审批阈值（元，超过触发审批）"><Input type="number" /></Form.Item>
        </Form>
      </Modal>

      <Modal title={`离职交接：${transferFrom?.name || ''}`} open={transferOpen} onCancel={() => setTransferOpen(false)} footer={null} destroyOnClose>
        <p style={{ color: '#7a8699', marginBottom: 16 }}>将 TA 名下的实例与项目所有权转移给指定成员，交接后原成员权限即时失效。</p>
        <Select style={{ width: '100%' }} placeholder="选择交接人" options={members.filter(m => m.id !== transferFrom?.id && m.status !== '禁用').map(m => ({ value: m.id, label: `${m.name}（${m.role}）` }))}
          onChange={(v) => transfer(v)} />
      </Modal>
    </div>
  );
}
