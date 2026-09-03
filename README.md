# SNHU Tools

Unofficial interactive academic planning, degree maps, course prerequisite graphs, and transfer equivalency tools for SNHU students.

SNHU Tools brings together three key resources into one unified application:
- **Degree Map** (`/programs`): Interactive prerequisite and requirement visualization for SNHU degree programs based on published catalog data.
- **Course Prerequisites** (`/courses`): Course-level prerequisite relationships and dependencies.
- **Transfer Equivalencies** (`/transfers`): Unofficial institutional and provider transfer course equivalencies.

## Live Site

**[https://snhu-tools.vercel.app](https://snhu-tools.vercel.app)**

## Why This Exists

I built this site as a proud SNHU graduate who wanted a clearer way to understand:

- What courses make up a degree
- How general education, core, major, concentration, and elective requirements fit together
- Which courses may need to be completed before others
- How prerequisite chains can affect degree planning

This site is a planning and visualization aid, not an official degree audit or prescribed plan of study.

## Disclaimer

**This site is unofficial and is intended for informational purposes only.**

- This project is not affiliated with, endorsed by, or operated by Southern New Hampshire University.
- Catalog requirements, prerequisite rules, concentrations, course availability, and academic policies can change.
- Parsed catalog data may be incomplete, delayed, or incorrectly interpreted.
- A displayed graph is not an official recommended course sequence.
- Students must verify requirements against the official SNHU Academic Catalog and with an academic advisor before making academic or financial decisions.

## Local Development

Install dependencies:

```bash
git clone https://github.com/andrewtryder/snhu-tools.git
cd snhu-tools
npm ci
```

Create a `.env` file (see `.env.example`):

```bash
cp .env.example .env
```

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

_Note: Database-backed program pages require a valid PostgreSQL connection and relevant Kuali configuration. Never commit `.env` files or API keys._

## Available Scripts

- `npm run dev` - Start the Next.js development server
- `npm run build` - Create a production build
- `npm run start` - Run the production server
- `npm run lint` - Run ESLint
- `npm run typecheck` - Run TypeScript typecheck (`tsc --noEmit`)
- `npm test` - Run Vitest tests
- `npm run test:watch` - Run Vitest tests in watch mode
- `npm run check` - Canonical full validation (`typecheck` + `lint` + `test` + `build`)
- `npm run check:quick` - Fast local check (`typecheck` + `lint`)
- `npm run db:migrate` - Run database migrations to create or update catalog tables
- `npm run program:bootstrap` - Run an initial catalog import directly to live tables
- `npm run program:sync` - Run the standard catalog synchronization, staging, validation, and promotion process

## Quality Checks

All code changes are validated using the canonical check script:

```bash
npm run check
```

This runs:
1. **TypeScript typecheck** (`tsc --noEmit`)
2. **ESLint** (`eslint`)
3. **Actionlint** (`github-actionlint`)
4. **Vitest test suite** (`vitest run`)
5. **Next.js production build** (`next build`)

Local Git hooks and CI enforce this pipeline:
- **commit-msg**: enforces Conventional Commits via `commitlint`
- **pre-commit**: runs `npm run lint`
- **pre-push**: runs `npm run check`
- **GitHub Actions**: runs `npm run check` on pull requests and pushes to `main`, plus semantic PR title validation

The check requires zero database credentials and must pass before pushing or merging.

## Conventional Commits & Release Process

- **Commit Formatting**: All commits and PR titles must follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:
  - `feat: ...` (SemVer minor)
  - `fix: ...` (SemVer patch)
  - `feat!: ...` or `BREAKING CHANGE:` (SemVer major)
  - `docs: ...`, `ci: ...`, `chore: ...`, `refactor: ...`, `test: ...`, `perf: ...`, `build: ...`
- **Merge Strategy**: PRs are squash-merged to place the validated conventional PR title onto `main`.
- **Release Please**: Automated release workflows track conventional commits on `main`, maintain `CHANGELOG.md`, manage versioning, and generate GitHub Releases and SemVer tags.
- **Deployment Isolation**: Release creation is purely versioning/changelog automation; Vercel Production deployments remain separate and controlled. No npm packages are published (`private: true`).

## Contributing

Contributions, bug reports, and focused pull requests are welcome. Because this application relies on an unstable upstream catalog payload structure, please open an issue before submitting substantial parser, schema, synchronization, or catalog-contract changes.

## License

No open-source license has currently been specified for this project. Copyright remains with the repository owner.
