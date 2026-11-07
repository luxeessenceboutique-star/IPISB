# Run this script ONCE to seed the two IPISB admin accounts.
#   SEED_ADMIN_PASSWORD=<mot de passe fort, 12+ caractères> python seed_admins.py
# Le mot de passe n'est JAMAIS écrit dans le code ni affiché. Refus en production
# sauf SEED_ALLOW_PRODUCTION=1 (premier amorçage voulu).
import os
import sys
from datetime import datetime, timezone
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

if os.environ.get("ENV", "").lower() == "production" and os.environ.get("SEED_ALLOW_PRODUCTION") != "1":
    sys.exit("Refus : ENV=production. Définir SEED_ALLOW_PRODUCTION=1 pour un amorçage volontaire.")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

SEED_ADMIN_PASSWORD = os.environ.get("SEED_ADMIN_PASSWORD", "")
if len(SEED_ADMIN_PASSWORD) < 12:
    sys.exit("Définir SEED_ADMIN_PASSWORD (12 caractères minimum) dans l'environnement.")

db = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

ADMINS = [
    {"email": "admin1@ipisb.ma", "password": SEED_ADMIN_PASSWORD, "full_name": "Admin IPISB 1"},
    {"email": "admin2@ipisb.ma", "password": SEED_ADMIN_PASSWORD, "full_name": "Admin IPISB 2"},
]


def seed_admin(email: str, password: str, full_name: str):
    # Check if user already exists by listing auth users and filtering by email
    try:
        existing = db.auth.admin.list_users()
        existing_emails = {u.email for u in existing}
        if email in existing_emails:
            print(f"[SKIP] {email} already exists — skipping.")
            return
    except Exception as e:
        print(f"[WARN] Could not list users to check existence: {e}")

    # Create auth user
    try:
        res = db.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {"full_name": full_name},
        })
    except Exception as e:
        print(f"[ERROR] Failed to create auth user for {email}: {e}")
        return

    user = res.user
    if user is None:
        print(f"[ERROR] No user returned for {email}")
        return

    uid = str(user.id)
    now = datetime.now(timezone.utc).isoformat()

    # Upsert profile
    try:
        db.from_("profiles").upsert({
            "id": uid,
            "email": email,
            "full_name": full_name,
            "created_at": now,
        }).execute()
    except Exception as e:
        print(f"[ERROR] Failed to insert profile for {email}: {e}")
        return

    # Assign admin role (ignore if already exists)
    try:
        db.from_("user_roles").upsert({
            "user_id": uid,
            "role": "admin",
        }).execute()
    except Exception as e:
        print(f"[ERROR] Failed to assign admin role for {email}: {e}")
        return

    print(f"[OK] Created admin account: {email}")


if __name__ == "__main__":
    print("Seeding IPISB admin accounts...")
    for admin in ADMINS:
        seed_admin(**admin)
    print("Done.")
