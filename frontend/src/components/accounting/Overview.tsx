import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area,
  ComposedChart, Line, ReferenceLine,
} from "recharts";
import {
  Wallet, TrendingUp, TrendingDown, FileWarning, CalendarClock,
  Building2, ShoppingCart, Receipt, CreditCard, ArrowUpRight, ArrowDownRight, Minus,
} from "lucide-react";
import { CountUp } from "@/components/CountUp";

type CatSlice = { name: string; value: number };
type BudgetRow = { category: string; budget: number; actual: number };
type TreasuryRow = { month: string; revenues: number; expenses: number; net: number };
type StatusRow = { name: string; value: number };
type Summary = {
  net_treasury: number;
  total_revenues_received: number;
  total_revenues_expected: number;
  total_outflow: number;
  total_purchases_amount: number;
  total_expenses_amount: number;
  unpaid_invoices: number;
  monthly_outflow: number;
  monthly_revenues: number;
  supplier_count: number;
  revenue_rate: number;
  counts: { purchases: number; expenses: number; revenues: number; invoices: number };
  expenses_by_category: CatSlice[];
  budget_vs_actual: BudgetRow[];
  treasury_series: TreasuryRow[];
  purchase_status_breakdown: StatusRow[];
  outflow_composition: StatusRow[];
};

const sans = '"Manrope", system-ui, sans-serif';
const mono = '"JetBrains Mono", ui-monospace, monospace';
const MONTHS_SHORT = ["janv.","fevr.","mars","avr.","mai","juin","juil.","aout","sept.","oct.","nov.","dec."];
const C = {
  primary:"oklch(48% 0.085 175)", mid:"oklch(62% 0.085 170)", accent:"oklch(72% 0.11 60)",
  good:"oklch(70% 0.13 155)", warn:"oklch(78% 0.12 80)", danger:"oklch(64% 0.18 25)",
  ink:"oklch(22% 0.025 175)", muted:"oklch(48% 0.02 180)", line:"oklch(88% 0.015 170)",
  pale:"oklch(94% 0.025 165)", paper:"oklch(99% 0.005 160)",
};
const PIE_COLORS = [C.primary, C.mid, C.accent, C.good, C.warn, C.danger];
const STATUS_COLORS = [C.good, C.warn, C.accent, C.danger];

export function fmtMAD(n: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) + " MAD";
}
function fmtK(n: number) {
  return new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}
function monthLabel(ym: string) {
  const [y, m] = ym.split("-");
  return MONTHS_SHORT[parseInt(m, 10) - 1] + " " + y.slice(2);
}

const ANIM_CSS = `
@keyframes ov-up { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:none} }
@keyframes ov-scale { from{opacity:0;transform:scale(.93)} to{opacity:1;transform:none} }
@keyframes ov-pulse { 0%,100%{box-shadow:0 0 0 0 oklch(48% .085 175/.15)} 50%{box-shadow:0 0 0 8px oklch(48% .085 175/0)} }
`;
function injectCSS() {
  if (document.getElementById("ov-anim-v2")) return;
  const s = document.createElement("style"); s.id="ov-anim-v2"; s.textContent=ANIM_CSS;
  document.head.appendChild(s);
}

const TT: React.CSSProperties = {
  fontFamily:sans, fontSize:12.5, borderRadius:12,
  border:`1px solid ${C.line}`, background:C.paper,
  boxShadow:"0 8px 32px oklch(0% 0 0/.12)", padding:"8px 12px",
};

function FadeUp({ delay=0, children }: { delay?:number; children:React.ReactNode }) {
  return <div style={{ animation:`ov-up .55s cubic-bezier(.22,1,.36,1) ${delay}ms both` }}>{children}</div>;
}

function SH({ children, sub }: { children:React.ReactNode; sub?:string }) {
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ fontSize:11, fontWeight:700, letterSpacing:".12em", textTransform:"uppercase", color:C.muted, fontFamily:sans }}>{children}</div>
      {sub && <div style={{ fontSize:11.5, color:C.muted, marginTop:3 }}>{sub}</div>}
    </div>
  );
}

function ChartCard({ title, sub, height=260, delay=0, children, glass }: {
  title:string; sub?:string; height?:number; delay?:number; children:React.ReactNode; glass?:boolean;
}) {
  return (
    <FadeUp delay={delay}>
      <div className="dash-card" style={{ padding:"20px 22px", height:"100%", boxSizing:"border-box", background: glass?"linear-gradient(135deg,oklch(97% .015 170),oklch(99% .005 160))":C.paper }}>
        <SH sub={sub}>{title}</SH>
        <div style={{ width:"100%", height }}>{children}</div>
      </div>
    </FadeUp>
  );
}

function Gauge({ value, label, color }: { value:number; label:string; color:string }) {
  const [v, setV] = useState(0);
  useEffect(() => { const t = setTimeout(() => setV(value), 300); return () => clearTimeout(t); }, [value]);
  const r=54, circ=2*Math.PI*r, offset=circ-(v/100)*circ;
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
      <svg width={128} height={128} viewBox="0 0 128 128">
        <circle cx={64} cy={64} r={r} fill="none" stroke={C.line} strokeWidth={10} />
        <circle cx={64} cy={64} r={r} fill="none" stroke={color} strokeWidth={10}
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
          transform="rotate(-90 64 64)"
          style={{ transition:"stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1)" }}
        />
        <text x={64} y={60} textAnchor="middle" style={{ fontFamily:mono, fontSize:20, fontWeight:700, fill:C.ink }}>{v.toFixed(0)}%</text>
        <text x={64} y={78} textAnchor="middle" style={{ fontFamily:sans, fontSize:10, fill:C.muted }}>{label}</text>
      </svg>
    </div>
  );
}

function SparkBar({ data, color }: { data:number[]; color:string }) {
  const max = Math.max(...data, 1);
  return (
    <div style={{ display:"flex", alignItems:"flex-end", gap:2, height:28 }}>
      {data.map((v, i) => (
        <div key={i} style={{ flex:1, borderRadius:2, background:color, opacity:0.25+0.75*(i/(data.length-1)), height:`${Math.max(4,(v/max)*100)}%`, transition:`height .6s ease ${i*50}ms` }} />
      ))}
    </div>
  );
}

function KpiCard({ label, value, money, icon:Icon, tone, spark, delay }: {
  label:string; value:number; money:boolean; icon:React.ElementType;
  tone:"success"|"danger"|"primary"|"warn"; spark?:number[]; delay?:number;
}) {
  const bg = { success:"oklch(93% .04 155)", danger:"oklch(93% .05 25)", primary:"oklch(93% .035 175)", warn:"oklch(93% .05 80)" };
  const fg = { success:C.good, danger:C.danger, primary:C.primary, warn:C.warn };
  return (
    <FadeUp delay={delay??0}>
      <div className="dash-card" style={{ padding:"18px 20px", height:"100%", boxSizing:"border-box", cursor:"default", transition:"transform .2s,box-shadow .2s", animation:"ov-pulse 4s ease-in-out infinite" }}
        onMouseEnter={e => { const el=e.currentTarget; el.style.transform="translateY(-3px)"; el.style.boxShadow="0 14px 40px oklch(30% .03 175/.15)"; }}
        onMouseLeave={e => { const el=e.currentTarget; el.style.transform=""; el.style.boxShadow=""; }}
      >
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
          <div style={{ width:34, height:34, borderRadius:10, background:bg[tone], display:"flex", alignItems:"center", justifyContent:"center" }}>
            <Icon size={16} strokeWidth={1.8} style={{ color:fg[tone] }} />
          </div>
          <span style={{ fontSize:10.5, fontWeight:700, letterSpacing:".06em", textTransform:"uppercase", color:C.muted, fontFamily:sans }}>{label}</span>
        </div>
        <div style={{ fontFamily:mono, fontSize:22, fontWeight:800, color:C.ink, letterSpacing:"-.02em" }}>
          {money ? (
            <><CountUp value={Math.round(value)} duration={800} /><span style={{ fontSize:13, marginLeft:4, fontWeight:600, color:C.muted }}>MAD</span></>
          ) : (
            <CountUp value={value} duration={700} />
          )}
        </div>
        {spark && <div style={{ marginTop:10 }}><SparkBar data={spark} color={fg[tone]} /></div>}
      </div>
    </FadeUp>
  );
}

function RankedBars({ data, title, delay }: { data:CatSlice[]; title:string; delay?:number }) {
  const max = Math.max(...data.map(d=>d.value), 1);
  const [vis, setVis] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVis(true); }, { threshold:0.2 });
    if (ref.current) obs.observe(ref.current); return () => obs.disconnect();
  }, []);
  return (
    <FadeUp delay={delay??0}>
      <div className="dash-card" ref={ref} style={{ padding:"20px 22px", height:"100%", boxSizing:"border-box" }}>
        <SH>{title}</SH>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {data.slice(0,6).map((d,i) => (
            <div key={d.name}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:4 }}>
                <span style={{ fontFamily:sans, fontWeight:600, color:C.ink }}>{d.name}</span>
                <span style={{ fontFamily:mono, color:C.muted }}>{fmtK(d.value)}</span>
              </div>
              <div style={{ height:6, borderRadius:999, background:C.pale, overflow:"hidden" }}>
                <div style={{ height:"100%", borderRadius:999, background:PIE_COLORS[i%PIE_COLORS.length], width:vis?`${(d.value/max)*100}%`:"0%", transition:`width .9s cubic-bezier(.22,1,.36,1) ${i*80}ms` }} />
              </div>
            </div>
          ))}
          {data.length===0 && <div style={{ textAlign:"center", padding:"24px 0", color:C.muted, fontSize:13 }}>Aucune donnee.</div>}
        </div>
      </div>
    </FadeUp>
  );
}

function CountBadges({ counts, delay }: { counts:Summary["counts"]; delay?:number }) {
  const items = [
    { label:"Achats", value:counts.purchases, icon:ShoppingCart, color:C.primary },
    { label:"Depenses", value:counts.expenses, icon:Receipt, color:C.accent },
    { label:"Recettes", value:counts.revenues, icon:TrendingUp, color:C.good },
    { label:"Factures", value:counts.invoices, icon:CreditCard, color:C.mid },
  ];
  return (
    <FadeUp delay={delay??0}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:10 }}>
        {items.map(it => (
          <div key={it.label} className="dash-card" style={{ padding:"14px 16px", textAlign:"center" }}>
            <div style={{ display:"flex", justifyContent:"center", marginBottom:6 }}>
              <div style={{ width:30, height:30, borderRadius:8, background:`${it.color}20`, display:"flex", alignItems:"center", justifyContent:"center" }}>
                <it.icon size={14} strokeWidth={1.8} style={{ color:it.color }} />
              </div>
            </div>
            <div style={{ fontFamily:mono, fontSize:20, fontWeight:800, color:C.ink }}><CountUp value={it.value} duration={600} /></div>
            <div style={{ fontSize:10.5, fontWeight:700, textTransform:"uppercase", letterSpacing:".08em", color:C.muted, marginTop:2 }}>{it.label}</div>
          </div>
        ))}
      </div>
    </FadeUp>
  );
}

export function AccountingOverview() {
  const [s, setS] = useState<Summary|null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    injectCSS();
    api.get("/api/accounting/dashboard/summary")
      .then(setS)
      .catch((err:any) => toast.error(err?.message ?? "Erreur lors du chargement."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      {[200,120,320,280].map((h,i) => <div key={i} className="shimmer" style={{ height:h, borderRadius:16 }} />)}
    </div>
  );
  if (!s) return null;

  const revSpark = s.treasury_series.map(t => t.revenues);
  const outSpark = s.treasury_series.map(t => t.expenses);
  const netSpark = s.treasury_series.map(t => Math.abs(t.net));
  const allZero  = s.treasury_series.every(t => t.revenues===0 && t.expenses===0);

  const kpis = [
    { label:"Tresorerie nette",     value:s.net_treasury,            money:true,  icon:Wallet,       tone:(s.net_treasury>=0?"success":"danger") as "success"|"danger", spark:netSpark },
    { label:"Recettes encaissees",  value:s.total_revenues_received, money:true,  icon:TrendingUp,   tone:"success" as const, spark:revSpark },
    { label:"Sorties totales",       value:s.total_outflow,           money:true,  icon:TrendingDown, tone:"danger"  as const, spark:outSpark },
    { label:"Factures impayees",     value:s.unpaid_invoices,         money:true,  icon:FileWarning,  tone:"warn"    as const },
    { label:"Sorties du mois",       value:s.monthly_outflow,         money:true,  icon:CalendarClock,tone:"primary" as const },
    { label:"Fournisseurs",          value:s.supplier_count,          money:false, icon:Building2,    tone:"primary" as const },
  ];

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:22, fontFamily:sans }}>

      {/* KPI cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:12 }}>
        {kpis.map((c,i) => <KpiCard key={c.label} {...c} delay={i*65} />)}
      </div>

      {/* Count badges */}
      <CountBadges counts={s.counts} delay={400} />

      {/* Treasury area + gauge */}
      <FadeUp delay={460}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 210px", gap:12, alignItems:"stretch" }}>
          <div className="dash-card" style={{ padding:"20px 22px" }}>
            <SH sub="Recettes vs Sorties — 6 derniers mois">Tresorerie mensuelle</SH>
            {allZero
              ? <div style={{ height:280, display:"flex", alignItems:"center", justifyContent:"center", color:C.muted, fontSize:13 }}>Aucune donnee.</div>
              : <div style={{ height:280 }}>
                  <ResponsiveContainer>
                    <ComposedChart data={s.treasury_series} margin={{ top:8, right:12, left:0, bottom:0 }}>
                      <defs>
                        <linearGradient id="gRev2" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={C.good}   stopOpacity={0.4} />
                          <stop offset="95%" stopColor={C.good}   stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="gExp2" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={C.danger} stopOpacity={0.4} />
                          <stop offset="95%" stopColor={C.danger} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.line} vertical={false} />
                      <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize:11, fontFamily:sans, fill:C.muted }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={fmtK} tick={{ fontSize:11, fontFamily:sans, fill:C.muted }} axisLine={false} tickLine={false} width={48} />
                      <Tooltip contentStyle={TT} formatter={(v:number, name) => [fmtMAD(v), name==="revenues"?"Recettes":name==="expenses"?"Sorties":"Net"]} labelFormatter={monthLabel} />
                      <Legend formatter={v => v==="revenues"?"Recettes":v==="expenses"?"Sorties":"Net"} wrapperStyle={{ fontFamily:sans, fontSize:12 }} />
                      <Area type="monotone" dataKey="revenues" stroke={C.good}    strokeWidth={2.5} fill="url(#gRev2)" animationDuration={1200} />
                      <Area type="monotone" dataKey="expenses" stroke={C.danger}  strokeWidth={2.5} fill="url(#gExp2)" animationDuration={1200} />
                      <Line  type="monotone" dataKey="net"     stroke={C.primary} strokeWidth={2} dot={{ r:3, fill:C.primary }} strokeDasharray="5 3" animationDuration={1400} />
                      <ReferenceLine y={0} stroke={C.muted} strokeDasharray="4 2" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
            }
          </div>
          <div className="dash-card" style={{ padding:"20px 22px", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:10 }}>
            <SH>Taux recouvrement</SH>
            <Gauge value={s.revenue_rate} label="encaisse" color={s.revenue_rate>70?C.good:s.revenue_rate>40?C.warn:C.danger} />
            <div style={{ textAlign:"center", fontSize:11, color:C.muted, lineHeight:1.6 }}>
              {fmtMAD(s.total_revenues_received)}<br/>encaisses sur<br/>{fmtMAD(s.total_revenues_received + s.total_revenues_expected)}
            </div>
          </div>
        </div>
      </FadeUp>

      {/* Donut: composition + statut achats */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <ChartCard title="Composition des sorties" sub="Achats vs Depenses" delay={520} height={240}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={s.outflow_composition.filter(d=>d.value>0)} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={52} paddingAngle={3} animationBegin={300} animationDuration={1000}>
                {s.outflow_composition.map((_,i) => <Cell key={i} fill={[C.primary,C.accent][i%2]} />)}
              </Pie>
              <Tooltip contentStyle={TT} formatter={(v:number) => fmtMAD(v)} />
              <Legend wrapperStyle={{ fontFamily:sans, fontSize:12 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Statut des achats" sub="Repartition par etat de paiement" delay={580} height={240}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={s.purchase_status_breakdown.filter(d=>d.value>0)} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={52} paddingAngle={3} animationBegin={400} animationDuration={1000}>
                {s.purchase_status_breakdown.map((_,i) => <Cell key={i} fill={STATUS_COLORS[i%STATUS_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={TT} />
              <Legend wrapperStyle={{ fontFamily:sans, fontSize:12 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Ranked bars + Budget vs Actual */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <RankedBars data={s.expenses_by_category} title="Sorties par categorie" delay={640} />

        <ChartCard title="Budget vs Reel" sub={`Exercice ${new Date().getFullYear()}`} delay={700} height={260} glass>
          {s.budget_vs_actual.length===0
            ? <div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center", color:C.muted, fontSize:13 }}>Aucun budget configure.</div>
            : <ResponsiveContainer>
                <BarChart data={s.budget_vs_actual} margin={{ top:8, right:12, left:0, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.line} vertical={false} />
                  <XAxis dataKey="category" tick={{ fontSize:10, fontFamily:sans, fill:C.muted }} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={52} />
                  <YAxis tickFormatter={fmtK} tick={{ fontSize:11, fontFamily:sans, fill:C.muted }} axisLine={false} tickLine={false} width={48} />
                  <Tooltip contentStyle={TT} formatter={(v:number, name) => [fmtMAD(v), name==="budget"?"Budget":"Reel"]} />
                  <Legend formatter={v => v==="budget"?"Budget alloue":"Depense reelle"} wrapperStyle={{ fontFamily:sans, fontSize:12 }} />
                  <Bar dataKey="budget" fill={C.mid}     radius={[5,5,0,0]} animationDuration={900} />
                  <Bar dataKey="actual" fill={C.primary} radius={[5,5,0,0]} animationDuration={1100} />
                </BarChart>
              </ResponsiveContainer>
          }
        </ChartCard>
      </div>

      {/* Net flow full width */}
      <ChartCard title="Flux net mensuel" sub="Recettes - Sorties (positif = excedent, negatif = deficit)" delay={760} height={200} glass>
        {allZero
          ? <div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center", color:C.muted, fontSize:13 }}>Pas encore de donnees.</div>
          : <ResponsiveContainer>
              <AreaChart data={s.treasury_series} margin={{ top:8, right:12, left:0, bottom:0 }}>
                <defs>
                  <linearGradient id="gNet2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={C.good}   stopOpacity={0.45} />
                    <stop offset="100%" stopColor={C.good}   stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.line} vertical={false} />
                <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize:11, fontFamily:sans, fill:C.muted }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtK} tick={{ fontSize:11, fontFamily:sans, fill:C.muted }} axisLine={false} tickLine={false} width={52} />
                <Tooltip contentStyle={TT} formatter={(v:number) => [fmtMAD(v), "Flux net"]} labelFormatter={monthLabel} />
                <ReferenceLine y={0} stroke={C.muted} strokeDasharray="4 2" />
                <Area type="monotone" dataKey="net" stroke={C.primary} strokeWidth={2.5} fill="url(#gNet2)" dot={{ r:4, fill:C.primary, strokeWidth:0 }} activeDot={{ r:6 }} animationDuration={1400} />
              </AreaChart>
            </ResponsiveContainer>
        }
      </ChartCard>

    </div>
  );
}
