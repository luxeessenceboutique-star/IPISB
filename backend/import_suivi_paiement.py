"""Agent d'import du « Suivi paiement » des stagiaires.

Lit suivi_paiement_nettoye.json (produit par le nettoyage du classeur Excel) et charge dans la
plateforme : 1 promo par (filière, année), les stagiaires de chaque promo, leur plan de paiement
(mensualité, frais d'inscription, statut) et leurs versements.

Idempotent : on peut le relancer sans créer de doublons (compte retrouvé par e-mail, promo par
nom, versements importés repérés par leur note). Par défaut c'est un ESSAI À BLANC — rien n'est
écrit en base ; ajouter --apply pour exécuter.

    cd backend && venv\\Scripts\\python.exe import_suivi_paiement.py            # essai à blanc
    cd backend && venv\\Scripts\\python.exe import_suivi_paiement.py --apply    # écriture

Règles (voir aussi routers/accounting_tuition.py) :
  • mensualité = colonne « Mensualité » ; mode « annuel » → budget ÷ nb de mensualités.
  • frais d'inscription (advance) = Budget − mensualité × nb de mensualités (≥ 0). Ils sont un poste
    séparé : ils ne comptent pas dans le « Total payé » de la page Suivi scolarité.
  • versements = Total payé − frais d'inscription, répartis mois par mois à partir du mois de
    départ de la promo (une mensualité par mois, le reste sur le dernier mois entamé).
  • statut : P → actif, A → abandon. Les lignes « DB » (statut inconnu) sont ignorées.
Les comptes créés n'ont PAS de connexion utilisable (e-mail @ipisb.local, mot de passe aléatoire).
"""
import argparse
import json
import re
import secrets
import sys
from datetime import date
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

NB_INSTALLMENTS = 11          # septembre → juillet
SCHOOL_YEAR_START = date(2026, 9, 1)   # le classeur « Suivi paiement » couvre l'année scolaire 2026/2027 pour TOUTES les promos
EMAIL_DOMAIN = "ipisb.local"
IMPORT_NOTE = "Import suivi paiement"
SPECIALTY_ALIASES = {         # libellé du fichier → mots à chercher dans specialties.name
    "Infirmier polyvalent": "polyvalent",
    "Infirmier auxiliaire": "auxiliaire",
    "Aide-soignant": "soignant",
}


def add_months(d: date, n: int) -> date:
    m = d.month - 1 + n
    return date(d.year + m // 12, m % 12 + 1, 1)


def email_for(enr: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", enr.lower()).strip("-") + "@" + EMAIL_DOMAIN


def plan_for(row: dict) -> dict:
    budget = row.get("budget") or 0.0
    fee = row.get("mensualite")
    if row["mode_paiement"] == "annuel" or not fee:
        fee = round(budget / NB_INSTALLMENTS, 2)
    advance = round(max(0.0, budget - fee * NB_INSTALLMENTS), 2) if row["mode_paiement"] == "mensuel" else 0.0
    if row["mode_paiement"] == "mensuel" and budget < fee * NB_INSTALLMENTS - 0.5:
        fee = round(budget / NB_INSTALLMENTS, 2)     # budget partiel (solde d'une année précédente)
        advance = 0.0
    paid = row.get("total_paye") or 0.0
    return {"monthly_fee": fee, "advance": advance, "paid_monthly": round(max(0.0, paid - advance), 2)}


def split_payments(amount: float, fee: float, start: date) -> list[tuple[date, float]]:
    out, left, i = [], amount, 0
    while left > 0.004 and i < NB_INSTALLMENTS + 12 and fee > 0:
        part = round(min(fee, left), 2)
        out.append((add_months(start, i), part))
        left = round(left - part, 2)
        i += 1
    if left > 0.004:
        if out:
            out[-1] = (out[-1][0], round(out[-1][1] + left, 2))
        else:
            out.append((start, left))          # mensualité inconnue : un seul versement
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="écrire en base (sinon essai à blanc)")
    ap.add_argument("--file", default=str(Path(__file__).resolve().parent.parent / "suivi_paiement_nettoye.json"))
    ap.add_argument("--rebuild-payments", action="store_true", help="supprimer puis recréer les versements issus d'un import précédent")
    ap.add_argument("--include-unknown", action="store_true", help="importer aussi les lignes « DB »")
    args = ap.parse_args()
    rows = json.load(open(args.file, encoding="utf-8"))

    from deps import get_db
    db = get_db()
    apply = args.apply
    print(("== APPLICATION ==" if apply else "== ESSAI À BLANC (rien n'est écrit) ==") + f"  {len(rows)} lignes dans le fichier")

    admins = db.from_("user_roles").select("user_id").eq("role", "admin").execute().data or []
    admin_id = admins[0]["user_id"] if admins else None
    specialties = db.from_("specialties").select("id,name").execute().data or []
    classes = {c["name"]: c for c in db.from_("classes").select("id,name").execute().data or []}
    profiles_by_email = {p["email"]: p["id"] for p in db.from_("profiles").select("id,email").execute().data or [] if p.get("email")}

    def spec_id(filiere: str):
        key = SPECIALTY_ALIASES.get(filiere, filiere).lower()
        hit = [s for s in specialties if key in (s["name"] or "").lower()]
        return hit[0]["id"] if hit else None

    stats = dict(classes_new=0, users_new=0, users_existing=0, members_new=0, payments_new=0, skipped=0)
    skipped = []
    by_class: dict[str, list[dict]] = {}
    for r in rows:
        if r["code"] == "DB" and not args.include_unknown:
            stats["skipped"] += 1
            skipped.append((r["nom"], "code DB (statut inconnu)"))
            continue
        by_class.setdefault(f"{r['filiere']} — Promo {r['promo']}", []).append(r)

    for cname, members in sorted(by_class.items()):
        sample = members[0]
        start = SCHOOL_YEAR_START
        cls = classes.get(cname)
        if cls is None:
            stats["classes_new"] += 1
            print(f"+ promo « {cname} » ({len(members)} stagiaires, départ {start}) spécialité={'oui' if spec_id(sample['filiere']) else 'NON TROUVÉE'}")
            if apply:
                cls = db.from_("classes").insert({
                    "name": cname, "specialty_id": spec_id(sample["filiere"]), "start_date": date(sample["promo"], 9, 1).isoformat(),
                    "payment_start_month": start.isoformat(), "installments_count": NB_INSTALLMENTS,
                    "created_by": admin_id,
                }).execute().data[0]
                classes[cname] = cls
        else:
            print(f"= promo « {cname} » existe déjà (échéancier recalé sur {start})")
            if apply:
                db.from_("classes").update({"payment_start_month": start.isoformat(), "installments_count": NB_INSTALLMENTS}).eq("id", cls["id"]).execute()
                if args.rebuild_payments:   # supprime UNIQUEMENT les versements créés par cet import
                    db.from_("tuition_payments").delete().eq("class_id", cls["id"]).eq("note", IMPORT_NOTE).execute()
        cid = cls["id"] if cls else None
        existing_members = set()
        if cid:
            existing_members = {m["student_id"] for m in db.from_("class_students").select("student_id").eq("class_id", cid).execute().data or []}

        for r in members:
            email = email_for(r["n_inscription"])
            plan = plan_for(r)
            sid = profiles_by_email.get(email)
            if sid:
                stats["users_existing"] += 1
            else:
                stats["users_new"] += 1
                if apply:
                    res = db.auth.admin.create_user({"email": email, "password": secrets.token_urlsafe(24), "email_confirm": True,
                                                     "user_metadata": {"full_name": r["nom"].title()}})
                    sid = str(res.user.id)
                    upd = db.from_("profiles").update({"full_name": r["nom"].title(), "created_by": admin_id}).eq("id", sid).execute()
                    if not upd.data:
                        db.from_("profiles").insert({"id": sid, "email": email, "full_name": r["nom"].title(), "created_by": admin_id}).execute()
                    db.from_("user_roles").upsert([{"user_id": sid, "role": "student"}], on_conflict="user_id,role").execute()
                    profiles_by_email[email] = sid
            payload = {
                "monthly_fee": plan["monthly_fee"], "advance": plan["advance"], "annual_budget": round(plan["monthly_fee"] * NB_INSTALLMENTS, 2),
                "enrollment_number": r["n_inscription"], "enrollment_date": r["date_inscription"],
                "enrollment_status": r["statut"] or "actif", "payment_comment": r["commentaire"],
            }
            if sid and sid in existing_members:
                if apply:
                    db.from_("class_students").update(payload).eq("class_id", cid).eq("student_id", sid).execute()
            else:
                stats["members_new"] += 1
                if apply and sid and cid:
                    db.from_("class_students").insert({"class_id": cid, "student_id": sid, **payload}).execute()
            # versements
            already = 0
            if apply and sid and cid:
                already = len(db.from_("tuition_payments").select("id").eq("class_id", cid).eq("student_id", sid).eq("note", IMPORT_NOTE).execute().data or [])
            if not already:
                for month, amount in split_payments(plan["paid_monthly"], plan["monthly_fee"], start):
                    stats["payments_new"] += 1
                    if apply and sid and cid:
                        db.from_("tuition_payments").insert({
                            "class_id": cid, "student_id": sid, "period_month": month.isoformat(), "amount": amount,
                            "paid_on": month.isoformat(), "note": IMPORT_NOTE, "created_by": admin_id,
                        }).execute()

    print("\nRésumé :", stats)
    for n, why in skipped:
        print("  ignoré :", n, "—", why)
    if not apply:
        print("\nEssai à blanc terminé. Relancer avec --apply pour écrire en base.")


if __name__ == "__main__":
    main()
