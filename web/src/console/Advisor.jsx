import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Empty, Form, Input, InputNumber, Modal, Progress, Row, Select, Space, Steps, Tag, Typography, message } from 'antd';
import { AuditOutlined, CheckCircleOutlined, ExperimentOutlined, SafetyCertificateOutlined, ThunderboltOutlined } from '@ant-design/icons';
import api, { fmtMoney } from '../api.js';

const { Title, Text, Paragraph } = Typography;
const strategyTone = ['green', 'cyan', 'gold'];

export default function Advisor() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [recommendation, setRecommendation] = useState(null);
  const [selected, setSelected] = useState(null);
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState();
  const [drafts, setDrafts] = useState([]);
  const isGuest = localStorage.getItem('cx_guest') === '1';

  const loadDrafts = () => api.get('/advisor/drafts').then(({ drafts: rows }) => setDrafts(rows));
  useEffect(() => {
    api.get('/auth/projects').then(({ projects: rows }) => { setProjects(rows); setProjectId(rows[0]?.id); });
    loadDrafts();
  }, []);

  const recommend = async values => {
    setLoading(true); setSelected(null);
    try {
      const { recommendation: result } = await api.post('/advisor/recommend', values);
      setRecommendation(result);
      message.success('已完成库存、价格、性能与风险校验');
    } catch (error) { message.error(error.message); }
    finally { setLoading(false); }
  };

  const createDraft = async () => {
    if (!selected || !projectId) return message.warning('请选择方案和归属项目');
    try {
      const { draft } = await api.post(`/advisor/recommendations/${recommendation.id}/draft`, { planId: selected.planId, projectId });
      message.success(`订单草稿 ${draft.id} 已锁定报价`); setSelected(null); loadDrafts();
    } catch (error) { message.error(error.message); }
  };

  const advanceDraft = async draft => {
    try {
      if (draft.status === '草稿') {
        const result = await api.post(`/approvals-v3/drafts/${draft.id}/submit`);
        message.success(result.approvalRequired ? '已进入审批轨迹' : '无需审批，可确认下单');
      } else if (draft.status === '待确认') {
        const { order } = await api.post(`/advisor/drafts/${draft.id}/confirm`);
        Modal.success({ title: '订单已创建，等待支付', content: `${order.orderNo} · ¥${fmtMoney(order.amount)}` });
      }
      loadDrafts();
    } catch (error) { message.error(error.message); }
  };

  const selectedProject = useMemo(() => projects.find(item => item.id === projectId), [projects, projectId]);
  const threshold = Number(JSON.parse(selectedProject?.approval_rule || '{}').threshold || 0);

  return <div className="cx-v3-page">
    <section className="cx-v3-hero"><div><div className="cx-eyebrow">DECISION INTELLIGENCE / V3</div><Title level={2}>算力决策中心</Title><Paragraph>把工作负载意图转换成可验证的采购方案。价格、库存与性能由业务引擎锁定，AI 仅解释证据。</Paragraph></div><div className="cx-trust-chip"><SafetyCertificateOutlined /> 事实约束推荐</div></section>
    {isGuest && <Alert className="cx-v3-alert" showIcon type="info" message="游客可浏览决策工作台与 FinOps 数据" description="生成推荐、创建草稿和提交审批会写入企业审计链，因此仅对登录企业成员开放。" />}
    <Card className="cx-intent-card" bordered={false}><Form form={form} layout="vertical" autoComplete="off" onFinish={recommend} initialValues={{ workloadType: '大模型微调', modelName: 'Qwen3-32B', modelSizeB: 32, dataSizeGB: 480, deadlineHours: 36, budget: 9000, region: '上海', compliance: ['数据不出境'] }}>
      <Row gutter={16}>
        <Col xs={24} md={8}><Form.Item name="workloadType" label="工作负载" rules={[{ required: true }]}><Select options={['大模型预训练', '大模型微调', '在线推理', '批量渲染'].map(value => ({ value, label: value }))} /></Form.Item></Col>
        <Col xs={24} md={8}><Form.Item name="modelName" label="模型 / 应用"><Input placeholder="例如 Qwen3-32B…" /></Form.Item></Col>
        <Col xs={12} md={4}><Form.Item name="modelSizeB" label="模型规模（B）" rules={[{ required: true }]}><InputNumber min={1} max={1000} style={{ width: '100%' }} /></Form.Item></Col>
        <Col xs={12} md={4}><Form.Item name="dataSizeGB" label="数据量（GB）" rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item name="deadlineHours" label="交付时限（小时）" rules={[{ required: true }]}><InputNumber min={1} style={{ width: '100%' }} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item name="budget" label="预算上限（元）" rules={[{ required: true }]}><InputNumber min={1} style={{ width: '100%' }} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item name="region" label="数据地域"><Select options={['上海', '北京', '杭州', '深圳'].map(value => ({ value, label: value }))} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item name="compliance" label="合规约束"><Select mode="multiple" options={['数据不出境', '等保三级', '仅认证资源方'].map(value => ({ value, label: value }))} /></Form.Item></Col>
      </Row><Button type="primary" htmlType="submit" size="large" icon={<ThunderboltOutlined />} loading={loading} disabled={isGuest}>生成可验证方案</Button>
    </Form></Card>
    {recommendation && <section className="cx-plan-section"><div className="cx-section-heading"><div><div className="cx-eyebrow">RECOMMENDATION TRACE</div><Title level={4}>三条可审计决策路径</Title></div><Space><Tag color={recommendation.engine === 'gateway' ? 'green' : 'default'}>{recommendation.engine === 'gateway' ? 'AI Gateway 已增强解释' : '确定性引擎降级'}</Tag><Text type="secondary">{recommendation.id}</Text></Space></div><Row gutter={[16, 16]}>{recommendation.plans.map((plan, index) => <Col xs={24} lg={8} key={plan.planId}><button type="button" className="cx-plan-button" disabled={isGuest} aria-pressed={selected?.planId === plan.planId} onClick={() => setSelected(plan)}><Card className={`cx-plan-card ${selected?.planId === plan.planId ? 'is-selected' : ''}`}><div className="cx-plan-top"><Tag color={strategyTone[index]}>{plan.strategy}</Tag><span className="cx-confidence">置信度 {Math.round(plan.confidence * 100)}%</span></div><Title level={4}>{plan.gpuModel}</Title><Text type="secondary">{plan.spec} · {plan.providerName}</Text><div className="cx-plan-price"><span>¥</span>{fmtMoney(plan.totalCost)}<small> / {plan.estimatedHours} 小时</small></div><Progress percent={Math.round(plan.confidence * 100)} showInfo={false} strokeColor={index === 2 ? '#d99412' : '#0e9f66'} /><div className="cx-evidence-grid"><div><span>库存快照</span><b>{plan.evidence.stockAtQuote} 台</b></div><div><span>交付预测</span><b>{plan.deliveryMinutes} 分钟</b></div><div><span>性能基准</span><b>{plan.evidence.benchmark}</b></div><div><span>可用性</span><b>{plan.evidence.availability}%</b></div></div><Paragraph className="cx-plan-explain">{plan.explanation}</Paragraph><div className="cx-risk-line">{plan.risks.length ? plan.risks.map(risk => <Tag key={risk} color="orange">{risk}</Tag>) : <Tag icon={<CheckCircleOutlined />} color="green">未发现关键风险</Tag>}</div></Card></button></Col>)}</Row>{selected && <Card className="cx-lock-bar"><Space wrap><CheckCircleOutlined /><b>已选择 {selected.strategy}</b><Select value={projectId} onChange={setProjectId} style={{ minWidth: 210 }} options={projects.map(project => ({ value: project.id, label: project.name }))} /><Tag color={selected.totalCost >= threshold ? 'orange' : 'green'}>{selected.totalCost >= threshold ? '预计需要审批' : '预计免审批'}</Tag><Button type="primary" onClick={createDraft}>锁定报价并创建草稿</Button></Space></Card>}</section>}
    <Card className="cx-draft-card" title={<Space><AuditOutlined />采购决策轨迹</Space>}>{drafts.length ? <div className="cx-draft-list">{drafts.map(draft => <div className="cx-draft-row" key={draft.id}><Steps size="small" current={draft.status === '草稿' ? 0 : draft.status === '审批中' ? 1 : draft.status === '待确认' ? 2 : 3} status={draft.status === '已驳回' ? 'error' : 'process'} items={[{ title: '报价草稿' }, { title: '审批决策' }, { title: '人工确认' }, { title: '待支付' }]} /><div className="cx-draft-meta"><div><b>{draft.spec}</b><span>{draft.projectName} · {draft.quantity} 台 × {draft.durationHours} 小时</span></div><div><b>¥{fmtMoney(draft.amount)}</b><Tag>{draft.status}</Tag>{['草稿', '待确认'].includes(draft.status) && !isGuest && <Button size="small" type="primary" onClick={() => advanceDraft(draft)}>{draft.status === '草稿' ? '提交策略判断' : '确认生成订单'}</Button>}</div></div></div>)}</div> : <Empty image={<ExperimentOutlined style={{ fontSize: 36 }} />} description="还没有采购决策轨迹" />}</Card>
  </div>;
}
