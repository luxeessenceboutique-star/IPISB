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
    questions: list[QuestionCreate] = []


class ExamAnswers(BaseModel):
    answers: dict[str, int]


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


class AddStudentRequest(BaseModel):
    student_id: str


class StudentUpdate(BaseModel):
    full_name: Optional[str] = None
    statut: Optional[str] = None
    photo_url: Optional[str] = None


class DocumentGenerate(BaseModel):
    type: str  # 'attestation_scolarite' | 'certificat' | 'convocation'
    student_id: str


class ScheduleCreate(BaseModel):
    class_id: Optional[str] = None
    professor_id: Optional[str] = None
    room: str
    title: Optional[str] = None
    start_time: str
    end_time: str
    recurrence: str = "once"  # 'once' | 'weekly'


class ScheduleUpdate(BaseModel):
    class_id: Optional[str] = None
    professor_id: Optional[str] = None
    room: Optional[str] = None
    title: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    recurrence: Optional[str] = None


class AnnouncementCreate(BaseModel):
    titre: str
    corps: str
    audience_roles: list[str] = []


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

