import { lazy, Suspense, useEffect, useState } from 'react';
import { Layout, Menu, Badge, Dropdown, Avatar, Input, Select, Button, Space, Tag, message, Tooltip, Alert, Drawer, Modal, List, Empty, Spin } from 'antd';
import {
  DashboardOutlined, ShoppingOutlined, CloudServerOutlined, FileTextOutlined, TeamOutlined,
  BellOutlined, QuestionCircleOutlined, UserOutlined, ThunderboltOutlined, ProjectOutlined,
  AuditOutlined, MessageOutlined, SettingOutlined, AppstoreOutlined, MobileOutlined, RocketOutlined,
  MenuOutlined, SearchOutlined, BulbOutlined, FundOutlined,
} from '@ant-design/icons';
import { Routes, Route, useNavigate, useLocation, Navigate, Link } from 'react-router-dom';
import api from '../api.js';
import Dashboard from './Dashboard.jsx';
import Market from './Market.jsx';
import ResourceDetail from './ResourceDetail.jsx';
import Estimator from './Estimator.jsx';
import InstanceCreate from './InstanceCreate.jsx';
import Instances from './Instances.jsx';
import InstanceDetail from './InstanceDetail.jsx';
import Bills from './Bills.jsx';
import BillDetail from './BillDetail.jsx';
import Invoices from './Invoices.jsx';
import Org from './Org.jsx';
import Approvals from './Approvals.jsx';
import Tickets from './Tickets.jsx';
import TicketDetail from './TicketDetail.jsx';
import Messages from './Messages.jsx';
import Settings from './Settings.jsx';

const Advisor = lazy(() => import('./Advisor.jsx'));
const FinOps = lazy(() => import('./FinOps.jsx'));

const { Sider, Header, Content } = Layout;

export default function ConsoleLayout() {
  const nav = useNavigate();
  const loc = useLocation();
  const [me, setMe] = useState(null);
  const [ent, setEnt] = useState(null);
  const [projects, setProjects] = useState([]);
  const [projId, setProjId] = useState('全部');
  const [unread, setUnread] = useState(0);
  const [mobileNav, setMobileNav] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const isGuest = localStorage.getItem('cx_guest') === '1';

  useEffect(() => {
    api.get('/auth/me').then(({ member, enterprise }) => { setMe(member); setEnt(enterprise); });
    api.get('/auth/projects').then(({ projects }) => setProjects(projects));
    api.get('/auth/unread').then(({ count }) => setUnread(count));
  }, []);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'auto' }); }, [loc.pathname]);

  const clearSession = () => {
    ['cx_token', 'cx_uid', 'cx_enterprise', 'cx_guest', 'cx_provider'].forEach(k => localStorage.removeItem(k));
  };
  const logout = async () => {
    try { await api.post('/auth/logout'); } finally { clearSession(); nav('/login'); }
  };

  const runSearch = async (value) => {
    const q = value.trim();
    if (q.length < 2) return message.info('请输入至少 2 个字符');
    setSearching(true);
    setSearchOpen(true);
    try {
      const { results } = await api.get('/dashboard/search', { params: { q } });
      setSearchResults(results);
    } catch (e) { message.error(e.message); }
    finally { setSearching(false); }
  };

  const menuItems = [
    { key: '/console', icon: <DashboardOutlined />, label: '概览' },
    { key: '/console/advisor', icon: <BulbOutlined />, label: 'AI 决策中心' },
    {
      key: 'market', icon: <ShoppingOutlined />, label: '资源市场',
      children: [
        { key: '/console/market', label: '资源列表' },
        { key: '/console/compare', label: '资源对比' },
        { key: '/console/estimator', label: '成本估算器' },
      ],
    },
    {
      key: 'inst', icon: <CloudServerOutlined />, label: '实例管理',
      children: [
        { key: '/console/instances', label: '实例列表' },
        { key: '/console/instances/create', label: '创建实例' },
      ],
    },
    {
      key: 'bill', icon: <FileTextOutlined />, label: '账单与费用',
      children: [
        { key: '/console/bills', label: '账单列表' },
        { key: '/console/invoices', label: '发票管理' },
        { key: '/console/finops', icon: <FundOutlined />, label: 'FinOps 控制台' },
      ],
    },
    {
      key: 'org', icon: <TeamOutlined />, label: '组织与项目',
      children: [
        { key: '/console/members', label: '成员管理' },
        { key: '/console/projects', label: '项目管理' },
        { key: '/console/audit', label: '审计日志' },
      ],
    },
    { key: '/console/approvals', icon: <AuditOutlined />, label: '审批中心', badge: undefined },
    { key: '/console/tickets', icon: <MessageOutlined />, label: '工单中心' },
    { key: '/console/settings', icon: <SettingOutlined />, label: '设置' },
  ];

  const selected = menuItems.flatMap(m => m.children ? m.children.map(c => c.key) : [m.key])
    .filter(k => loc.pathname === k || loc.pathname.startsWith(`${k}/`))
    .sort((a, b) => b.length - a.length)[0] || '/console';

  return (
    <Layout className="cx-shell" style={{ minHeight: '100vh' }}>
      <a className="cx-skip-link" href="#cx-main">跳至主内容</a>
      <Sider className="cx-sider" width={228} theme="dark">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 16px 14px' }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: 'linear-gradient(135deg,#2f54eb,#13c2c2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18, flexShrink: 0 }}>
            <ThunderboltOutlined />
          </div>
          <div>
            <div className="cx-brand-wordmark" style={{ fontWeight: 700, fontSize: 15 }}>ComputeX</div>
            <div className="cx-brand-kicker" style={{ fontSize: 9 }}>VERIFIED COMPUTE</div>
          </div>
        </div>
        <Menu theme="dark" mode="inline" items={menuItems} selectedKeys={[selected]} onClick={({ key }) => nav(key)} style={{ border: 'none' }} />
        <div style={{ position: 'absolute', bottom: 16, left: 16, right: 16 }}>
          <Button ghost block icon={<MobileOutlined />} onClick={() => nav('/app')}>移动协同端</Button>
        </div>
      </Sider>
      <Layout>
        <Header className="cx-header" style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button className="cx-mobile-trigger" icon={<MenuOutlined />} onClick={() => setMobileNav(true)} aria-label="打开导航" />
            <Input.Search className="cx-header-search" prefix={<SearchOutlined />} placeholder="搜索资源、实例、账单或工单" style={{ width: 320 }} allowClear enterButton onSearch={runSearch} loading={searching} />
            <Select className="cx-header-project" value={projId} onChange={setProjId} style={{ width: 170 }} options={[{ value: '全部', label: '全部项目' }, ...projects.map(p => ({ value: p.id, label: p.name }))]} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <Tooltip title="帮助与支持"><Button type="text" aria-label="打开帮助与支持" icon={<QuestionCircleOutlined />} onClick={() => nav('/console/tickets')} /></Tooltip>
            <Badge count={unread} size="small">
              <Button type="text" aria-label={`打开消息中心，${unread} 条未读`} icon={<BellOutlined />} onClick={() => nav('/console/messages')} />
            </Badge>
            <Dropdown menu={{
              items: [
                { key: 'msg', icon: <MessageOutlined />, label: '消息中心', onClick: () => nav('/console/messages') },
                { key: 'settings', icon: <SettingOutlined />, label: '账号安全', onClick: () => nav('/console/settings') },
                { type: 'divider' },
                { key: 'app', icon: <MobileOutlined />, label: '移动端 App', onClick: () => nav('/app') },
                { type: 'divider' },
                { key: 'logout', icon: <UserOutlined />, label: '退出登录', onClick: logout },
              ],
            }}>
              <Space style={{ cursor: 'pointer' }}>
                <Avatar style={{ background: isGuest ? '#8c8c8c' : '#2f54eb' }} size={32}>{me?.name?.[0] || '游'}</Avatar>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>
                    {me?.name}{isGuest && <Tag style={{ marginLeft: 4, fontSize: 10, lineHeight: '16px' }} color="purple">游客</Tag>}
                  </div>
                  <div className="cx-header-user-role" style={{ fontSize: 11, color: '#7a8699' }}>{isGuest ? '只读体验' : me?.role}</div>
                </div>
              </Space>
            </Dropdown>
          </div>
        </Header>
        <Content className="cx-content" id="cx-main" tabIndex={-1}>
          {isGuest && (
            <Alert
              style={{ marginBottom: 16 }}
              type="warning"
              showIcon
              icon={<RocketOutlined />}
              message="游客体验模式"
              description="当前为游客访问（无需账号密码），可浏览全部演示数据与界面。注册企业账号后，你的实例、账单与项目将相互隔离。"
              action={<Button size="small" type="primary" onClick={() => { clearSession(); nav('/login'); }}>登录 / 注册</Button>}
            />
          )}
          <Routes>
            <Route index element={<Dashboard projId={projId} />} />
            <Route path="market" element={<Market />} />
            <Route path="market/:id" element={<ResourceDetail />} />
            <Route path="compare" element={<Market compare />} />
            <Route path="estimator" element={<Estimator />} />
            <Route path="advisor" element={<Suspense fallback={<Spin style={{ display: 'block', margin: 80 }} />}><Advisor /></Suspense>} />
            <Route path="finops" element={<Suspense fallback={<Spin style={{ display: 'block', margin: 80 }} />}><FinOps projId={projId} /></Suspense>} />
            <Route path="instances" element={<Instances projId={projId} />} />
            <Route path="instances/create" element={<InstanceCreate />} />
            <Route path="instances/:id" element={<InstanceDetail />} />
            <Route path="bills" element={<Bills />} />
            <Route path="bills/:id" element={<BillDetail />} />
            <Route path="invoices" element={<Invoices />} />
            <Route path="members" element={<Org me={me} />} />
            <Route path="projects" element={<Org me={me} tab="projects" />} />
            <Route path="audit" element={<Org me={me} tab="audit" />} />
            <Route path="approvals" element={<Approvals me={me} />} />
            <Route path="tickets" element={<Tickets me={me} />} />
            <Route path="tickets/:id" element={<TicketDetail me={me} />} />
            <Route path="messages" element={<Messages me={me} />} />
            <Route path="settings" element={<Settings me={me} ent={ent} />} />
            <Route path="*" element={<Navigate to="/console" replace />} />
          </Routes>
        </Content>
      </Layout>
      <Drawer title="ComputeX 导航" placement="left" width={292} open={mobileNav} onClose={() => setMobileNav(false)} styles={{ body: { padding: 8, background: '#07110f' }, header: { background: '#07110f', color: '#fff', borderBottomColor: '#223830' } }}>
        <Menu theme="dark" mode="inline" items={menuItems} selectedKeys={[selected]} onClick={({ key }) => { nav(key); setMobileNav(false); }} style={{ border: 0, background: '#07110f' }} />
      </Drawer>
      <Modal title="全局搜索" open={searchOpen} onCancel={() => setSearchOpen(false)} footer={null} width={640}>
        {searchResults.length ? <List dataSource={searchResults} renderItem={item => (
          <List.Item><Link className="cx-search-result" to={item.path} onClick={() => setSearchOpen(false)}><List.Item.Meta avatar={<Tag color={item.type === '实例' ? 'cyan' : item.type === '账单' ? 'gold' : item.type === '工单' ? 'purple' : 'green'}>{item.type}</Tag>} title={item.title} description={item.subtitle} /></Link></List.Item>
        )} /> : <Empty description={searching ? '正在搜索…' : '没有找到匹配结果'} />}
      </Modal>
    </Layout>
  );
}
