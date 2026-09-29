import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Checkbox, message, Divider, Tag, Space, Spin } from 'antd';
import { UserOutlined, LockOutlined, SafetyCertificateOutlined, ThunderboltOutlined, EyeOutlined, EyeInvisibleOutlined, GlobalOutlined, RocketOutlined, MobileOutlined } from '@ant-design/icons';
import api from '../api.js';

// 演示账号（一键登录）
const DEMO_ACCOUNTS = [
  { key: 'a1', name: '陈远', role: '企业管理员', ent: '星云智能', type: 'console', userId: 'u-admin', color: '#2f54eb', desc: '完整管理权限' },
  { key: 'a2', name: '李算法', role: '工程师', ent: '星云智能', type: 'console', userId: 'u-eng', color: '#13c2c2', desc: '实例/训练/工单' },
  { key: 'a3', name: '林财务', role: '财务', ent: '星云智能', type: 'console', userId: 'u-fin', color: '#722ed1', desc: '账单/发票/对账' },
  { key: 'a4', name: '周教授', role: '管理员', ent: '启明大学实验室', type: 'console', userId: 'u-lab', color: '#fa8c16', desc: '科研算力场景' },
  { key: 'a5', name: '华东智算中心', role: '资源方', ent: '供给方后台', type: 'provider', providerId: 'prv-cloud', color: '#08979c', desc: '上架/结算/收益' },
  { key: 'a6', name: '平台运营中心', role: '平台', ent: '管理后台', type: 'admin', color: '#f5222d', desc: '审核/对账/公告' },
];

export default function Login() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  useEffect(() => {
    // 若已登录则直接进入
    if (localStorage.getItem('cx_uid')) nav('/console', { replace: true });
  }, []);

  const go = (target) => nav(target, { replace: true });

  const doLogin = async (payload, target) => {
    try {
      const { member } = await api.post('/auth/login', payload);
      localStorage.setItem('cx_uid', member.id);
      localStorage.setItem('cx_enterprise', member.enterprise_id);
      localStorage.removeItem('cx_guest');
      message.success(`欢迎回来，${member.name}`);
      go(target);
    } catch (e) {
      message.error(e.message);
      setLoading(false);
    }
  };

  const submit = async (v) => {
    setLoading(true);
    await doLogin({ account: v.account.trim(), password: v.password }, '/console');
  };

  const enterGuest = async () => {
    setGuestLoading(true);
    try {
      const { member } = await api.post('/auth/guest');
      localStorage.setItem('cx_uid', member.id);
      localStorage.setItem('cx_enterprise', member.enterprise_id);
      localStorage.setItem('cx_guest', '1');
      message.success('已进入游客体验模式（仅浏览演示数据）');
      go('/console');
    } catch (e) {
      message.error(e.message);
      setGuestLoading(false);
    }
  };

  const quickLogin = async (acc) => {
    if (acc.type === 'console') {
      setLoading(true);
      await doLogin({ userId: acc.userId }, '/console');
    } else if (acc.type === 'provider') {
      localStorage.setItem('cx_uid', 'u-guest');
      localStorage.setItem('cx_provider', acc.providerId);
      message.success(`已进入${acc.name}（资源方后台）`);
      go('/provider');
    } else {
      localStorage.setItem('cx_uid', 'u-guest');
      message.success('已进入平台管理后台');
      go('/admin');
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#f5f6f8' }}>
      {/* ===== 左侧品牌区 ===== */}
      <div style={{
        flex: '1.1', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        padding: '48px 56px', color: '#fff', position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(150deg,#1f2d5c 0%,#2f54eb 55%,#13c2c2 130%)',
      }}>
        {/* 装饰圆 */}
        <div style={{ position: 'absolute', width: 420, height: 420, borderRadius: '50%', background: 'rgba(255,255,255,.06)', top: -140, right: -120 }} />
        <div style={{ position: 'absolute', width: 300, height: 300, borderRadius: '50%', background: 'rgba(255,255,255,.05)', bottom: -100, left: -80 }} />

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,.16)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
            <ThunderboltOutlined />
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: .5 }}>ComputeX</div>
            <div style={{ fontSize: 12, opacity: .75 }}>算力租赁平台 · Enterprise</div>
          </div>
        </div>

        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.4, marginBottom: 12 }}>
            让企业像用电一样
            <br />
            按需获得全球算力
          </div>
          <div style={{ fontSize: 14, opacity: .85, lineHeight: 1.8, maxWidth: 420, marginBottom: 28 }}>
            连接算力供给与需求 —— 资源市场、实例全生命周期管理、按秒计费、企业级审批与合规交付，一站搞定。
          </div>
          <Space size={12} wrap>
            <Tag style={{ background: 'rgba(255,255,255,.14)', color: '#fff', border: 'none', padding: '4px 12px', borderRadius: 20 }} icon={<SafetyCertificateOutlined />}>等保三级</Tag>
            <Tag style={{ background: 'rgba(255,255,255,.14)', color: '#fff', border: 'none', padding: '4px 12px', borderRadius: 20 }} icon={<SafetyCertificateOutlined />}>SOC 2 Type I</Tag>
            <Tag style={{ background: 'rgba(255,255,255,.14)', color: '#fff', border: 'none', padding: '4px 12px', borderRadius: 20 }}>可用性 99.9%</Tag>
            <Tag style={{ background: 'rgba(255,255,255,.14)', color: '#fff', border: 'none', padding: '4px 12px', borderRadius: 20 }}>数据擦除保障</Tag>
          </Space>
        </div>

        <div style={{ position: 'relative', fontSize: 12, opacity: .6 }}>
          © 2026 ComputeX Technology · 供产品演示使用
        </div>
      </div>

      {/* ===== 右侧登录区 ===== */}
      <div style={{ flex: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 48px', background: '#fff', minWidth: 480 }}>
        <div style={{ width: '100%', maxWidth: 420 }}>
          {/* 移动端入口 */}
          <div style={{ position: 'absolute', top: 20, right: 24, zIndex: 1 }}>
            <Button size="small" type="text" icon={<MobileOutlined />} onClick={() => {
              localStorage.setItem('cx_uid', 'u-guest'); localStorage.setItem('cx_guest', '1');
              go('/app');
            }}>移动端 App</Button>
          </div>

          <div style={{ fontSize: 26, fontWeight: 800, color: '#1f2d3d' }}>欢迎回来 👋</div>
          <div style={{ color: '#7a8699', fontSize: 13, margin: '8px 0 24px' }}>登录 ComputeX 管理控制台，开始管理你的算力资源</div>

          <Form onFinish={submit} size="large">
            <Form.Item name="account" rules={[{ required: true, message: '请输入手机号 / 邮箱 / 姓名' }]}>
              <Input prefix={<UserOutlined style={{ color: '#a6b0c0' }} />} placeholder="手机号 / 邮箱 / 姓名" />
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password
                prefix={<LockOutlined style={{ color: '#a6b0c0' }} />}
                placeholder="密码（演示账号默认 123456）"
                iconRender={(v) => (v ? <EyeOutlined /> : <EyeInvisibleOutlined />)}
              />
            </Form.Item>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Checkbox defaultChecked>记住我</Checkbox>
              <a style={{ fontSize: 13 }} onClick={() => message.info('演示环境：请联系企业管理员重置密码')}>忘记密码？</a>
            </div>
            <Button type="primary" htmlType="submit" block loading={loading} style={{ height: 44, borderRadius: 8, fontSize: 15 }}>登 录</Button>
          </Form>

          {/* 游客模式 */}
          <Button
            block
            icon={<RocketOutlined />}
            loading={guestLoading}
            onClick={enterGuest}
            style={{ height: 44, borderRadius: 8, fontSize: 14, marginTop: 12, borderColor: '#2f54eb', color: '#2f54eb', background: '#f0f5ff' }}
          >
            游客体验模式 · 无需账号密码
          </Button>
          <div style={{ textAlign: 'center', color: '#a6b0c0', fontSize: 11, marginTop: 8 }}>
            游客可浏览全部演示数据与界面；注册企业账号后数据相互隔离
          </div>

          <Divider plain style={{ color: '#a6b0c0', fontSize: 12 }}>演示环境 · 一键体验</Divider>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {DEMO_ACCOUNTS.map(a => (
              <div
                key={a.key}
                onClick={() => quickLogin(a)}
                style={{
                  border: '1px solid #eef0f4', borderRadius: 10, padding: '10px 8px', textAlign: 'center', cursor: 'pointer',
                  transition: 'all .2s', background: '#fff',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = a.color, e.currentTarget.style.boxShadow = `0 4px 12px rgba(0,0,0,.06)`)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = '#eef0f4', e.currentTarget.style.boxShadow = 'none')}
              >
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: a.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, margin: '0 auto 6px', fontSize: 13 }}>
                  {a.name[0]}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1f2d3d' }}>{a.name}</div>
                <div style={{ fontSize: 10, color: '#7a8699' }}>{a.role}</div>
                <Tag style={{ fontSize: 9, marginTop: 4, padding: '0 6px' }} color={a.type === 'console' ? 'blue' : a.type === 'provider' ? 'cyan' : 'red'}>
                  {a.type === 'console' ? '控制台' : a.type === 'provider' ? '资源方' : '平台'}
                </Tag>
              </div>
            ))}
          </div>

          <div style={{ textAlign: 'center', color: '#a6b0c0', fontSize: 11, marginTop: 20 }}>
            登录即代表同意 <a>《服务条款》</a> 与 <a>《隐私政策》</a> · 新用户可联系管理员开通企业账号
          </div>
        </div>
      </div>
    </div>
  );
}
