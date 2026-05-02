import { createContext, useContext, useState, useEffect } from "react";

type Lang = "fr" | "en";

const translations = {
  fr: {
    // Nav
    "nav.dashboard": "Tableau de bord",
    "nav.login": "Se connecter",
    "nav.signup": "S'inscrire",
    "nav.logout": "Déconnexion",
    // Hero (auth page)
    "hero.title1": "Votre espace académique",
    "hero.title2": "tout-en-un.",
    "hero.subtitle":
      "Accédez à vos cours, examens, devoirs et réunions depuis une seule plateforme moderne.",
    // Auth
    "auth.login.title": "Bienvenue 👋",
    "auth.signup.title": "Créer un compte",
    "auth.email": "Adresse e-mail",
    "auth.password": "Mot de passe",
    "auth.fullname": "Nom complet",
    "auth.forgot": "Mot de passe oublié ?",
    "auth.submit_login": "Se connecter",
    "auth.submit_signup": "Créer le compte",
    "auth.no_account": "Pas encore de compte ?",
    "auth.has_account": "Déjà un compte ?",
    "auth.signup_success": "Compte créé ! Vérifiez votre e-mail.",
    "auth.error": "Une erreur est survenue.",
    // Dashboard
    "dash.overview": "Aperçu",
    "dash.courses": "Cours",
    "dash.assignments": "Devoirs",
    "dash.exams": "Examens",
    "dash.agenda": "Agenda",
    "dash.notifications": "Notifications",
    "dash.meetings": "Réunions",
    "dash.users": "Utilisateurs",
    "dash.welcome": "Bienvenue",
    "dash.role.admin": "Administrateur",
    "dash.role.professor": "Professeur",
    "dash.role.student": "Étudiant",
    // Courses
    "courses.subtitle": "Parcourez et gérez vos cours.",
    "courses.create": "Créer un cours",
    "courses.empty": "Aucun cours disponible.",
    "courses.enrolled": "Inscription réussie !",
    "courses.unenrolled": "Désinscription effectuée.",
    "courses.deleted": "Cours supprimé.",
    "courses.title_required": "Le titre est obligatoire.",
    "courses.created": "Cours créé avec succès !",
    "courses.enrolled_label": "Inscrit",
    "courses.enroll": "S'inscrire",
    "courses.unenroll": "Se désinscrire",
    "courses.form.title": "Titre",
    "courses.form.code": "Code",
    "courses.form.credits": "Crédits",
    "courses.form.semester": "Semestre",
    "courses.form.description": "Description",
    "courses.form.color": "Couleur de couverture",
    // Assignments
    "assignments.subtitle": "Vos devoirs et soumissions.",
    "assignments.create": "Créer un devoir",
    "assignments.empty": "Aucun devoir disponible.",
    "assignments.created": "Devoir créé !",
    "assignments.deleted": "Devoir supprimé.",
    "assignments.submitted": "Devoir soumis !",
    "assignments.graded": "Note enregistrée !",
    "assignments.title_required": "Le titre est obligatoire.",
    "assignments.form.title": "Titre",
    "assignments.form.description": "Description",
    "assignments.form.due_date": "Date limite",
    "assignments.form.max_grade": "Note maximale",
    "assignments.form.course": "Cours",
    "assignments.form.content": "Votre réponse",
    "assignments.submit": "Soumettre",
    "assignments.grade": "Corriger",
    "assignments.grade_label": "Note",
    "assignments.feedback": "Commentaire",
    "assignments.save_grade": "Enregistrer la note",
    "assignments.due": "Échéance",
    "assignments.submissions": "soumissions",
    // Exams
    "exams.subtitle": "Gérez et passez vos examens QCM.",
    "exams.create": "Créer un examen",
    "exams.empty": "Aucun examen disponible.",
    "exams.created": "Examen créé !",
    "exams.deleted": "Examen supprimé.",
    "exams.submitted": "Examen soumis !",
    "exams.title_required": "Le titre est obligatoire.",
    "exams.form.title": "Titre",
    "exams.form.description": "Description",
    "exams.form.duration": "Durée (min)",
    "exams.form.start_time": "Date de début",
    "exams.form.course": "Cours",
    "exams.form.questions": "Questions",
    "exams.start": "Commencer l'examen",
    "exams.submit": "Soumettre l'examen",
    "exams.result": "Résultat",
    "exams.score": "Score",
    "exams.time_left": "Temps restant",
    "exams.add_question": "Ajouter une question",
    "exams.question": "Question",
    "exams.option": "Option",
    "exams.correct": "Bonne réponse",
    // Meetings
    "meetings.subtitle": "Réunions en ligne et séances.",
    "meetings.create": "Créer une réunion",
    "meetings.empty": "Aucune réunion planifiée.",
    "meetings.created": "Réunion créée !",
    "meetings.deleted": "Réunion supprimée.",
    "meetings.title_required": "Le titre est obligatoire.",
    "meetings.form.title": "Titre",
    "meetings.form.description": "Description",
    "meetings.form.scheduled_at": "Date et heure",
    "meetings.form.duration": "Durée (min)",
    "meetings.form.course": "Cours",
    "meetings.join": "Rejoindre",
    // Agenda
    "agenda.subtitle": "Votre calendrier d'événements.",
    "agenda.create": "Ajouter un événement",
    "agenda.empty": "Aucun événement.",
    "agenda.created": "Événement ajouté !",
    "agenda.deleted": "Événement supprimé.",
    "agenda.title_required": "Le titre est obligatoire.",
    "agenda.form.title": "Titre",
    "agenda.form.description": "Description",
    "agenda.form.start_time": "Début",
    "agenda.form.end_time": "Fin",
    "agenda.form.type": "Type",
    "agenda.form.course": "Cours",
    // Notifications
    "notifications.subtitle": "Vos notifications.",
    "notifications.empty": "Aucune notification.",
    "notifications.mark_read": "Marquer comme lu",
    "notifications.mark_all_read": "Tout marquer comme lu",
    "notifications.delete": "Supprimer",
    "notifications.unread": "Non lue",
    // Users
    "users.subtitle": "Gestion des utilisateurs.",
    "users.empty": "Aucun utilisateur.",
    "users.role_updated": "Rôle mis à jour.",
    "users.search": "Rechercher…",
    // Common
    "common.save": "Enregistrer",
    "common.cancel": "Annuler",
    "common.delete": "Supprimer",
    "common.edit": "Modifier",
    "common.loading": "Chargement…",
    "common.error": "Erreur",
    "common.yes": "Oui",
    "common.no": "Non",
  },
  en: {
    // Nav
    "nav.dashboard": "Dashboard",
    "nav.login": "Sign in",
    "nav.signup": "Sign up",
    "nav.logout": "Logout",
    // Hero
    "hero.title1": "Your academic workspace,",
    "hero.title2": "all in one place.",
    "hero.subtitle":
      "Access your courses, exams, assignments, and meetings from one modern platform.",
    // Auth
    "auth.login.title": "Welcome back 👋",
    "auth.signup.title": "Create an account",
    "auth.email": "Email address",
    "auth.password": "Password",
    "auth.fullname": "Full name",
    "auth.forgot": "Forgot password?",
    "auth.submit_login": "Sign in",
    "auth.submit_signup": "Create account",
    "auth.no_account": "Don't have an account?",
    "auth.has_account": "Already have an account?",
    "auth.signup_success": "Account created! Check your email.",
    "auth.error": "An error occurred.",
    // Dashboard
    "dash.overview": "Overview",
    "dash.courses": "Courses",
    "dash.assignments": "Assignments",
    "dash.exams": "Exams",
    "dash.agenda": "Calendar",
    "dash.notifications": "Notifications",
    "dash.meetings": "Meetings",
    "dash.users": "Users",
    "dash.welcome": "Welcome",
    "dash.role.admin": "Administrator",
    "dash.role.professor": "Professor",
    "dash.role.student": "Student",
    // Courses
    "courses.subtitle": "Browse and manage your courses.",
    "courses.create": "Create course",
    "courses.empty": "No courses available.",
    "courses.enrolled": "Successfully enrolled!",
    "courses.unenrolled": "Successfully unenrolled.",
    "courses.deleted": "Course deleted.",
    "courses.title_required": "Title is required.",
    "courses.created": "Course created!",
    "courses.enrolled_label": "Enrolled",
    "courses.enroll": "Enroll",
    "courses.unenroll": "Unenroll",
    "courses.form.title": "Title",
    "courses.form.code": "Code",
    "courses.form.credits": "Credits",
    "courses.form.semester": "Semester",
    "courses.form.description": "Description",
    "courses.form.color": "Cover color",
    // Assignments
    "assignments.subtitle": "Your assignments and submissions.",
    "assignments.create": "Create assignment",
    "assignments.empty": "No assignments available.",
    "assignments.created": "Assignment created!",
    "assignments.deleted": "Assignment deleted.",
    "assignments.submitted": "Assignment submitted!",
    "assignments.graded": "Grade saved!",
    "assignments.title_required": "Title is required.",
    "assignments.form.title": "Title",
    "assignments.form.description": "Description",
    "assignments.form.due_date": "Due date",
    "assignments.form.max_grade": "Max grade",
    "assignments.form.course": "Course",
    "assignments.form.content": "Your answer",
    "assignments.submit": "Submit",
    "assignments.grade": "Grade",
    "assignments.grade_label": "Grade",
    "assignments.feedback": "Feedback",
    "assignments.save_grade": "Save grade",
    "assignments.due": "Due",
    "assignments.submissions": "submissions",
    // Exams
    "exams.subtitle": "Manage and take your MCQ exams.",
    "exams.create": "Create exam",
    "exams.empty": "No exams available.",
    "exams.created": "Exam created!",
    "exams.deleted": "Exam deleted.",
    "exams.submitted": "Exam submitted!",
    "exams.title_required": "Title is required.",
    "exams.form.title": "Title",
    "exams.form.description": "Description",
    "exams.form.duration": "Duration (min)",
    "exams.form.start_time": "Start time",
    "exams.form.course": "Course",
    "exams.form.questions": "Questions",
    "exams.start": "Start exam",
    "exams.submit": "Submit exam",
    "exams.result": "Result",
    "exams.score": "Score",
    "exams.time_left": "Time left",
    "exams.add_question": "Add question",
    "exams.question": "Question",
    "exams.option": "Option",
    "exams.correct": "Correct answer",
    // Meetings
    "meetings.subtitle": "Online meetings and sessions.",
    "meetings.create": "Create meeting",
    "meetings.empty": "No meetings scheduled.",
    "meetings.created": "Meeting created!",
    "meetings.deleted": "Meeting deleted.",
    "meetings.title_required": "Title is required.",
    "meetings.form.title": "Title",
    "meetings.form.description": "Description",
    "meetings.form.scheduled_at": "Date & time",
    "meetings.form.duration": "Duration (min)",
    "meetings.form.course": "Course",
    "meetings.join": "Join",
    // Agenda
    "agenda.subtitle": "Your event calendar.",
    "agenda.create": "Add event",
    "agenda.empty": "No events.",
    "agenda.created": "Event added!",
    "agenda.deleted": "Event deleted.",
    "agenda.title_required": "Title is required.",
    "agenda.form.title": "Title",
    "agenda.form.description": "Description",
    "agenda.form.start_time": "Start",
    "agenda.form.end_time": "End",
    "agenda.form.type": "Type",
    "agenda.form.course": "Course",
    // Notifications
    "notifications.subtitle": "Your notifications.",
    "notifications.empty": "No notifications.",
    "notifications.mark_read": "Mark as read",
    "notifications.mark_all_read": "Mark all as read",
    "notifications.delete": "Delete",
    "notifications.unread": "Unread",
    // Users
    "users.subtitle": "User management.",
    "users.empty": "No users found.",
    "users.role_updated": "Role updated.",
    "users.search": "Search…",
    // Common
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.delete": "Delete",
    "common.edit": "Edit",
    "common.loading": "Loading…",
    "common.error": "Error",
    "common.yes": "Yes",
    "common.no": "No",
  },
};

type TranslationKey = keyof (typeof translations)["fr"];

interface I18nContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const STORAGE_KEY = "ipisbe-lang";

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "en" || stored === "fr" ? stored : "fr";
  });

  function setLang(l: Lang) {
    setLangState(l);
    localStorage.setItem(STORAGE_KEY, l);
  }

  function t(key: string): string {
    return (translations[lang] as Record<string, string>)[key] ?? key;
  }

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
