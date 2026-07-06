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
    notes: Optional[str] = None


class SupplierUpdate(BaseModel):
    company_name: Optional[str] = None
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    tax_number: Optional[str] = None
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
