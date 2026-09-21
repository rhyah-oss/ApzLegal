import React, { useState } from 'react';
import {
  Activity, AlertTriangle, ArrowRight, BarChart3, Bell, BookOpen, BriefcaseBusiness,
  CalendarDays, CheckCircle2, ChevronDown, CircleDollarSign, ClipboardCheck, Clock3,
  FileSearch, FileText, GitBranch, GitMerge, LayoutDashboard, LogOut, Mail, Plus,
  Receipt, Search, Settings, ShieldAlert, ShieldCheck, SlidersHorizontal, Users, X,
} from 'lucide-react';

const brass = '#b28a48';
const ink = '#353937';
const muted = '#68706d';
const rule = '#d9d5ca';
const red = '#9b5148';
const green = '#557866';
const groups = [
  { name: 'WORKSPACE', items: [['Overview', LayoutDashboard], ['Matters', BriefcaseBusiness], ['Clients', Users], ['Documents', FileText], ['My Actions', ClipboardCheck]] },
  { name: 'INTELLIGENCE', items: [['Legal AI', BarChart3], ['Research', FileSearch], ['Knowledge Base', BookOpen], ['Conflict Check', GitMerge]] },
  { name: 'OPERATIONS', items: [['Tasks', ClipboardCheck], ['Calendar', CalendarDays], ['Time Tracking', Clock3], ['Billing', Receipt]] },
  { name: 'COMPLIANCE', items: [['FICA Compliance', ShieldAlert], ['Audit Logs', FileSearch]] },
  { name: 'ADMINISTRATION', items: [['Users', Users], ['Settings', Settings]] },
] as const;

const attention = [
  ['Mthembu Holdings (Pty) Ltd', 'FICA verification incomplete', 'CRITICAL', red],
  ['Nkosi Acquisition', '2 expired FICA documents', 'HIGH', brass],
  ['Dlamini Estate', 'Partner approval pending', 'MEDIUM', '#90784e'],
];
const activity = [
  ['Sale Agreement v3 approved', 'Nkosi Acquisition', '18m ago', FileText],
  ['Conflict check completed', 'Mthembu Holdings (Pty) Ltd', '45m ago', ShieldCheck],
  ['Document signed by all parties', 'Employment Agreement', '1h ago', CheckCircle2],
  ['AI analysis saved', 'Lease Agreement Review', '2h ago', Activity],
  ['Time entry added', 'Nkosi Acquisition', '2h ago', Clock3],
];
const matters = [
  ['Nkosi Acquisition', 'Corporate', 'Partner Review', '12m ago', '#8c754d'],
  ['Mthembu Holdings (Pty) Ltd', 'Compliance', 'Action Required', '24m ago', red],
  ['ABC Properties (Pty) Ltd', 'Property', 'Active', '1h ago', green],
  ['Dlamini Estate', 'Estate', 'Drafting', '2h ago', '#66778a'],
  ['Zwane v Minister of Finance', 'Dispute', 'Research', '3h ago', '#596879'],
];

function InkBrassDashboard() {
  const [selected, setSelected] = useState('Overview');
  const [toast, setToast] = useState('');
  const [alertOpen, setAlertOpen] = useState(true);
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2200); };
  const action = (label: string) => { setSelected(label); notify(`${label} workspace selected`); };
  return (
    <div className="ib-page">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@500;600&display=swap');
        *{box-sizing:border-box} body{margin:0;background:#f6f4ef;color:${ink};font-family:'DM Sans',sans-serif}
        button{font:inherit;color:inherit}.ib-page{min-height:960px;background:#f7f5f0;display:flex;font-size:12px}
        .ib-rail{width:244px;background:${ink};color:#e7e3d7;display:flex;flex-direction:column;flex:none;padding:28px 16px 18px}
         .ib-brand{padding:0 14px 25px;border-bottom:1px solid #4b504b}.ib-brand b{font:600 29px/1 'Playfair Display',serif;letter-spacing:-1.2px}.ib-brand small{display:block;color:${brass};font-size:9px;letter-spacing:3px;margin-top:4px}
         .ib-sub{font-size:9px;letter-spacing:1.4px;color:#9da29b;margin:22px 12px 8px}.ib-nav button{width:100%;height:31px;background:none;border:0;border-radius:3px;color:#abb1ab;text-align:left;display:flex;align-items:center;gap:11px;padding:0 12px;cursor:pointer;transition:.18s ease}.ib-nav button:hover,.ib-nav button.active{background:#454a46;color:#faf8f1}.ib-nav button.active{box-shadow:inset 2px 0 ${brass}}.ib-nav button svg{width:14px}.ib-nav em{font-style:normal;margin-left:auto;color:${brass};font-size:10px}.ib-divider{border-top:1px solid #5a5f5a;margin:12px 0}
         .ib-profile{margin-top:auto;border-top:1px solid #5a5f5a;padding:17px 10px 0;display:flex;align-items:center;gap:9px}.ib-avatar{width:29px;height:29px;border-radius:50%;border:1px solid #8d7243;color:#e3c27e;display:grid;place-items:center;font-size:10px}.ib-profile b{display:block;font-size:11px;font-weight:600}.ib-profile small{color:#929a92;font-size:9px}.ib-profile svg{margin-left:auto;color:#929a92}
        .ib-main{min-width:0;flex:1;padding:0 30px 35px;overflow:hidden}.ib-top{height:68px;border-bottom:1px solid ${rule};display:flex;align-items:center;justify-content:space-between}.ib-crumb{color:${muted};font-size:11px}.ib-crumb strong{color:${ink};font-weight:600}.ib-top-actions{display:flex;align-items:center;gap:14px}.ib-search{border:1px solid ${rule};background:#fbfaf7;width:248px;height:30px;border-radius:3px;display:flex;align-items:center;gap:8px;padding:0 10px;color:#9a9d96;font-size:10px}.ib-search input{border:0;outline:0;background:transparent;width:100%;font-size:10px}.ib-icon{border:0;background:none;position:relative;cursor:pointer;padding:5px}.ib-dot{position:absolute;right:1px;top:1px;background:${brass};width:5px;height:5px;border-radius:50%}.ib-role{font-size:10px;color:${muted};padding-left:4px}
        .ib-heading{display:flex;align-items:flex-end;justify-content:space-between;padding:30px 0 25px}.ib-heading h1{font:500 31px/1.15 'Playfair Display',serif;margin:0 0 8px;letter-spacing:-.5px}.ib-heading p{margin:0;color:${muted};font-size:10px}.ib-heading-actions{display:flex;gap:8px}.ib-control{height:30px;background:#fbfaf7;border:1px solid ${rule};border-radius:3px;padding:0 10px;display:flex;align-items:center;gap:7px;font-size:10px;cursor:pointer}.ib-control:hover{border-color:#9c967f}.ib-control.primary{background:${ink};border-color:${ink};color:#fbf8ef}
        .ib-kpis{display:grid;grid-template-columns:repeat(5,1fr);border-top:1px solid ${rule};border-bottom:1px solid ${rule};margin-bottom:20px}.ib-kpi{border:0;border-right:1px solid ${rule};background:transparent;text-align:left;padding:16px 14px 14px;cursor:pointer}.ib-kpi:first-child{padding-left:3px}.ib-kpi:last-child{border-right:0}.ib-kpi:hover strong{color:${brass}}.ib-kpi-label{font-size:9px;letter-spacing:1px;color:${muted};text-transform:uppercase}.ib-kpi strong{display:block;font:500 28px/1.3 'Playfair Display',serif;margin-top:5px;transition:.18s}.ib-kpi small{color:${muted};font-size:9px}
        .ib-grid{display:grid;grid-template-columns:1.08fr .92fr;gap:12px}.ib-stack{display:flex;flex-direction:column;gap:12px}.ib-card{border:1px solid ${rule};background:#fbfaf7;border-radius:5px;overflow:hidden}.ib-card-head{height:40px;border-bottom:1px solid ${rule};display:flex;align-items:center;justify-content:space-between;padding:0 14px}.ib-card-head b{font-size:10px;letter-spacing:1px;text-transform:uppercase}.ib-card-head button,.ib-view{border:0;background:none;color:${muted};font-size:9px;cursor:pointer}.ib-card-head button:hover,.ib-view:hover{color:${brass}}.ib-attention{padding:3px 14px}.ib-att-row{display:grid;grid-template-columns:3px 1fr auto 12px;align-items:center;gap:11px;min-height:54px;border-bottom:1px solid #e8e5de}.ib-att-row:last-child{border-bottom:0}.ib-att-row>i{height:30px;background:${brass}}.ib-att-row b{display:block;font-size:11px;font-weight:600}.ib-att-row small{color:${muted};font-size:9px}.ib-status{font-size:8px;padding:4px 6px;background:#f1e9e2;color:${red};letter-spacing:.4px}.ib-status.gold{background:#f3eee4;color:#8a6d3e}.ib-status.med{background:#f3efe8;color:#8b7852}
        .ib-table{width:100%;border-collapse:collapse}.ib-table th{text-align:left;color:${muted};font-size:8px;letter-spacing:1px;font-weight:500;padding:10px 14px 8px;text-transform:uppercase}.ib-table td{border-top:1px solid #e8e5de;padding:9px 14px;font-size:10px}.ib-table td:first-child{font-weight:600}.ib-chip{padding:4px 6px;background:#edf1ee;color:${green};font-size:8px}.ib-chip.red{background:#f3e9e6;color:${red}}.ib-chip.gold{background:#f3eee4;color:#8a6d3e}.ib-chip.blue{background:#e9eef0;color:#576b77}
        .ib-activity{padding:3px 14px}.ib-act{display:grid;grid-template-columns:18px 1fr auto;gap:8px;align-items:start;padding:11px 0;border-bottom:1px solid #e8e5de}.ib-act:last-child{border-bottom:0}.ib-act svg{color:#7d827c;width:14px;margin-top:1px}.ib-act b{display:block;font-size:10px}.ib-act small{color:${muted};font-size:9px}.ib-act time{color:${muted};font-size:9px;white-space:nowrap}.ib-tasks .ib-task{display:grid;grid-template-columns:3px 1fr auto;gap:10px;align-items:center;padding:11px 14px;border-bottom:1px solid #e8e5de}.ib-task i{height:31px;background:${red}}.ib-task:nth-child(3) i{background:${brass}}.ib-task:nth-child(4) i{background:${green}}.ib-task b{display:block;font-size:10px}.ib-task small{color:${muted};font-size:9px}.ib-task time{font-size:9px;color:${muted}}
         .ib-overview{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;padding:14px 0}.ib-overview>div{padding:2px 14px;border-right:1px solid ${rule}}.ib-overview>div:first-child{padding-left:14px}.ib-overview>div:last-child{border:0}.ib-overview label{display:block;color:${muted};font-size:9px;text-transform:uppercase;letter-spacing:1px}.ib-overview strong{display:block;font:500 24px 'Playfair Display',serif;margin-top:10px}.ib-overview small{color:${muted};font-size:9px}.ib-bars{height:78px;display:flex;align-items:end;gap:12px;padding:9px 14px 12px;border-top:1px solid ${rule}}.ib-bar{flex:1;background:#d8d5cd;position:relative}.ib-bar:nth-child(1),.ib-bar:nth-child(3),.ib-bar:nth-child(5){background:#b5b0a4}.ib-bar b{position:absolute;bottom:-13px;left:50%;transform:translateX(-50%);font-size:8px;color:${muted};font-weight:400}.ib-alert{border:1px solid #d9c9ad;background:#fbf8f0;padding:11px 14px;margin-bottom:20px;display:flex;align-items:center;gap:9px}.ib-alert b{font-size:10px}.ib-alert span{font-size:9px;color:${muted}}.ib-alert button{margin-left:auto;border:0;background:none;cursor:pointer;color:${muted}.ib-alert button:hover{color:${ink}}.ib-toast{position:fixed;bottom:22px;right:28px;background:${ink};color:#f7f3e9;padding:11px 15px;border-left:2px solid ${brass};font-size:10px;box-shadow:0 8px 24px #35393722}
        @media(max-width:900px){.ib-rail{width:190px}.ib-main{padding:0 18px}.ib-heading{align-items:flex-start;gap:18px;flex-direction:column}.ib-grid{grid-template-columns:1fr}.ib-top .ib-search{width:180px}.ib-role{display:none}}
      `}</style>
      <aside className="ib-rail">
        <div className="ib-brand"><b>APZ</b><small>LEGAL</small><div style={{fontSize:9,letterSpacing:1.5,color:'#8f9690',marginTop:20}}>LEGAL OPERATING SYSTEM</div></div>
        <nav className="ib-nav">
          {groups.map((group, index) => <div key={group.name}><div className="ib-sub">{group.name}</div>{group.items.map(([label, Icon]) => <button key={label} className={selected === label ? 'active' : ''} onClick={() => action(label)}><Icon size={14}/><span>{label}</span>{label === 'My Actions' && <em>4</em>}{label === 'Conflict Check' && <em>5</em>}{label === 'FICA Compliance' && <em>3</em>}</button>)}{index < groups.length - 1 && <div className="ib-divider" />}</div>)}
        </nav>
        <div className="ib-profile"><div className="ib-avatar">AK</div><div><b>Andile Khumalo</b><small>Managing Partner</small></div><ChevronDown size={13}/></div>
      </aside>
      <main className="ib-main">
        <header className="ib-top"><div className="ib-crumb">APZ Legal <ArrowRight size={11} style={{verticalAlign:'middle',margin:'0 7px'}}/> <strong>{selected}</strong></div><div className="ib-top-actions"><label className="ib-search"><Search size={13}/><input placeholder="Search matters, documents, clients..." /></label><button className="ib-icon" onClick={() => notify('Notifications opened')} aria-label="Notifications"><Bell size={15}/><i className="ib-dot"/></button><button className="ib-control primary" onClick={() => notify('New matter form ready')}><Plus size={12}/> New matter</button><span className="ib-role">Managing Partner</span></div></header>
        <section className="ib-heading"><div><h1>Good morning, Andile</h1><p>Monday, 18 November 2024 <span style={{margin:'0 7px'}}>·</span> Firm overview</p></div><div className="ib-heading-actions"><button className="ib-control" onClick={() => notify('Showing today')}><CalendarDays size={12}/>Today<ChevronDown size={11}/></button><button className="ib-control" onClick={() => notify('Department filter opened')}><SlidersHorizontal size={12}/>All departments<ChevronDown size={11}/></button></div></section>
        {alertOpen && <div className="ib-alert"><AlertTriangle size={15} color={red}/><b>6 items requiring your attention</b><span>3 critical · 3 warnings</span><button onClick={() => setAlertOpen(false)} aria-label="Dismiss alert"><X size={14}/></button></div>}
        <section className="ib-kpis">{[['Active matters','47','+4 from last month'],['Conflict checks','5','Awaiting review'],['FICA compliance','87%','Firm threshold 90%'],['Unbilled time','38h','Across active matters'],['Overdue tasks','4','Requires attention']].map(([label,value,sub], index) => <button className="ib-kpi" key={label} onClick={() => notify(`${label} opened`)}><div className="ib-kpi-label">{label}</div><strong style={{color:index === 2 || index === 4 ? (index === 4 ? red : brass) : ink}}>{value}</strong><small>{sub}</small></button>)}</section>
        <section className="ib-grid">
          <div className="ib-stack">
            <section className="ib-card"><div className="ib-card-head"><b>Matters requiring attention</b><button onClick={() => action('Matters')}>View all <ArrowRight size={10} style={{verticalAlign:'middle'}}/></button></div><div className="ib-attention">{attention.map(([name,desc,status,color]) => <button className="ib-att-row" key={name} onClick={() => notify(`${name} opened`)}><i style={{background:color}}/><span><b>{name}</b><small>{desc}</small></span><span className={`ib-status ${status === 'HIGH' ? 'gold' : status === 'MEDIUM' ? 'med' : ''}`} style={status === 'CRITICAL' ? {color: red} : {}}>{status}</span><ArrowRight size={12} color={muted}/></button>)}</div></section>
            <section className="ib-card"><div className="ib-card-head"><b>Active matters</b><button onClick={() => action('Matters')}>View all matters <ArrowRight size={10} style={{verticalAlign:'middle'}}/></button></div><table className="ib-table"><thead><tr><th>Matter</th><th>Type</th><th>Status</th><th>Updated</th></tr></thead><tbody>{matters.map(([name,type,status,time,color]) => <tr key={name}><td>{name}</td><td>{type}</td><td><span className={`ib-chip ${status === 'Action Required' ? 'red' : status === 'Partner Review' ? 'gold' : status === 'Drafting' || status === 'Research' ? 'blue' : ''}`} style={status === 'Active' ? {color} : {}}>{status}</span></td><td style={{color:muted}}>{time}</td></tr>)}</tbody></table></section>
            <section className="ib-card"><div className="ib-card-head"><b>Practice overview</b><button className="ib-view" onClick={() => notify('Practice report opened')}>View report <ArrowRight size={10} style={{verticalAlign:'middle'}}/></button></div><div className="ib-overview"><div><label>Matters</label><strong>47</strong><small>Active matters</small></div><div><label>Documents</label><strong>128</strong><small>Filed this month</small></div><div><label>Clients</label><strong>63</strong><small>Active clients</small></div><div><label>Revenue MTD</label><strong>R 2.84m</strong><small>+12.4% from last month</small></div></div></section>
          </div>
          <div className="ib-stack">
            <section className="ib-card"><div className="ib-card-head"><b>Recent activity</b><button onClick={() => notify('Activity log opened')}>View all <ArrowRight size={10} style={{verticalAlign:'middle'}}/></button></div><div className="ib-activity">{activity.map(([title,subject,time,Icon]) => <button className="ib-act" key={title} onClick={() => notify(title)}><Icon/><span><b>{title}</b><small>{subject}</small></span><time>{time}</time></button>)}</div></section>
            <section className="ib-card"><div className="ib-card-head"><b>Tasks due</b><button onClick={() => action('Tasks')}>View all tasks <ArrowRight size={10} style={{verticalAlign:'middle'}}/></button></div><div className="ib-tasks">{[['Client meeting','Nkosi Acquisition','Today, 10:00'],['Court appearance','Zwane v Minister of Finance','Tomorrow, 09:00'],['Partner review','Mthembu Holdings','20 Nov, 14:00']].map(([title,subject,time]) => <button className="ib-task" key={title} onClick={() => notify(`${title} opened`)}><i/><span><b>{title}</b><small>{subject}</small></span><time>{time}</time></button>)}</div></section>
            <section className="ib-card"><div className="ib-card-head"><b>Unbilled time</b><button onClick={() => action('Time Tracking')}>View time entries <ArrowRight size={10} style={{verticalAlign:'middle'}}/></button></div><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'14px 14px 0'}}><div><strong style={{font:'500 27px "Playfair Display",serif'}}>38h</strong><div style={{fontWeight:600,fontSize:10,marginTop:7}}>R 152,000</div><small style={{color:muted,fontSize:9}}>Potential fees</small></div><div className="ib-bars">{[42,57,31,76,51,62,27,39].map((height,index) => <i className="ib-bar" key={index} style={{height:`${height}%`}}><b>{['M','T','W','T','F','S','S',''][index]}</b></i>)}</div></div></section>
          </div>
        </section>
      </main>
      {toast && <div className="ib-toast">{toast}</div>}
    </div>
  );
}

export { InkBrassDashboard };
export default InkBrassDashboard;