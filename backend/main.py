import logging
import re
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from deps import FRONTEND_URL
from routers import courses, assignments, exams, meetings, agenda, notifications, users, dashboard
from routers import chatbot, resources, classes
from routers import students, documents, schedules, announcements
from routers import accounting_categories, accounting_suppliers, accounting_purchases
from routers import document_templates
from routers import accounting_invoices, accounting_expenses, accounting_revenues
from routers import accounting_budgets, accounting_dashboard, accounting_analytics
from routers import accounting_purchase_requests, accounting_quotations
from routers import accounting_receptions, accounting_payments, accounting_inventory

app = FastAPI(title="IPISBE Connect API", version="1.0.0")

ALLOWED_ORIGINS = [
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
]
ALLOWED_ORIGIN_REGEX = re.compile(r"https://.*\.vercel\.app")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=ALLOWED_ORIGIN_REGEX.pattern,
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
app.include_router(students.router, prefix="/api")
app.include_router(documents.router, prefix="/api")
app.include_router(schedules.router, prefix="/api")
app.include_router(announcements.router, prefix="/api")
app.include_router(accounting_categories.router, prefix="/api")
app.include_router(accounting_suppliers.router, prefix="/api")
app.include_router(accounting_purchases.router, prefix="/api")
app.include_router(document_templates.router, prefix="/api")
app.include_router(accounting_invoices.router, prefix="/api")
app.include_router(accounting_expenses.router, prefix="/api")
app.include_router(accounting_revenues.router, prefix="/api")
app.include_router(accounting_budgets.router, prefix="/api")
app.include_router(accounting_dashboard.router, prefix="/api")
app.include_router(accounting_analytics.router, prefix="/api")
app.include_router(accounting_purchase_requests.router, prefix="/api")
app.include_router(accounting_quotations.router, prefix="/api")
app.include_router(accounting_receptions.router, prefix="/api")
app.include_router(accounting_payments.router, prefix="/api")
app.include_router(accounting_inventory.router, prefix="/api")


@app.get("/health")
async def health():
    return {"ok": True, "version": "1.0.0"}


# An exception that isn't an HTTPException (e.g. a missing-table DB error)
# propagates past CORSMiddleware entirely: Starlette always runs the outermost
# ServerErrorMiddleware above all user middleware (including CORS), even if you
# register @app.exception_handler(Exception) — Starlette special-cases that
# registration straight into ServerErrorMiddleware, which is *outside* CORS.
# So the 500 response never gets an Access-Control-Allow-Origin header, the
# browser blocks it as a cross-origin failure, and the frontend sees a bare
# "Failed to fetch" instead of the real error. Catching it ourselves in a
# middleware — with CORS headers attached by hand — sidesteps that ordering
# entirely, regardless of where CORSMiddleware sits in the stack.
@app.middleware("http")
async def cors_safe_error_handler(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception:
        logging.exception("Unhandled exception on %s %s", request.method, request.url.path)
        response = JSONResponse(status_code=500, content={"detail": "Internal server error"})
        origin = request.headers.get("origin")
        if origin and (origin in ALLOWED_ORIGINS or ALLOWED_ORIGIN_REGEX.match(origin)):
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Vary"] = "Origin"
        return response
