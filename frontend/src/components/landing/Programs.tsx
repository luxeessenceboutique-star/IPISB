export function Programs() {
  const programs = [
    { name: "Infirmier(e)", desc: "Formation en soins infirmiers – 3 ans", color: "from-blue-400 to-indigo-600" },
    { name: "Kinésithérapeute", desc: "Rééducation physique et motrice – 4 ans", color: "from-green-400 to-teal-500" },
    { name: "Sage-femme", desc: "Maïeutique et obstétrique – 5 ans", color: "from-pink-400 to-rose-600" },
    { name: "Technicien de lab.", desc: "Analyses biomédicales – 3 ans", color: "from-yellow-400 to-orange-500" },
    { name: "Diététicien(ne)", desc: "Nutrition et bien-être – 3 ans", color: "from-purple-400 to-violet-600" },
    { name: "Radiologue", desc: "Imagerie médicale – 3 ans", color: "from-sky-400 to-cyan-600" },
  ];
  return (
    <section className="bg-muted/30 py-20">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="text-center font-display text-3xl font-bold md:text-4xl">
          Nos programmes
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-center text-muted-foreground">
          Des formations spécialisées dans les métiers de la santé et du bien-être.
        </p>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {programs.map((p) => (
            <div
              key={p.name}
              className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md"
            >
              <div
                className={`h-2 w-2 shrink-0 rounded-full bg-gradient-to-br ${p.color}`}
                style={{ minWidth: 8, minHeight: 8 }}
              />
              <div>
                <h3 className="font-display font-semibold">{p.name}</h3>
                <p className="mt-0.5 text-sm text-muted-foreground">{p.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
