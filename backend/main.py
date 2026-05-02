from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from deps import FRONTEND_URL
from routers import courses, assignments, exams, meetings, agenda, notifications, users, dashboard

app = FastAPI(title="IPISBE Connect API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        FRONTEND_URL,
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(courses.router, prefix="/api")
app.include_router(assignments.router, prefix="/api")
app.include_router(exams.router, prefix="/api")
app.include_router(meetings.router, prefix="/api")
app.include_router(agenda.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")


@app.get("/health")
async def health():
    return {"ok": True, "version": "1.0.0"}
