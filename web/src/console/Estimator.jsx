import { useState } from 'react';
import { Card, Form, Select, InputNumber, Button, Table, Tag, Space, Result, message, Radio } from 'antd';
import { CalculatorOutlined, DownloadOutlined } from '@ant-design/icons';
import api from '../api.js';
import { fmtMoney } from '../api.js';
import { downloadCsv } from '../utils/download.js';

export default function Estimator() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async (v) => {
    setLoading(true);
    try {
      const { range, recommendations } = await api.post('/market/estimate', v);
      setResult({ ...v, range, recommendations });
    } catch (e) { message.error(e.message); } finally { setLoading(false); }
  };
  const exportReport = () => {
    downloadCsv(`ComputeX-成本估算-${new Date().toISOString().slice(0, 10)}.csv`, result.recommendations, [
      ['任务类型', () => result.taskType], ['卡数', () => result.cards], ['预计时长(小时)', () => result.hours], ['数据规模(GB)', () => result.dataSize],
      ['资源规格', 'spec'], ['GPU', 'gpu_model'], ['地域', 'region'], ['节点数', 'nodeCount'], ['时价', 'price_hour'], ['存储费', 'storageCost'], ['带宽费', 'bwCost'], ['预估总费用', 'estimate'],
    ]);
    message.success('估算报告已导出');
  };

  return (
    <div>
      <Card title={<Space><CalculatorOutlined />算力成本估算器</Space>} size="small" style={{ marginBottom: 16 }}>
        <Form layout="inline" onFinish={submit} initialValues={{ taskType: '训练', cards: 8, hours: 72, dataSize: 100 }}>
          <Form.Item name="taskType" label="任务类型">
            <Radio.Group options={[{ value: '训练', label: '训练' }, { value: '推理', label: '推理' }, { value: '渲染', label: '渲染' }]} optionType="button" />
          </Form.Item>
          <Form.Item name="gpuModel" label="GPU 型号">
            <Select allowClear placeholder="不限" style={{ width: 180 }} options={['NVIDIA A100 40G', 'NVIDIA A100 80G', 'NVIDIA H100 80G', 'NVIDIA RTX 4090', 'NVIDIA L40S 48G', 'NVIDIA A10 24G', 'NVIDIA V100 16G', '昇腾 910B'].map(g => ({ value: g, label: g }))} />
          </Form.Item>
          <Form.Item name="cards" label="卡数"><InputNumber min={1} max={64} /></Form.Item>
          <Form.Item name="hours" label="预计时长(小时)"><InputNumber min={1} max={8760} /></Form.Item>
          <Form.Item name="dataSize" label="数据规模(GB)"><InputNumber min={0} /></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" loading={loading}>估算</Button></Form.Item>
        </Form>
      </Card>

      {result && (
        <Card size="small" title={`估算结果：${result.taskType}任务 · ${result.cards} 卡 · ${result.hours} 小时`}>
          <Result
            status="success"
            title={`预估费用区间：¥${fmtMoney(result.range[0])} ～ ¥${fmtMoney(result.range[1])}`}
            subTitle="含资源租赁 + 存储（0.1元/GB/小时）+ 带宽（0.5元/GB）；与真实计费口径误差 ≤5%"
            extra={[
              <Button key="dl" icon={<DownloadOutlined />} onClick={exportReport}>导出估算报告</Button>,
            ]}
          />
          <Table rowKey="id" size="small" dataSource={result.recommendations} pagination={false}
            columns={[
              { title: '推荐资源', dataIndex: 'spec' },
              { title: 'GPU', dataIndex: 'gpu_model' },
              { title: '地域', dataIndex: 'region' },
              { title: '节点数', dataIndex: 'nodeCount' },
              { title: '时价', dataIndex: 'price_hour', render: v => `¥${v}` },
              { title: '存储费', dataIndex: 'storageCost', render: v => `¥${v}` },
              { title: '带宽费', dataIndex: 'bwCost', render: v => `¥${v}` },
              { title: '预估总费用', dataIndex: 'estimate', render: (v, r) => <b style={{ color: '#f5222d' }}>¥{fmtMoney(v)}</b> },
              { title: '', key: 'op', render: (_, r) => <Tag color="blue">推荐</Tag> },
            ]} />
        </Card>
      )}
    </div>
  );
}
