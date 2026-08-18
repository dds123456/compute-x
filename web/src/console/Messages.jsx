import { useEffect, useState } from 'react';
import { Card, List, Tag, Button, Space, Segmented, Badge, Empty, message } from 'antd';
import { BellOutlined, CheckOutlined, AlertOutlined, AuditOutlined, FileTextOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../api.js';
import { STATUS_COLOR } from '../api.js';

const ICONS = { 告警: <AlertOutlined style={{ color: '#f5222d' }} />, 审批: <AuditOutlined style={{ color: '#faad14' }} />, 账单: <FileTextOutlined style={{ color: '#2f54eb' }} />, 实例: <ThunderboltOutlined style={{ color: '#13c2c2' }} />, 系统: <BellOutlined style={{ color: '#7a8699' }} />, 工单: <BellOutlined style={{ color: '#722ed1' }} /> };

export default function Messages({ me }) {
  const nav = useNavigate();
  const [list, setList] = useState([]);
  const [cat, setCat] = useState('全部');
  const [onlyUnread, setOnlyUnread] = useState(false);
  const uid = localStorage.getItem('cx_uid');

  const load = () => {
    api.get('/notify/notifications', { params: { userId: uid, category: cat, unread: onlyUnread ? '1' : undefined } }).then(({ notifications }) => setList(notifications));
  };
  useEffect(load, [cat, onlyUnread]);

  const readAll = async () => {
    await api.post('/notify/notifications/read', { userId: uid, all: true });
    message.success('已全部标记已读');
    load();
  };

  const readOne = async (n) => {
    if (!n.is_read) {
      await api.post('/notify/notifications/read', { ids: [n.id] });
      load();
    }
    const link = n.link;
    if (link?.startsWith('/instances/')) nav(`/console/instances/${link.split('/')[2]}`);
    else if (link?.startsWith('/approvals')) nav('/console/approvals');
    else if (link?.startsWith('/bills/')) nav(`/console/bills/${link.split('/')[2]}`);
    else if (link?.startsWith('/tickets/')) nav(`/console/tickets/${link.split('/')[2]}`);
    else if (link === '/projects') nav('/console/projects');
    else if (link === '/members') nav('/console/members');
    else if (link === '/invoices') nav('/console/invoices');
    else if (link === '/notice') message.info('系统公告（演示）');
  };

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16 }}
        title={<Space><BellOutlined />消息中心</Space>}
        extra={<Button size="small" icon={<CheckOutlined />} onClick={readAll}>全部已读</Button>}>
        <Space style={{ marginBottom: 12 }}>
          <Segmented value={cat} onChange={setCat} options={['全部', '告警', '审批', '账单', '实例', '工单', '系统'].map(c => ({ value: c, label: c }))} />
          <Button size="small" type={onlyUnread ? 'primary' : 'default'} onClick={() => setOnlyUnread(!onlyUnread)}>只看未读</Button>
        </Space>
        {list.length === 0 ? <Empty description="暂无消息" /> : (
          <List
            itemLayout="horizontal"
            dataSource={list}
            renderItem={(n) => (
              <List.Item style={{ cursor: 'pointer', opacity: n.is_read ? 0.6 : 1 }} onClick={() => readOne(n)}>
                <List.Item.Meta
                  avatar={<Badge dot={!n.is_read} offset={[-4, 4]}>{ICONS[n.category] || ICONS.系统}</Badge>}
                  title={<Space>{n.title}<Tag color={STATUS_COLOR[n.category]} style={{ marginLeft: 4 }}>{n.category}</Tag></Space>}
                  description={<div><div>{n.content}</div><span style={{ fontSize: 12, color: '#a6b0c0' }}>{n.created_at}</span></div>}
                />
              </List.Item>
            )}
          />
        )}
      </Card>
    </div>
  );
}
