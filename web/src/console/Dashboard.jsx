import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Row, Col, Card, Statistic, Progress, Button, Space, Tag, Spin, Empty, Alert } from 'antd';
import { ArrowUpOutlined, ThunderboltOutlined, WalletOutlined, CloudServerOutlined, AuditOutlined, AlertOutlined } from '@ant-design/icons';
import api from '../api.js';
import { fmtMoney, fmtInt, STATUS_COLOR } from '../api.js';
import { LineChart, DonutChart, BarChart } from '../components/charts.jsx';

export default function Dashboard({ projId }) {
  const nav = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/dashboard/overview', { params: { enterpriseId: localStorage.getItem('cx_enterprise'), projectId: projId !== '全部' ? projId : undefined } }).then(({ overview }) => setData(overview));
  }, [projId]);

  if (!data) return <Spin style={{ display: 'block', margin: '80px auto' }} />;

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col span={6}><Card><Statistic title="本月消费（元）" value={data.monthCost} precision={2} prefix={<WalletOutlined />} valueStyle={{ color: '#2f54eb' }} suffix={<Tag color="blue">待支付 {fmtMoney(data.pendingBills)}</Tag>} /></Card></Col>
        <Col span={6}><Card><Statistic title="运行中实例" value={data.running} prefix={<CloudServerOutlined />} suffix={<span style={{ fontSize: 13, color: '#7a8699' }}>异常 {data.error} · 待续费 {data.expiring}</span>} valueStyle={{ color: '#13c2c2' }} /></Card></Col>
        <Col span={6}><Card><Statistic title="待审批" value={data.pendingApprovals} prefix={<AuditOutlined />} valueStyle={{ color: '#faad14' }} suffix={<Tag color="orange">未读告警 {data.unreadAlerts}</Tag>} /></Card></Col>
        <Col span={6}><Card><Statistic title="账户余额（元）" value={data.balance} precision={2} prefix={<ThunderboltOutlined />} suffix={<span style={{ fontSize: 12, color: '#a6b0c0' }}>授信 {fmtMoney(data.credit)}</span>} valueStyle={{ color: '#722ed1' }} /></Card></Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={12}>
          <Card title="近 30 天消费趋势" size="small">
            <LineChart data={data.trend} height={220} label="单位：元" />
          </Card>
        </Col>
        <Col span={6}>
          <Card title="实例状态分布" size="small" style={{ height: '100%' }}>
            {data.statusDist.length ? <DonutChart data={data.statusDist} size={150} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />}
          </Card>
        </Col>
        <Col span={6}>
          <Card title="项目资源利用率" size="small" style={{ height: '100%' }}>
            <BarChart data={data.utilByProject} height={220} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={12}>
          <Card title="项目预算使用" size="small">
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              {data.projects.map(p => (
                <div key={p.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                    <span>{p.name}</span>
                    <span><b>{fmtMoney(p.used)}</b> / {fmtMoney(p.budget)} 元 · <Tag color={STATUS_COLOR[p.level]} style={{ marginLeft: 4 }}>{p.level === '预警' ? '已达80%预警' : p.level === '超支' ? '已超支' : '正常'}</Tag></span>
                  </div>
                  <Progress percent={p.percent} status={p.level === '超支' ? 'exception' : p.level === '预警' ? 'active' : 'normal'} strokeColor={p.level === '超支' ? '#f5222d' : p.level === '预警' ? '#faad14' : '#2f54eb'} size={['100%', 8]} />
                </div>
              ))}
            </Space>
          </Card>
        </Col>
        <Col span={12}>
          <Card title="快捷入口" size="small" style={{ height: '100%' }}>
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <Space>
                <Button type="primary" icon={<ThunderboltOutlined />} onClick={() => nav('/console/instances/create')}>立即租用</Button>
                <Button onClick={() => nav('/console/bills')}>查看账单</Button>
                <Button onClick={() => nav('/console/tickets')}>创建工单</Button>
                <Button onClick={() => nav('/console/estimator')}>成本估算</Button>
              </Space>
              <Alert type="info" showIcon message="提示" description="演示环境：下单后实例约 2 秒交付；实例费用按当前状态实时计算，可前往实例列表验证启停/释放等状态流转。" />
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
