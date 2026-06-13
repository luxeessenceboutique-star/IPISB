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
