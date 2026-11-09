# SNHU Tools

**Unofficial interactive academic planning, degree maps, course prerequisite graphs, and transfer equivalency tools for Southern New Hampshire University (SNHU) students.**

🌐 **Live Site:** [https://snhu-tools.vercel.app](https://snhu-tools.vercel.app)

---

![SNHU Tools Degree Map Preview](./public/home/computer-science-degree-map-preview.webp)
*Interactive degree map preview showing course nodes, branching prerequisite paths, and program requirements.*

---

## What is SNHU Tools?

Planning a college degree shouldn't feel like deciphering a hundred-page catalog. **SNHU Tools** brings together published course requirements, prerequisite dependency trees, and transfer policies into one fast, easy-to-use visual web app:

* 🗺️ **[Degree Maps](https://snhu-tools.vercel.app/programs)**: Explore undergraduate and graduate programs as interactive visual roadmaps. Clearly see how general education, major courses, concentrations, and electives connect, plus which courses unlock later capstones.
* 📚 **[Course Prerequisites](https://snhu-tools.vercel.app/courses)**: Look up any course (such as `CS210`, `MAT140`, or `ENG122`) to view full descriptions, credit counts, required prerequisites, and the entire chain of courses it leads into.
* 🔄 **[Transfer Equivalencies](https://snhu-tools.vercel.app/transfers)**: Search unofficial credit transfers from hundreds of colleges and popular ACE/NCCRS credit providers (Sophia Learning, Study.com, CLEP, AP, StraighterLine) to see how external coursework maps to SNHU equivalents.
* 🔎 **[Instant Search](https://snhu-tools.vercel.app/search)**: Quickly search across all degree programs, course codes, titles, and transfer subjects with immediate keyboard-friendly suggestions.

---

## Why This Exists

As a proud SNHU graduate, I built this site to solve a challenge almost every student faces: **visualizing the path to graduation**.

When planning terms, it can be tough to see:
* How major courses, concentrations, and electives fit together
* Which courses must be taken in sequence due to strict prerequisite chains
* How external or transfer credits can satisfy degree requirements ahead of time
* What courses become available once a particular class is completed

This tool turns static catalog tables into an interactive, visual roadmap so students can make informed, confident choices with their academic plans.

---

## How to Use It

1. **Find Your Degree:** Head to the [Programs directory](https://snhu-tools.vercel.app/programs) and select your degree level (Bachelor's, Associate, Master's, or Certificate).
2. **Explore the Map:** Use the interactive canvas to zoom, pan, and click on any course node. Related prerequisites and dependent courses highlight automatically.
3. **Plan Around Prerequisites:** Identify bottleneck courses early so prerequisite sequences don't delay your graduation timeline.
4. **Check Transfer Credits:** Check the [Transfers directory](https://snhu-tools.vercel.app/transfers) to see how prior learning or online ACE courses might transfer into your program.

---

## Important Disclaimer

> [!IMPORTANT]
> **This site is an unofficial, independent student resource and is not affiliated with, operated by, or endorsed by Southern New Hampshire University.**
> 
> * Catalog rules, prerequisite requirements, course availability, and transfer policies change regularly.
> * Visual graphs and equivalency charts are planning aids, not official degree audits or prescribed sequences of study.
> * Always verify your academic plan with your official **SNHU Academic Advisor** and consult the official **SNHU Academic Catalog** before registering or making academic or financial commitments.

---

<details>
<summary>🛠️ <strong>For Developers & Contributors (Click to expand)</strong></summary>

### Tech Stack
* **Framework:** [Next.js](https://nextjs.org/) (App Router, Turbopack) & [React 19](https://react.dev/)
* **Graph Visualization:** [@xyflow/react](https://reactflow.dev/) (React Flow) & Dagre layout engine
* **Styling:** [Tailwind CSS v4](https://tailwindcss.com/)
* **Database & Storage:** PostgreSQL (Neon Serverless) & Drizzle ORM
* **Testing & Quality:** Vitest, Testing Library, TypeScript, ESLint, Actionlint

### Running Locally
```bash
git clone https://github.com/andrewtryder/snhu-tools.git
cd snhu-tools
npm ci
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Quality Validation
Before committing or creating a pull request, verify tests and builds:
```bash
npm run check:quick  # Fast local check: typecheck + lint
npm run check        # Full check: clean + typecheck + lint + tests + build
```

See [docs/operations.md](docs/operations.md) for data sync and snapshot operational details.

</details>

---

## License

This project is open source and available under the [MIT License](LICENSE).
