import { describe, it, expect } from "vitest";
import {
  parseProgramDetail,
  parseDirectAssessmentTree,
  extractCourseReferences,
  mapTitleToGroupCategory,
} from "@/lib/kualiParser";
import { transformPrograms, ProgramExportInput } from "@/lib/static-export/programs";
import cbeProgramsFixture from "@/data/fixtures/cbe-programs.sample.json";
import sampleCsProgram from "@/data/fixtures/computer-science-program.sample.json";

describe("Direct Assessment CBE Parser", () => {
  const expectedTotals: Record<string, number> = {
    ryhJltQRI: 24, // Business Operations Certificate
    H1pYI4BZQ: 120, // Management BA
    ryX_U4rWQ: 60, // Healthcare Management AA
    rJUTINrWQ: 120, // Communications BA
    "HJi-S-QHee": 24, // Medical Office Administration Certificate
    r1G9UNSbm: 60, // General Studies AA
    "SJ2tLNH-7": 120, // Healthcare Management BA
  };

  it("parses all seven Direct Assessment CBE programs with nonempty requirement groups", () => {
    expect(cbeProgramsFixture).toHaveLength(7);

    for (const raw of cbeProgramsFixture) {
      const parsed = parseProgramDetail(raw);

      expect(parsed.sourcePid).toBe(raw.pid);
      expect(parsed.title).toBe(raw.title);
      expect(parsed.slug).toBeDefined();
      expect(parsed.requirementGroups.length).toBeGreaterThan(0);
      expect(parsed.warnings.filter((w) => w.code.includes("MISMATCH"))).toHaveLength(0);
    }
  });

  it("reconciles exact source-defined credit totals for all seven programs", () => {
    for (const raw of cbeProgramsFixture) {
      const parsed = parseProgramDetail(raw);
      const expectedTotal = expectedTotals[raw.pid];

      expect(parsed.totalCredits).toBe(expectedTotal);

      // Verify that the sum of group minimum credits reconciles to expected total
      const groupCreditsSum = parsed.requirementGroups.reduce(
        (sum, g) => sum + (g.minimumCredits ?? 0),
        0
      );
      expect(groupCreditsSum).toBe(expectedTotal);
    }
  });

  it("preserves competency identifiers, titles, and intact formatting", () => {
    // Check Business Operations Certificate
    const bop = parseProgramDetail(
      cbeProgramsFixture.find((p) => p.pid === "ryhJltQRI")!
    );
    const bopGroup = bop.requirementGroups[0];
    expect(bopGroup.courseRequirements).toHaveLength(24);
    expect(bopGroup.courseRequirements[0].courseCode).toBe("ENG10007");
    expect(bopGroup.courseRequirements[0].title).toBe("Analyze texts to draw meaningful conclusions");
    expect(bopGroup.courseRequirements[0].credits).toBe(1);

    // Check Medical Office Administration Certificate (handles HTML tags like <u></u> inside list items)
    const moa = parseProgramDetail(
      cbeProgramsFixture.find((p) => p.pid === "HJi-S-QHee")!
    );
    const moaGroup = moa.requirementGroups[0];
    expect(moaGroup.courseRequirements).toHaveLength(24);
    expect(moaGroup.courseRequirements[0].courseCode).toBe("BUS20064");
    expect(moaGroup.courseRequirements[0].title).toContain("Utilize information from industry");
    expect(moaGroup.courseRequirements[0].credits).toBe(1);

    // Check Healthcare Management BA with spaced course codes (e.g. COM 20091)
    const hcmBa = parseProgramDetail(
      cbeProgramsFixture.find((p) => p.pid === "SJ2tLNH-7")!
    );
    const hcmMajor = hcmBa.requirementGroups.find((g) => g.category === "major");
    expect(hcmMajor).toBeDefined();
    expect(hcmMajor!.courseRequirements[0].courseCode).toBe("COM 20091");
    expect(hcmMajor!.courseRequirements[0].credits).toBe(1);
  });

  it("preserves source-defined groupings without double-counting embedded associate degrees", () => {
    const mgmtBa = parseProgramDetail(
      cbeProgramsFixture.find((p) => p.pid === "H1pYI4BZQ")!
    );

    expect(mgmtBa.requirementGroups).toHaveLength(3);

    // Group 1: Associate degree transfer / equivalent milestone
    const aaGroup = mgmtBa.requirementGroups[0];
    expect(aaGroup.title).toBe("AA.GSU or Equivalent");
    expect(aaGroup.category).toBe("core");
    expect(aaGroup.minimumCredits).toBe(60);
    expect(aaGroup.courseRequirements).toHaveLength(0);
    expect(aaGroup.textRequirements).toContain("AA.GSU or Equivalent: 60 Total Credits");

    // Group 2: BA Major Competencies
    const majorGroup = mgmtBa.requirementGroups[1];
    expect(majorGroup.title).toBe("BA Management Competencies");
    expect(majorGroup.category).toBe("major");
    expect(majorGroup.minimumCredits).toBe(51);
    expect(majorGroup.courseRequirements).toHaveLength(51);

    // Group 3: Concentration rule
    const concGroup = mgmtBa.requirementGroups[2];
    expect(concGroup.title).toBe("Concentration Competencies");
    expect(concGroup.category).toBe("elective");
    expect(concGroup.ruleType).toBe("concentration");
    expect(concGroup.minimumCredits).toBe(9);
    expect(concGroup.textRequirements).toContain("Students must select a concentration.");

    // Grand total: 60 + 51 + 9 = 120
    expect(mgmtBa.totalCredits).toBe(120);
  });

  it("does not create catalog course references or links for CBE competencies", () => {
    for (const raw of cbeProgramsFixture) {
      const parsed = parseProgramDetail(raw);
      const refs = extractCourseReferences(parsed);

      // CBE competencies (5-digit IDs, no Kuali catalog PID) must NOT be extracted as conventional catalog course references
      expect(refs).toEqual([]);
    }

    // Contrast with conventional Computer Science program which HAS course references
    const csProg = parseProgramDetail(sampleCsProgram);
    const csRefs = extractCourseReferences(csProg);
    expect(csRefs.length).toBeGreaterThan(0);
  });

  it("categorizes CBE section headings accurately via mapTitleToGroupCategory", () => {
    expect(mapTitleToGroupCategory("General Education Competencies")).toBe("gened");
    expect(mapTitleToGroupCategory("AA.GSU or Equivalent")).toBe("core");
    expect(mapTitleToGroupCategory("AA.HCM or Equivalent")).toBe("core");
    expect(mapTitleToGroupCategory("Foundation Courses")).toBe("core");
    expect(mapTitleToGroupCategory("BA Management Competencies")).toBe("major");
    expect(mapTitleToGroupCategory("Business Operations Competencies")).toBe("major");
    expect(mapTitleToGroupCategory("Medical Office Administration Competencies")).toBe("major");
    expect(mapTitleToGroupCategory("Major Required Competencies")).toBe("major");
    expect(mapTitleToGroupCategory("Concentration Competencies")).toBe("elective");
    expect(mapTitleToGroupCategory("Free Electives")).toBe("elective");
    expect(mapTitleToGroupCategory("Other Unknown Grouping")).toBe("other");
  });

  describe("Precedence and Source Selection Rules", () => {
    it("preserves conventional rulesRequirements when catDirectAssessmentText is absent", () => {
      const parsed = parseProgramDetail(sampleCsProgram);
      expect(parsed.slug).toBe("computer-science-bs");
      expect(parsed.requirementGroups.length).toBeGreaterThan(0);
      expect(parsed.warnings.some((w) => w.code === "MULTIPLE_REQUIREMENT_SOURCES")).toBe(false);
    });

    it("prioritizes rulesRequirements and emits MULTIPLE_REQUIREMENT_SOURCES when both are present", () => {
      const dualPayload = {
        ...sampleCsProgram,
        catDirectAssessmentText: "<h4><strong>Some CBE: 10 Total Credits</strong></h4>",
      };
      const parsed = parseProgramDetail(dualPayload);

      expect(parsed.requirementGroups[0].title).toBe("General Education Courses");
      expect(parsed.warnings.some((w) => w.code === "MULTIPLE_REQUIREMENT_SOURCES")).toBe(true);
    });

    it("emits NO_REQUIREMENTS_SOURCE when neither source has valid curriculum HTML", () => {
      const emptyPayload = {
        pid: "empty-pid",
        title: "Empty Degree (BS)",
        rulesRequirements: "   ",
        catDirectAssessmentText: "",
      };
      const parsed = parseProgramDetail(emptyPayload);

      expect(parsed.requirementGroups).toHaveLength(0);
      expect(parsed.warnings.some((w) => w.code === "NO_REQUIREMENTS_SOURCE")).toBe(true);
    });
  });

  describe("Diagnostic and Arithmetic Validation Failures", () => {
    it("reports SECTION_CREDIT_MISMATCH when competencies sum does not match section credits", () => {
      const mismatchedHtml = `
        <h4><strong>Operations: 20 Total Credits</strong></h4>
        <ul>
          <li>BUS10001 - Skill 1 (1)</li>
          <li>BUS10002 - Skill 2 (1)</li>
        </ul>
        <h4><strong>Grand Total Credits: 20</strong></h4>
      `;
      const result = parseDirectAssessmentTree(mismatchedHtml);

      expect(result.warnings.some((w) => w.code === "SECTION_CREDIT_MISMATCH")).toBe(true);
    });

    it("reports GRAND_TOTAL_MISMATCH when section credits do not match grand total", () => {
      const mismatchedHtml = `
        <h4><strong>General Education: 40 Total Credits</strong></h4>
        <ul><li>GEN10001 - Gen 1 (40)</li></ul>
        <h4><strong>Grand Total Credits: 120</strong></h4>
      `;
      const result = parseDirectAssessmentTree(mismatchedHtml);

      expect(result.warnings.some((w) => w.code === "GRAND_TOTAL_MISMATCH")).toBe(true);
    });

    it("reports EMPTY_DIRECT_ASSESSMENT on empty or whitespace HTML", () => {
      const result = parseDirectAssessmentTree("   ");
      expect(result.groups).toHaveLength(0);
      expect(result.warnings.some((w) => w.code === "EMPTY_DIRECT_ASSESSMENT")).toBe(true);
    });
  });

  describe("Compatibility with Static Exporter", () => {
    it("transforms all seven CBE programs cleanly without error", () => {
      for (const raw of cbeProgramsFixture) {
        const parsed = parseProgramDetail(raw);

        // Convert parsed domain program into exporter input rows
        const programId = `prog_${parsed.sourcePid}`;
        const exportInput: ProgramExportInput = {
          programs: [
            {
              id: programId,
              slug: parsed.slug,
              title: parsed.title,
              credential: parsed.credential,
              catalogYear: parsed.catalogYearLabel,
              totalCredits: parsed.totalCredits,
              description: parsed.descriptionSummary,
              sourcePid: parsed.sourcePid,
              syncedAt: new Date().toISOString(),
            },
          ],
          groups: parsed.requirementGroups.map((g, idx) => ({
            id: `grp_${idx}`,
            programId,
            parentId: null,
            title: g.title,
            category: g.category,
            ruleType: g.ruleType,
            minimumSelections: g.minimumSelections ?? null,
            maximumSelections: g.maximumSelections ?? null,
            minimumCredits: g.minimumCredits ?? null,
            rawExcerpt: g.rawText ?? null,
            ruleMetadata: g.ruleMetadata ?? null,
            sortOrder: idx,
          })),
          courses: parsed.requirementGroups.flatMap((g, gIdx) =>
            g.courseRequirements.map((c, cIdx) => ({
              groupId: `grp_${gIdx}`,
              id: `c_${gIdx}_${cIdx}`,
              courseCode: c.courseCode,
              title: c.title,
              credits: c.credits,
              optional: false,
              sortOrder: cIdx,
            }))
          ),
          texts: parsed.requirementGroups.flatMap((g, gIdx) =>
            g.textRequirements.map((t, tIdx) => ({
              groupId: `grp_${gIdx}`,
              id: `t_${gIdx}_${tIdx}`,
              text: t,
              unparsed: false,
              sortOrder: tIdx,
            }))
          ),
          edges: [], // Zero prerequisite edges for CBE programs
        };

        const exported = transformPrograms(exportInput);
        const degree = exported.bySlug[parsed.slug];

        expect(degree).toBeDefined();
        expect(degree.slug).toBe(parsed.slug);
        expect(degree.totalCredits).toBe(expectedTotals[raw.pid]);
        expect(degree.groups.length).toBeGreaterThan(0);
        expect(degree.edges).toHaveLength(0);

        // Verify that competency nodes have isCompetency flagged and no conventional prerequisites
        for (const node of degree.nodes) {
          expect(node.isCompetency).toBe(true);
          expect(node.prerequisites).toEqual([]);
          expect(node.corequisites).toEqual([]);
        }
      }
    });
  });
});
