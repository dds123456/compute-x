import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Tag, Rate, Button, Space, Table, Spin, Progress, message, Alert, Tabs, Tooltip } from 'antd';
import { ThunderboltOutlined, StarOutlined, SafetyCertificateOutlined, DashboardOutlined } from '@ant-design/icons';
import api from '../api.js';
import { fmtMoney, STATUS_COLOR } from '../api.js';

export default function ResourceDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get(`/market/resources/${id}`).then(({ resource }) => setData(resource));
  }, [id]);

  if (!data) return <Spin style={{ display: 'block', margin: '80px auto' }} />;
  const r = data;

  const benchCols = [
    { title: '测试日期', dataIndex: 'date' },
    { title: '训练吞吐 (samples/s/8卡)', dataIndex: 'train_throughput' },
    { title: '推理延迟 (ms)', dataIndex: 'inference_latency' },
    { title: '稳定性', dataIndex: 'stability', render: v => <Tag color="green">{v}</Tag> },
  ];

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space size={12}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{r.spec}</div>
            <Tag color={STATUS_COLOR[r.status]}>{r.status}</Tag>
            <Tag icon={<SafetyCertificateOutlined />} color="blue">{r.provider_name} 已认证</Tag>
          </Space>
          <Space>
            <Button icon={<StarOutlined />} onClick={async () => { await api.post('/market/subscribe', { resourceId: r.id, memberId: localStorage.getItem('cx_uid') }); message.success('已订阅降价提醒'); }}>订阅降价</Button>
            <Button type="primary" icon={<ThunderboltOutlined />} disabled={r.status !== '可售'} onClick={() => nav(`/console/instances/create?resource=${r.id}`)}>立即租用</Button>
          </Space>
        </Space>
      </Card>

      <Tabs
        defaultActiveKey="params"
        items={[
          {
            key: 'params', label: '参数配置',
            children: (
              <Card size="small">
                <Descriptions column={3} bordered size="small">
                  <Descriptions.Item label="GPU 型号">{r.gpu_model}</Descriptions.Item>
                  <Descriptions.Item label="显存">{r.vram}</Descriptions.Item>
                  <Descriptions.Item label="内存">{r.ram}</Descriptions.Item>
                  <Descriptions.Item label="CPU">{r.cpu}</Descriptions.Item>
                  <Descriptions.Item label="带宽">{r.bandwidth}</Descriptions.Item>
                  <Descriptions.Item label="存储">{r.storage}</Descriptions.Item>
                  <Descriptions.Item label="地域">{r.region}</Descriptions.Item>
                  <Descriptions.Item label="机房位置">{r.site}</Descriptions.Item>
                  <Descriptions.Item label="可售库存">{r.stock} 台</Descriptions.Item>
                </Descriptions>
              </Card>
            ),
          },
          {
            key: 'perf', label: '性能验证（基准测试）',
            children: (
              <div>
                <Card size="small" style={{ marginBottom: 12 }}>
                  <Space size={32}>
                    <div><div style={{ color: '#7a8699', fontSize: 12 }}>理论性能分</div><b style={{ fontSize: 24, color: '#2f54eb' }}>{Math.round(r.benchmark * 1.1)}</b></div>
                    <div><div style={{ color: '#7a8699', fontSize: 12 }}>实测基准分</div><b style={{ fontSize: 24, color: '#13c2c2' }}>{r.benchmark}</b></div>
                    <div><div style={{ color: '#7a8699', fontSize: 12 }}>资源健康分</div><b style={{ fontSize: 24, color: '#52c41a' }}>{r.health}</b></div>
                    <div><div style={{ color: '#7a8699', fontSize: 12 }}>历史可用率</div><b style={{ fontSize: 24 }}>{r.availability}%</b></div>
                    <div><div style={{ color: '#7a8699', fontSize: 12 }}>历史故障率</div><b style={{ fontSize: 24 }}>{r.fault_rate}%</b></div>
                  </Space>
                </Card>
                <Card size="small" title="历史抽测记录">
                  <Table rowKey="date" columns={benchCols} dataSource={r.benches} pagination={false} size="small" />
                </Card>
              </div>
            ),
          },
          {
            key: 'price', label: '价格',
            children: (
              <Card size="small">
                <Space size={24} style={{ marginBottom: 16 }}>
                  <div style={{ textAlign: 'center', padding: '16px 28px', background: '#f0f5ff', borderRadius: 8 }}>
                    <div style={{ color: '#7a8699' }}>按小时</div><b style={{ fontSize: 26, color: '#f5222d' }}>¥{r.price_hour}</b><div style={{ color: '#a6b0c0', fontSize: 12 }}>按秒计量 · 按小时出账</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '16px 28px', background: '#f6ffed', borderRadius: 8 }}>
                    <div style={{ color: '#7a8699' }}>包日</div><b style={{ fontSize: 26, color: '#52c41a' }}>¥{r.price_day}</b><div style={{ color: '#a6b0c0', fontSize: 12 }}>≈ 日价 8 折</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '16px 28px', background: '#fff7e6', borderRadius: 8 }}>
                    <div style={{ color: '#7a8699' }}>包月</div><b style={{ fontSize: 26, color: '#fa8c16' }}>¥{fmtMoney(r.price_month)}</b><div style={{ color: '#a6b0c0', fontSize: 12 }}>长期合约另有折扣</div>
                  </div>
                </Space>
                <Alert type="info" showIcon message={`附加费用说明：${r.extra_fee}`} />
              </Card>
            ),
          },
          {
            key: 'provider', label: '资源方',
            children: (
              <Card size="small">
                <Space size={24} style={{ marginBottom: 16 }}>
                  <div style={{ width: 56, height: 56, borderRadius: 28, background: '#e8eeff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: '#2f54eb' }}><DashboardOutlined /></div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{r.provider_name}</div>
                    <div style={{ color: '#7a8699', fontSize: 12 }}>{r.provider_location} · 资质已认证 · 保证金 ¥50,000</div>
                    <Rate disabled defaultValue={r.provider_rating} />
                  </div>
                </Space>
                <Table rowKey="time" pagination={false} size="small" dataSource={r.reviews} columns={[
                  { title: '用户', dataIndex: 'user', width: 100 },
                  { title: '时间', dataIndex: 'time', width: 110 },
                  { title: '评价', dataIndex: 'content' },
                  { title: '评分', dataIndex: 'stars', width: 140, render: v => <Rate disabled defaultValue={v} style={{ fontSize: 12 }} /> },
                ]} />
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
}
