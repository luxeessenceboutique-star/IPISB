export function About() {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-4">
        <div className="grid gap-12 md:grid-cols-2 md:items-center">
          <div>
            <h2 className="font-display text-3xl font-bold md:text-4xl">
              À propos d'IPISBE
            </h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              L'Institut Privé d'Innovation en Santé et Bien-être (IPISBE) est un établissement d'enseignement supérieur spécialisé dans les professions de la santé.
            </p>
            <p className="mt-3 text-muted-foreground leading-relaxed">
              Notre plateforme numérique permet aux étudiants et aux professeurs de gérer l'ensemble du parcours académique : inscriptions, cours, examens, devoirs et communications.
            </p>
            <div className="mt-8 grid grid-cols-3 gap-4 text-center">
              {[
                { value: "500+", label: "Étudiants" },
                { value: "40+", label: "Professeurs" },
                { value: "6", label: "Filières" },
              ].map((stat) => (
                <div key={stat.label} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                  <div className="font-display text-2xl font-bold text-indigo-600">{stat.value}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-3xl bg-gradient-to-br from-indigo-500/10 via-violet-500/10 to-transparent p-1">
            <div className="rounded-[calc(1.5rem-4px)] border border-border bg-card p-8">
              <h3 className="font-display text-lg font-semibold">Notre mission</h3>
              <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-indigo-500">✦</span>
                  Former des professionnels de santé compétents et engagés.
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-violet-500">✦</span>
                  Proposer un enseignement innovant ancré dans la pratique.
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-purple-500">✦</span>
                  Accompagner chaque étudiant vers l'excellence académique.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
