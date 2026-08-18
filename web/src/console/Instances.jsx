import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Table, Tag, Button, Space, Select, Input, Dropdown, message, Popconfirm, Segmented } from 'antd';
import { ThunderboltOutlined, MoreOutlined, ReloadOutlined, PoweroffOutlined, SyncOutlined, DollarOutlined, DeleteOutlined } from '@ant-design/icons';
import api from '../api.js';
import { fmtMoney, STATUS_COLOR } from '../api.js';

export default function Instances({ projId }) {
  const nav = useNavigate();
  const [list, setList] = useState([]);
  const [status, setStatus] = useState('全部');
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/orders/instances', { params: { enterpriseId: localStorage.getItem('cx_enterprise'), status, projectId: projId !== '全部' ? projId : undefined } })
      .then(({ instances }) => setList(instances))
      .finally(() => setLoading(false));
  };
  useEffect(load, [status, projId]);

  const action = async (id, act, name) => {
    try {
      const { msg } = await api.post(`/orders/instances/${id}/action`, { action: act });
      message.success(`${name}${name.includes('释放') ? '（数据擦除中）' : ''}成功`);
      load();
    } catch (e) { message.error(e.message); }
  };

  const batchAction = async (act) => {
    for (const id of selected) await action(id, act, act);
    setSelected([]);
  };

  const filtered = keyword ? list.filter(i => i.name.includes(keyword) || (i.spec || '').includes(keyword)) : list;

  const columns = [
    { title: '实例名', dataIndex: 'name', width: 200, render: (v, r) => (
      <div>
        <a onClick={() => nav(`/console/instances/${r.id}`)} style={{ fontWeight: 600 }}>{v}</a>
        <div style={{ fontSize: 11, color: '#a6b0c0' }}>{r.spec} · {r.region}</div>
      </div>
    )},
    { title: '状态', dataIndex: 'status', width: 90, render: v => <Tag color={STATUS_COLOR[v]}>{v}</Tag> },
    { title: '项目', key: 'project', width: 130, render: (_, r) => <span style={{ fontSize: 12 }}>{r.project_id || '-'}</span> },
    { title: '计费方式', dataIndex: 'billing_type', width: 90, render: v => <Tag color="blue">{v}</Tag> },
    { title: '当前费用', dataIndex: 'current_cost', width: 120, render: (v, r) => <b style={{ color: r.status === '已释放' ? '#a6b0c0' : '#f5222d' }}>¥{fmtMoney(v)}</b> },
    { title: '创建时间', dataIndex: 'created_at', width: 150, render: v => <span style={{ fontSize: 12 }}>{v}</span> },
    { title: '到期时间', dataIndex: 'expires_at', width: 150, render: v => <span style={{ fontSize: 12 }}>{v || '-'}</span> },
    { title: '操作', key: 'op', width: 210, render: (_, r) => {
      const acts = {
        '运行中': [['停止', <PoweroffOutlined />], ['重启', <ReloadOutlined />], ['续费', <DollarOutlined />]],
        '已停止': [['启动', <SyncOutlined />]],
        '待续费': [['续费', <DollarOutlined />]],
        '异常': [['重启', <ReloadOutlined />]],
      }[r.status] || [];
      return (
        <Space size={4}>
          {acts.map(([a, icon]) => a === '释放' ? (
            <Popconfirm key={a} title={`确认释放 ${r.name}？数据将被擦除且不可恢复`} onConfirm={() => action(r.id, '释放', a)}>
              <Button size="small" danger icon={icon}>{a}</Button>
            </Popconfirm>
          ) : (
            <Button key={a} size="small" onClick={() => action(r.id, a, a)} icon={icon}>{a}</Button>
          ))}
          <Dropdown menu={{ items: [
            { key: 'detail', label: '实例详情', onClick: () => nav(`/console/instances/${r.id}`) },
            { key: 'rel', type: 'divider' },
            { key: 'release', label: '释放实例（数据擦除）', danger: true, onClick: () => action(r.id, '释放', '释放') },
          ] }}>
            <Button size="small" icon={<MoreOutlined />} />
          </Dropdown>
        </Space>
      );
    }},
  ];

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Segmented value={status} onChange={setStatus} options={['全部', '运行中', '已停止', '待续费', '异常', '已释放'].map(s => ({ value: s, label: s }))} />
          <Input.Search placeholder="搜索实例名/规格" style={{ width: 220 }} allowClear onSearch={setKeyword} />
          <Button type="primary" icon={<ThunderboltOutlined />} onClick={() => nav('/console/instances/create')}>创建实例</Button>
          {selected.length > 0 && (
            <Space>
              <Button onClick={() => batchAction('启动')}>批量启动 ({selected.length})</Button>
              <Button onClick={() => batchAction('停止')}>批量停止</Button>
              <Popconfirm title={`确认释放 ${selected.length} 个实例？`} onConfirm={() => batchAction('释放')}>
                <Button danger>批量释放</Button>
              </Popconfirm>
            </Space>
          )}
        </Space>
      </Card>
      <Card size="small">
        <Table rowKey="id" loading={loading} columns={columns} dataSource={filtered} size="middle"
          rowSelection={{ selectedRowKeys: selected, onChange: setSelected }}
          pagination={{ pageSize: 10, showTotal: t => `共 ${t} 个实例` }} />
      </Card>
    </div>
  );
}
