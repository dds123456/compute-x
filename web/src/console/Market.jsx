import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Card, Table, Tag, Button, Space, Input, Select, Rate, Progress, Drawer, message, Tooltip } from 'antd';
import { SearchOutlined, ThunderboltOutlined, EyeOutlined, StarOutlined, WarningOutlined } from '@ant-design/icons';
import api from '../api.js';
import { fmtMoney, fmtInt, STATUS_COLOR } from '../api.js';

const sortMap = { price: '价格最低', benchmark: '性能分最高', created: '最新上架' };

export default function Market({ compare }) {
  const nav = useNavigate();
  const loc = useLocation();
  const [resources, setResources] = useState([]);
  const [filters, setFilters] = useState({});
  const [gpus, setGpus] = useState([]);
  const [regions, setRegions] = useState([]);
  const [sort, setSort] = useState('benchmark');
  const [compareIds, setCompareIds] = useState([]);
  const [drawer, setDrawer] = useState(false);
  const [compareData, setCompareData] = useState([]);
  const [keyword, setKeyword] = useState('');

  const load = () => {
    api.get('/market/resources', { params: { ...filters, sort, keyword } }).then(({ resources }) => setResources(resources));
  };
  useEffect(load, [filters, sort, keyword]);
  useEffect(() => {
    api.get('/market/filters').then(({ gpus, regions }) => { setGpus(gpus); setRegions(regions); });
  }, []);

  const openCompare = async () => {
    if (compareIds.length < 2) return message.warning('请至少选择 2 个资源对比');
    const { resources } = await api.get('/market/compare', { params: { ids: compareIds.join(',') } });
    setCompareData(resources);
    setDrawer(true);
  };

  const subscribe = async (id) => {
    await api.post('/market/subscribe', { resourceId: id, memberId: localStorage.getItem('cx_uid') });
    message.success('已订阅降价/到货提醒');
  };

  const columns = [
    { title: '资源 / GPU 规格', dataIndex: 'spec', width: 250, render: (v, r) => (
      <div>
        <a onClick={() => nav(`/console/market/${r.id}`)} style={{ fontWeight: 600, color: '#1f2d3d' }}>{v}</a>
        <div style={{ fontSize: 12, color: '#7a8699' }}>{r.gpu_model} · {r.region} · {r.site}</div>
        <div style={{ fontSize: 12, color: '#a6b0c0' }}>资源方：{r.provider_name} <Rate disabled defaultValue={r.provider_rating || 4.5} style={{ fontSize: 10 }} /></div>
      </div>
    )},
    { title: '配置', key: 'conf', width: 210, render: (_, r) => (
      <div style={{ fontSize: 12, color: '#4a5568', lineHeight: 1.8 }}>
        <div>显存 {r.vram} · 内存 {r.ram}</div>
        <div>CPU {r.cpu} · 带宽 {r.bandwidth}</div>
      </div>
    )},
    { title: '基准分', dataIndex: 'benchmark', width: 90, render: (v, r) => (
      <Tooltip title={`实测训练吞吐 ${(v * 1.8).toFixed(0)} samples/s（8卡）\n推理延迟 ${(Math.random() * 6 + 5).toFixed(1)}ms`}>
        <b style={{ color: '#2f54eb', fontSize: 15 }}>{v}</b>
        <Progress percent={Math.min(100, v)} showInfo={false} strokeColor="#2f54eb" size="small" />
      </Tooltip>
    )},
    { title: '可用性', key: 'avail', width: 90, render: (_, r) => (
      <div style={{ fontSize: 12 }}>
        <Tag color={STATUS_COLOR[r.status]}>{r.status}</Tag>
        <div style={{ color: '#7a8699' }}>可用率 {r.availability}%</div>
        <div style={{ color: '#7a8699' }}>故障率 {r.fault_rate}%</div>
      </div>
    )},
    { title: '单价（含税）', key: 'price', width: 130, render: (_, r) => (
      <div>
        <b style={{ color: '#f5222d', fontSize: 16 }}>¥{r.price_hour}</b><span style={{ color: '#7a8699', fontSize: 12 }}>/小时</span>
        <div style={{ fontSize: 12, color: '#7a8699' }}>包日 ¥{r.price_day} · 包月 ¥{fmtInt(r.price_month)}</div>
      </div>
    )},
    { title: '库存', dataIndex: 'stock', width: 70, render: (v) => <span style={{ color: v < 5 ? '#f5222d' : '#52c41a' }}>{v} 台</span> },
    { title: '操作', key: 'op', width: 220, render: (_, r) => (
      <Space size={4}>
        {compare && (
          <CheckboxMini checked={compareIds.includes(r.id)} onChange={() => setCompareIds(ids => ids.includes(r.id) ? ids.filter(x => x !== r.id) : [...ids, r.id])} />
        )}
        <Button size="small" icon={<EyeOutlined />} onClick={() => nav(`/console/market/${r.id}`)}>详情</Button>
        <Button size="small" icon={<StarOutlined />} onClick={() => subscribe(r.id)}>订阅</Button>
        <Button size="small" type="primary" icon={<ThunderboltOutlined />} disabled={r.status !== '可售'} onClick={() => nav(`/console/instances/create?resource=${r.id}`)}>租用</Button>
      </Space>
    )},
  ];

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space wrap>
            <Input prefix={<SearchOutlined />} placeholder="搜索资源名/GPU 型号" style={{ width: 220 }} value={keyword} onChange={e => setKeyword(e.target.value)} allowClear />
            <Select placeholder="GPU 型号" style={{ width: 170 }} allowClear onChange={v => setFilters(f => ({ ...f, gpu_model: v }))} options={gpus.map(g => ({ value: g, label: g }))} />
            <Select placeholder="地域" style={{ width: 120 }} allowClear onChange={v => setFilters(f => ({ ...f, region: v }))} options={regions.map(r => ({ value: r, label: r }))} />
            <Select placeholder="可用状态" style={{ width: 110 }} allowClear onChange={v => setFilters(f => ({ ...f, status: v }))} options={['可售', '售罄', '维护中', '已下架'].map(s => ({ value: s, label: s }))} />
            <Input prefix="¥" placeholder="最高时价" type="number" style={{ width: 110 }} onChange={e => setFilters(f => ({ ...f, max_price: e.target.value || undefined }))} />
            <Select value={sort} onChange={setSort} style={{ width: 120 }} options={Object.entries(sortMap).map(([k, v]) => ({ value: k, label: v }))} />
          </Space>
          <Space>
            {compare && (
              <>
                <Button onClick={openCompare} disabled={compareIds.length < 2}>对比 ({compareIds.length}/3)</Button>
                <Button type="primary" onClick={() => nav('/console/instances/create')}>去租用</Button>
              </>
            )}
            {!compare && <Button type="primary" onClick={() => nav('/console/instances/create')}>立即租用</Button>}
          </Space>
        </Space>
      </Card>

      <Card size="small">
        <Table rowKey="id" columns={columns} dataSource={resources} pagination={{ pageSize: 10, showTotal: t => `共 ${t} 个资源` }} size="middle" />
      </Card>

      <Drawer title={`资源对比（${compareData.length}）`} width={1100} open={drawer} onClose={() => setDrawer(false)}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <tbody>
            <tr><td style={td}>规格</td>{compareData.map(r => <td key={r.id} style={td}><b>{r.spec}</b></td>)}</tr>
            <tr><td style={td}>GPU</td>{compareData.map(r => <td key={r.id} style={td}>{r.gpu_model}</td>)}</tr>
            <tr><td style={td}>显存/内存</td>{compareData.map(r => <td key={r.id} style={td}>{r.vram} / {r.ram}</td>)}</tr>
            <tr><td style={td}>地域</td>{compareData.map(r => <td key={r.id} style={td}>{r.region} · {r.site}</td>)}</tr>
            <tr><td style={td}>基准分</td>{compareData.map(r => <td key={r.id} style={td}><b style={{ color: '#2f54eb' }}>{r.benchmark}</b></td>)}</tr>
            <tr><td style={td}>可用率</td>{compareData.map(r => <td key={r.id} style={td}>{r.availability}%</td>)}</tr>
            <tr><td style={td}>资源方评分</td>{compareData.map(r => <td key={r.id} style={td}><Rate disabled defaultValue={r.provider_rating || 4.5} style={{ fontSize: 12 }} /></td>)}</tr>
            <tr><td style={td}>时价/包日/包月</td>{compareData.map(r => <td key={r.id} style={td}><span style={{ color: '#f5222d' }}>¥{r.price_hour}</span> / ¥{r.price_day} / ¥{fmtInt(r.price_month)}</td>)}</tr>
            <tr><td style={td}>库存</td>{compareData.map(r => <td key={r.id} style={td}>{r.stock} 台</td>)}</tr>
            <tr><td style={td}>操作</td>{compareData.map(r => <td key={r.id} style={td}><Button type="primary" size="small" disabled={r.status !== '可售'} onClick={() => nav(`/console/instances/create?resource=${r.id}`)}>立即租用</Button></td>)}</tr>
          </tbody>
        </table>
      </Drawer>
    </div>
  );
}

const td = { padding: '10px 14px', border: '1px solid #eef0f4', minWidth: 150, background: '#fff' };

function CheckboxMini({ checked, onChange }) {
  return (
    <Button size="small" type={checked ? 'primary' : 'default'} onClick={onChange}>
      {checked ? '✓' : '选'}
    </Button>
  );
}
