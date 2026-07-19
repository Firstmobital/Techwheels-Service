// WarrantySubReports.tsx
// 7 independent warranty tabs rendered full-page (same pattern as WarrantyOverviewReport).
// Each tab: own filters, 10 KPI cards, 5 chart sections, sortable paginated table, Excel/CSV export.
// Shared DB fetch (one load for all tabs), each tab filters its own rows independently.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { supabase } from '../../../lib/supabase'
import type { ReportViewProps } from '../types'

// ─── Types ────────────────────────────────────────────────────────────────────
type Portal = 'ALL' | 'PV' | 'EV'
type SortDir = 'asc' | 'desc'
type SortCol = 'job_card_number'|'prowac_no'|'part_number'|'description'|'ndp'|'labour_chgs'|'spl_labour_chgs'|'total'|'invc_date'|'portal'|'dealer_code'
type Section = 'summary'|'revenue'|'parts'|'labour'|'charts'|'table'

interface Row {
  id: number; portal: string; dealer_code: string; job_card_number: string
  prowac_no: string; sap_claim: string; job_code: string
  part_number: string|null; description: string|null
  ndp: number; list_price: number; misc_chgs: number
  labour_chgs: number; spl_labour_chgs: number
  dealer_invc_no: string|null; invc_date: string|null
  posting_document_number: string|null; posting_date: string|null
  code_label?: string|null
}

interface TabDef {
  id: string; label: string; icon: string; accent: string; desc: string
  filter: (r: Row) => boolean
}

// ─── Tab definitions (7 independent reports) ──────────────────────────────────
const TABS: TabDef[] = [
  { id:'warranty-claims',   label:'Warranty',       icon:'🛡️', accent:'#58a6ff',
    desc:'Standard warranty claims — Prowac prefix CW, CR, CS',
    filter: r => ['CW','CR','CS'].includes((r.prowac_no||'').slice(0,2).toUpperCase()) },
  { id:'warranty-ext',      label:'Ext. Warranty',  icon:'🔒', accent:'#d2a8ff',
    desc:'Extended warranty claims — Prowac prefix EW, ER, EE',
    filter: r => ['EW','ER','EE'].includes((r.prowac_no||'').slice(0,2).toUpperCase()) },
  { id:'warranty-goodwill', label:'Goodwill',        icon:'🤝', accent:'#3fb950',
    desc:'Goodwill warranty claims — Prowac prefix MW, MR, ME',
    filter: r => ['MW','MR','ME'].includes((r.prowac_no||'').slice(0,2).toUpperCase()) },
  { id:'warranty-rusting',  label:'Rusting',         icon:'🔧', accent:'#ffa657',
    desc:'Rusting & body SPL claims — job code 980016',
    filter: r => (r.job_code||'').slice(0,6) === '980016' },
  { id:'warranty-pdi',      label:'PDI',             icon:'🔍', accent:'#e3b341',
    desc:'Pre-delivery inspection claims — job code 980004',
    filter: r => (r.job_code||'').slice(0,6) === '980004' },
  { id:'warranty-amc',      label:'AMC',             icon:'📋', accent:'#79c0ff',
    desc:'Annual Maintenance Contract — Prowac prefix 00',
    filter: r => (r.prowac_no||'').slice(0,2).toUpperCase() === '00' },
  { id:'warranty-updation', label:'Updation',        icon:'⚙️', accent:'#388bfd',
    desc:'Updation / software warranty — Prowac SW, SR, SE',
    filter: r => ['SW','SR','SE'].includes((r.prowac_no||'').slice(0,2).toUpperCase()) },
]

// ─── Utils ────────────────────────────────────────────────────────────────────
const settled = (r: Row) => {
  const p = r.posting_document_number || ''
  return p !== '' && p !== '0' && p.trim() !== '' && p !== '0000-00-00'
}
const rowTotal = (r: Row) => (r.ndp||0)+(r.labour_chgs||0)+(r.spl_labour_chgs||0)+(r.misc_chgs||0)
const fmtRs = (v: number) => {
  if (!v || !isFinite(v)) return '₹0'
  const a = Math.abs(v)
  const s = a >= 1e7 ? `₹${(a/1e7).toFixed(2)} Cr` : a >= 1e5 ? `₹${(a/1e5).toFixed(2)} L` : `₹${Math.round(a).toLocaleString('en-IN')}`
  return v < 0 ? `-${s}` : s
}
const fmtN = (v: number) => Math.round(v).toLocaleString('en-IN')
const pct  = (n: number, d: number) => d ? `${Math.round((n/d)*100)}%` : '—'
const MNL: Record<string,string> = {'01':'Jan','02':'Feb','03':'Mar','04':'Apr','05':'May','06':'Jun','07':'Jul','08':'Aug','09':'Sep','10':'Oct','11':'Nov','12':'Dec'}
const ml = (ym: string) => { const [y,m] = ym.split('-'); return `${MNL[m]||m} ${(y||'').slice(2)}` }

// ─── DB ───────────────────────────────────────────────────────────────────────
const SEL = 'id,portal,dealer_code,job_card_number,prowac_no,sap_claim,job_code,part_number,description,ndp,list_price,misc_chgs,labour_chgs,spl_labour_chgs,dealer_invc_no,invc_date,posting_document_number,posting_date'
const SSPL = SEL + ',code_label'

async function loadAll(table: string, sel: string, portal: Portal): Promise<Row[]> {
  const acc: Row[] = []; let from = 0
  for (;;) {
    let q = (supabase.from(table) as any).select(sel).range(from, from+999)
    if (portal !== 'ALL') q = q.eq('portal', portal)
    const { data, error } = await q
    if (error) throw error
    if (!data?.length) break
    acc.push(...data as Row[])
    if (data.length < 1000) break
    from += 1000
  }
  return acc
}

// ─── Colors ───────────────────────────────────────────────────────────────────
const BG0='#0d1117',BG1='#161b22',BG2='#1c2128',BG3='#21262d'
const BORD='#30363d',TXT='#e6edf3',DIM='#8b949e'
const GRN='#3fb950',RED='#f85149',YLW='#e3b341',BLU='#58a6ff'

// ─── Mini components ──────────────────────────────────────────────────────────
function Kpi({l,v,s,c,click}:{l:string;v:string;s?:string;c:string;click?:()=>void}) {
  return (
    <div onClick={click} style={{background:BG2,border:`1px solid ${c}33`,borderRadius:10,padding:'12px 14px',cursor:click?'pointer':'default'}}>
      <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:1,color:DIM}}>{l}</div>
      <div style={{fontSize:19,fontWeight:700,color:c,marginTop:4}}>{v}</div>
      {s&&<div style={{fontSize:10,color:DIM,marginTop:2}}>{s}</div>}
    </div>
  )
}

function Donut({segs}:{segs:{l:string;v:number;c:string}[]}) {
  const tot = segs.reduce((a,s)=>a+(s.v||0),0)
  if (!tot) return <div style={{color:DIM,fontSize:12,padding:8}}>No data</div>
  const sz=110,r=sz*0.36,cx=sz/2,cy=sz/2; let cum=0
  const arcs = segs.filter(s=>s.v>0).map(seg=>{
    const f=seg.v/tot,sa=(cum*360-90)*(Math.PI/180),ea=((cum+f)*360-90)*(Math.PI/180)
    cum+=f; const x1=cx+r*Math.cos(sa),y1=cy+r*Math.sin(sa),x2=cx+r*Math.cos(ea),y2=cy+r*Math.sin(ea)
    return {d:`M${cx},${cy}L${x1},${y1}A${r},${r},0,${f>0.5?1:0},1,${x2},${y2}Z`,c:seg.c,l:seg.l,v:seg.v}
  })
  return (
    <div style={{display:'flex',gap:14,alignItems:'center',flexWrap:'wrap' as const}}>
      <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`}>
        {arcs.map((a,i)=><path key={i} d={a.d} fill={a.c} opacity={0.88}/>)}
        <circle cx={cx} cy={cy} r={sz*0.2} fill={BG1}/>
        <text x={cx} y={cy+4} textAnchor="middle" fill={TXT} fontSize={10} fontWeight={700}>{fmtN(tot)}</text>
      </svg>
      <div style={{display:'flex',flexDirection:'column' as const,gap:5}}>
        {arcs.map((a,i)=>(
          <div key={i} style={{display:'flex',alignItems:'center',gap:6,fontSize:11}}>
            <div style={{width:9,height:9,borderRadius:2,background:a.c,flexShrink:0}}/>
            <span style={{color:DIM}}>{a.l}</span>
            <span style={{color:TXT,fontWeight:700,marginLeft:4}}>{fmtN(a.v)}</span>
            <span style={{color:DIM,fontSize:10}}>({pct(a.v,tot)})</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function HBar({l,v,max,c}:{l:string;v:number;max:number;c:string}) {
  return (
    <div style={{marginBottom:8}}>
      <div style={{display:'flex',justifyContent:'space-between',fontSize:11,marginBottom:3}}>
        <span style={{color:DIM}}>{l}</span><span style={{fontWeight:700,color:c}}>{fmtRs(v)}</span>
      </div>
      <div style={{height:5,background:BG3,borderRadius:3}}>
        <div style={{height:'100%',width:`${Math.round((v/Math.max(max,1))*100)}%`,background:c,borderRadius:3}}/>
      </div>
    </div>
  )
}

function BarChart({data,color,h=110}:{data:{lbl:string;val:number}[];color:string;h?:number}) {
  const mx = Math.max(...data.map(d=>d.val),1)
  return (
    <div style={{display:'flex',gap:5,alignItems:'flex-end',height:h,overflowX:'auto'}}>
      {data.map((d,i)=>{
        const bh = Math.round((d.val/mx)*(h-22))
        return (
          <div key={i} style={{display:'flex',flexDirection:'column',alignItems:'center',minWidth:38,flexShrink:0}}>
            <div style={{fontSize:8,color:DIM,marginBottom:2,textAlign:'center'}}>{fmtRs(d.val)}</div>
            <div style={{width:28,height:h-22,display:'flex',flexDirection:'column',justifyContent:'flex-end'}}>
              <div style={{height:Math.max(bh,2),background:color,borderRadius:'2px 2px 0 0',opacity:0.9}}/>
            </div>
            <div style={{fontSize:9,color:DIM,marginTop:2,textAlign:'center'}}>{d.lbl}</div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Per-tab panel ────────────────────────────────────────────────────────────
const PAGE_SIZES = [10,25,50,100,500,-1]

function TabPanel({tab,labRows,splRows}:{tab:TabDef;labRows:Row[];splRows:Row[]}) {
  const acc = tab.accent

  // Independent filter state per tab
  const [yearF,  setYearF]  = useState('ALL')
  const [monthF, setMonthF] = useState('ALL')
  const [fromF,  setFromF]  = useState('')
  const [toF,    setToF]    = useState('')
  const [statF,  setStatF]  = useState('ALL')
  const [dealF,  setDealF]  = useState('ALL')
  const [srch,   setSrch]   = useState('')
  const [drillM, setDrillM] = useState<string|null>(null)
  const [sec,    setSec]    = useState<Section>('summary')
  const [pgSz,   setPgSz]   = useState(50)
  const [pg,     setPg]     = useState(1)
  const [sCol,   setSCol]   = useState<SortCol>('invc_date')
  const [sDir,   setSDir]   = useState<SortDir>('desc')

  // Type-filtered rows (this tab's claim category only)
  const typeRows = useMemo(()=>[...labRows,...splRows].filter(r=>tab.filter(r)),[labRows,splRows,tab])

  // Filter options from actual data
  const years   = useMemo(()=>Array.from(new Set(typeRows.map(r=>(r.invc_date||'').slice(0,4)).filter(y=>/^20\d{2}$/.test(y)))).sort().reverse(),[typeRows])
  const months  = useMemo(()=>Array.from(new Set(typeRows.map(r=>(r.invc_date||'').slice(0,7)).filter(m=>m.length===7))).sort().reverse(),[typeRows])
  const dealers = useMemo(()=>Array.from(new Set(typeRows.map(r=>r.dealer_code).filter(Boolean))).sort(),[typeRows])

  // Apply filters
  const filtered = useMemo(()=>typeRows.filter(r=>{
    const d = r.invc_date||''
    if (yearF !== 'ALL' && !d.startsWith(yearF)) return false
    if (monthF !== 'ALL' && d.slice(0,7) !== monthF) return false
    if (fromF && d < fromF) return false
    if (toF   && d > toF)   return false
    if (statF === 'settled' && !settled(r)) return false
    if (statF === 'pending' &&  settled(r)) return false
    if (dealF !== 'ALL' && r.dealer_code !== dealF) return false
    if (drillM && d.slice(0,7) !== drillM) return false
    const q = srch.trim().toLowerCase()
    if (q) {
      const hay = [r.job_card_number,r.prowac_no,r.sap_claim,r.part_number,r.description,r.dealer_code].join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  }),[typeRows,yearF,monthF,fromF,toF,statF,dealF,srch,drillM])

  // KPIs
  const kpi = useMemo(()=>{
    const stl = filtered.filter(settled), pnd = filtered.filter(r=>!settled(r))
    const ndp  = filtered.reduce((a,r)=>a+(r.ndp||0),0)
    const lab  = filtered.reduce((a,r)=>a+(r.labour_chgs||0),0)
    const spl  = filtered.reduce((a,r)=>a+(r.spl_labour_chgs||0),0)
    const misc = filtered.reduce((a,r)=>a+(r.misc_chgs||0),0)
    const tot  = ndp+lab+spl+misc
    const claims = new Set(filtered.map(r=>r.prowac_no).filter(Boolean)).size
    return {
      ndp,lab,spl,misc,tot,claims,rows:filtered.length,
      stlVal:stl.reduce((a,r)=>a+rowTotal(r),0), pndVal:pnd.reduce((a,r)=>a+rowTotal(r),0),
      stlCnt:stl.length, pndCnt:pnd.length,
      avgRev:claims?tot/claims:0, appPct:pct(stl.length,filtered.length), rejPct:pct(pnd.length,filtered.length),
      maxClaim:filtered.reduce((mx,r)=>Math.max(mx,rowTotal(r)),0),
    }
  },[filtered])

  // Monthly data (from all typeRows for chart continuity)
  const monthly = useMemo(()=>{
    const m: Record<string,{ndp:number;lab:number;spl:number;s:number;p:number}> = {}
    for (const r of typeRows) {
      const ym = (r.invc_date||'').slice(0,7)
      if (ym.length!==7) continue
      if (!m[ym]) m[ym]={ndp:0,lab:0,spl:0,s:0,p:0}
      m[ym].ndp+=r.ndp||0; m[ym].lab+=r.labour_chgs||0; m[ym].spl+=r.spl_labour_chgs||0
      if (settled(r)) m[ym].s++; else m[ym].p++
    }
    return Object.entries(m).sort(([a],[b])=>a.localeCompare(b)).map(([ym,v])=>({ym,lbl:ml(ym),...v,tot:v.ndp+v.lab+v.spl}))
  },[typeRows])

  // Top parts
  const topParts = useMemo(()=>{
    const m: Record<string,{desc:string;cnt:number;ndp:number}> = {}
    for (const r of filtered) {
      if (!r.part_number||r.part_number==='0') continue
      if (!m[r.part_number]) m[r.part_number]={desc:r.description||'',cnt:0,ndp:0}
      m[r.part_number].cnt++; m[r.part_number].ndp+=r.ndp||0
      if ((r.description?.length||0)>m[r.part_number].desc.length) m[r.part_number].desc=r.description||''
    }
    return Object.entries(m).sort(([,a],[,b])=>b.ndp-a.ndp).slice(0,10).map(([pn,v])=>({pn,...v}))
  },[filtered])
  const maxPNdp = Math.max(...topParts.map(p=>p.ndp),1)

  const pvCnt = filtered.filter(r=>r.portal==='PV').length
  const evCnt = filtered.filter(r=>r.portal==='EV').length
  const pvVal = filtered.filter(r=>r.portal==='PV').reduce((a,r)=>a+rowTotal(r),0)
  const evVal = filtered.filter(r=>r.portal==='EV').reduce((a,r)=>a+rowTotal(r),0)

  // Sorted + paginated table
  const sorted = useMemo(()=>[...filtered].sort((a,b)=>{
    const av: number|string = sCol==='total'?rowTotal(a):(a[sCol]||'') as number|string
    const bv: number|string = sCol==='total'?rowTotal(b):(b[sCol]||'') as number|string
    const n1=typeof av==='number'?av:Number(av)||0, n2=typeof bv==='number'?bv:Number(bv)||0
    if (!isNaN(n1)&&!isNaN(n2)&&n1!==n2) return sDir==='asc'?n1-n2:n2-n1
    return sDir==='asc'?String(av).localeCompare(String(bv)):String(bv).localeCompare(String(av))
  }),[filtered,sCol,sDir])

  const effSz = pgSz===-1?sorted.length:pgSz
  const totPg = Math.max(1,Math.ceil(sorted.length/effSz))
  const paged  = sorted.slice((pg-1)*effSz, pg*effSz)

  function doSort(k:SortCol){if(sCol===k)setSDir(d=>d==='asc'?'desc':'asc');else{setSCol(k);setSDir('desc')};setPg(1)}
  const hasF = yearF!=='ALL'||monthF!=='ALL'||fromF||toF||statF!=='ALL'||dealF!=='ALL'||srch||drillM
  function clearF(){setYearF('ALL');setMonthF('ALL');setFromF('');setToF('');setStatF('ALL');setDealF('ALL');setSrch('');setDrillM(null);setPg(1)}

  // Export
  function doExcel(){
    const wb=XLSX.utils.book_new()
    const hd=['#','Portal','Job Card','Prowac','Dealer','Part No','Description','NDP(₹)','Labour(₹)','SPL(₹)','Misc(₹)','Total(₹)','Invoice Date','Status']
    const dt=sorted.map((r,i)=>[i+1,r.portal,r.job_card_number,r.prowac_no,r.dealer_code,r.part_number||'',r.description||'',Math.round(r.ndp||0),Math.round(r.labour_chgs||0),Math.round(r.spl_labour_chgs||0),Math.round(r.misc_chgs||0),Math.round(rowTotal(r)),r.invc_date?.slice(0,10)||'',settled(r)?'Settled':'Pending'])
    const ws=XLSX.utils.aoa_to_sheet([hd,...dt]);ws['!cols']=hd.map((_,i)=>({wch:i<7?24:12}))
    XLSX.utils.book_append_sheet(wb,ws,tab.label.slice(0,31))
    const wm=XLSX.utils.aoa_to_sheet([['Month','NDP','Labour','SPL','Total','Settled','Pending'],...monthly.map(m=>[m.lbl,Math.round(m.ndp),Math.round(m.lab),Math.round(m.spl),Math.round(m.tot),m.s,m.p])])
    XLSX.utils.book_append_sheet(wb,wm,'Monthly')
    XLSX.writeFile(wb,`${tab.label.replace(/[^a-z0-9]/gi,'_')}_${new Date().toISOString().slice(0,10)}.xlsx`)
  }
  function doCSV(){
    const hd='Portal,Job Card,Prowac,Part No,Description,NDP,Labour,SPL,Total,Date,Status'
    const dt=sorted.map(r=>[r.portal,r.job_card_number,r.prowac_no,r.part_number||'',`"${(r.description||'').replace(/"/g,'""')}"`,Math.round(r.ndp||0),Math.round(r.labour_chgs||0),Math.round(r.spl_labour_chgs||0),Math.round(rowTotal(r)),r.invc_date?.slice(0,10)||'',settled(r)?'Settled':'Pending'].join(','))
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([[hd,...dt].join('\n')],{type:'text/csv'}));a.download=`${tab.label}_export.csv`;a.click()
  }

  if (typeRows.length===0) return (
    <div style={{textAlign:'center',padding:60,color:DIM}}>
      <div style={{fontSize:36,marginBottom:8}}>{tab.icon}</div>
      No {tab.label} data in the current portal selection.
    </div>
  )

  const INP:React.CSSProperties={height:30,borderRadius:6,border:`1px solid ${BORD}`,background:BG0,color:TXT,padding:'0 8px',fontSize:12,outline:'none'}
  const SEL:React.CSSProperties={...INP,padding:'0 6px'}
  const BTN:React.CSSProperties={padding:'5px 12px',borderRadius:6,border:`1px solid ${BORD}`,background:BG3,color:TXT,cursor:'pointer',fontSize:12,fontWeight:500}
  const CARD:React.CSSProperties={background:BG1,border:`1px solid ${BORD}`,borderRadius:10,padding:'14px 18px'}
  const TH:React.CSSProperties={padding:'7px 10px',fontSize:11,fontWeight:700,textTransform:'uppercase',color:DIM,borderBottom:`1px solid ${BORD}`,whiteSpace:'nowrap',background:BG1,cursor:'pointer',userSelect:'none',position:'sticky',top:0}
  const TD:React.CSSProperties={padding:'7px 10px',borderBottom:`1px solid ${BG3}`,fontSize:12,verticalAlign:'middle' as const}
  const TDR:React.CSSProperties={...TD,textAlign:'right',fontVariantNumeric:'tabular-nums'}
  const SECS:{id:Section;lbl:string}[]=[{id:'summary',lbl:'📊 Summary'},{id:'revenue',lbl:'💰 Revenue'},{id:'parts',lbl:'🔩 Parts'},{id:'labour',lbl:'🔧 Labour'},{id:'charts',lbl:'📈 Charts'},{id:'table',lbl:'📋 Detail Table'}]

  return (
    <div style={{padding:'12px 16px'}}>

      {/* Filter bar */}
      <div style={{...CARD,marginBottom:14,display:'flex',flexWrap:'wrap',gap:8,alignItems:'flex-end'}}>
        <div><div style={{fontSize:10,color:DIM,marginBottom:3,fontWeight:700}}>YEAR</div>
          <select value={yearF} onChange={e=>{setYearF(e.target.value);setPg(1)}} style={{...SEL,width:80}}>
            <option value="ALL">All</option>{years.map(y=><option key={y}>{y}</option>)}</select></div>
        <div><div style={{fontSize:10,color:DIM,marginBottom:3,fontWeight:700}}>MONTH</div>
          <select value={monthF} onChange={e=>{setMonthF(e.target.value);setPg(1)}} style={{...SEL,width:110}}>
            <option value="ALL">All Months</option>{months.map(m=><option key={m} value={m}>{ml(m)}</option>)}</select></div>
        <div><div style={{fontSize:10,color:DIM,marginBottom:3,fontWeight:700}}>FROM</div>
          <input type="date" value={fromF} onChange={e=>{setFromF(e.target.value);setPg(1)}} style={{...INP,width:120}}/></div>
        <div><div style={{fontSize:10,color:DIM,marginBottom:3,fontWeight:700}}>TO</div>
          <input type="date" value={toF} onChange={e=>{setToF(e.target.value);setPg(1)}} style={{...INP,width:120}}/></div>
        <div><div style={{fontSize:10,color:DIM,marginBottom:3,fontWeight:700}}>STATUS</div>
          <select value={statF} onChange={e=>{setStatF(e.target.value);setPg(1)}} style={{...SEL,width:110}}>
            <option value="ALL">All Status</option>
            <option value="settled">✅ Settled</option>
            <option value="pending">🔴 Pending</option></select></div>
        <div><div style={{fontSize:10,color:DIM,marginBottom:3,fontWeight:700}}>DEALER</div>
          <select value={dealF} onChange={e=>{setDealF(e.target.value);setPg(1)}} style={{...SEL,width:120}}>
            <option value="ALL">All Dealers</option>{dealers.map(d=><option key={d}>{d}</option>)}</select></div>
        <div style={{flex:1,minWidth:200}}><div style={{fontSize:10,color:DIM,marginBottom:3,fontWeight:700}}>SEARCH</div>
          <input value={srch} onChange={e=>{setSrch(e.target.value);setPg(1)}} placeholder="Job Card / Prowac / Part No…" style={{...INP,width:'100%'}}/></div>
        <div style={{display:'flex',gap:6,alignItems:'flex-end'}}>
          {hasF&&<button onClick={clearF} style={{...BTN,color:RED,borderColor:RED+'44'}}>✕ Clear</button>}
          <span style={{fontSize:11,color:DIM,whiteSpace:'nowrap'}}>{fmtN(filtered.length)} rows</span>
        </div>
        {drillM&&<div style={{width:'100%',display:'flex',alignItems:'center',gap:8,background:acc+'15',border:`1px solid ${acc}44`,borderRadius:6,padding:'5px 10px',fontSize:12}}>
          <span style={{color:acc,fontWeight:700}}>Drill: {ml(drillM)}</span>
          <button onClick={()=>{setDrillM(null);setPg(1)}} style={{background:'none',border:'none',color:acc,cursor:'pointer'}}>✕</button>
        </div>}
      </div>

      {/* KPI cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(145px,1fr))',gap:10,marginBottom:14}}>
        <Kpi l="Total Cases"    v={fmtN(kpi.claims)}        s={`${fmtN(kpi.rows)} rows`}         c={acc}        click={()=>setSec('table')}/>
        <Kpi l="Total Revenue"  v={fmtRs(kpi.tot)}          s="Parts+Labour+SPL"                 c={acc}/>
        <Kpi l="Parts (NDP)"    v={fmtRs(kpi.ndp)}          s="Net Dealer Price"                 c={BLU}        click={()=>setSec('parts')}/>
        <Kpi l="Labour"         v={fmtRs(kpi.lab+kpi.spl)}  s="Regular + SPL"                   c="#79c0ff"    click={()=>setSec('labour')}/>
        <Kpi l="Avg / Case"     v={fmtRs(kpi.avgRev)}       s="Per claim"                        c={YLW}/>
        <Kpi l="✅ Settled"     v={fmtRs(kpi.stlVal)}       s={`${fmtN(kpi.stlCnt)} rows`}       c={GRN}        click={()=>{setStatF('settled');setSec('table')}}/>
        <Kpi l="🔴 Pending"     v={fmtRs(kpi.pndVal)}       s={`${fmtN(kpi.pndCnt)} rows`}       c={RED}        click={()=>{setStatF('pending');setSec('table')}}/>
        <Kpi l="Approval %"     v={kpi.appPct}              s="Settled / Total"                  c={GRN}/>
        <Kpi l="Rejection %"    v={kpi.rejPct}              s="Pending / Total"                  c={RED}/>
        <Kpi l="Highest Claim"  v={fmtRs(kpi.maxClaim)}     s="Single row"                       c="#d2a8ff"/>
      </div>

      {/* Section tabs + export */}
      <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:14,alignItems:'center'}}>
        {SECS.map(s=>(
          <button key={s.id} onClick={()=>setSec(s.id)} style={{padding:'6px 14px',borderRadius:6,border:'none',background:sec===s.id?acc:BG3,color:sec===s.id?'#fff':DIM,cursor:'pointer',fontSize:12,fontWeight:700,whiteSpace:'nowrap' as const}}>{s.lbl}</button>
        ))}
        <div style={{marginLeft:'auto',display:'flex',gap:6}}>
          <button onClick={doExcel} style={{...BTN,color:GRN,borderColor:GRN+'44'}}>⬇ Excel</button>
          <button onClick={doCSV}   style={{...BTN,color:BLU,borderColor:BLU+'44'}}>⬇ CSV</button>
          <button onClick={()=>window.print()} style={{...BTN,color:YLW,borderColor:YLW+'44'}}>🖨 Print</button>
        </div>
      </div>

      {/* ── SUMMARY ── */}
      {sec==='summary'&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:14}}>
          <div style={CARD}><div style={{fontWeight:700,color:acc,marginBottom:12}}>Settlement Status</div>
            <Donut segs={[{l:'✅ Settled',v:kpi.stlCnt,c:GRN},{l:'🔴 Pending',v:kpi.pndCnt,c:RED}]}/>
          </div>
          <div style={CARD}><div style={{fontWeight:700,color:acc,marginBottom:12}}>Value Breakdown</div>
            <HBar l="Parts (NDP)"    v={kpi.ndp}  max={kpi.tot} c={BLU}/>
            <HBar l="SPL Labour"     v={kpi.spl}  max={kpi.tot} c="#d2a8ff"/>
            <HBar l="Regular Labour" v={kpi.lab}  max={kpi.tot} c="#79c0ff"/>
            <HBar l="Misc Charges"   v={kpi.misc} max={kpi.tot} c={YLW}/>
            <div style={{marginTop:8,fontSize:12}}>Total: <span style={{fontWeight:700}}>{fmtRs(kpi.tot)}</span></div>
          </div>
          <div style={CARD}><div style={{fontWeight:700,color:acc,marginBottom:12}}>Portal Split</div>
            <Donut segs={[{l:'🚗 PV',v:pvCnt,c:BLU},{l:'⚡ EV',v:evCnt,c:'#d2a8ff'}]}/>
            <div style={{marginTop:10,fontSize:12}}>
              <div>🚗 PV: <span style={{fontWeight:700}}>{fmtRs(pvVal)}</span></div>
              <div>⚡ EV: <span style={{fontWeight:700}}>{fmtRs(evVal)}</span></div>
            </div>
          </div>
          <div style={{...CARD,gridColumn:'span 2'}}><div style={{fontWeight:700,color:acc,marginBottom:12}}>Month-wise Summary <span style={{color:DIM,fontWeight:400,fontSize:11}}>(click row → drill into that month)</span></div>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead><tr>{['Month','Parts (NDP)','Labour','SPL','Total','✅ Settled','🔴 Pending','Settle %'].map(h=>(
                  <th key={h} style={{...TH,textAlign:h==='Month'?'left':'right'}}>{h}</th>))}</tr></thead>
                <tbody>
                  {monthly.map(m=>(
                    <tr key={m.ym} onClick={()=>{setDrillM(m.ym);setSec('table');setPg(1)}} style={{cursor:'pointer',background:drillM===m.ym?acc+'15':'transparent'}}>
                      <td style={{...TD,fontWeight:600}}>{m.lbl}</td>
                      <td style={{...TDR,color:BLU}}>{fmtRs(m.ndp)}</td>
                      <td style={{...TDR,color:'#79c0ff'}}>{fmtRs(m.lab)}</td>
                      <td style={{...TDR,color:'#d2a8ff'}}>{m.spl>0?fmtRs(m.spl):'—'}</td>
                      <td style={{...TDR,fontWeight:700}}>{fmtRs(m.tot)}</td>
                      <td style={{...TDR,color:GRN}}>{fmtN(m.s)}</td>
                      <td style={{...TDR,color:m.p>0?RED:DIM}}>{fmtN(m.p)}</td>
                      <td style={{...TDR,color:m.p===0?GRN:YLW}}>{pct(m.s,m.s+m.p)}</td>
                    </tr>
                  ))}
                  <tr style={{background:BG3,fontWeight:700}}>
                    <td style={TD}>TOTAL</td>
                    <td style={{...TDR,color:BLU}}>{fmtRs(kpi.ndp)}</td>
                    <td style={{...TDR,color:'#79c0ff'}}>{fmtRs(kpi.lab)}</td>
                    <td style={{...TDR,color:'#d2a8ff'}}>{kpi.spl>0?fmtRs(kpi.spl):'—'}</td>
                    <td style={TDR}>{fmtRs(kpi.tot)}</td>
                    <td style={{...TDR,color:GRN}}>{fmtN(kpi.stlCnt)}</td>
                    <td style={{...TDR,color:RED}}>{fmtN(kpi.pndCnt)}</td>
                    <td style={{...TDR,color:GRN}}>{kpi.appPct}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── REVENUE ── */}
      {sec==='revenue'&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:14}}>
          <div style={CARD}><div style={{fontWeight:700,color:acc,marginBottom:10}}>Monthly Revenue Trend <span style={{color:DIM,fontWeight:400,fontSize:11}}>(click bar → drill)</span></div>
            <div style={{display:'flex',gap:5,alignItems:'flex-end',height:130,overflowX:'auto'}}>
              {monthly.map(m=>{
                const mxV=Math.max(...monthly.map(x=>x.tot),1), bh=Math.round((m.tot/mxV)*100), isD=drillM===m.ym
                return(<div key={m.ym} onClick={()=>{setDrillM(isD?null:m.ym);setSec('table');setPg(1)}} style={{display:'flex',flexDirection:'column',alignItems:'center',minWidth:42,cursor:'pointer'}}>
                  <div style={{fontSize:9,color:acc,marginBottom:2}}>{fmtRs(m.tot)}</div>
                  <div style={{width:30,height:100,display:'flex',flexDirection:'column',justifyContent:'flex-end'}}>
                    <div style={{height:Math.max(bh,2),background:isD?TXT:acc,borderRadius:'2px 2px 0 0',boxShadow:isD?`0 0 6px ${acc}`:'none'}}/>
                  </div>
                  <div style={{fontSize:9,color:DIM,marginTop:2,textAlign:'center'}}>{m.lbl}</div>
                </div>)
              })}
            </div>
          </div>
          <div style={CARD}><div style={{fontWeight:700,color:acc,marginBottom:12}}>Revenue Stats</div>
            {[{l:'Total Revenue',v:kpi.tot,c:acc},{l:'Labour Revenue',v:kpi.lab+kpi.spl,c:'#79c0ff'},{l:'Parts Revenue',v:kpi.ndp,c:BLU},{l:'Avg Rev / Case',v:kpi.avgRev,c:YLW},{l:'Highest Claim',v:kpi.maxClaim,c:'#d2a8ff'},{l:'Settled Value',v:kpi.stlVal,c:GRN},{l:'Pending Value',v:kpi.pndVal,c:RED}].map(s=>(
              <div key={s.l} style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'5px 0',borderBottom:`1px solid ${BG3}`}}>
                <span style={{color:DIM}}>{s.l}</span><span style={{fontWeight:700,color:s.c}}>{fmtRs(s.v)}</span>
              </div>
            ))}
          </div>
          <div style={CARD}><div style={{fontWeight:700,color:acc,marginBottom:12}}>Revenue Breakdown</div>
            <Donut segs={[{l:'Parts (NDP)',v:Math.round(kpi.ndp),c:BLU},{l:'Labour',v:Math.round(kpi.lab),c:'#79c0ff'},{l:'SPL',v:Math.round(kpi.spl),c:'#d2a8ff'},{l:'Misc',v:Math.round(kpi.misc),c:YLW}].filter(s=>s.v>0)}/>
          </div>
          <div style={CARD}><div style={{fontWeight:700,color:acc,marginBottom:10}}>Settlement Trend</div>
            <div style={{display:'flex',gap:5,alignItems:'flex-end',height:110,overflowX:'auto'}}>
              {monthly.map(m=>{
                const mx=Math.max(...monthly.map(x=>x.s+x.p),1),hs=Math.round((m.s/mx)*85),hp=Math.round((m.p/mx)*85)
                return(<div key={m.ym} style={{display:'flex',flexDirection:'column',alignItems:'center',minWidth:38}}>
                  <div style={{width:26,height:90,display:'flex',flexDirection:'column',justifyContent:'flex-end'}}>
                    <div style={{height:Math.max(hp,m.p?2:0),background:RED,opacity:0.8}}/>
                    <div style={{height:Math.max(hs,m.s?2:0),background:GRN,opacity:0.9,borderRadius:'2px 2px 0 0'}}/>
                  </div>
                  <div style={{fontSize:9,color:DIM,marginTop:2,textAlign:'center'}}>{m.lbl}</div>
                </div>)
              })}
            </div>
            <div style={{display:'flex',gap:12,marginTop:6,fontSize:11}}><span><span style={{color:GRN}}>■</span> Settled</span><span><span style={{color:RED}}>■</span> Pending</span></div>
          </div>
        </div>
      )}

      {/* ── PARTS ── */}
      {sec==='parts'&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:14}}>
          <div style={{...CARD,gridColumn:'span 2'}}>
            <div style={{fontWeight:700,color:acc,marginBottom:4}}>Top 10 Parts by NDP Value</div>
            <div style={{fontSize:11,color:DIM,marginBottom:12}}>{fmtN(new Set(filtered.map(r=>r.part_number).filter(Boolean)).size)} unique parts · current filters</div>
            {topParts.length===0?<div style={{color:DIM,fontSize:12}}>No parts data.</div>:topParts.map((p,i)=>(
              <div key={p.pn} style={{marginBottom:9}}>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:2}}>
                  <span><span style={{color:DIM}}>#{i+1} </span><span style={{fontFamily:'monospace',color:BLU}}>{p.pn}</span><span style={{color:DIM,marginLeft:6}}>{(p.desc||'').slice(0,40)}</span></span>
                  <span style={{fontWeight:700,color:BLU,marginLeft:8}}>{fmtRs(p.ndp)}</span>
                </div>
                <div style={{height:5,background:BG3,borderRadius:3}}><div style={{height:'100%',width:`${Math.round((p.ndp/maxPNdp)*100)}%`,background:BLU,borderRadius:3}}/></div>
                <div style={{fontSize:10,color:DIM}}>{fmtN(p.cnt)} claims</div>
              </div>
            ))}
          </div>
          <div style={CARD}><div style={{fontWeight:700,color:acc,marginBottom:12}}>Parts Summary</div>
            {[{l:'Total Parts Amount',v:fmtRs(kpi.ndp)},{l:'Rows with Parts',v:fmtN(filtered.filter(r=>r.ndp>0).length)},{l:'Unique Part Numbers',v:fmtN(new Set(filtered.map(r=>r.part_number).filter(p=>p&&p!=='0')).size)},{l:'Avg NDP / Part Row',v:fmtRs(filtered.filter(r=>r.ndp>0).length?kpi.ndp/filtered.filter(r=>r.ndp>0).length:0)}].map(s=>(
              <div key={s.l} style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'6px 0',borderBottom:`1px solid ${BG3}`}}>
                <span style={{color:DIM}}>{s.l}</span><span style={{fontWeight:700,color:BLU}}>{s.v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── LABOUR ── */}
      {sec==='labour'&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:14}}>
          <div style={CARD}><div style={{fontWeight:700,color:acc,marginBottom:12}}>Labour Summary</div>
            {[{l:'Total Labour',v:fmtRs(kpi.lab+kpi.spl),c:'#79c0ff'},{l:'Regular Labour',v:fmtRs(kpi.lab),c:'#79c0ff'},{l:'SPL Labour',v:fmtRs(kpi.spl),c:'#d2a8ff'},{l:'Misc Charges',v:fmtRs(kpi.misc),c:YLW},{l:'Avg Labour / Row',v:fmtRs(filtered.length?(kpi.lab+kpi.spl)/filtered.length:0),c:DIM}].map(s=>(
              <div key={s.l} style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'6px 0',borderBottom:`1px solid ${BG3}`}}>
                <span style={{color:DIM}}>{s.l}</span><span style={{fontWeight:700,color:s.c}}>{s.v}</span>
              </div>
            ))}
          </div>
          <div style={CARD}><div style={{fontWeight:700,color:acc,marginBottom:12}}>Labour vs Parts</div>
            <Donut segs={[{l:'Labour (Reg+SPL)',v:Math.round(kpi.lab+kpi.spl),c:'#79c0ff'},{l:'Parts (NDP)',v:Math.round(kpi.ndp),c:BLU},{l:'Misc',v:Math.round(kpi.misc),c:YLW}].filter(s=>s.v>0)}/>
          </div>
          <div style={CARD}><div style={{fontWeight:700,color:acc,marginBottom:10}}>Monthly Labour Trend</div>
            <BarChart color="#79c0ff" data={monthly.map(m=>({lbl:m.lbl,val:m.lab+m.spl}))}/>
          </div>
        </div>
      )}

      {/* ── CHARTS ── */}
      {sec==='charts'&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:14}}>
          <div style={CARD}><div style={{fontWeight:700,color:acc,marginBottom:10}}>Monthly Revenue</div>
            <BarChart color={acc} data={monthly.map(m=>({lbl:m.lbl,val:m.tot}))}/>
          </div>
          <div style={CARD}><div style={{fontWeight:700,color:acc,marginBottom:10}}>Status Distribution</div>
            <Donut segs={[{l:'✅ Settled',v:kpi.stlCnt,c:GRN},{l:'🔴 Pending',v:kpi.pndCnt,c:RED}]}/>
          </div>
          <div style={CARD}><div style={{fontWeight:700,color:acc,marginBottom:10}}>Parts vs Labour</div>
            <Donut segs={[{l:'Parts(NDP)',v:Math.round(kpi.ndp),c:BLU},{l:'Labour',v:Math.round(kpi.lab+kpi.spl),c:'#79c0ff'},{l:'Misc',v:Math.round(kpi.misc),c:YLW}].filter(s=>s.v>0)}/>
          </div>
          <div style={CARD}><div style={{fontWeight:700,color:acc,marginBottom:10}}>Portal Distribution</div>
            <Donut segs={[{l:'🚗 PV',v:pvCnt,c:BLU},{l:'⚡ EV',v:evCnt,c:'#d2a8ff'}]}/>
          </div>
          <div style={CARD}><div style={{fontWeight:700,color:acc,marginBottom:10}}>Monthly Parts Trend</div>
            <BarChart color={BLU} data={monthly.map(m=>({lbl:m.lbl,val:m.ndp}))}/>
          </div>
          <div style={CARD}><div style={{fontWeight:700,color:acc,marginBottom:10}}>Monthly Settlement</div>
            <div style={{display:'flex',gap:5,alignItems:'flex-end',height:110,overflowX:'auto'}}>
              {monthly.map(m=>{const mx=Math.max(...monthly.map(x=>x.s+x.p),1),hs=Math.round((m.s/mx)*85),hp=Math.round((m.p/mx)*85)
                return(<div key={m.ym} style={{display:'flex',flexDirection:'column',alignItems:'center',minWidth:38}}>
                  <div style={{width:26,height:90,display:'flex',flexDirection:'column',justifyContent:'flex-end'}}>
                    <div style={{height:Math.max(hp,m.p?2:0),background:RED,opacity:0.8}}/>
                    <div style={{height:Math.max(hs,m.s?2:0),background:GRN,opacity:0.9,borderRadius:'2px 2px 0 0'}}/>
                  </div>
                  <div style={{fontSize:9,color:DIM,marginTop:2,textAlign:'center'}}>{m.lbl}</div>
                </div>)})}
            </div>
            <div style={{display:'flex',gap:12,marginTop:6,fontSize:11}}><span><span style={{color:GRN}}>■</span> Settled</span><span><span style={{color:RED}}>■</span> Pending</span></div>
          </div>
        </div>
      )}

      {/* ── DETAIL TABLE ── */}
      {sec==='table'&&(
        <div style={CARD}>
          <div style={{display:'flex',flexWrap:'wrap',justifyContent:'space-between',alignItems:'center',gap:8,marginBottom:12}}>
            <div style={{fontWeight:700,color:acc,fontSize:14}}>Claim Detail — {fmtN(sorted.length)} rows{drillM&&<span style={{fontSize:12,color:DIM,marginLeft:8}}>({ml(drillM)})</span>}</div>
            <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
              <select value={pgSz} onChange={e=>{setPgSz(Number(e.target.value));setPg(1)}} style={{...SEL,width:110}}>
                {PAGE_SIZES.map(n=><option key={n} value={n}>{n===-1?'All Records':`${n} / page`}</option>)}</select>
              <span style={{fontSize:11,color:DIM}}>Page {pg}/{totPg}</span>
              <button onClick={()=>setPg(1)} disabled={pg===1} style={BTN}>«</button>
              <button onClick={()=>setPg(p=>Math.max(1,p-1))} disabled={pg===1} style={BTN}>‹</button>
              <button onClick={()=>setPg(p=>Math.min(totPg,p+1))} disabled={pg===totPg} style={BTN}>›</button>
              <button onClick={()=>setPg(totPg)} disabled={pg===totPg} style={BTN}>»</button>
            </div>
          </div>
          <div style={{overflowX:'auto',maxHeight:520,overflowY:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr>
                {([{h:'#',k:null},{h:'Portal',k:'portal'},{h:'Job Card No',k:'job_card_number'},{h:'Prowac No',k:'prowac_no'},{h:'Dealer Code',k:'dealer_code'},{h:'Part No',k:'part_number'},{h:'Description',k:'description'},{h:'NDP (₹)',k:'ndp'},{h:'Labour (₹)',k:'labour_chgs'},{h:'SPL (₹)',k:'spl_labour_chgs'},{h:'Total (₹)',k:'total'},{h:'Invoice Date',k:'invc_date'},{h:'Status',k:null}] as {h:string;k:SortCol|null}[]).map(col=>(
                  <th key={col.h} onClick={col.k?()=>doSort(col.k!):undefined} style={{...TH,textAlign:['NDP (₹)','Labour (₹)','SPL (₹)','Total (₹)'].includes(col.h)?'right':'left'}}>
                    {col.h}{col.k&&sCol===col.k&&(sDir==='asc'?' ↑':' ↓')}</th>
                ))}
              </tr></thead>
              <tbody>
                {paged.map((r,i)=>{const stl=settled(r),rt=rowTotal(r)
                  return(
                    <tr key={r.id} style={{background:i%2===0?'transparent':BG2}}>
                      <td style={{...TD,color:DIM,width:36}}>{(pg-1)*effSz+i+1}</td>
                      <td style={TD}><span style={{display:'inline-block',padding:'2px 7px',borderRadius:10,fontSize:10,fontWeight:700,background:(r.portal==='PV'?BLU:'#d2a8ff')+'22',color:r.portal==='PV'?BLU:'#d2a8ff'}}>{r.portal}</span></td>
                      <td style={{...TD,fontFamily:'monospace',fontSize:11,color:DIM,maxWidth:180}}><span style={{display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={r.job_card_number}>{r.job_card_number}</span></td>
                      <td style={{...TD,fontFamily:'monospace',fontSize:11}}>{r.prowac_no}</td>
                      <td style={{...TD,fontSize:11,color:DIM}}>{r.dealer_code}</td>
                      <td style={{...TD,fontFamily:'monospace',fontSize:11,color:BLU}}>{r.part_number||'—'}</td>
                      <td style={{...TD,maxWidth:200}}><span style={{display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={r.description||''}>{r.description||'—'}</span></td>
                      <td style={{...TDR,color:(r.ndp||0)>0?BLU:DIM}}>{(r.ndp||0)>0?fmtRs(r.ndp):'—'}</td>
                      <td style={{...TDR,color:(r.labour_chgs||0)>0?'#79c0ff':DIM}}>{(r.labour_chgs||0)>0?fmtRs(r.labour_chgs):'—'}</td>
                      <td style={{...TDR,color:(r.spl_labour_chgs||0)>0?'#d2a8ff':DIM}}>{(r.spl_labour_chgs||0)>0?fmtRs(r.spl_labour_chgs):'—'}</td>
                      <td style={{...TDR,fontWeight:700}}>{fmtRs(rt)}</td>
                      <td style={{...TD,fontSize:11,color:DIM}}>{r.invc_date?.slice(0,10)||'—'}</td>
                      <td style={TD}><span style={{display:'inline-block',padding:'2px 7px',borderRadius:10,fontSize:10,fontWeight:700,background:(stl?GRN:RED)+'22',color:stl?GRN:RED}}>{stl?'✅ Settled':'🔴 Pending'}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main exported component ──────────────────────────────────────────────────
interface Props extends ReportViewProps { activeTabId: string }

export default function WarrantySubReports({ activeTabId }: Props) {
  const navigate = useNavigate()
  const [portal,  setPortal]  = useState<Portal>('ALL')
  const [labRows, setLabRows] = useState<Row[]>([])
  const [splRows, setSplRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [err,     setErr]     = useState<string|null>(null)

  const activeTab = TABS.find(t=>t.id===activeTabId) ?? TABS[0]

  const load = useCallback(async (p: Portal) => {
    setLoading(true); setErr(null)
    try {
      const [lab, spl] = await Promise.all([
        loadAll('warranty_labour_data', SEL, p),
        loadAll('warranty_spl_codes_data', SSPL, p),
      ])
      setLabRows(lab); setSplRows(spl)
    } catch (e: unknown) { setErr(String(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load(portal) }, [load, portal])

  return (
    <div style={{background:BG0,color:TXT,fontFamily:'Inter,system-ui,sans-serif',minHeight:'100vh'}}>

      {/* Top bar */}
      <div style={{background:BG1,borderBottom:`1px solid ${BORD}`,padding:'10px 16px',display:'flex',flexWrap:'wrap',gap:10,alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:22}}>{activeTab.icon}</span>
          <div>
            <div style={{fontSize:15,fontWeight:700,color:activeTab.accent}}>{activeTab.label} Report</div>
            <div style={{fontSize:11,color:DIM}}>{activeTab.desc}</div>
          </div>
        </div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
          {(['ALL','PV','EV'] as Portal[]).map(p=>(
            <button key={p} onClick={()=>setPortal(p)} style={{padding:'5px 12px',borderRadius:6,border:'none',cursor:'pointer',fontSize:12,fontWeight:600,background:portal===p?activeTab.accent:BG3,color:portal===p?'#fff':DIM}}>
              {p==='ALL'?'🌐 All':p==='PV'?'🚗 PV':'⚡ EV'}
            </button>
          ))}
          <button onClick={()=>load(portal)} style={{padding:'5px 10px',borderRadius:6,border:`1px solid ${BORD}`,background:BG3,color:TXT,cursor:'pointer',fontSize:12}}>↻</button>
        </div>
      </div>

      {/* Tab bar — all 7 report tabs */}
      <div style={{background:BG2,borderBottom:`1px solid ${BORD}`,padding:'0 16px',display:'flex',gap:2,overflowX:'auto'}}>
        {TABS.map(tab=>{
          const isA = activeTab.id === tab.id
          return (
            <button key={tab.id} onClick={()=>navigate(`/reports/warranty/${tab.id}`)} style={{padding:'10px 16px',background:'none',border:'none',cursor:'pointer',fontSize:13,fontWeight:600,whiteSpace:'nowrap' as const,color:isA?tab.accent:DIM,borderBottom:isA?`2px solid ${tab.accent}`:'2px solid transparent',transition:'all 0.15s'}}>
              {tab.icon} {tab.label}
            </button>
          )
        })}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{textAlign:'center',padding:60,color:DIM}}>
          <div style={{fontSize:32,marginBottom:8}}>{activeTab.icon}</div>
          Loading {activeTab.label} data…
        </div>
      ) : err ? (
        <div style={{margin:16,padding:16,background:BG1,border:`1px solid ${RED}`,borderRadius:8,color:RED}}>Error: {err}</div>
      ) : (
        <TabPanel key={activeTab.id} tab={activeTab} labRows={labRows} splRows={splRows}/>
      )}
    </div>
  )
}
