const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

export function downloadCsv(filename, rows, columns) {
  const header = columns.map(([label]) => csvCell(label)).join(',');
  const body = rows.map(row => columns.map(([, getter]) => csvCell(typeof getter === 'function' ? getter(row) : row[getter])).join(',')).join('\r\n');
  const blob = new Blob([`\uFEFF${header}\r\n${body}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);

export function printInvoiceReceipt(invoice) {
  const popup = window.open('', '_blank');
  if (!popup) throw new Error('浏览器阻止了票据窗口，请允许弹出窗口后重试');
  popup.opener = null;
  popup.document.write(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(invoice.invoice_no)}</title><style>body{font-family:system-ui,"Microsoft YaHei",sans-serif;color:#14221d;padding:48px;max-width:820px;margin:auto}.head{display:flex;justify-content:space-between;border-bottom:3px solid #0e9f66;padding-bottom:24px}.mono{font-family:monospace;color:#667a71}.amount{font-size:36px;font-weight:800}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:36px 0}.item{padding:16px;background:#f3f6f4;border:1px solid #dce6e1}.notice{font-size:12px;color:#667a71;border-top:1px solid #dce6e1;padding-top:18px}@media print{button{display:none}}</style></head><body><div class="head"><div><div class="mono">COMPUTEX / INVOICE RECEIPT</div><h1>开票受理凭证</h1></div><div class="amount">¥${Number(invoice.amount || 0).toFixed(2)}</div></div><div class="grid"><div class="item"><small>发票申请号</small><br><b>${escapeHtml(invoice.invoice_no)}</b></div><div class="item"><small>当前状态</small><br><b>${escapeHtml(invoice.status)}</b></div><div class="item"><small>发票抬头</small><br><b>${escapeHtml(invoice.title)}</b></div><div class="item"><small>发票类型</small><br><b>${escapeHtml(invoice.type)}</b></div><div class="item"><small>税号</small><br><b>${escapeHtml(invoice.tax_no)}</b></div><div class="item"><small>接收邮箱</small><br><b>${escapeHtml(invoice.email)}</b></div></div><p class="notice">本页是 ComputeX 开票流程受理凭证，不替代税务机关或电子发票服务平台签发的正式发票。正式票据签发后应通过已验证渠道交付。</p><button onclick="window.print()">打印 / 另存为 PDF</button></body></html>`);
  popup.document.close();
}
