import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Plus, Search, Users, Trash2, ChevronLeft, ChevronRight, Pencil, Eye, FileText } from "lucide-react";
import { SectionLabel, EmptyHint, DashAvatar } from "@/components/dashboard/ui";

const PAL = {
  ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)",
};
const sans = '"Manrope", system-ui, sans-serif';

const STATUSES = [
  { value: "active", label: "Actif" },
  { value: "on-leave", label: "En congé" },
  { value: "inactive", label: "Inactif" },
];

export type Employee = {
  id: string;
  full_name: string;
  cin: string | null;
  matricule: string | null;
  email: string | null;
  phone: string | null;
  position: string | null;
  department: string | null;
  status: string;
  hire_date: string | null;
  contract_type: string | null;
  contract_start: string | null;
  contract_end: string | null;
  salary: number | null;
  birth_date: string | null;
  address: string | null;
  city: string | null;
  nationality: string | null;
  manager: string | null;
  cnss_number: string | null;
  bank_account: string | null;
  notes: string | null;
  probation_duration_days?: number | null;
  probation_end_date?: string | null;
  probation_status?: string | null;
  photo_url?: string | null;
  // Identité complémentaire
  gender?: string | null;
  place_of_birth?: string | null;
  marital_status?: string | null;
  dependents_count?: number | null;
  blood_type?: string | null;
  postal_code?: string | null;
  country?: string | null;
  personal_email?: string | null;
  // Pièce d'identité
  cin_issue_date?: string | null;
  cin_expiry_date?: string | null;
  passport_number?: string | null;
  // Contact d'urgence
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  emergency_contact_relation?: string | null;
  // Poste / conditions de travail
  grade?: string | null;
  work_location?: string | null;
  weekly_hours?: number | null;
  // Administratif / paie
  bank_name?: string | null;
  amo_number?: string | null;
  tax_id?: string | null;
  cimr_number?: string | null;
};

const fieldStyle = { marginTop: 8, marginBottom: 16, width: "100%", padding: "11px 14px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 14, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const };
const labelStyle = { fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={labelStyle}>{label}</label>{children}</div>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: sans, fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" as const, color: "var(--pal-primary-deep)", margin: "22px 0 10px", paddingTop: 14, borderTop: `1px solid ${PAL.line}` }}>
      {children}
    </div>
  );
}

export type LookupItem = { id: string; name: string };

export function FormModal({ editing, departments, contractTypes, onClose, onSaved }: {
  editing: Employee | null; departments: LookupItem[]; contractTypes: LookupItem[];
  onClose: () => void; onSaved: () => void;
}) {
  const { roles } = useAuth();
  const canSeeSalary = roles.includes("admin") || roles.includes("rh");
  const [form, setForm] = useState({
    full_name: editing?.full_name ?? "",
    cin: editing?.cin ?? "",
    matricule: editing?.matricule ?? "",
    email: editing?.email ?? "",
    phone: editing?.phone ?? "",
    position: editing?.position ?? "",
    department: editing?.department ?? "",
    status: editing?.status ?? "active",
    hire_date: editing?.hire_date ?? "",
    contract_type: editing?.contract_type ?? "",
    salary: editing ? String(editing.salary ?? "") : "",
    manager: editing?.manager ?? "",
    cnss_number: editing?.cnss_number ?? "",
    bank_account: editing?.bank_account ?? "",
    address: editing?.address ?? "",
    city: editing?.city ?? "",
    nationality: editing?.nationality ?? "",
    notes: editing?.notes ?? "",
    birth_date: editing?.birth_date ?? "",
    gender: editing?.gender ?? "",
    place_of_birth: editing?.place_of_birth ?? "",
    marital_status: editing?.marital_status ?? "",
    dependents_count: editing ? String(editing.dependents_count ?? "") : "",
    blood_type: editing?.blood_type ?? "",
    postal_code: editing?.postal_code ?? "",
    country: editing?.country ?? "",
    personal_email: editing?.personal_email ?? "",
    cin_issue_date: editing?.cin_issue_date ?? "",
    cin_expiry_date: editing?.cin_expiry_date ?? "",
    passport_number: editing?.passport_number ?? "",
    emergency_contact_name: editing?.emergency_contact_name ?? "",
    emergency_contact_phone: editing?.emergency_contact_phone ?? "",
    emergency_contact_relation: editing?.emergency_contact_relation ?? "",
    grade: editing?.grade ?? "",
    work_location: editing?.work_location ?? "",
    weekly_hours: editing ? String(editing.weekly_hours ?? "") : "",
    bank_name: editing?.bank_name ?? "",
    amo_number: editing?.amo_number ?? "",
    tax_id: editing?.tax_id ?? "",
    cimr_number: editing?.cimr_number ?? "",
  });
  const [busy, setBusy] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(f => ({ ...f, [key]: value }));
  }

  async function submit() {
    if (!form.full_name.trim()) { toast.error("Le nom complet est requis."); return; }
    setBusy(true);
    const payload = {
      ...form,
      hire_date: form.hire_date || null,
      salary: form.salary ? parseFloat(form.salary) : null,
      cin: form.cin || null,
      matricule: form.matricule || null,
      email: form.email || null,
      phone: form.phone || null,
      position: form.position || null,
      department: form.department || null,
      contract_type: form.contract_type || null,
      manager: form.manager || null,
      cnss_number: form.cnss_number || null,
      bank_account: form.bank_account || null,
      address: form.address || null,
      city: form.city || null,
      nationality: form.nationality || null,
      notes: form.notes || null,
      birth_date: form.birth_date || null,
      gender: form.gender || null,
      place_of_birth: form.place_of_birth || null,
      marital_status: form.marital_status || null,
      dependents_count: form.dependents_count ? parseInt(form.dependents_count, 10) : null,
      blood_type: form.blood_type || null,
      postal_code: form.postal_code || null,
      country: form.country || null,
      personal_email: form.personal_email || null,
      cin_issue_date: form.cin_issue_date || null,
      cin_expiry_date: form.cin_expiry_date || null,
      passport_number: form.passport_number || null,
      emergency_contact_name: form.emergency_contact_name || null,
      emergency_contact_phone: form.emergency_contact_phone || null,
      emergency_contact_relation: form.emergency_contact_relation || null,
      grade: form.grade || null,
      work_location: form.work_location || null,
      weekly_hours: form.weekly_hours ? parseFloat(form.weekly_hours) : null,
      bank_name: form.bank_name || null,
      amo_number: form.amo_number || null,
      tax_id: form.tax_id || null,
      cimr_number: form.cimr_number || null,
    };
    try {
      if (editing) await api.patch(`/api/rh/employees/${editing.id}`, payload);
      else await api.post("/api/rh/employees", payload);
      toast.success(editing ? "Employé modifié !" : "Employé créé !");
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'enregistrement.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="anim-fade" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 16, padding: 32, width: 620, maxWidth: "95vw", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }}>
        <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 26, fontWeight: 500, color: PAL.ink, margin: "0 0 20px" }}>
          {editing ? "Modifier l'employé" : "Nouvel employé"}
        </h2>

        <Field label="Nom complet *">
          <input type="text" value={form.full_name} onChange={e => set("full_name", e.target.value)} className="u-input" style={fieldStyle} />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Poste"><input type="text" value={form.position} onChange={e => set("position", e.target.value)} className="u-input" style={fieldStyle} /></Field>
          <Field label="Département">
            <select value={form.department} onChange={e => set("department", e.target.value)} className="u-input" style={fieldStyle}>
              <option value="">— Non défini —</option>
              {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
            </select>
          </Field>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Field label="Statut">
            <select value={form.status} onChange={e => set("status", e.target.value)} className="u-input" style={fieldStyle}>
              {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Date d'embauche"><input type="date" value={form.hire_date} onChange={e => set("hire_date", e.target.value)} className="u-input" style={fieldStyle} /></Field>
          <Field label="Type de contrat">
            <select value={form.contract_type} onChange={e => set("contract_type", e.target.value)} className="u-input" style={fieldStyle}>
              <option value="">— Non défini —</option>
              {contractTypes.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </Field>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Email"><input type="email" value={form.email} onChange={e => set("email", e.target.value)} className="u-input" style={fieldStyle} /></Field>
          <Field label="Téléphone"><input type="text" value={form.phone} onChange={e => set("phone", e.target.value)} className="u-input" style={fieldStyle} /></Field>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {canSeeSalary && (
            <Field label="Salaire de base (MAD)"><input type="number" min="0" step="any" value={form.salary} onChange={e => set("salary", e.target.value)} className="u-input" style={fieldStyle} /></Field>
          )}
          <Field label="Manager"><input type="text" value={form.manager} onChange={e => set("manager", e.target.value)} className="u-input" style={fieldStyle} /></Field>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="N° CNSS"><input type="text" value={form.cnss_number} onChange={e => set("cnss_number", e.target.value)} className="u-input" style={fieldStyle} /></Field>
          <Field label="Compte bancaire (RIB)"><input type="text" value={form.bank_account} onChange={e => set("bank_account", e.target.value)} className="u-input" style={fieldStyle} /></Field>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Ville"><input type="text" value={form.city} onChange={e => set("city", e.target.value)} className="u-input" style={fieldStyle} /></Field>
          <Field label="Nationalité"><input type="text" value={form.nationality} onChange={e => set("nationality", e.target.value)} className="u-input" style={fieldStyle} /></Field>
        </div>

        <Field label="Adresse"><input type="text" value={form.address} onChange={e => set("address", e.target.value)} className="u-input" style={fieldStyle} /></Field>

        <SectionTitle>Identité complémentaire</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Date de naissance"><input type="date" value={form.birth_date} onChange={e => set("birth_date", e.target.value)} className="u-input" style={fieldStyle} /></Field>
          <Field label="Lieu de naissance"><input type="text" value={form.place_of_birth} onChange={e => set("place_of_birth", e.target.value)} className="u-input" style={fieldStyle} /></Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Genre">
            <select value={form.gender} onChange={e => set("gender", e.target.value)} className="u-input" style={fieldStyle}>
              <option value="">— Non défini —</option>
              <option value="M">Masculin</option>
              <option value="F">Féminin</option>
            </select>
          </Field>
          <Field label="Situation familiale">
            <select value={form.marital_status} onChange={e => set("marital_status", e.target.value)} className="u-input" style={fieldStyle}>
              <option value="">— Non défini —</option>
              <option value="célibataire">Célibataire</option>
              <option value="marié(e)">Marié(e)</option>
              <option value="divorcé(e)">Divorcé(e)</option>
              <option value="veuf(ve)">Veuf(ve)</option>
            </select>
          </Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Personnes à charge"><input type="number" min="0" value={form.dependents_count} onChange={e => set("dependents_count", e.target.value)} className="u-input" style={fieldStyle} /></Field>
          <Field label="Groupe sanguin"><input type="text" value={form.blood_type} onChange={e => set("blood_type", e.target.value)} className="u-input" style={fieldStyle} placeholder="ex. O+" /></Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Code postal"><input type="text" value={form.postal_code} onChange={e => set("postal_code", e.target.value)} className="u-input" style={fieldStyle} /></Field>
          <Field label="Pays"><input type="text" value={form.country} onChange={e => set("country", e.target.value)} className="u-input" style={fieldStyle} /></Field>
        </div>
        <Field label="Email personnel"><input type="email" value={form.personal_email} onChange={e => set("personal_email", e.target.value)} className="u-input" style={fieldStyle} /></Field>

        <SectionTitle>Pièce d'identité</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="CIN — Date de délivrance"><input type="date" value={form.cin_issue_date} onChange={e => set("cin_issue_date", e.target.value)} className="u-input" style={fieldStyle} /></Field>
          <Field label="CIN — Date de validité"><input type="date" value={form.cin_expiry_date} onChange={e => set("cin_expiry_date", e.target.value)} className="u-input" style={fieldStyle} /></Field>
        </div>
        <Field label="N° Passeport"><input type="text" value={form.passport_number} onChange={e => set("passport_number", e.target.value)} className="u-input" style={fieldStyle} /></Field>

        <SectionTitle>Contact d'urgence</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Nom"><input type="text" value={form.emergency_contact_name} onChange={e => set("emergency_contact_name", e.target.value)} className="u-input" style={fieldStyle} /></Field>
          <Field label="Téléphone"><input type="text" value={form.emergency_contact_phone} onChange={e => set("emergency_contact_phone", e.target.value)} className="u-input" style={fieldStyle} /></Field>
        </div>
        <Field label="Lien de parenté"><input type="text" value={form.emergency_contact_relation} onChange={e => set("emergency_contact_relation", e.target.value)} className="u-input" style={fieldStyle} placeholder="ex. Conjoint(e), Parent…" /></Field>

        <SectionTitle>Conditions de travail</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Échelon / Niveau"><input type="text" value={form.grade} onChange={e => set("grade", e.target.value)} className="u-input" style={fieldStyle} /></Field>
          <Field label="Lieu de travail"><input type="text" value={form.work_location} onChange={e => set("work_location", e.target.value)} className="u-input" style={fieldStyle} /></Field>
        </div>
        <Field label="Heures hebdomadaires"><input type="number" min="0" step="any" value={form.weekly_hours} onChange={e => set("weekly_hours", e.target.value)} className="u-input" style={fieldStyle} /></Field>

        <SectionTitle>Administratif / Paie</SectionTitle>
        <Field label="Nom de la banque"><input type="text" value={form.bank_name} onChange={e => set("bank_name", e.target.value)} className="u-input" style={fieldStyle} /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="N° AMO"><input type="text" value={form.amo_number} onChange={e => set("amo_number", e.target.value)} className="u-input" style={fieldStyle} /></Field>
          <Field label="Identifiant fiscal (IF)"><input type="text" value={form.tax_id} onChange={e => set("tax_id", e.target.value)} className="u-input" style={fieldStyle} /></Field>
        </div>
        <Field label="N° CIMR"><input type="text" value={form.cimr_number} onChange={e => set("cimr_number", e.target.value)} className="u-input" style={fieldStyle} /></Field>

        <Field label="Notes">
          <textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} className="u-input" style={{ ...fieldStyle, resize: "vertical" as const, marginBottom: 24 }} />
        </Field>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} className="u-ghost" style={{ fontFamily: sans, fontSize: 13, color: PAL.muted, background: "transparent", border: `1px solid ${PAL.line}`, borderRadius: 8, padding: "10px 18px", cursor: "pointer" }}>Annuler</button>
          <button onClick={submit} disabled={busy} style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: PAL.paper, background: PAL.ink, border: 0, borderRadius: 8, padding: "10px 24px", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? .6 : 1 }}>
            {busy ? "Enregistrement…" : editing ? "Enregistrer" : "Créer l'employé"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function RhEmployees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; editing: Employee | null }>({ open: false, editing: null });
  const [departments, setDepartments] = useState<LookupItem[]>([]);
  const [contractTypes, setContractTypes] = useState<LookupItem[]>([]);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (q) params.set("q", q);
      if (status) params.set("status", status);
      const res = await api.get(`/api/rh/employees?${params.toString()}`);
      setEmployees(res.items ?? []);
      setTotal(res.total ?? 0);
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du chargement.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status, page]);

  useEffect(() => {
    api.get("/api/rh/departments").then(setDepartments).catch(() => {});
    api.get("/api/rh/contract-types").then(setContractTypes).catch(() => {});
  }, []);

  async function remove(e: Employee) {
    if (!window.confirm(`Supprimer l'employé « ${e.full_name} » ?`)) return;
    try {
      await api.delete(`/api/rh/employees/${e.id}`);
      toast.success("Employé supprimé.");
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la suppression.");
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      {modal.open && (
        <FormModal editing={modal.editing} departments={departments} contractTypes={contractTypes} onClose={() => setModal({ open: false, editing: null })} onSaved={load} />
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 220px" }}>
          <Search size={15} strokeWidth={1.7} style={{ position: "absolute", insetInlineStart: 14, top: "50%", transform: "translateY(-50%)", color: PAL.muted }} />
          <input type="text" value={q} onChange={e => { setPage(1); setQ(e.target.value); }} placeholder="Rechercher un employé…" className="u-input" style={{ width: "100%", padding: "10px 14px 10px 38px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 13.5, background: PAL.paper, outline: "none", boxSizing: "border-box" as const }} />
        </div>
        <select value={status} onChange={e => { setPage(1); setStatus(e.target.value); }} className="u-input" style={{ padding: "10px 12px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 13, background: PAL.paper }}>
          <option value="">Tous statuts</option>
          {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <button type="button" onClick={() => setModal({ open: true, editing: null })} className="btn-c btn-c-primary">
          <Plus size={15} strokeWidth={1.7} />Nouvel employé
        </button>
      </div>

      <SectionLabel>{total} employé{total !== 1 ? "s" : ""}</SectionLabel>

      {loading ? (
        <div className="dash-card" style={{ padding: 26 }}>
          <div className="shimmer" style={{ height: 18, width: 180, borderRadius: 999 }} />
        </div>
      ) : employees.length === 0 ? (
        <div className="dash-card">
          <EmptyHint icon={<Users size={28} strokeWidth={1.7} />} text="Aucun employé trouvé." />
        </div>
      ) : (
        <>
          <div className="dash-card overflow-hidden">
            {employees.map(emp => (
              <div key={emp.id} className="row-c flex-wrap">
                {emp.photo_url ? (
                  <img
                    src={emp.photo_url}
                    alt=""
                    style={{ width: 34, height: 34, borderRadius: 999, objectFit: "cover", flexShrink: 0 }}
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <DashAvatar name={emp.full_name || "?"} size={34} tone="mid" />
                )}
                <div className="min-w-0 flex-1" style={{ minWidth: 180 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: PAL.ink }}>{emp.full_name}</div>
                  <div className="mt-0.5" style={{ fontSize: 12, color: PAL.muted }}>
                    {emp.position || "—"}{emp.department ? ` · ${emp.department}` : ""}
                  </div>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
                  color: emp.status === "active" ? "var(--pal-good)" : emp.status === "on-leave" ? "var(--pal-warn)" : "var(--pal-muted)",
                  background: "var(--pal-pale)",
                }}>
                  {STATUSES.find(s => s.value === emp.status)?.label ?? emp.status}
                </span>
                <Link to="/dashboard/rh/employees/$employeeId" params={{ employeeId: emp.id }} search={{ tab: undefined }} style={{ display: "flex", color: PAL.muted }} title="Voir le dossier"><Eye size={14} strokeWidth={1.7} /></Link>
                <Link to="/dashboard/rh/employees/$employeeId" params={{ employeeId: emp.id }} search={{ tab: "fichiers" }} style={{ display: "flex", color: PAL.muted }} title="Fichiers"><FileText size={14} strokeWidth={1.7} /></Link>
                <button onClick={() => setModal({ open: true, editing: emp })} style={{ background: "none", border: 0, cursor: "pointer", color: PAL.muted }} title="Modifier"><Pencil size={14} strokeWidth={1.7} /></button>
                <button onClick={() => remove(emp)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }} title="Supprimer"><Trash2 size={14} strokeWidth={1.7} /></button>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 16 }}>
            <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-c btn-c-sm btn-c-ghost" style={{ opacity: page <= 1 ? 0.4 : 1 }}><ChevronLeft size={14} strokeWidth={1.7} /></button>
            <span style={{ fontFamily: sans, fontSize: 12.5, color: PAL.muted }}>Page {page} / {totalPages}</span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="btn-c btn-c-sm btn-c-ghost" style={{ opacity: page >= totalPages ? 0.4 : 1 }}><ChevronRight size={14} strokeWidth={1.7} /></button>
          </div>
        </>
      )}
    </div>
  );
}
