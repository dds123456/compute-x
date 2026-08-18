// 轻量 SVG 图表组件（无第三方依赖）
export function LineChart({ data = [], height = 200, color = '#2f54eb', label }) {
  const w = 680, h = height, padL = 44, padB = 24, padT = 16, padR = 12;
  if (!data.length) return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a6b0c0' }}>暂无数据</div>;
  const max = Math.max(...data.map(d => d.v)) * 1.15 || 1;
  const min = 0;
  const step = (w - padL - padR) / (data.length - 1);
  const y = (v) => padT + (h - padT - padB) * (1 - (v - min) / (max - min));
  const x = (i) => padL + i * step;
  const pts = data.map((d, i) => `${x(i)},${y(d.v)}`).join(' ');
  const area = `${padL},${h - padB} ${pts} ${x(data.length - 1)},${h - padB}`;
  const stepTick = Math.ceil((data.length - 1) / 6);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height }} preserveAspectRatio="none">
      {[0.25, 0.5, 0.75, 1].map(f => (
        <line key={f} x1={padL} x2={w - padR} y1={y(max * f)} y2={y(max * f)} stroke="#eef0f4" strokeDasharray="4 4" />
      ))}
      <polygon points={area} fill={color} opacity="0.08" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => i % stepTick === 0 && (
        <text key={i} x={x(i)} y={h - 6} fontSize="10" fill="#a6b0c0" textAnchor="middle">{d.t}</text>
      ))}
      <text x={padL} y={10} fontSize="10" fill="#7a8699">{label}</text>
    </svg>
  );
}

export function DonutChart({ data = [], size = 160, colors = ['#2f54eb', '#13c2c2', '#faad14', '#f5222d', '#a0a0a0', '#722ed1'] }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  let acc = 0;
  const r = 54, cx = 90, cy = 90;
  const arcs = data.map((d, i) => {
    const a0 = (acc / total) * 2 * Math.PI - Math.PI / 2;
    acc += d.value;
    const a1 = (acc / total) * 2 * Math.PI - Math.PI / 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    return { d: `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`, color: colors[i % colors.length], name: d.name, value: d.value };
  });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <svg viewBox="0 0 180 180" width={size} height={size}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f0f1f5" strokeWidth="22" />
        {arcs.map((a, i) => <path key={i} d={a.d} fill="none" stroke={a.color} strokeWidth="22" strokeLinecap="butt" />)}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="18" fontWeight="700" fill="#1f2d3d">{total}</text>
        <text x={cx} y={cy + 16} textAnchor="middle" fontSize="10" fill="#7a8699">实例数</text>
      </svg>
      <div>
        {data.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: colors[i % colors.length], display: 'inline-block' }} />
            <span style={{ color: '#4a5568' }}>{d.name}</span>
            <b>{d.value}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BarChart({ data = [], height = 200, color = '#13c2c2' }) {
  const w = 680, h = height, padL = 40, padB = 24, padT = 16, padR = 12;
  if (!data.length) return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a6b0c0' }}>暂无数据</div>;
  const max = Math.max(...data.map(d => d.value)) * 1.2 || 1;
  const bw = (w - padL - padR) / data.length * 0.55;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height }} preserveAspectRatio="none">
      {[0.25, 0.5, 0.75, 1].map(f => (
        <line key={f} x1={padL} x2={w - padR} y1={padT + (h - padT - padB) * (1 - f)} y2={padT + (h - padT - padB) * (1 - f)} stroke="#eef0f4" strokeDasharray="4 4" />
      ))}
      {data.map((d, i) => {
        const cx = padL + (w - padL - padR) / data.length * (i + 0.5);
        const bh = (h - padT - padB) * (d.value / max);
        return (
          <g key={i}>
            <rect x={cx - bw / 2} y={padT + (h - padT - padB) - bh} width={bw} height={bh} rx="4" fill={color} opacity="0.85" />
            <text x={cx} y={h - 6} fontSize="10" fill="#a6b0c0" textAnchor="middle">{d.name}</text>
          </g>
        );
      })}
    </svg>
  );
}
