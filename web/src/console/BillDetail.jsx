import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Table, Button, Space, Tag, message, Statistic, Row, Col, Popconfirm } from 'antd';
import { PayCircleOutlined, FileTextOutlined, WarningOutlined, DownloadOutlined } from '@ant-design/icons';
import api from '../api.js';
import { fmtMoney, STATUS_COLOR } from '../api.js';
import { downloadCsv } from '../utils/download.js';

export default function BillDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);

  const load = () => api.get(`/billing/bills/${id}`).then(({ bill, enterprise }) => setData({ bill, enterprise }));
  useEffect(load, [id]);

  if (!data) return null;
  const { bill, enterprise } = data;
  const exportDetail = () => {
    downloadCsv(`${bill.bill_no}-明细.csv`, bill.items, [
      ['账单号', () => bill.bill_no], ['账期', () => bill.period], ['实例/项目', 'name'], ['规格', 'spec'],
      ['小时数', 'hours'], ['天数', 'days'], ['单价', 'rate'], ['金额', 'amount'],
    ]);
    message.success('账单明细已导出');
  };

  const pay = async () => {
    try { const { msg } = await api.post(`/billing/bills/${id}/pay`); message.success(msg); load(); }
    catch (e) { message.error(e.message); }
  };

  return (
    <div>
      <Card size="small" style={{ marginBottom: 12 }}>
        <Row gutter={16} align="middle">
          <Col span={16}>
            <Space size={12}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>账单 {bill.bill_no}</div>
              <Tag color={STATUS_COLOR[bill.status]}>{bill.status}</Tag>
              <Tag color={STATUS_COLOR[bill.invoice_status]}>开票：{bill.invoice_status}</Tag>
            </Space>
          </Col>
          <Col span={8} style={{ textAlign: 'right' }}>
            <Space>
              {bill.status === '待支付' && <Button type="primary" icon={<PayCircleOutlined />} onClick={pay}>立即支付</Button>}
              {bill.invoice_status === '未开票' && <Button icon={<FileTextOutlined />} onClick={() => nav('/console/invoices')}>申请开票</Button>}
              <Button icon={<WarningOutlined />} onClick={() => nav(`/console/tickets?bill=${bill.id}`)}>计费争议</Button>
              <Button icon={<DownloadOutlined />} onClick={exportDetail}>导出</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card size="small" style={{ marginBottom: 12 }}>
        <Descriptions column={4} size="small">
          <Descriptions.Item label="账期">{bill.period}</Descriptions.Item>
          <Descriptions.Item label="总金额"><b style={{ color: '#f5222d' }}>¥{fmtMoney(bill.amount)}</b></Descriptions.Item>
          <Descriptions.Item label="付款方式">{bill.paid_at ? '账户余额' : '待支付'}</Descriptions.Item>
          <Descriptions.Item label="出账时间">{bill.created_at}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card size="small" title="费用明细（按实例聚合，可展开逐日明细）">
        <Table rowKey="id" dataSource={bill.items} pagination={false} expandable={{ expandedRowRender: (r) => (
          <Table size="small" rowKey="d" pagination={false} dataSource={Array.from({ length: 5 }, (_, k) => ({ d: `2026-08-${String(13 + k).padStart(2, '0')}`, h: 24, a: Math.round(r.amount / 5 * 100) / 100 }))}
            columns={[{ title: '日期', dataIndex: 'd' }, { title: '小时数', dataIndex: 'h' }, { title: '费用', dataIndex: 'a', render: v => `¥${v}` }]} />
        )}} columns={[
          { title: '实例/项目', dataIndex: 'name' },
          { title: '规格', dataIndex: 'spec' },
          { title: '用量', key: 'usage', render: (_, r) => r.hours ? `${r.hours} 小时` : r.days ? `${r.days} 天` : '-' },
          { title: '单价', key: 'rate', render: (_, r) => r.rate ? `¥${r.rate}` : '-' },
          { title: '金额', dataIndex: 'amount', render: v => <b>¥{fmtMoney(v)}</b> },
        ]} />
      </Card>
    </div>
  );
}
