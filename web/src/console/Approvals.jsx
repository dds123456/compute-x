import { useEffect, useState } from 'react';
import { Card, Table, Tag, Button, Space, Modal, Input, message, Descriptions, Timeline, Empty } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, AuditOutlined } from '@ant-design/icons';
import api from '../api.js';
import { fmtMoney, STATUS_COLOR } from '../api.js';

export default function Approvals({ me }) {
  const [list, setList] = useState([]);
  const [cur, setCur] = useState(null);
  const [note, setNote] = useState('');
  const [members, setMembers] = useState([]);
  const uid = localStorage.getItem('cx_uid');

  const load = () => {
    api.get('/org/approvals', { params: { userId: uid, enterpriseId: localStorage.getItem('cx_enterprise') } }).then(({ approvals }) => setList(approvals));
    api.get('/org/members', { params: { enterpriseId: localStorage.getItem('cx_enterprise') } }).then(({ members }) => setMembers(members));
  };
  useEffect(load, []);

  const decide = async (id, action) => {
    if (action === '驳回' && !note) return message.warning('驳回必须填写原因');
    await api.post(`/org/approvals/${id}/decide`, { action, note });
    message.success(action === '通过' ? '已通过，关联订单自动执行' : '已驳回');
    setCur(null); setNote(''); load();
  };

  const name = (id) => members.find(m => m.id === id)?.name || id;

  return (
    <div>
      <Card size="small" title={<Space><AuditOutlined />审批中心（{list.filter(a => a.status === '待审批').length} 条待处理）</Space>}>
        {list.length === 0 && <Empty description="暂无审批记录" />}
        <Table rowKey="id" dataSource={list} pagination={false} columns={[
          { title: '类型', dataIndex: 'type', width: 110, render: v => <Tag color={v === '实例购买' ? 'blue' : v === '预算申请' ? 'orange' : 'purple'}>{v}</Tag> },
          { title: '标题', dataIndex: 'title' },
          { title: '申请人', dataIndex: 'applicant_name', width: 100 },
          { title: '状态', dataIndex: 'status', width: 100, render: v => <Tag color={STATUS_COLOR[v]}>{v}</Tag> },
          { title: '提交时间', dataIndex: 'created_at', width: 160, render: v => <span style={{ fontSize: 12 }}>{v}</span> },
          { title: '操作', key: 'op', width: 90, render: (_, a) => a.status === '待审批' ? (
            <Button size="small" type="primary" onClick={() => setCur(a)}>处理</Button>
          ) : <Button size="small" onClick={() => setCur(a)}>查看</Button> },
        ]} />
      </Card>

      <Modal title={`审批详情：${cur?.title || ''}`} open={!!cur} onCancel={() => setCur(null)} footer={null} width={640}>
        {cur && (
          <div>
            <Descriptions column={2} bordered size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="类型">{cur.type}</Descriptions.Item>
              <Descriptions.Item label="状态"><Tag color={STATUS_COLOR[cur.status]}>{cur.status}</Tag></Descriptions.Item>
              <Descriptions.Item label="申请人">{name(cur.applicant_id)}</Descriptions.Item>
              <Descriptions.Item label="提交时间">{cur.created_at}</Descriptions.Item>
              <Descriptions.Item label="关联对象">{cur.related || '-'}</Descriptions.Item>
              <Descriptions.Item label="审批人">{name(cur.approver_id)}</Descriptions.Item>
            </Descriptions>
            {JSON.parse(cur.detail || '{}').amount && (
              <Descriptions column={2} bordered size="small" style={{ marginBottom: 16 }}>
                <Descriptions.Item label="规格">{JSON.parse(cur.detail).spec}</Descriptions.Item>
                <Descriptions.Item label="金额"><b style={{ color: '#f5222d' }}>¥{fmtMoney(JSON.parse(cur.detail).amount)}</b></Descriptions.Item>
                <Descriptions.Item label="时长">{JSON.parse(cur.detail).duration}</Descriptions.Item>
                <Descriptions.Item label="数量">{JSON.parse(cur.detail).quantity || 1}</Descriptions.Item>
              </Descriptions>
            )}
            <div style={{ fontWeight: 600, marginBottom: 8 }}>审批历史</div>
            {JSON.parse(cur.history || '[]').length === 0 ? <div style={{ color: '#a6b0c0' }}>暂无处理记录</div> : (
              <Timeline items={JSON.parse(cur.history).map((h, i) => ({
                color: h.action === '通过' ? 'green' : 'red',
                children: <span><b>{name(h.who)}</b> {h.action === '通过' ? '通过' : '驳回'} · {h.at}{h.note ? ` · 备注：${h.note}` : ''}</span>,
              }))} />
            )}
            {cur.status === '待审批' && (
              <div style={{ marginTop: 16 }}>
                <Input.TextArea rows={2} placeholder="驳回时填写原因（通过可选填）" value={note} onChange={e => setNote(e.target.value)} style={{ marginBottom: 12 }} />
                <Space>
                  <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => decide(cur.id, '通过')}>通过</Button>
                  <Button danger icon={<CloseCircleOutlined />} onClick={() => decide(cur.id, '驳回')}>驳回</Button>
                </Space>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
