import { useEffect, useState } from 'react';
import { Card, Col, Progress, Row, Select, Spin, Table, Tag, Typography } from 'antd';
import { AlertOutlined, BarChartOutlined, ClockCircleOutlined, DatabaseOutlined, DollarOutlined, ThunderboltOutlined } from '@ant-design/icons';
import api, { fmtMoney } from '../api.js';
import { LineChart } from '../components/charts.jsx';

const { Title, Text } = Typography;

export default function FinOps({ projId }) {
  const [windowValue, setWindowValue] = useState('30d');
  const [data, setData] = useState(null);
  useEffect(() => {
    setData(null);
    api.get('/finops/overview', { params: { enterpriseId: localStorage.getItem('cx_enterprise'), projectId: projId !== '全部' ? projId : undefined, window: windowValue } }).then(setData);
  }, [projId, windowValue]);
  if (!data) return <Spin style={{ display: 'block', margin: '80px auto' }} />;
  const kpis = data.kpis;
  const metrics = [[<DollarOutlined />, kpis.totalCost, '#10221c'], [<ThunderboltOutlined />, kpis.avgGpuUtilization, '#0e9f66'], [<AlertOutlined />, kpis.idleCost, '#d99412'], [<BarChartOutlined />, kpis.forecastMonthCost, '#31b8c8'], [<span className="cx-mono">↓</span>, kpis.savingsPotential, '#6d5bd0']];
  return <div className="cx-v3-page">
    <section className="cx-v3-hero"><div><div className="cx-eyebrow">FINOPS CONTROL / SOURCE-BACKED</div><Title level={2}>成本与利用率控制台</Title><Text type="secondary">从逐日用量事实发现浪费、预测成本，并把建议转成可执行动作。</Text></div><Select value={windowValue} onChange={setWindowValue} options={[{ value: '7d', label: '近 7 天' }, { value: '30d', label: '近 30 天' }, { value: '90d', label: '近 90 天' }]} /></section>
    <div className="cx-kpi-grid">{metrics.map(([icon, metric, color]) => <Card className="cx-kpi-card" key={metric.label}><div className="cx-kpi-icon" style={{ color }}>{icon}</div><span>{metric.label}</span><b>{metric.unit === '%' ? `${metric.value}%` : `¥${fmtMoney(metric.value)}`}</b><small>{metric.definition}</small></Card>)}</div>
    <Row gutter={[16, 16]} style={{ marginTop: 16 }}><Col xs={24} xl={16}><Card title="成本与利用率趋势"><LineChart height={260} color="#0e9f66" label="每日成本（元）" data={data.trend.map(item => ({ t: item.date.slice(5), v: item.cost }))} /><div className="cx-chart-foot">利用率均值 {kpis.avgGpuUtilization.value}% · 观察 {data.source.observedDays} 个自然日</div></Card></Col><Col xs={24} xl={8}><Card title="预算护栏" className="cx-guardrail-card">{data.guardrails.map(item => <div className="cx-guardrail" key={item.projectId}><div><b>{item.projectName}</b><Tag color={item.level === '高' ? 'red' : item.level === '中' ? 'orange' : 'green'}>{item.level}暴露</Tag></div><Progress percent={Math.min(100, item.value)} strokeColor={item.level === '高' ? '#d64b43' : item.level === '中' ? '#d99412' : '#0e9f66'} /><small>{item.message}</small></div>)}</Card></Col></Row>
    <Row gutter={[16, 16]} style={{ marginTop: 16 }}><Col xs={24} xl={13}><Card title="优化机会"><Table rowKey="id" pagination={false} dataSource={data.opportunities} columns={[{ title: '实例', dataIndex: 'instanceName', render: (value, row) => <div><b>{value}</b><br /><Text type="secondary">{row.spec}</Text></div> }, { title: '利用率', dataIndex: 'utilization', render: value => <Tag color={value < 20 ? 'red' : 'orange'}>{value}%</Tag> }, { title: '可节省', dataIndex: 'estimatedSavings', render: value => <b>¥{fmtMoney(value)}</b> }, { title: '建议动作', dataIndex: 'action' }]} /></Card></Col><Col xs={24} xl={11}><Card title="项目成本驱动"><Table rowKey="projectId" pagination={false} dataSource={data.projectBreakdown} columns={[{ title: '项目', dataIndex: 'projectName' }, { title: '窗口成本', dataIndex: 'cost', render: value => `¥${fmtMoney(value)}` }, { title: '利用率', dataIndex: 'utilization', render: value => `${value}%` }, { title: '预算暴露', dataIndex: 'budgetUsedRate', render: value => `${value}%` }]} /></Card></Col></Row>
    <div className="cx-source-strip"><DatabaseOutlined /><span>数据粒度：{data.source.grain}</span><ClockCircleOutlined /><span>最新入库：{data.source.latestAt}</span><span>来源：{data.source.provider}</span><span>刷新：{data.source.refreshPolicy}</span></div>
  </div>;
}
