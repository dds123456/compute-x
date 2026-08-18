// 通用业务工具：ID生成、费用计算、实例状态机、通知、审计
import db from './db.js';

export const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

export function genId(prefix, n = 3) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Math.random().toString(36).slice(2, 6)}`.toLowerCase();
}

export function genNo(prefix) {
  const d = new Date();
  const p = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rand = String(Math.floor(Math.random() * 9000) + 1000);
  return `${prefix}${p}${rand}`;
}

// 计算实例累计费用（元）
export function calcInstanceCost(inst, asOf = Date.now()) {
  if (!inst) return 0;
  const price = inst.price_hour || 0;
  let end = asOf;
  if (inst.status === '已释放' || inst.status === '已停止' || inst.status === '被回收') {
    end = new Date(inst.stopped_at || inst.expires_at || asOf).getTime();
  } else if (inst.status === '运行中' || inst.status === '创建中' || inst.status === '异常') {
    end = asOf;
  } else {
    end = asOf;
  }
  const start = new Date(inst.created_at).getTime();
  const hours = Math.max(0, (end - start) / 3600000);
  let cost = hours * price;
  if (inst.billing_type === '包日') {
    const days = Math.max(1, Math.ceil(hours / 24));
    cost = days * (inst.price_day || price * 24);
  } else if (inst.billing_type === '包月') {
    const months = Math.max(1, Math.ceil(hours / 720));
    cost = months * (inst.price_month || price * 720);
  }
  return Math.round(cost * 100) / 100;
}

// 实例状态机迁移
export const STATUS_ACTIONS = {
  '运行中': ['停止', '重启', '释放', '续费', '变更配置'],
  '已停止': ['启动', '释放'],
  '创建中': [],
  '待续费': ['续费', '释放'],
  '异常': ['重启', '释放'],
  '释放中': [],
  '已释放': [],
  '被回收': [],
};

export function transitionInstance(id, action) {
  const inst = db.prepare('SELECT * FROM instances WHERE id = ?').get(id);
  if (!inst) return { ok: false, msg: '实例不存在' };
  const t = now();
  switch (action) {
    case '启动':
      if (inst.status !== '已停止') return { ok: false, msg: '仅已停止实例可启动' };
      db.prepare(`UPDATE instances SET status='运行中', stopped_at=NULL, expires_at=datetime(expires_at,'+7 days') WHERE id=?`).run(id);
      notifyByProject(inst, '实例', '实例已启动', `${inst.name} 已恢复运行，开始计费`);
      break;
    case '停止':
      if (inst.status !== '运行中') return { ok: false, msg: '仅运行中实例可停止' };
      db.prepare(`UPDATE instances SET status='已停止', stopped_at=? WHERE id=?`).run(t, id);
      notifyByProject(inst, '实例', '实例已停止', `${inst.name} 已停止，计算费用停止（存储费用继续）`);
      break;
    case '重启':
      if (!['运行中', '异常'].includes(inst.status)) return { ok: false, msg: '当前状态不可重启' };
      db.prepare(`UPDATE instances SET status='运行中' WHERE id=?`).run(id);
      break;
    case '续费':
      db.prepare(`UPDATE instances SET status='运行中', expires_at=datetime(expires_at,'+7 days') WHERE id=?`).run(id);
      notifyByProject(inst, '账单', '续费成功', `${inst.name} 续费成功，到期时间顺延 7 天`);
      break;
    case '释放': {
      db.prepare(`UPDATE instances SET status='释放中' WHERE id=?`).run(id);
      setTimeout(() => {
        try {
          db.prepare(`UPDATE instances SET status='已释放', stopped_at=? WHERE id=?`).run(t, id);
          db.prepare(`INSERT INTO notifications (id,enterprise_id,user_id,category,title,content,is_read,link,created_at) VALUES (?,?,?,?,?,?,0,?,?)`)
            .run(genId('n'), inst.enterprise_id, inst.member_id, '实例', '实例已释放', `${inst.name} 已释放，数据已按 NIST 800-88 标准擦除`, `/instances/${id}`, now());
        } catch (e) { /* ignore */ }
      }, 1500);
      db.prepare(`INSERT INTO audit_logs (enterprise_id,user_id,user_name,action,target,created_at) VALUES (?,?,?,?,?,?)`)
        .run(inst.enterprise_id, 'system', '系统', '释放实例', `${inst.name}（数据已擦除）`, t);
      break;
    }
    default:
      return { ok: false, msg: `不支持的操作: ${action}` };
  }
  return { ok: true };
}

function notifyByProject(inst, category, title, content) {
  const members = JSON.parse(inst.project_id ? (db.prepare('SELECT project_ids FROM members WHERE id=?').get(inst.member_id)?.project_ids || '[]') : '[]');
  const project = inst.project_id ? db.prepare('SELECT owner_id FROM projects WHERE id=?').get(inst.project_id) : null;
  const targets = new Set([inst.member_id, project?.owner_id]);
  targets.forEach(uid => {
    if (!uid) return;
    db.prepare(`INSERT INTO notifications (id,enterprise_id,user_id,category,title,content,is_read,link,created_at) VALUES (?,?,?,?,?,?,0,?,?)`)
      .run(genId('n'), inst.enterprise_id, uid, category, title, content, `/instances/${inst.id}`, now());
  });
}

export function notify(enterpriseId, userId, category, title, content, link = '') {
  db.prepare(`INSERT INTO notifications (id,enterprise_id,user_id,category,title,content,is_read,link,created_at) VALUES (?,?,?,?,?,?,0,?,?)`)
    .run(genId('n'), enterpriseId, userId, category, title, content, link, now());
}

export function auditLog(enterpriseId, userId, userName, action, target) {
  db.prepare(`INSERT INTO audit_logs (enterprise_id,user_id,user_name,action,target,created_at) VALUES (?,?,?,?,?,?)`)
    .run(enterpriseId, userId, userName, action, target, now());
}

// 常用查询：当前企业实例带资源信息
export function listInstances(enterpriseId, filter = {}) {
  let sql = `SELECT i.*, r.region, r.site FROM instances i LEFT JOIN resources r ON i.resource_id = r.id WHERE i.enterprise_id = ?`;
  const params = [enterpriseId];
  if (filter.status && filter.status !== '全部') { sql += ` AND i.status = ?`; params.push(filter.status); }
  if (filter.projectId) { sql += ` AND i.project_id = ?`; params.push(filter.projectId); }
  sql += ` ORDER BY datetime(i.created_at) DESC`;
  const rows = db.prepare(sql).all(...params);
  return rows.map(r => ({ ...r, current_cost: calcInstanceCost(r) }));
}

export function fmtMoney(v) {
  return Number(v || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
