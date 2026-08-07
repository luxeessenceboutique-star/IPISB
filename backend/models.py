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
    formation_id: Optional[str] = None
    trainer_id: Optional[str] = None
    start_date: Optional[str] = None
    duration_months: Optional[int] = None


class ClassUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    formation_id: Optional[str] = None
    trainer_id: Optional[str] = None
    start_date: Optional[str] = None
    duration_months: Optional[int] = None


class FormationCreate(BaseModel):
    name: str
    code: Optional[str] = None
    default_duration_months: Optional[int] = None
    description: Optional[str] = None


class AddStudentRequest(BaseModel):
    student_id: str


class TransferStudentRequest(BaseModel):
    to_class_id: str  # classe cible (doit être de la même filière/formation)


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
    comment: Optional[str] = None


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
    comment: Optional[str] = None


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
    comment: Optional[str] = None


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
    comment: Optional[str] = None


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
    comment: Optional[str] = None


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
    comment: Optional[str] = None


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
    conformity_note: Optional[str] = None
    conformity_criteria: list[str] = []
    article_code: Optional[str] = None
    quantity: float = 1
    budget_estimate: float = 0
    duration: Optional[str] = None
    comment: Optional[str] = None


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
    conformity_note: Optional[str] = None
    conformity_criteria: Optional[list[str]] = None
    article_code: Optional[str] = None
    quantity: Optional[float] = None
    budget_estimate: Optional[float] = None
    duration: Optional[str] = None
    quote_synthesis: Optional[str] = None
    payment_mode: Optional[str] = None
    payment_terms_days: Optional[int] = None
    nc: Optional[str] = None                     # 'noir' | 'comptable'


class DecisionInput(BaseModel):
    decision: str                                # 'validation' | 'retour' | 'annulation'
    comment: Optional[str] = None


class QuoteSelectInput(BaseModel):
    quotation_id: str
    decision: str = "validation"                 # 'validation' | 'retour' | 'annulation'
    comment: Optional[str] = None


# ── Journal de caisse ─────────────────────────────────────────────────────────
class CashJournalEntryCreate(BaseModel):
    entry_date: Optional[str] = None             # défaut = aujourd'hui
    type: str = "sortie"                         # 'entree' | 'sortie'
    action: str
    prestataire: Optional[str] = None
    amount: float = 0                            # DH, valeur positive
    justificatif: Optional[str] = None
    nc: str = "comptable"                        # 'noir' | 'comptable'
    channel: str = "caisse"                      # 'caisse' (espèces) | 'banque' (Journal des comptes)
    payment_mode: Optional[str] = None           # virement|ov_permanent|ov_ponctuel|cheque|prelevement|carte|especes|…
    payment_ref: Optional[str] = None            # n° de chèque / n° d'OV / réf. de virement


class CashJournalEntryUpdate(BaseModel):
    """Modification d'une ligne du journal de caisse (tous champs optionnels)."""
    entry_date: Optional[str] = None
    type: Optional[str] = None                   # 'entree' | 'sortie'
    action: Optional[str] = None
    prestataire: Optional[str] = None
    amount: Optional[float] = None               # DH, valeur positive
    justificatif: Optional[str] = None
    nc: Optional[str] = None                      # 'noir' | 'comptable'
    channel: Optional[str] = None                 # 'caisse' | 'banque'
    payment_mode: Optional[str] = None
    payment_ref: Optional[str] = None


class CashNoteItem(BaseModel):
    """Ligne du tableau d'une note de caisse."""
    article: Optional[str] = None
    prestataire: Optional[str] = None
    montant: float = 0


class CashNoteCreate(BaseModel):
    """Création d'une note de caisse (modèle bébleo « Note de Caisse »)."""
    note_date: Optional[str] = None                 # défaut = aujourd'hui
    beneficiary_name: str                           # Nom et Prénom
    beneficiary_cin: Optional[str] = None           # CIN
    objet: Optional[str] = None                     # Objet de la note
    period_from: Optional[str] = None               # Du ...
    period_to: Optional[str] = None                 # ... au ...
    accorded_by: Optional[str] = None               # Accordée par
    items: list[CashNoteItem] = []                  # [{article, prestataire, montant}]
    nc: str = "comptable"                           # nature journal : 'noir' | 'comptable'
    comment: Optional[str] = None


class CashNoteUpdate(BaseModel):
    """Modification d'une note de caisse (tous champs optionnels)."""
    note_date: Optional[str] = None
    beneficiary_name: Optional[str] = None
    beneficiary_cin: Optional[str] = None
    objet: Optional[str] = None
    period_from: Optional[str] = None
    period_to: Optional[str] = None
    accorded_by: Optional[str] = None
    items: Optional[list[CashNoteItem]] = None
    nc: Optional[str] = None                         # 'noir' | 'comptable'
    comment: Optional[str] = None


class CashNotePay(BaseModel):
    """Exécution du paiement (décaissement) d'une avance de note de caisse approuvée."""
    payment_method: str = "cheque"                   # ov_permanent | ov_ponctuel | cheque | caisse_sociale | autre
    payment_reference: Optional[str] = None          # n° chèque / virement
    payment_date: Optional[str] = None               # défaut = aujourd'hui


class MissionNoteCreate(BaseModel):
    """Création d'une note de frais de mission (modèle bébleo « Note des frais de mission »).
    La matrice est ventilée par thème/article (clés fixes, cf. MISSION_CATALOG) et par jour :
      - days    : dates ordonnées des colonnes (≤ 7)
      - amounts : {clé_article: [montant J1, montant J2, ...]} aligné sur days."""
    note_date: Optional[str] = None                  # défaut = aujourd'hui
    beneficiary_name: str                            # Nom et Prénom
    beneficiary_cin: Optional[str] = None            # CIN
    accompanied_by: Optional[str] = None             # Accompagné par
    objet: Optional[str] = None                      # Objet de mission
    mission_from: Optional[str] = None               # Mission du ...
    mission_to: Optional[str] = None                 # ... au ...
    accorded_by: Optional[str] = None                # Accordée par
    days: list[str] = []                             # ["AAAA-MM-JJ", ...] (≤ 7)
    amounts: dict[str, list[float]] = {}             # {article: [montant par jour]}
    nc: str = "comptable"                            # nature journal : 'noir' | 'comptable'
    comment: Optional[str] = None


class MissionNoteUpdate(BaseModel):
    """Modification d'une note de frais de mission (tous champs optionnels)."""
    note_date: Optional[str] = None
    beneficiary_name: Optional[str] = None
    beneficiary_cin: Optional[str] = None
    accompanied_by: Optional[str] = None
    objet: Optional[str] = None
    mission_from: Optional[str] = None
    mission_to: Optional[str] = None
    accorded_by: Optional[str] = None
    days: Optional[list[str]] = None
    amounts: Optional[dict[str, list[float]]] = None
    nc: Optional[str] = None                          # 'noir' | 'comptable'
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
    comment: Optional[str] = None
    delivery_required: bool = False
    delivery_cost: Optional[float] = None  # None = coût inconnu / à préciser ; 0 = gratuite
    delivery_included: bool = False  # la livraison est-elle déjà comprise dans `amount` ?


class QuotationUpdate(BaseModel):
    supplier_id: Optional[str] = None
    quote_number: Optional[str] = None
    quote_date: Optional[str] = None
    expiration_date: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    rank: Optional[int] = None
    comment: Optional[str] = None
    delivery_required: Optional[bool] = None
    delivery_cost: Optional[float] = None
    delivery_included: Optional[bool] = None


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
    payment_method: str  # 'ov_permanent' | 'ov_ponctuel' | 'cheque' | 'caisse_sociale' | 'autre'
    reference: Optional[str] = None
    comment: Optional[str] = None
    nc: str = "comptable"  # 'noir' | 'comptable' — pour le journal de caisse (non stocké sur le paiement)
    installment_id: Optional[str] = None  # échéance planifiée réglée (échéancier du bon de commande) ; None = hors échéancier


class PurchaseInstallmentIn(BaseModel):
    """Une échéance de l'échéancier prévisionnel d'un bon de commande.
    L'axe n\\c est dérivé côté serveur du mode ('caisse_sociale' → 'noir')."""
    label: Optional[str] = None          # jalon : avance, à la livraison, contrôle qualité, mensualité…
    amount: float = 0
    payment_mode: str = "cheque"         # ov_permanent|ov_ponctuel|cheque|caisse_sociale|autre
    due_date: Optional[str] = None       # échéance prévue (ISO yyyy-mm-dd), nullable


class PurchaseInstallmentsReplace(BaseModel):
    """Remplace l'intégralité de l'échéancier d'un bon de commande."""
    installments: list[PurchaseInstallmentIn] = []


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
    comment: Optional[str] = None


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


# ── Suivi de paiement des élèves (échéancier mensuel + alertes) ────────────
class TuitionPlanUpdate(BaseModel):
    monthly_fee: Optional[float] = None       # mensualité SAISIE (standardisée par promo)
    registration_fee: Optional[float] = None  # (obsolète, remplacé par advance)
    advance: Optional[float] = None           # frais d'inscription (poste séparé, hors budget) — peut être 0
    annual_budget: Optional[float] = None      # dérivé = mensualité × nb_mois (hors frais) — ignoré en écriture
    enrollment_number: Optional[str] = None
    enrollment_date: Optional[str] = None
    enrollment_status: Optional[str] = None  # 'actif'|'abandon'|'absent'|'suspendu'|'diplome'
    payment_comment: Optional[str] = None
    due_day: Optional[int] = None             # jour d'échéance de la mensualité (1..28), par élève
    grace_days: Optional[int] = None          # jours de tolérance après l'échéance (0..27)


class TuitionPlanBulkItem(TuitionPlanUpdate):
    student_id: str


class TuitionPlanBulkUpdate(BaseModel):
    updates: list[TuitionPlanBulkItem]


class ClassScheduleUpdate(BaseModel):
    payment_start_month: Optional[str] = None  # 1er du mois (ex. '2024-09-01')
    installments_count: Optional[int] = None


class TuitionPaymentCreate(BaseModel):
    class_id: str
    student_id: str
    period_month: str  # mois d'imputation (normalisé au 1er du mois côté router)
    amount: float = 0
    method: Optional[str] = None
    note: Optional[str] = None
    paid_on: Optional[str] = None
    comment: Optional[str] = None
    receipt_reference: Optional[str] = None


class TuitionPaymentUpdate(BaseModel):
    period_month: Optional[str] = None
    amount: Optional[float] = None
    method: Optional[str] = None
    note: Optional[str] = None
    paid_on: Optional[str] = None
    receipt_reference: Optional[str] = None


# ── Validation N+1 (file d'attente des saisies caissier) ───────────────────
class ApprovalReject(BaseModel):
    comment: str  # motif du rejet (obligatoire)


# ── Registre des règlements bancaires (migrations l37, l38) ─────────────────
class ChequeCreate(BaseModel):
    """Saisie manuelle d'une pièce au registre."""
    direction: str = "recu"                  # 'emis' (établi par l'école) | 'recu'
    mode: str = "cheque"                     # cheque|versement|virement|ov_permanent|ov_ponctuel
    amount: float = 0
    counterparty: Optional[str] = None       # bénéficiaire (émis) | tireur (reçu)
    cheque_number: Optional[str] = None
    bank: Optional[str] = None
    label: Optional[str] = None              # objet du chèque
    issue_date: Optional[str] = None         # défaut = aujourd'hui
    due_date: Optional[str] = None           # échéance / remise prévue
    comment: Optional[str] = None


class ChequeUpdate(BaseModel):
    """Complète ou corrige un chèque (le statut se change via /status)."""
    counterparty: Optional[str] = None
    cheque_number: Optional[str] = None
    bank: Optional[str] = None
    label: Optional[str] = None
    issue_date: Optional[str] = None
    due_date: Optional[str] = None
    remitted_date: Optional[str] = None      # « déposé le » — corrigeable après coup
    comment: Optional[str] = None


class ChequeStatusUpdate(BaseModel):
    """Avancement dans le cycle de vie : remis | encaisse | impaye | annule."""
    status: str
    date: Optional[str] = None               # date d'encaissement / d'impayé / nouvelle échéance
    comment: Optional[str] = None

