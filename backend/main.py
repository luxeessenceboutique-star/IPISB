from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from deps import FRONTEND_URL
from routers import courses, assignments, exams, meetings, agenda, notifications, users, dashboard
from routers import chatbot, resources, classes

app = FastAPI(title="IPISBE Connect API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        FRONTEND_URL,
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:5176",
        "http://localhost:5177",
        "http://localhost:5178",
        "http://localhost:5179",
        "http://localhost:5180",
        "http://localhost:5181",
        "http://localhost:5182",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",
        "http://127.0.0.1:5176",
        "http://127.0.0.1:5177",
        "http://127.0.0.1:5178",
        "http://127.0.0.1:5179",
        "http://127.0.0.1:5180",
        "http://127.0.0.1:5181",
        "http://127.0.0.1:5182",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
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
app.include_router(chatbot.router, prefix="/api")
app.include_router(resources.router, prefix="/api")
app.include_router(classes.router, prefix="/api")


@app.get("/health")
async def health():
    return {"ok": True, "version": "1.0.0"}
