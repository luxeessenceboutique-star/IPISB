"""Jeu de données de démonstration pour le module Comptabilité.

Sert à peupler chaque onglet avec des données fictives présentables, pour
les captures d'écran du manuel de formation PDF. Aucune donnée réelle
d'élève/fournisseur n'est utilisée — tout est inventé (« Fournitures
Pédagogiques SARL », « Salma Benjelloun », montants ronds…).

Prérequis :
  - Backend local lancé : uvicorn main:app --reload --port 9000
  - Compte admin1@ipisb.ma déjà seedé (cf. seed_admins.py)

Usage :
  cd backend && venv\\Scripts\\activate && python seed_accounting_demo.py

Semi-idempotent : les catégories/fournisseurs/local sont réutilisés s'ils
existent déjà (repérage par nom). Les chaînes DA→devis→commande et la
promo de démo sont marquées par un préfixe "[DEMO]" et sautées si déjà
présentes, pour permettre de relancer le script sans tout dupliquer.
"""
import os
import sys
from datetime import date, datetime, timedelta, timezone

import httpx
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
SUPABASE_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]
API_BASE = os.environ.get("SEED_API_BASE", "http://localhost:9000/api")

SEED_ADMIN_EMAIL = "seed.demo.admin@ipisb.ma"
SEED_ADMIN_PASSWORD = "SeedDemo@IPISB2026!"
DEMO_PASSWORD = "Demo@IPISB2026!"

TODAY = date.today()
YEAR = TODAY.year

db = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)  # accès direct (lecture + tables hors API)


def log(msg: str) -> None:
    print(f"[SEED] {msg}")


def iso(d: date) -> str:
    return d.isoformat()


# ── Authentification admin + client HTTP vers l'API réelle ──────────────────
# Utilise un compte admin dédié au seed (plutôt que admin1@ipisb.ma, dont le
# mot de passe réel peut différer de celui documenté dans seed_admins.py —
# on ne veut surtout pas l'écraser).

def ensure_seed_admin() -> None:
    existing = [u for u in db.auth.admin.list_users() if u.email == SEED_ADMIN_EMAIL]
    if existing:
        uid = str(existing[0].id)
    else:
        res = db.auth.admin.create_user({
            "email": SEED_ADMIN_EMAIL, "password": SEED_ADMIN_PASSWORD, "email_confirm": True,
            "user_metadata": {"full_name": "Seed Demo Admin"},
        })
        uid = str(res.user.id)
        db.from_("user_roles").upsert({"user_id": uid, "role": "admin"}).execute()
        log(f"Compte admin dédié au seed créé : {SEED_ADMIN_EMAIL}")
    # Rôles admin/comptabilite/professor/rh sont bloqués tant que
    # profiles.login_approved_at n'est pas renseigné (gate anti-phishing par
    # e-mail, cf. utils/login_approval.py) — on l'auto-approuve ici puisque
    # c'est nous-mêmes qui venons de créer ce compte dédié au seed.
    db.from_("profiles").upsert({
        "id": uid, "email": SEED_ADMIN_EMAIL, "full_name": "Seed Demo Admin",
        "login_approved_at": datetime.now(timezone.utc).isoformat(),
    }).execute()


def get_admin_session():
    ensure_seed_admin()
    auth_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    res = auth_client.auth.sign_in_with_password({"email": SEED_ADMIN_EMAIL, "password": SEED_ADMIN_PASSWORD})
    if not res.session:
        sys.exit("Connexion du compte admin de seed impossible.")
    return res.session.access_token, res.user.id


TOKEN, ADMIN_ID = get_admin_session()
http = httpx.Client(base_url=API_BASE, headers={"Authorization": f"Bearer {TOKEN}"}, timeout=30)


def api(method: str, path: str, **kwargs):
    r = http.request(method, path, **kwargs)
    if r.status_code >= 400:
        raise RuntimeError(f"{method} {path} -> {r.status_code}: {r.text}")
    return r.json() if r.text else None


# ── Catégories & catalogue d'articles ────────────────────────────────────────

def ensure_category(name: str, code: str) -> dict:
    existing = db.from_("accounting_categories").select("*").eq("name", name).execute().data or []
    if existing:
        log(f"Catégorie « {name} » déjà présente — réutilisée.")
        return existing[0]
    cat = api("POST", "/accounting/categories", json={"name": name, "code": code})
    log(f"Catégorie créée : {name}")
    return cat


def ensure_article(category_id: str, code_article: str, article: str, caracteristiques: str, budget_estimate: float) -> dict:
    existing = (
        db.from_("accounting_category_articles").select("*")
        .eq("category_id", category_id).eq("code_article", code_article).execute().data or []
    )
    if existing:
        log(f"Article « {article} » déjà présent — réutilisé.")
        return existing[0]
    art = api("POST", f"/accounting/categories/{category_id}/articles", json={
        "article": article,
        "code_article": code_article,
        "caracteristiques": caracteristiques,
        "budget_estimate": budget_estimate,
    })
    log(f"Article créé : {article}")
    return art


def ensure_supplier(company_name: str, **fields) -> dict:
    existing = db.from_("suppliers").select("*").eq("company_name", company_name).execute().data or []
    if existing:
        log(f"Fournisseur « {company_name} » déjà présent — réutilisé.")
        return existing[0]
    sup = api("POST", "/accounting/suppliers", json={"company_name": company_name, **fields})
    log(f"Fournisseur créé : {company_name}")
    return sup


def ensure_local(name: str, **fields) -> dict:
    existing = db.from_("locaux").select("*").eq("name", name).execute().data or []
    if existing:
        log(f"Local « {name} » déjà présent — réutilisé.")
        return existing[0]
    loc = api("POST", "/accounting/locaux", json={"name": name, **fields})
    log(f"Local créé : {name}")
    return loc


log("=== Catégories & catalogue d'articles ===")
cat_fournitures = ensure_category("Fournitures pédagogiques", "FPED")
cat_informatique = ensure_category("Équipement informatique", "INFO")

art_blouses = ensure_article(
    cat_fournitures["id"], "FPED00001", "Blouses de stage",
    "Blouse blanche 100% coton, tailles S à XL", 4500,
)
art_cahiers = ensure_article(
    cat_fournitures["id"], "FPED00002", "Cahiers d'exercices A4",
    "96 pages, petits carreaux, lot de 100 unités", 1200,
)
art_ordinateur = ensure_article(
    cat_informatique["id"], "INFO00001", "Ordinateur portable formateur",
    "15 pouces, 16 Go RAM, SSD 512 Go", 8500,
)

log("=== Fournisseurs ===")
sup_fournitures = ensure_supplier(
    "Fournitures Pédagogiques SARL",
    contact_person="Karim El Amrani", email="contact@fournitures-pedagogiques.ma",
    phone="0522334455", address="Zone Industrielle, Casablanca",
    tax_number="12345678", legal_form="SARL", bank="Attijariwafa Bank",
    payment_terms_days=30,
)
sup_techno = ensure_supplier(
    "TechnoMaroc Distribution",
    contact_person="Sanae Bennani", email="ventes@technomaroc.ma",
    phone="0522998877", address="Boulevard Zerktouni, Casablanca",
    tax_number="87654321", legal_form="SARL AU",
    payment_terms_days=15,
)

log("=== Local ===")
local_salle = ensure_local("Salle de cours 12", floor="2e", code="S12", capacity=30,
                            note="Salle équipée d'un vidéoprojecteur")


# ── Chaîne Demandes d'achat → devis → commande (3 statuts différents) ───────

def pr_exists(justification: str) -> dict | None:
    rows = db.from_("purchase_requests").select("*").eq("justification", justification).execute().data or []
    return rows[0] if rows else None


log("=== Demandes d'achat (3 statuts) ===")

# PR1 — reste au stade « brouillon »
just1 = "[DEMO] Renouvellement des blouses de stage pour la promotion de septembre"
if pr_exists(just1):
    log("PR1 (brouillon) déjà présente — sautée.")
else:
    api("POST", "/accounting/purchase-requests", json={
        "company": "IPISB", "service": "Pédagogie", "requester_name": "Fatima Zahra Idrissi",
        "project": "Rentrée Septembre 2026", "activity": "Formation Infirmiers polyvalents",
        "justification": just1, "request_type": "renouvellement", "asset_category": "consommable",
        "category_id": cat_fournitures["id"], "characteristics": art_blouses["caracteristiques"],
        "article_code": art_blouses["code_article"], "article_identification": art_blouses["article"],
        "quantity": 30, "budget_estimate": 4500, "comment": "Prévoir un assortiment de tailles S à XL",
    })
    log("PR1 créée (brouillon).")

# PR2 — jusqu'à « devis_valide »
just2 = "[DEMO] Achat de cahiers d'exercices pour les nouveaux élèves"
if pr_exists(just2):
    log("PR2 (devis_valide) déjà présente — sautée.")
else:
    pr2 = api("POST", "/accounting/purchase-requests", json={
        "company": "IPISB", "service": "Pédagogie", "requester_name": "Fatima Zahra Idrissi",
        "project": "Rentrée Septembre 2026", "activity": "Formation Infirmiers polyvalents",
        "justification": just2, "request_type": "nouveau_besoin", "asset_category": "consommable",
        "category_id": cat_fournitures["id"], "characteristics": art_cahiers["caracteristiques"],
        "article_code": art_cahiers["code_article"], "article_identification": art_cahiers["article"],
        "quantity": 100, "budget_estimate": 1200,
    })
    api("POST", f"/accounting/purchase-requests/{pr2['id']}/need-decision", json={"decision": "validation"})
    quote2 = api("POST", "/accounting/quotations", json={
        "purchase_request_id": pr2["id"], "supplier_id": sup_fournitures["id"], "quote_number": "DEV-2026-001",
        "quote_date": iso(TODAY), "expiration_date": iso(TODAY + timedelta(days=30)),
        "amount": 1100, "vat_percent": 20,
    })
    api("POST", f"/accounting/purchase-requests/{pr2['id']}/quote-decision",
        json={"decision": "validation", "quotation_id": quote2["id"]})
    log("PR2 créée jusqu'à devis_valide.")

# PR3 — jusqu'à « commande_emise » (+ réception + facture payée)
just3 = "[DEMO] Achat d'un ordinateur portable pour un formateur"
if pr_exists(just3):
    log("PR3 (commande_emise) déjà présente — sautée (facture/réception non revérifiées).")
else:
    pr3 = api("POST", "/accounting/purchase-requests", json={
        "company": "IPISB", "service": "Pédagogie", "requester_name": "Hicham Berrada",
        "project": "Équipement formateurs 2026", "activity": "Formation Infirmiers polyvalents",
        "justification": just3, "request_type": "nouveau_besoin", "asset_category": "equipement",
        "category_id": cat_informatique["id"], "characteristics": art_ordinateur["caracteristiques"],
        "article_code": art_ordinateur["code_article"], "article_identification": art_ordinateur["article"],
        "quantity": 1, "budget_estimate": 8500,
    })
    api("POST", f"/accounting/purchase-requests/{pr3['id']}/need-decision", json={"decision": "validation"})
    quote3 = api("POST", "/accounting/quotations", json={
        "purchase_request_id": pr3["id"], "supplier_id": sup_techno["id"], "quote_number": "DEV-2026-002",
        "quote_date": iso(TODAY), "expiration_date": iso(TODAY + timedelta(days=30)),
        "amount": 8200, "vat_percent": 20, "delivery_required": False,
    })
    api("POST", f"/accounting/purchase-requests/{pr3['id']}/quote-decision",
        json={"decision": "validation", "quotation_id": quote3["id"]})
    total_incl_vat = float(quote3["amount"]) * 1.20
    api("PUT", f"/accounting/purchase-requests/{pr3['id']}/installments", json={
        "installments": [{
            "label": "Paiement à la livraison", "amount": round(total_incl_vat, 2),
            "payment_mode": "ov_ponctuel", "due_date": iso(TODAY + timedelta(days=15)),
        }],
    })
    purchase3 = api("POST", f"/accounting/purchase-requests/{pr3['id']}/create-order")
    api("POST", f"/accounting/purchases/{purchase3['id']}/validate-order")
    api("POST", "/accounting/receptions", json={
        "purchase_id": purchase3["id"], "received_quantity": 1, "quality_status": "conforme",
        "qhse_checked": True, "inclure_rapport_comptable": True, "validation_cg": True,
        "comment": "Livraison conforme, testé et fonctionnel à la réception",
    })
    api("POST", "/accounting/invoices", json={
        "invoice_number": "FA-2026-0001", "supplier_id": sup_techno["id"], "purchase_id": purchase3["id"],
        "invoice_date": iso(TODAY), "due_date": iso(TODAY + timedelta(days=30)),
        "amount": 8200, "vat_percent": 20, "payment_status": "paid", "payment_date": iso(TODAY),
        "payment_method": "virement", "comment": "Facture ordinateur portable formateur",
    })
    log("PR3 créée jusqu'à commande_emise, avec réception et facture payée.")

log("=== Facture supplémentaire (en attente de paiement) ===")
inv2_existing = db.from_("invoices").select("id").eq("invoice_number", "FA-2026-0002").execute().data or []
if inv2_existing:
    log("Facture FA-2026-0002 déjà présente — sautée.")
else:
    api("POST", "/accounting/invoices", json={
        "invoice_number": "FA-2026-0002", "supplier_id": sup_fournitures["id"],
        "invoice_date": iso(TODAY), "due_date": iso(TODAY + timedelta(days=30)),
        "amount": 1100, "vat_percent": 20, "payment_status": "pending",
        "comment": "Facture cahiers d'exercices — en attente de paiement",
    })
    log("Facture FA-2026-0002 créée (en attente).")

log("=== Recettes ===")
rev1_existing = db.from_("revenues").select("id").eq("title", "[DEMO] Subvention ministère de tutelle").execute().data or []
if rev1_existing:
    log("Recette subvention déjà présente — sautée.")
else:
    api("POST", "/accounting/revenues", json={
        "title": "[DEMO] Subvention ministère de tutelle", "revenue_type": "subsidy",
        "amount": 50000, "vat_percent": 0, "payment_method": "virement", "status": "received",
        "revenue_date": iso(TODAY), "description": "Subvention annuelle de fonctionnement",
    })
    log("Recette subvention créée.")

log("=== Budgets ===")
for cat, amount, label in ((cat_fournitures, 60000, "fournitures pédagogiques"), (cat_informatique, 30000, "équipement informatique")):
    existing = (
        db.from_("budgets").select("id")
        .eq("category_id", cat["id"]).eq("year", YEAR).is_("month", "null").execute().data or []
    )
    if existing:
        log(f"Budget {label} {YEAR} déjà présent — sauté.")
        continue
    api("POST", "/accounting/budgets", json={
        "category_id": cat["id"], "year": YEAR, "amount": amount,
        "comment": f"Budget annuel {label}",
    })
    log(f"Budget {label} {YEAR} créé.")


# ── Promo fictive + élèves + plans de paiement + versements ─────────────────

log("=== Promo & élèves (paiements scolarité) ===")
CLASS_NAME = "[DEMO] Infirmiers Polyvalents — Promo 2026"
existing_class = db.from_("classes").select("*").eq("name", CLASS_NAME).execute().data or []
if existing_class:
    log("Promo de démo déjà présente — sautée (élèves/versements non revérifiés).")
else:
    class_row = db.from_("classes").insert({
        "name": CLASS_NAME, "description": "Promotion 2026 — filière Soins infirmiers",
        "created_by": ADMIN_ID, "tuition_per_student": 1500, "payment_start_month": iso(date(YEAR, 9, 1)),
        "installments_count": 10, "start_date": iso(date(YEAR, 9, 1)), "duration_months": 10, "year_number": 1,
    }).execute().data[0]
    class_id = class_row["id"]

    students = [
        ("etudiant.demo1@ipisb.ma", "Salma Benjelloun", 1500, 1000, "actif"),
        ("etudiant.demo2@ipisb.ma", "Youssef Chraibi", 1500, 1000, "actif"),
        ("etudiant.demo3@ipisb.ma", "Imane Ouazzani", 1500, 800, "actif"),
    ]
    student_ids = []
    for email, full_name, monthly_fee, advance, status in students:
        existing_users = db.auth.admin.list_users()
        match = next((u for u in existing_users if u.email == email), None)
        if match:
            uid = str(match.id)
            log(f"Utilisateur démo {email} déjà présent — réutilisé.")
        else:
            res = db.auth.admin.create_user({
                "email": email, "password": DEMO_PASSWORD, "email_confirm": True,
                "user_metadata": {"full_name": full_name},
            })
            uid = str(res.user.id)
            db.from_("profiles").upsert({"id": uid, "email": email, "full_name": full_name}).execute()
            log(f"Élève démo créé : {full_name}")
        student_ids.append((uid, monthly_fee, advance, status))
        db.from_("class_students").upsert({"class_id": class_id, "student_id": uid}).execute()
        api("PATCH", f"/accounting/tuition/class/{class_id}/student/{uid}/plan", json={
            "monthly_fee": monthly_fee, "advance": advance, "enrollment_status": status,
            "due_day": 5, "grace_days": 5, "payment_comment": "Plan standard",
        })
    log("Plans de paiement affectés aux 3 élèves.")

    # Salma : mensualité de septembre payée intégralement le jour même.
    api("POST", "/accounting/tuition/payment", json={
        "class_id": class_id, "student_id": student_ids[0][0], "period_month": iso(date(YEAR, 9, 1)),
        "amount": 1500, "method": "espece", "paid_on": iso(TODAY),
        "comment": "Versement mensualité septembre",
    })
    # Imane : versement partiel (pour illustrer un statut « partiel »).
    api("POST", "/accounting/tuition/payment", json={
        "class_id": class_id, "student_id": student_ids[2][0], "period_month": iso(date(YEAR, 9, 1)),
        "amount": 800, "method": "virement", "paid_on": iso(TODAY),
        "comment": "Versement partiel mensualité septembre",
    })
    # Youssef : aucun versement — reste en retard pour montrer l'alerte.
    log("Versements créés (Salma payée, Imane partielle, Youssef en retard).")


log("=== Chèque, note de caisse, note de frais de mission ===")
cheque_existing = db.from_("cheques").select("id").eq("cheque_number", "CH-000123").execute().data or []
if cheque_existing:
    log("Chèque CH-000123 déjà présent — sauté.")
else:
    api("POST", "/accounting/cheques", json={
        "direction": "recu", "mode": "cheque", "amount": 1500, "counterparty": "Famille Benjelloun (Salma Benjelloun)",
        "cheque_number": "CH-000123", "bank": "Attijariwafa Bank", "label": "Mensualité scolarité — octobre",
        "issue_date": iso(TODAY), "due_date": iso(TODAY + timedelta(days=7)),
        "comment": "Chèque reçu, à remettre à l'encaissement",
    })
    log("Chèque créé.")

cash_note_existing = (
    db.from_("cash_notes").select("id").eq("beneficiary_name", "Mohammed Alaoui")
    .eq("objet", "Achat de fournitures de bureau").execute().data or []
)
if cash_note_existing:
    log("Note de caisse déjà présente — sautée.")
else:
    api("POST", "/accounting/cash-notes", json={
        "beneficiary_name": "Mohammed Alaoui", "beneficiary_cin": "BE123456",
        "objet": "Achat de fournitures de bureau", "period_from": iso(TODAY), "period_to": iso(TODAY),
        "accorded_by": "Direction administrative",
        "items": [{"article": "Papeterie", "prestataire": "Papeterie Al Amal",
                    "montant_ht": 416.67, "tva_percent": 20, "montant": 500}],
        "nc": "comptable", "caisse": "caisse_sociale", "disbursement_method": "espece",
        "comment": "Avance pour achat urgent de fournitures de bureau",
    })
    log("Note de caisse créée (en attente de validation).")

mission_from = TODAY + timedelta(days=14)
mission_to = mission_from + timedelta(days=2)
mission_note_existing = (
    db.from_("mission_notes").select("id").eq("beneficiary_name", "Nadia Squalli")
    .eq("objet", "Mission de prospection — salon de l'enseignement à Rabat").execute().data or []
)
if mission_note_existing:
    log("Note de frais de mission déjà présente — sautée.")
else:
    days = [iso(mission_from + timedelta(days=i)) for i in range(3)]
    api("POST", "/accounting/mission-notes", json={
        "beneficiary_name": "Nadia Squalli", "beneficiary_cin": "B987654",
        "objet": "Mission de prospection — salon de l'enseignement à Rabat",
        "mission_from": iso(mission_from), "mission_to": iso(mission_to),
        "accorded_by": "Direction générale",
        "days": days,
        "amounts": {"train": [200, 0, 200], "hotel": [0, 450, 0], "repas_forfait": [100, 100, 100]},
        "nc": "comptable", "caisse": "caisse_sociale",
        "comment": "Frais de déplacement et hébergement — salon de l'enseignement",
    })
    log("Note de frais de mission créée (en attente de validation).")


log("=== Inventaire (article supplémentaire) ===")
inv_existing = db.from_("inventory_items").select("id").eq("name", "Chaises de salle de classe").execute().data or []
if inv_existing:
    log("Article d'inventaire déjà présent — sauté.")
else:
    api("POST", "/accounting/inventory", json={
        "name": "Chaises de salle de classe", "asset_category": "equipement", "status": "actif",
        "quantity": 40, "unite": "unité", "prix_unitaire_ttc": 350, "tva_percent": 20,
        "initial_value": 40 * 350, "purchase_date": iso(TODAY), "location": local_salle["name"],
        "caracteristiques": "Chaises empilables, coque plastique renforcée",
    })
    log("Article d'inventaire créé.")


log("=== Journal de caisse / journal des comptes (écritures manuelles) ===")
je1 = db.from_("cash_journal").select("id").eq("action", "[DEMO] Achat de consommables imprimante").execute().data or []
if je1:
    log("Écriture caisse déjà présente — sautée.")
else:
    api("POST", "/accounting/cash-journal", json={
        "entry_date": iso(TODAY), "type": "sortie", "action": "[DEMO] Achat de consommables imprimante",
        "prestataire": "Papeterie Al Amal", "amount": 250, "channel": "caisse", "payment_mode": "especes",
    })
    log("Écriture journal de caisse créée.")

je2 = db.from_("cash_journal").select("id").eq("action", "[DEMO] Virement client — solde facture").execute().data or []
if je2:
    log("Écriture banque déjà présente — sautée.")
else:
    api("POST", "/accounting/cash-journal", json={
        "entry_date": iso(TODAY), "type": "entree", "action": "[DEMO] Virement client — solde facture",
        "prestataire": "Famille Chraibi", "amount": 1500, "channel": "banque", "payment_mode": "virement",
        "payment_ref": "VIR-2026-0456",
    })
    log("Écriture journal des comptes créée.")

log("=== Terminé ===")
