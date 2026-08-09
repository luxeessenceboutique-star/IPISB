from pydantic import BaseModel
from typing import Optional


class CourseCreate(BaseModel):
    title: str
    description: Optional[str] = None
    code: Optional[str] = None
    semester: Optional[str] = None
    credits: int = 3
    cover_color: str = "blue"
    class_ids: list[str] = []


class CourseUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    code: Optional[str] = None
    semester: Optional[str] = None
    credits: Optional[int] = None
    cover_color: Optional[str] = None
    class_ids: Optional[list[str]] = None


class AssignmentCreate(BaseModel):
    title: str
    description: Optional[str] = None
    due_date: Optional[str] = None
    max_grade: float = 20
    course_id: str


class SubmissionCreate(BaseModel):
    content: Optional[str] = None
    file_url: Optional[str] = None


class GradeInput(BaseModel):
    grade: Optional[float] = None
    feedback: Optional[str] = None


class QuestionCreate(BaseModel):
    question: str
    options: list[str]
    correct_index: int
    order_num: int = 0


class ExamCreate(BaseModel):
    title: str
    description: Optional[str] = None
    duration_minutes: int = 60
    start_time: Optional[str] = None
    course_id: str
    type: str = "examen"  # 'examen' | 'quiz'
    questions: list[QuestionCreate] = []


class ExamAnswers(BaseModel):
    answers: dict[str, int]


class GenerateQuestionsRequest(BaseModel):
    course_id: str
    topic: Optional[str] = None
    num_questions: int = 5


class MeetingCreate(BaseModel):
    title: str
    description: Optional[str] = None
    course_id: Optional[str] = None
    class_id: Optional[str] = None
    scheduled_at: str
    duration_minutes: int = 60


class EventCreate(BaseModel):
    title: str
    description: Optional[str] = None
    start_time: str
    end_time: Optional[str] = None
    event_type: str = "event"
    course_id: Optional[str] = None


class RoleAction(BaseModel):
    role: str
    action: str  # "add" or "remove"


class CreateUserRequest(BaseModel):
    email: str
    full_name: str
    password: str  # Temporary password set by creator


class ClassCreate(BaseModel):
    name: str
    description: Optional[str] = None
    specialty_id: Optional[str] = None
    year_number: Optional[int] = None


class ClassUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    specialty_id: Optional[str] = None
    year_number: Optional[int] = None


class AddStudentRequest(BaseModel):
    student_id: str


class StudentUpdate(BaseModel):
    full_name: Optional[str] = None
    statut: Optional[str] = None
    photo_url: Optional[str] = None


class StudentDetailsUpdate(BaseModel):
    nom: Optional[str] = None
    prenom: Optional[str] = None
    date_naissance: Optional[str] = None  # ISO AAAA-MM-JJ
    lieu_naissance: Optional[str] = None
    cin: Optional[str] = None
    matricule: Optional[str] = None
    telephone: Optional[str] = None
    email_personnel: Optional[str] = None
    adresse: Optional[str] = None
    bac_annee: Optional[str] = None


class DocumentGenerate(BaseModel):
    type: str  # 'attestation_scolarite' | 'certificat' | 'convocation' | 'releve_notes'
    student_id: str


class ScheduleCreate(BaseModel):
    class_id: Optional[str] = None
    professor_id: Optional[str] = None
    course_id: Optional[str] = None
    room: str
    title: Optional[str] = None
    start_time: str
    end_time: str
    recurrence: str = "once"  # 'once' | 'weekly'


class ScheduleUpdate(BaseModel):
    class_id: Optional[str] = None
    professor_id: Optional[str] = None
    course_id: Optional[str] = None
    room: Optional[str] = None
    title: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    recurrence: Optional[str] = None


# ── Specialties (filières) ──────────────────────────────────────────────────
class SpecialtyCreate(BaseModel):
    name: str


class SpecialtyUpdate(BaseModel):
    name: Optional[str] = None


# ── Attendance ───────────────────────────────────────────────────────────────
class AttendanceEntry(BaseModel):
    student_id: str
    status: str = "present"  # 'present' | 'absent' | 'retard' | 'excuse'


class AttendanceMark(BaseModel):
    entries: list[AttendanceEntry]


# ── Continuous-assessment grade weighting ───────────────────────────────────
class CourseGradeWeightsUpdate(BaseModel):
    exam_weight: int
    devoir_weight: int
    quiz_weight: int


class AnnouncementCreate(BaseModel):
    titre: str
    corps: str
    audience_roles: list[str] = []


class TimetableCreate(BaseModel):
    class_id: str
    academic_year: str
    week_start: str  # date "YYYY-MM-DD", Monday
    week_end: str    # date "YYYY-MM-DD", Friday


class TimetableSlotCreate(BaseModel):
    day_of_week: int    # 0=Lundi .. 4=Vendredi
    start_time: str     # "HH:MM"
    end_time: str       # "HH:MM"
    subject: Optional[str] = None
    slot_type: str = "course"  # 'course' | 'exam'
    professor_id: Optional[str] = None
    room: Optional[str] = None


class TimetableSlotUpdate(BaseModel):
    day_of_week: Optional[int] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    subject: Optional[str] = None
    slot_type: Optional[str] = None
    professor_id: Optional[str] = None
    room: Optional[str] = None


class CategoryCreate(BaseModel):
    name: str


class SupplierCreate(BaseModel):
    company_name: str
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    tax_number: Optional[str] = None
    legal_form: Optional[str] = None
    rib: Optional[str] = None
    bank: Optional[str] = None
    bank_branch: Optional[str] = None
    payment_terms_days: Optional[int] = None
    notes: Optional[str] = None


class SupplierUpdate(BaseModel):
    company_name: Optional[str] = None
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    tax_number: Optional[str] = None
    legal_form: Optional[str] = None
    rib: Optional[str] = None
    bank: Optional[str] = None
    bank_branch: Optional[str] = None
    payment_terms_days: Optional[int] = None
    notes: Optional[str] = None


class PurchaseCreate(BaseModel):
    title: str
    description: Optional[str] = None
    category_id: Optional[str] = None
    supplier_id: Optional[str] = None
    quantity: float = 1
    unit_price: float = 0
    vat_percent: float = 20
    currency: str = "MAD"
    purchase_date: Optional[str] = None
    payment_status: str = "pending"  # 'pending' | 'partially_paid' | 'paid'
    payment_method: Optional[str] = None
    approved_by: Optional[str] = None
    notes: Optional[str] = None


class TemplateGenerate(BaseModel):
    student_id: str


class PurchaseUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category_id: Optional[str] = None
    supplier_id: Optional[str] = None
    quantity: Optional[float] = None
    unit_price: Optional[float] = None
    vat_percent: Optional[float] = None
    currency: Optional[str] = None
    purchase_date: Optional[str] = None
    payment_status: Optional[str] = None
    payment_method: Optional[str] = None
    approved_by: Optional[str] = None
    notes: Optional[str] = None
    purchase_request_id: Optional[str] = None   # lien DA (Phase 2)
    quotation_id: Optional[str] = None           # devis retenu (Phase 2)


# ── Invoices (factures fournisseurs) ─────────────────────────────────────────
class InvoiceCreate(BaseModel):
    invoice_number: str
    supplier_id: Optional[str] = None
    purchase_id: Optional[str] = None
    class_id: Optional[str] = None          # promo rattachée (facturation élève)
    student_id: Optional[str] = None        # élève concerné
    invoice_date: Optional[str] = None
    due_date: Optional[str] = None
    amount: float = 0                       # HT
    vat_percent: float = 20
    payment_status: str = "pending"         # 'pending' | 'partially_paid' | 'paid'


class InvoiceUpdate(BaseModel):
    invoice_number: Optional[str] = None
    supplier_id: Optional[str] = None
    purchase_id: Optional[str] = None
    class_id: Optional[str] = None
    student_id: Optional[str] = None
    invoice_date: Optional[str] = None
    due_date: Optional[str] = None
    amount: Optional[float] = None
    vat_percent: Optional[float] = None
    payment_status: Optional[str] = None


# ── Expenses (dépenses) ──────────────────────────────────────────────────────
class ExpenseCreate(BaseModel):
    title: str
    category_id: Optional[str] = None
    supplier_id: Optional[str] = None
    amount: float = 0
    expense_date: Optional[str] = None
    payment_method: Optional[str] = None
    description: Optional[str] = None


class ExpenseUpdate(BaseModel):
    title: Optional[str] = None
    category_id: Optional[str] = None
    supplier_id: Optional[str] = None
    amount: Optional[float] = None
    expense_date: Optional[str] = None
    payment_method: Optional[str] = None
    description: Optional[str] = None


# ── Budgets (budget prévisionnel par catégorie / année / mois) ───────────────
class BudgetCreate(BaseModel):
    category_id: str
    year: int
    month: Optional[int] = None             # None = budget annuel
    amount: float = 0


class BudgetUpdate(BaseModel):
    category_id: Optional[str] = None
    year: Optional[int] = None
    month: Optional[int] = None
    amount: Optional[float] = None


# ── Revenues (recettes) ──────────────────────────────────────────────────────
class RevenueCreate(BaseModel):
    title: str
    revenue_type: str = "other"             # 'tuition'|'subsidy'|'donation'|'service'|'other'
    category_id: Optional[str] = None
    amount: float = 0                       # HT
    vat_percent: float = 0
    payment_method: Optional[str] = None
    status: str = "received"                # 'expected' | 'received' | 'cancelled'
    revenue_date: Optional[str] = None
    description: Optional[str] = None
    class_id: Optional[str] = None          # promo rattachée (analytique formation)
    student_id: Optional[str] = None        # élève ayant payé (analytique formation)


class RevenueUpdate(BaseModel):
    title: Optional[str] = None
    revenue_type: Optional[str] = None
    category_id: Optional[str] = None
    amount: Optional[float] = None
    vat_percent: Optional[float] = None
    payment_method: Optional[str] = None
    status: Optional[str] = None
    revenue_date: Optional[str] = None
    description: Optional[str] = None
    class_id: Optional[str] = None
    student_id: Optional[str] = None


# ── Phase 2 — Demandes d'achat (DA) & devis ──────────────────────────────────
class PurchaseRequestCreate(BaseModel):
    company: Optional[str] = None
    service: Optional[str] = None
    requester_name: Optional[str] = None
    project: Optional[str] = None
    activity: Optional[str] = None
    justification: Optional[str] = None
    request_type: str = "nouveau_besoin"        # 'nouveau_besoin' | 'renouvellement'
    asset_category: str = "consommable"         # 'consommable'|'equipement'|'locaux'|'service'
    characteristics: Optional[str] = None
    article_code: Optional[str] = None
    quantity: float = 1
    budget_estimate: float = 0
    duration: Optional[str] = None


class PurchaseRequestUpdate(BaseModel):
    company: Optional[str] = None
    service: Optional[str] = None
    requester_name: Optional[str] = None
    project: Optional[str] = None
    activity: Optional[str] = None
    justification: Optional[str] = None
    request_type: Optional[str] = None
    asset_category: Optional[str] = None
    characteristics: Optional[str] = None
    article_code: Optional[str] = None
    quantity: Optional[float] = None
    budget_estimate: Optional[float] = None
    duration: Optional[str] = None
    quote_synthesis: Optional[str] = None
    payment_mode: Optional[str] = None
    payment_terms_days: Optional[int] = None


class DecisionInput(BaseModel):
    decision: str                                # 'validation' | 'retour' | 'annulation'
    comment: Optional[str] = None


class QuoteSelectInput(BaseModel):
    quotation_id: str
    decision: str = "validation"                 # 'validation' | 'retour' | 'annulation'
    comment: Optional[str] = None


class QuotationCreate(BaseModel):
    purchase_request_id: str
    supplier_id: Optional[str] = None
    quote_number: str
    quote_date: Optional[str] = None
    expiration_date: Optional[str] = None
    amount: float = 0
    currency: str = "MAD"
    rank: int = 1


class QuotationUpdate(BaseModel):
    supplier_id: Optional[str] = None
    quote_number: Optional[str] = None
    quote_date: Optional[str] = None
    expiration_date: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    rank: Optional[int] = None


class ClassTuitionUpdate(BaseModel):
    tuition_per_student: float


class TrainerRateUpdate(BaseModel):
    hourly_rate: float
    currency: str = "MAD"
    social_charge_percent: float = 0


# ── Phase 3 — Réceptions, Paiements, Inventaire & Mouvements ───────────────
class PurchaseReceptionCreate(BaseModel):
    purchase_id: str
    received_quantity: float = 1
    quality_status: str = "conforme"  # 'conforme' | 'non_conforme_partiel' | 'non_conforme_total' | 'retourne'
    qhse_checked: bool = False
    inclure_rapport_comptable: bool = False
    validation_cg: bool = False
    comment: Optional[str] = None


class PurchaseReceptionUpdate(BaseModel):
    received_quantity: Optional[float] = None
    quality_status: Optional[str] = None
    qhse_checked: Optional[bool] = None
    inclure_rapport_comptable: Optional[bool] = None
    validation_cg: Optional[bool] = None
    comment: Optional[str] = None


class PurchasePaymentCreate(BaseModel):
    purchase_id: str
    amount: float
    payment_date: Optional[str] = None
    payment_method: str  # 'ov_permanent' | 'ov_ponctuel' | 'cheque' | 'versement' | 'espece' | 'autre'
    reference: Optional[str] = None


class InventoryItemCreate(BaseModel):
    name: str
    asset_category: str  # 'consommable' | 'equipement' | 'locaux' | 'service'
    purchase_id: Optional[str] = None
    reception_id: Optional[str] = None
    initial_value: float = 0
    purchase_date: Optional[str] = None
    status: str = "actif"  # 'actif' | 'hors_service' | 'vendu' | 'perdu'
    amortissement_duree_annees: Optional[int] = None
    niveau_alerte: Optional[float] = None
    quantity: float = 1
    location: Optional[str] = None


class InventoryItemUpdate(BaseModel):
    name: Optional[str] = None
    asset_category: Optional[str] = None
    status: Optional[str] = None
    amortissement_duree_annees: Optional[int] = None
    niveau_alerte: Optional[float] = None
    quantity: Optional[float] = None
    location: Optional[str] = None


class InventoryMovementCreate(BaseModel):
    movement_type: str  # 'entree' | 'sortie' | 'ajustement'
    quantity: float
    movement_date: Optional[str] = None
    description: Optional[str] = None


# ── RH — Employees (Ressources humaines) ──────────────────────────────────────
class EmployeeCreate(BaseModel):
    full_name: str
    cin: Optional[str] = None
    matricule: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    position: Optional[str] = None
    department: Optional[str] = None
    status: str = "active"           # 'active' | 'on-leave' | 'inactive'
    hire_date: Optional[str] = None
    contract_type: Optional[str] = None
    contract_start: Optional[str] = None
    contract_end: Optional[str] = None
    salary: Optional[float] = None
    birth_date: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    nationality: Optional[str] = None
    manager: Optional[str] = None
    cnss_number: Optional[str] = None
    bank_account: Optional[str] = None
    notes: Optional[str] = None


class EmployeeUpdate(BaseModel):
    full_name: Optional[str] = None
    cin: Optional[str] = None
    matricule: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    position: Optional[str] = None
    department: Optional[str] = None
    status: Optional[str] = None
    hire_date: Optional[str] = None
    contract_type: Optional[str] = None
    contract_start: Optional[str] = None
    contract_end: Optional[str] = None
    salary: Optional[float] = None
    birth_date: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    nationality: Optional[str] = None
    manager: Optional[str] = None
    cnss_number: Optional[str] = None
    bank_account: Optional[str] = None
    notes: Optional[str] = None


# ── RH — Leave requests ────────────────────────────────────────────────────────
class LeaveRequestCreate(BaseModel):
    employee_id: str
    type: str = "annual"             # 'annual'|'sick'|'personal'|'maternity'|'paternity'|'unpaid'
    start_date: str
    end_date: str
    days: int
    reason: Optional[str] = None


class LeaveRequestUpdate(BaseModel):
    status: Optional[str] = None     # 'pending' | 'approved' | 'rejected'
    reason: Optional[str] = None
    comment: Optional[str] = None


# ── RH — Payroll ────────────────────────────────────────────────────────────────
class PayrollCreate(BaseModel):
    employee_id: str
    month: int
    year: int
    base_salary: float
    bonuses: float = 0
    deductions: float = 0
    notes: Optional[str] = None


class PayrollUpdate(BaseModel):
    bonuses: Optional[float] = None
    deductions: Optional[float] = None
    status: Optional[str] = None     # 'draft' | 'validated' | 'paid'
    notes: Optional[str] = None


# ── RH — Performance reviews ────────────────────────────────────────────────────
class PerformanceReviewCreate(BaseModel):
    employee_id: str
    period: str
    score: Optional[int] = None      # 1-5
    feedback: Optional[str] = None
    objectives: Optional[str] = None
    achievements: Optional[str] = None
    improvements: Optional[str] = None
    status: str = "draft"            # 'draft' | 'submitted' | 'acknowledged'


class PerformanceReviewUpdate(BaseModel):
    score: Optional[int] = None
    feedback: Optional[str] = None
    objectives: Optional[str] = None
    achievements: Optional[str] = None
    improvements: Optional[str] = None


class GoalCreate(BaseModel):
    employee_id: str
    title: str
    description: Optional[str] = None
    due_date: Optional[str] = None


class GoalUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None      # 'pending' | 'in_progress' | 'done'
    progress: Optional[int] = None    # 0-100
    due_date: Optional[str] = None


class ProbationDecision(BaseModel):
    decision: str                     # 'passed' | 'failed' | 'extended'
    feedback: Optional[str] = None
    extend_days: Optional[int] = None  # required when decision == 'extended'
    status: Optional[str] = None


# ── RH phase 2 — Departments & contract types ──────────────────────────────────
class DepartmentCreate(BaseModel):
    name: str
    description: Optional[str] = None


class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class ContractTypeCreate(BaseModel):
    name: str
    description: Optional[str] = None


class ContractTypeUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


# ── RH phase 2 — Assets ────────────────────────────────────────────────────────
class AssetCreate(BaseModel):
    name: str
    category: Optional[str] = None
    serial_number: Optional[str] = None
    employee_id: Optional[str] = None
    status: str = "available"
    notes: Optional[str] = None


class AssetUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    serial_number: Optional[str] = None
    employee_id: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


# ── RH phase 2 — Onboarding ─────────────────────────────────────────────────────
class OnboardingUpdate(BaseModel):
    phase: Optional[str] = None                # 'day30'|'day60'|'day90'|'completed'
    buddy_name: Optional[str] = None
    buddy_email: Optional[str] = None
    contract_signed: Optional[bool] = None
    plan_30: Optional[list] = None
    plan_60: Optional[list] = None
    plan_90: Optional[list] = None


class PulseSurveyCreate(BaseModel):
    week_number: Optional[int] = None
    satisfaction_score: Optional[int] = None    # 1-5
    integration_score: Optional[int] = None     # 1-5
    clarity_score: Optional[int] = None         # 1-5
    comment: Optional[str] = None


# ── RH phase 2 — Recruitment (ads, candidates, interviews, slots) ──────────────
class JobAdCreate(BaseModel):
    poste: str
    description: Optional[str] = None
    competences: Optional[str] = None
    experience: Optional[str] = None
    contenu: str
    image_url: Optional[str] = None
    is_active: bool = True


class JobAdUpdate(BaseModel):
    poste: Optional[str] = None
    description: Optional[str] = None
    competences: Optional[str] = None
    experience: Optional[str] = None
    contenu: Optional[str] = None
    image_url: Optional[str] = None
    is_active: Optional[bool] = None


class CandidateCreate(BaseModel):
    full_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    position: Optional[str] = None
    notes: Optional[str] = None


class CandidatePromote(BaseModel):
    hire_date: Optional[str] = None
    position: Optional[str] = None
    required_documents: Optional[list[str]] = None
    probation_duration_days: int = 30  # 30 | 60 | 90


class InterviewCreate(BaseModel):
    candidate_id: str
    recruiter_id: Optional[str] = None
    date: str
    start_time: str
    end_time: str
    type: str                                    # 'rh'|'technical'|'final'
    meet_link: Optional[str] = None
    notes: Optional[str] = None
    slot_id: Optional[str] = None


class InterviewUpdate(BaseModel):
    date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    type: Optional[str] = None
    meet_link: Optional[str] = None
    notes: Optional[str] = None


class SlotCreate(BaseModel):
    date: str
    start_time: str
    end_time: str
    ad_id: Optional[str] = None


# ── RH phase 2 — Org chart ──────────────────────────────────────────────────────
class OrgProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    color: str = "#0891b2"


class OrgProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None


class OrgMemberAdd(BaseModel):
    employee_id: str
    role_in_team: Optional[str] = None


class OrgMemberRoleUpdate(BaseModel):
    role_in_team: str


class OrgPositionUpdate(BaseModel):
    x: float
    y: float


# ── RH phase 2 — Training & skills ──────────────────────────────────────────────
class TrainingCreate(BaseModel):
    title: str
    category: str = "technique"
    provider: Optional[str] = None
    duration_hours: int = 0
    cost_dh: float = 0
    description: Optional[str] = None


class TrainingUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    provider: Optional[str] = None
    duration_hours: Optional[int] = None
    cost_dh: Optional[float] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class TrainingAssignmentCreate(BaseModel):
    employee_id: str
    training_id: str
    status: str = "planned"
    notes: Optional[str] = None


class TrainingAssignmentUpdate(BaseModel):
    status: Optional[str] = None
    score: Optional[int] = None
    notes: Optional[str] = None
    completed_at: Optional[str] = None


class SkillCreate(BaseModel):
    name: str
    category: str = "technique"
    description: Optional[str] = None


class SkillUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class EmployeeSkillUpsert(BaseModel):
    employee_id: str
    skill_id: str
    level: str = "beginner"


# ── RH phase 2 — Talent management ──────────────────────────────────────────────
class TalentProfileUpdate(BaseModel):
    performance_score: Optional[int] = None      # 1-5
    potential_score: Optional[int] = None         # 1-5
    flight_risk: Optional[str] = None             # 'low'|'medium'|'high'
    is_critical_position: Optional[bool] = None
    successor_names: Optional[list] = None
    career_path: Optional[str] = None
    next_role: Optional[str] = None
    notes: Optional[str] = None


class OkrCreate(BaseModel):
    title: str
    description: Optional[str] = None
    quarter: Optional[str] = None
    progress: int = 0
    status: str = "active"


class OkrUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    quarter: Optional[str] = None
    progress: Optional[int] = None
    status: Optional[str] = None


class PdiItemCreate(BaseModel):
    title: str
    action_type: str = "formation"
    target_date: Optional[str] = None
    notes: Optional[str] = None


class PdiItemUpdate(BaseModel):
    title: Optional[str] = None
    action_type: Optional[str] = None
    target_date: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None

