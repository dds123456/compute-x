import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Tag, Button, Space, Tabs, Spin, message, Popconfirm, Alert, Table, Input, Progress, Statistic, Row, Col, Timeline, Empty, Typography } from 'antd';
import { PoweroffOutlined, SyncOutlined, DollarOutlined, DeleteOutlined, CopyOutlined, CameraOutlined, CloudDownloadOutlined } from '@ant-design/icons';
import api from '../api.js';
import { fmtMoney, STATUS_COLOR } from '../api.js';
import { LineChart } from '../components/charts.jsx';

export default function InstanceDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [logs, setLogs] = useState([]);
  const [range, setRange] = useState('1h');

  const load = () => api.get(`/orders/instances/${id}`).then(({ instance }) => setData(instance));
  useEffect(() => { load(); }, [id]);
  useEffect(() => {
    if (data?.status === '运行中') api.get(`/orders/instances/${id}/logs`).then(({ lines }) => setLogs(lines));
  }, [id, data?.status]);

  const act = async (a, confirm = false) => {
    const doAct = async () => {
      try {
        const { msg } = await api.post(`/orders/instances/${id}/action`, { action: a });
        message.success(msg);
        load();
      } catch (e) { message.error(e.message); }
    };
    if (confirm) return doAct();
    if (a === '释放') return;
    doAct();
  };

  if (!data) return <Spin style={{ display: 'block', margin: '80px auto' }} />;
  const i = data;
  const sshCmd = `ssh -p ${i.ssh_port} ${i.ssh_user}@${i.ssh_host}`;

  return (
    <div>
      {i.status === '异常' && (
        <Alert style={{ marginBottom: 12 }} type="error" showIcon banner message={`实例异常：宿主机网络故障（工单 TK20260817001 处理中），已自动减免故障期间费用`} />
      )}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space size={12}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{i.name}</div>
            <Tag color={STATUS_COLOR[i.status]}>{i.status}</Tag>
            <Tag>{i.spec}</Tag>
            <Tag color="blue">{i.billing_type}</Tag>
          </Space>
          <Space>
            {i.status === '运行中' && <Button icon={<PoweroffOutlined />} onClick={() => act('停止')}>停止</Button>}
            {i.status === '已停止' && <Button type="primary" icon={<SyncOutlined />} onClick={() => act('启动')}>启动</Button>}
            {['运行中', '异常'].includes(i.status) && <Button icon={<SyncOutlined />} onClick={() => act('重启')}>重启</Button>}
            {['运行中', '待续费'].includes(i.status) && <Button type="primary" icon={<DollarOutlined />} onClick={() => act('续费')}>续费</Button>}
            <Popconfirm title="确认释放该实例？" description="实例将被回收，磁盘数据按 NIST 800-88 标准擦除，不可恢复" okText="确认释放" okButtonProps={{ danger: true }} onConfirm={() => act('释放', true)}>
              <Button danger icon={<DeleteOutlined />}>释放</Button>
            </Popconfirm>
          </Space>
        </Space>
      </Card>

      <Tabs
        defaultActiveKey="overview"
        items={[
          {
            key: 'overview', label: '概览',
            children: (
              <div>
                <Row gutter={[12, 12]}>
                  <Col span={18}>
                    <Card title={`实时监控（近 ${range}）`} size="small" extra={
                      <Space><Tag color="green">GPU 利用率</Tag><Tag color="cyan">显存</Tag><Tag color="blue">CPU</Tag><Tag color="purple">内存</Tag></Space>
                    }>
                      <LineChart data={data.monitor.gpu} height={150} color="#52c41a" label="GPU %" />
                      <LineChart data={data.monitor.vram} height={120} color="#13c2c2" label="显存 %" />
                      <LineChart data={data.monitor.cpu} height={120} color="#2f54eb" label="CPU %" />
                      <LineChart data={data.monitor.mem} height={120} color="#722ed1" label="内存 %" />
                    </Card>
                  </Col>
                  <Col span={6}>
                    <Card title="费用与信息" size="small">
                      <Statistic title="当前累计费用" value={i.current_cost} precision={2} prefix="¥" valueStyle={{ color: '#f5222d', fontSize: 24 }} />
                      <DividerSmall />
                      <Descriptions column={1} size="small">
                        <Descriptions.Item label="单价">¥{i.price_hour}/小时（{i.billing_type}）</Descriptions.Item>
                        <Descriptions.Item label="预计日费用">¥{fmtMoney(i.price_hour * 24)}</Descriptions.Item>
                        <Descriptions.Item label="创建时间">{i.created_at}</Descriptions.Item>
                        <Descriptions.Item label="到期时间">{i.expires_at || '-'}</Descriptions.Item>
                        <Descriptions.Item label="断点保护">{i.checkpoint ? <Tag color="green">已启用</Tag> : <Tag>未启用</Tag>}</Descriptions.Item>
                      </Descriptions>
                    </Card>
                  </Col>
                </Row>
                <Card title="连接信息" size="small" style={{ marginTop: 12 }}>
                  <Descriptions column={2} size="small">
                    <Descriptions.Item label="SSH 命令">
                      <code style={{ background: '#f0f1f5', padding: '2px 8px', borderRadius: 4 }}>{sshCmd}</code>
                      <Button size="small" type="text" icon={<CopyOutlined />} onClick={() => { navigator.clipboard?.writeText(sshCmd); message.success('已复制'); }} />
                    </Descriptions.Item>
                    <Descriptions.Item label="密钥">{i.key_name || '默认密钥'}</Descriptions.Item>
                    <Descriptions.Item label="镜像">{i.image}</Descriptions.Item>
                    <Descriptions.Item label="地域">{i.region}</Descriptions.Item>
                  </Descriptions>
                </Card>
              </div>
            ),
          },
          {
            key: 'logs', label: '日志',
            children: (
              <Card size="small">
                <Space style={{ marginBottom: 12 }}>
                  <Input.Search placeholder="搜索日志关键词" style={{ width: 240 }} allowClear />
                  <Button icon={<CloudDownloadOutlined />}>下载日志</Button>
                </Space>
                <pre style={{ background: '#1f2d3d', color: '#c8f7c5', padding: 16, borderRadius: 8, fontSize: 12, maxHeight: 480, overflow: 'auto', lineHeight: 1.7 }}>
                  {logs.length ? logs.join('\n') : '(实例未运行，暂无日志)'}
                </pre>
              </Card>
            ),
          },
          {
            key: 'alerts', label: '告警',
            children: (
              <Card size="small">
                <Table rowKey="id" size="small" pagination={false} dataSource={i.alerts} columns={[
                  { title: '类型', dataIndex: 'type', render: v => <Tag>{v}</Tag> },
                  { title: '等级', dataIndex: 'level', render: v => <Tag color={STATUS_COLOR[v]}>{v}</Tag> },
                  { title: '指标', dataIndex: 'metric' },
                  { title: '消息', dataIndex: 'message' },
                  { title: '状态', dataIndex: 'status', render: v => <Tag color={STATUS_COLOR[v]}>{v}</Tag> },
                  { title: '触发时间', dataIndex: 'triggered_at', render: v => <span style={{ fontSize: 12 }}>{v}</span> },
                ]} />
              </Card>
            ),
          },
          {
            key: 'snap', label: '快照',
            children: (
              <Card size="small">
                <Button icon={<CameraOutlined />} style={{ marginBottom: 12 }} onClick={async () => {
                  await api.post(`/orders/instances/${id}/snapshot`, {});
                  message.success('快照创建成功');
                  load();
                }}>创建快照</Button>
                <Table rowKey="id" size="small" pagination={false} dataSource={i.snapshots} columns={[
                  { title: '快照名', dataIndex: 'name' },
                  { title: '大小', dataIndex: 'size' },
                  { title: '创建时间', dataIndex: 'created_at' },
                  { title: '操作', key: 'op', render: () => <Button size="small">从快照恢复</Button> },
                ]} />
              </Card>
            ),
          },
          {
            key: 'billing', label: '计费',
            children: (
              <Card size="small">
                <Descriptions column={3} bordered size="small" style={{ marginBottom: 12 }}>
                  <Descriptions.Item label="计费方式">{i.billing_type}</Descriptions.Item>
                  <Descriptions.Item label="单价">¥{i.price_hour}/小时</Descriptions.Item>
                  <Descriptions.Item label="累计费用">¥{fmtMoney(i.current_cost)}</Descriptions.Item>
                </Descriptions>
                <Table rowKey="d" size="small" pagination={false} dataSource={Array.from({ length: 7 }, (_, k) => {
                  const d = new Date(Date.now() - (6 - k) * 86400000);
                  const hours = k === 6 ? new Date().getHours() : 24;
                  return { d: `${d.getMonth() + 1}/${d.getDate()}`, hours, amount: hours * i.price_hour };
                })} columns={[
                  { title: '日期', dataIndex: 'd' },
                  { title: '运行时长', dataIndex: 'hours', render: v => `${v} 小时` },
                  { title: '费用', dataIndex: 'amount', render: v => `¥${fmtMoney(v)}` },
                ]} />
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
}

function DividerSmall() { return <div style={{ height: 1, background: '#eef0f4', margin: '12px 0' }} />; }
