import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Steps, Card, Select, InputNumber, Input, Radio, Checkbox, Button, Space, Table, Descriptions, message, Tag, Alert, Divider, Switch, Form } from 'antd';
import api from '../api.js';
import { fmtMoney } from '../api.js';

export default function InstanceCreate() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [step, setStep] = useState(0);
  const [resources, setResources] = useState([]);
  const [images, setImages] = useState([]);
  const [projects, setProjects] = useState([]);
  const [form] = Form.useForm();
  const [fee, setFee] = useState(0);

  const sel = Form.useWatch([], form) || {};

  useEffect(() => {
    api.get('/market/resources', { params: { status: '可售' } }).then(({ resources }) => setResources(resources));
    api.get('/market/images').then(({ images }) => setImages(images));
    api.get('/auth/projects').then(({ projects }) => setProjects(projects));
    if (params.get('resource')) {
      form.setFieldValue('resourceId', params.get('resource'));
    }
  }, []);

  const resource = useMemo(() => resources.find(r => r.id === sel.resourceId), [resources, sel.resourceId]);

  useEffect(() => {
    if (!resource) return setFee(0);
    const hours = sel.hours || 1;
    const qty = sel.quantity || 1;
    let unit = resource.price_hour;
    if (sel.billingType === '包日') unit = resource.price_day;
    if (sel.billingType === '包月') unit = resource.price_month;
    setFee(unit * qty * (sel.billingType === '按小时' ? hours : sel.billingType === '包日' ? Math.ceil(hours / 24) : Math.ceil(hours / 720)));
  }, [sel, resource]);

  const project = useMemo(() => projects.find(p => p.id === sel.projectId), [projects, sel.projectId]);
  const overBudget = project && project.budget > 0 && fee > (project.budget - project.used);
  const needApproval = project && JSON.parse(project.approval_rule || '{}').threshold > 0 && fee >= JSON.parse(project.approval_rule).threshold;

  const submit = async () => {
    try {
      const values = await form.validateFields();
      const res = await api.post('/orders/create', {
        resourceId: values.resourceId, quantity: values.quantity, hours: values.hours, billingType: values.billingType,
        projectId: values.projectId, memberId: localStorage.getItem('cx_uid'), enterpriseId: localStorage.getItem('cx_enterprise'),
        name: values.name, envVars: (values.envVars || '').split('\n').filter(Boolean),
        sshKey: values.sshKey, checkpoint: values.checkpoint, autoRelease: values.autoRelease,
      });
      if (res.needApproval) {
        message.warning(`订单已提交审批：${res.approvalMsg}`);
        nav('/console/approvals');
      } else {
        const pay = await api.post('/orders/pay', { orderId: res.orderId, name: values.name });
        message.success('支付成功，实例交付中（约 2 秒）');
        setTimeout(() => nav(`/console/instances/${pay.instanceId}`), 1200);
      }
    } catch (e) {
      if (e.errorFields) return;
      message.error(e.message);
      if (e.message?.includes('库存不足') || e.message?.includes('不可售')) {
        nav('/console/market');
      }
    }
  };

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto' }}>
      <Steps current={step} style={{ marginBottom: 24 }} items={[
        { title: '选择资源' }, { title: '配置' }, { title: '项目与审批' }, { title: '确认与支付' },
      ]} />

      <Form form={form} layout="vertical" initialValues={{ quantity: 1, hours: 24, billingType: '按小时' }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            {step === 0 && (
              <Card title="步骤 1 · 选择资源规格" size="small">
                <Form.Item name="resourceId" rules={[{ required: true, message: '请选择资源' }]}>
                  <Select size="large" placeholder="选择 GPU 资源" options={resources.map(r => ({
                    value: r.id,
                    label: `${r.spec}（${r.region} · ¥${r.price_hour}/时 · 库存${r.stock}）`,
                  }))} />
                </Form.Item>
                {resource && (
                  <Table rowKey="id" size="small" pagination={false} dataSource={[resource]}
                    columns={[
                      { title: 'GPU', dataIndex: 'gpu_model' },
                      { title: '显存', dataIndex: 'vram' },
                      { title: '内存', dataIndex: 'ram' },
                      { title: 'CPU', dataIndex: 'cpu' },
                      { title: '带宽', dataIndex: 'bandwidth' },
                      { title: '基准分', dataIndex: 'benchmark', render: v => <b style={{ color: '#2f54eb' }}>{v}</b> },
                      { title: '可用率', dataIndex: 'availability', render: v => `${v}%` },
                    ]} />
                )}
              </Card>
            )}

            {step === 1 && (
              <Card title="步骤 2 · 实例配置" size="small">
                <Form.Item name="name" label="实例名称" rules={[{ required: true, message: '请输入实例名称' }]}>
                  <Input placeholder="如 llm-train-a100-01" />
                </Form.Item>
                <Space size={16} style={{ width: '100%' }} wrap>
                  <Form.Item name="quantity" label="数量" rules={[{ required: true }]}><InputNumber min={1} max={50} /></Form.Item>
                  <Form.Item name="billingType" label="计费方式"><Radio.Group optionType="button" options={['按小时', '包日', '包月'].map(v => ({ value: v, label: v }))} /></Form.Item>
                  <Form.Item name="hours" label="时长（小时）" rules={[{ required: true, message: '请输入时长' }]}><InputNumber min={1} max={720} style={{ width: 140 }} /></Form.Item>
                  <Form.Item name="imageId" label="镜像" initialValue="img-1">
                    <Select style={{ width: 260 }} options={images.map(i => ({ value: i.id, label: `${i.name}（${i.type}）` }))} />
                  </Form.Item>
                </Space>
                <Form.Item name="sshKey" label="SSH 密钥（Key Name）"><Input placeholder="选择或输入已托管密钥名" /></Form.Item>
                <Form.Item name="envVars" label="环境变量（每行一个，如 KEY=VALUE）"><Input.TextArea rows={3} placeholder={'WANDB_API_KEY=sk-xxx\nDATA_DIR=/data/llm'} /></Form.Item>
                <Space size={24}>
                  <Form.Item name="checkpoint" valuePropName="checked"><Checkbox>启用断点保护（宿主机故障自动迁移）</Checkbox></Form.Item>
                  <Form.Item name="autoRelease" valuePropName="checked"><Checkbox>任务结束自动释放（不产生闲置费用）</Checkbox></Form.Item>
                </Space>
              </Card>
            )}

            {step === 2 && (
              <Card title="步骤 3 · 项目与审批" size="small">
                <Form.Item name="projectId" label="所属项目" rules={[{ required: true, message: '请选择项目' }]}>
                  <Select options={projects.map(p => ({ value: p.id, label: `${p.name}（预算 ${fmtMoney(p.budget)}，已用 ${fmtMoney(p.used)}）` }))} />
                </Form.Item>
                {project && (
                  <Descriptions column={2} bordered size="small">
                    <Descriptions.Item label="项目预算">{fmtMoney(project.budget)} 元</Descriptions.Item>
                    <Descriptions.Item label="剩余额度"><b style={{ color: project.budget - project.used < fee ? '#f5222d' : '#52c41a' }}>{fmtMoney(project.budget - project.used)} 元</b></Descriptions.Item>
                    <Descriptions.Item label="审批阈值">超过 {fmtMoney(JSON.parse(project.approval_rule || '{}').threshold)} 元自动触发审批</Descriptions.Item>
                    <Descriptions.Item label="本次费用">{fmtMoney(fee)} 元</Descriptions.Item>
                  </Descriptions>
                )}
                {overBudget && <Alert style={{ marginTop: 12 }} type="error" showIcon message="超出项目剩余预算，将无法提交（需管理员调整预算）" />}
                {needApproval && !overBudget && <Alert style={{ marginTop: 12 }} type="warning" showIcon message="本次费用超过项目审批阈值，提交后将进入审批流，审批通过后自动扣费交付" />}
              </Card>
            )}

            {step === 3 && (
              <Card title="步骤 4 · 确认与支付" size="small">
                <Descriptions column={2} bordered size="small">
                  <Descriptions.Item label="资源规格">{resource?.spec}</Descriptions.Item>
                  <Descriptions.Item label="数量">{sel.quantity} 台</Descriptions.Item>
                  <Descriptions.Item label="计费方式">{sel.billingType}</Descriptions.Item>
                  <Descriptions.Item label="时长">{sel.hours} 小时</Descriptions.Item>
                  <Descriptions.Item label="所属项目">{project?.name}</Descriptions.Item>
                  <Descriptions.Item label="镜像">{images.find(i => i.id === sel.imageId)?.name}</Descriptions.Item>
                  <Descriptions.Item label="断点保护">{sel.checkpoint ? '启用' : '未启用'}</Descriptions.Item>
                  <Descriptions.Item label="自动释放">{sel.autoRelease ? '启用' : '未启用'}</Descriptions.Item>
                </Descriptions>
                <Divider />
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#7a8699' }}>费用预估（含税）</div>
                  <div style={{ fontSize: 30, fontWeight: 700, color: '#f5222d' }}>¥{fmtMoney(fee)}</div>
                  <div style={{ color: '#a6b0c0', fontSize: 12 }}>支付方式：账户余额（当前余额 {fmtMoney(0)} 元）</div>
                </div>
              </Card>
            )}
          </div>

          <Card title="费用估算（实时）" size="small" style={{ width: 280, position: 'sticky', top: 80 }}>
            {resource ? (
              <Space direction="vertical" style={{ width: '100%' }} size={6}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#7a8699' }}>资源时价</span><b>¥{resource.price_hour}/小时</b></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#7a8699' }}>包日价</span><b>¥{resource.price_day}/日</b></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#7a8699' }}>包月价</span><b>¥{fmtMoney(resource.price_month)}/月</b></div>
                <Divider style={{ margin: '8px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>预估费用</span><b style={{ fontSize: 20, color: '#f5222d' }}>¥{fmtMoney(fee)}</b></div>
                <div style={{ color: '#a6b0c0', fontSize: 11 }}>含税；带宽/存储按量另计</div>
              </Space>
            ) : <div style={{ color: '#a6b0c0' }}>选择资源后实时估算</div>}
          </Card>
        </div>
      </Form>

      <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between' }}>
        <Button disabled={step === 0} onClick={() => setStep(s => s - 1)}>上一步</Button>
        {step < 3 ? (
          <Button type="primary" onClick={async () => {
            try { await form.validateFields(['resourceId', step === 1 ? 'name' : null].filter(Boolean)); setStep(s => s + 1); }
            catch { message.warning('请完善必填项'); }
          }}>下一步</Button>
        ) : (
          <Button type="primary" size="large" disabled={overBudget} onClick={submit}>提交订单并支付</Button>
        )}
      </div>
    </div>
  );
}
