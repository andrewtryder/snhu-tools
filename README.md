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

## Related Projects

- **[SNHU Course Prerequisites Tool](https://github.com/andrewtryder/snhu-courses)** ([Live Site](https://snhu-courses.vercel.app))
- **[SNHU Transfer Equivalency List](https://github.com/andrewtryder/snhu-transfers)** ([Live Site](https://snhu-transfers.vercel.app))

**How they differ:**

- **Degree Map** visualizes requirements within a specific degree program.
- **Courses** explores course-level prerequisite relationships independently of a degree.
- **Transfers** explores unofficial transfer equivalencies from outside providers.

## Local Development

Install dependencies:

```bash
git clone https://github.com/andrewtryder/snhu-degreemap.git
cd snhu-degreemap
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
3. **Vitest test suite** (`vitest run`)
4. **Next.js production build** (`next build`)

Local Git hooks and CI enforce this pipeline:
- **pre-commit**: runs `npm run lint`
- **pre-push**: runs `npm run check`
- **GitHub Actions**: runs `npm run check` on pull requests and pushes to `integration/snhu-tools` and `main`

The check requires zero database credentials and must pass before pushing or merging.

## Contributing

Contributions, bug reports, and focused pull requests are welcome. Because this application relies on an unstable upstream catalog payload structure, please open an issue before submitting substantial parser, schema, synchronization, or catalog-contract changes.

## License

No open-source license has currently been specified for this project. Copyright remains with the repository owner.
