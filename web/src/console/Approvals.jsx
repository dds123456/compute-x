import { useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Empty, Input, Modal, Row, Space, Steps, Tag, Typography, message } from 'antd';
import { AuditOutlined, CheckCircleOutlined, CloseCircleOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import api, { fmtMoney } from '../api.js';

const { Title, Text } = Typography;

export default function Approvals() {
  const [requests, setRequests] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [current, setCurrent] = useState(null);
  const [comment, setComment] = useState('');
  const isGuest = localStorage.getItem('cx_guest') === '1';
  const load = () => Promise.all([api.get('/approvals-v3/requests'), api.get('/approvals-v3/policies')]).then(([a, b]) => { setRequests(a.requests); setPolicies(b.policies); });
  useEffect(() => { load(); }, []);
  const decide = async action => {
    if (action === '驳回' && !comment.trim()) return message.warning('驳回必须填写原因');
    try {
      await api.post(`/approvals-v3/requests/${current.id}/decision`, { action, comment });
      message.success(action === '通过' ? '本步骤已通过；审批不会自动支付或交付' : '已驳回并写入审计轨迹');
      setCurrent(null); setComment(''); load();
    } catch (error) { message.error(error.message); }
  };
  return <div className="cx-v3-page">
    <section className="cx-v3-hero"><div><div className="cx-eyebrow">APPROVAL CONTROL / V2</div><Title level={2}>审批与履约隔离</Title><Text type="secondary">策略决定谁能批准；批准只产生决策结果，支付与实例交付保持独立。</Text></div><div className="cx-trust-chip"><SafetyCertificateOutlined /> 职责分离</div></section>
    {isGuest && <Alert type="info" showIcon message="游客模式为只读审批视图" style={{ marginBottom: 16 }} />}
    <Row gutter={[16, 16]}>
      <Col xs={24} xl={16}><Card title={<Space><AuditOutlined />审批请求</Space>}>{requests.length ? <div className="cx-approval-list">{requests.map(request => <button type="button" className="cx-approval-row" key={request.id} onClick={() => setCurrent(request)}><div><Tag color={request.status === '待审批' ? 'orange' : request.status === '已通过' ? 'green' : 'red'}>{request.status}</Tag><b>¥{fmtMoney(request.amount)}</b><span>{request.id}</span></div><Steps size="small" current={Math.max(0, request.currentStep - 1)} status={request.status === '已驳回' ? 'error' : request.status === '已通过' ? 'finish' : 'process'} items={request.steps.map(step => ({ title: `第 ${step.stepNo} 级`, description: step.status }))} /></button>)}</div> : <Empty description="暂无 V3 审批请求" />}</Card></Col>
      <Col xs={24} xl={8}><Card title="生效策略">{policies.map(policy => <div className="cx-policy" key={policy.id}><div><b>{policy.project_name}</b><Tag color="green">{policy.status}</Tag></div><Text type="secondary">金额达到 ¥{fmtMoney(policy.min_amount)} 触发</Text><div className="cx-policy-steps">{policy.steps.map((step, index) => <span key={step.approverId}>{index + 1}. {step.approverId}</span>)}</div></div>)}</Card></Col>
    </Row>
    <Modal title="审批决策轨迹" open={!!current} onCancel={() => setCurrent(null)} footer={null} width={680}>{current && <><div className="cx-approval-summary"><div><span>申请金额</span><b>¥{fmtMoney(current.amount)}</b></div><div><span>草稿状态</span><b>{current.draftStatus}</b></div><div><span>提交时间</span><b>{current.submittedAt}</b></div></div><Steps direction="vertical" current={Math.max(0, current.currentStep - 1)} status={current.status === '已驳回' ? 'error' : 'process'} items={current.steps.map(step => ({ title: `第 ${step.stepNo} 级审批 · ${step.approverId}`, description: `${step.status}${step.comment ? ` · ${step.comment}` : ''}${step.decidedAt ? ` · ${step.decidedAt}` : ''}` }))} />{current.status === '待审批' && !isGuest && <><Input.TextArea value={comment} onChange={event => setComment(event.target.value)} placeholder="填写核验结论；驳回时必填…" maxLength={500} showCount /><Space style={{ marginTop: 12 }}><Button type="primary" icon={<CheckCircleOutlined />} onClick={() => decide('通过')}>通过当前步骤</Button><Button danger icon={<CloseCircleOutlined />} onClick={() => decide('驳回')}>驳回</Button></Space></>}</>}</Modal>
  </div>;
}
