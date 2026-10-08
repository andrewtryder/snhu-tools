import crypto from "node:crypto";
import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { GroupCategory, DegreeLevel } from "@/types/program";
import {
  isRawProgramListItem,
  isRawProgramDetail,
} from "@/types/kualiRaw";
import {
  CatalogProgram,
  RequirementGroupDomain,
  CourseRequirementDomain,
  RuleType,
  ParserWarning,
} from "@/types/domainCatalog";
import { normalizeCourseCode } from "@/lib/courseCode";
import { isValidCourseId, normalizeCourseId } from "@/features/courses/lib/courseIds";
import { RequirementRuleMetadata } from "@/types/program";

export function hashSourcePayload(raw: unknown): string {
  const jsonStr = JSON.stringify(raw ?? "");
  return crypto.createHash("sha256").update(jsonStr).digest("hex");
}

export function createProgramSlug(title: string, credential?: string): string {
  const slugFromTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

  if (/\b(bs|ba|as|ms|rn-to-bsn)\b/.test(slugFromTitle)) {
    return slugFromTitle;
  }

  if (credential) {
    const credSlug = credential
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");
    return `${slugFromTitle}-${credSlug}`;
  }

  return slugFromTitle;
}

export function normalizeDegreeLevel(credential: string): DegreeLevel {
  const c = credential.toUpperCase();
  if (c.includes("RN TO BSN") || c.includes("RN-TO-BSN")) return "RN to BSN";
  if (c.includes("MBA") || c.includes("MASTER OF BUSINESS")) return "MBA";
  if (c.includes("MFA") || c.includes("MASTER OF FINE ARTS")) return "Other";
  if (c.includes("MED") || c.includes("M.ED") || c.includes("MASTER OF EDUCATION")) return "Other";
  if (c.includes("MASTER OF ARTS") || c.includes(" MA ") || c.endsWith(" MA") || c === "MA") return "MA";
  if (c.includes("MASTER OF SCIENCE") || c.includes(" MS ") || c.endsWith(" MS") || c === "MS") return "MS";
  if (c.includes("BFA") || c.includes("BACHELOR OF FINE ARTS")) return "Other";
  if (c.includes("BBA") || c.includes("BACHELOR OF BUSINESS")) return "Other";
  if (c.includes("BACHELOR OF ARTS") || c.includes(" BA ") || c.endsWith(" BA") || c === "BA") return "BA";
  if (c.includes("BACHELOR OF SCIENCE") || c.includes(" BS ") || c.endsWith(" BS") || c === "BS") return "BS";
  if (c.includes("ASSOCIATE OF ARTS") || c.includes(" AA ") || c.endsWith(" AA") || c === "AA") return "AA";
  if (c.includes("ASSOCIATE OF SCIENCE") || c.includes(" AS ") || c.endsWith(" AS") || c === "AS") return "AS";
  if (c.includes("UNDERGRADUATE CERTIFICATE")) return "Undergraduate Certificate";
  if (c.includes("GRADUATE CERTIFICATE")) return "Graduate Certificate";
  // If it still explicitly says master, bachelor or associate but didn't match the specific BAs/BSs
  if (c.match(/\bMASTER\b/)) return "Other";
  if (c.match(/\bBACHELOR\b/)) return "Other";
  if (c.match(/\bASSOCIATE\b/)) return "Other";
  if (c.match(/\bCERTIFICATE\b/) || c.includes("CERTIF")) return "Other";
  return "Other";
}

export function normalizeCredential(title: string, rawTypeName?: string): string {
  const t = title.toUpperCase();
  if (t.includes("RN TO BSN") || t.includes("RN-TO-BSN")) {
    return "Bachelor of Science in Nursing (RN to BSN)";
  }
  if (t.includes("(BS)") || t.includes("BACHELOR OF SCIENCE") || rawTypeName?.includes("Bachelor")) {
    return "Bachelor of Science";
  }
  if (t.includes("(BA)") || t.includes("BACHELOR OF ARTS")) {
    return "Bachelor of Arts";
  }
  if (t.includes("(AS)") || t.includes("ASSOCIATE OF SCIENCE") || rawTypeName?.includes("Associate")) {
    return "Associate of Science";
  }
  if (t.includes("(MS)") || t.includes("MASTER OF SCIENCE") || rawTypeName?.includes("Master")) {
    return "Master of Science";
  }
  return rawTypeName || "Degree Program";
}

export function mapTitleToGroupCategory(title: string): GroupCategory {
  const lower = title.toLowerCase();
  if (lower.includes("gen") || lower.includes("general education")) return "gened";
  if (lower.includes("elective") || lower.includes("concentration")) return "elective";
  if (
    lower.includes("core") ||
    lower.includes("foundation") ||
    lower.includes("equivalent") ||
    lower.startsWith("aa.")
  ) {
    return "core";
  }
  if (
    lower.includes("major") ||
    lower.includes("competencies") ||
    lower.includes("operations") ||
    lower.includes("administration")
  ) {
    return "major";
  }
  return "other";
}

export function parseProgramListItem(raw: unknown): {
  sourcePid: string;
  title: string;
  code?: string;
  slug: string;
  credential: string;
  category?: string;
  warnings: ParserWarning[];
} {
  const warnings: ParserWarning[] = [];

  if (!isRawProgramListItem(raw)) {
    throw new Error("Invalid Kuali program list item payload");
  }

  const sourcePid = raw.pid || raw.id || "unknown-pid";
  const title = raw.title || "Untitled Program";
  const credential = normalizeCredential(title, raw.programType?.name);
  const slug = createProgramSlug(title, credential);

  if (!raw.pid) {
    warnings.push({
      code: "MISSING_PID",
      message: `Program list item '${title}' missing pid field`,
    });
  }

  return {
    sourcePid,
    title,
    code: raw.code,
    slug,
    credential,
    category: raw.catalogCategory?.name,
    warnings,
  };
}

export function parseRequirementTree(
  rawHtml: string,
  basePath = "root"
): { groups: RequirementGroupDomain[]; totalCredits: number; warnings: ParserWarning[] } {
  const warnings: ParserWarning[] = [];
  const groups: RequirementGroupDomain[] = [];
  let grandTotalCredits = 0;

  if (!rawHtml || typeof rawHtml !== "string") {
    warnings.push({
      code: "EMPTY_RULES",
      message: "No rulesRequirements HTML content provided for program",
    });
    return { groups: [], totalCredits: 0, warnings };
  }

  try {
    const $ = cheerio.load(rawHtml);

    // Extract grand total credits if present
    const grandTotalText = $("h3:contains('Grand Total Credits')").text();
    const grandMatch = grandTotalText.match(/(\d+)/);
    if (grandMatch) {
      grandTotalCredits = parseInt(grandMatch[1], 10);
    }

    $("section").each((index, element) => {
      const sectionPath = `${basePath}.group[${index}]`;
      const groupTitle = $(element).find("h2").text().trim() || `Requirement Group ${index + 1}`;

      // Extract section credits
      const headerSpanText = $(element).find("header").text();
      const creditMatch = headerSpanText.match(/(\d+)\s*Total Credits/i);
      const groupCredits = creditMatch ? parseInt(creditMatch[1], 10) : undefined;

      const rootGroup: RequirementGroupDomain = {
        stableSourcePath: sectionPath,
        title: groupTitle,
        category: mapTitleToGroupCategory(groupTitle),
        ruleType: inferRuleType(groupTitle),
        minimumSelections: inferMinimumSelections(groupTitle),
        minimumCredits: groupCredits ?? inferMinimumCredits(groupTitle),
        children: [],
        courseRequirements: [],
        textRequirements: [],
        // A section header is a label, not the catalog rule. Its children retain
        // their own direct source text below.
        rawText: undefined,
        ruleMetadata: undefined,
        warnings: [],
      };

      parseRequirementContainer($, element, rootGroup, sectionPath, true);
      groups.push(rootGroup);
    });
  } catch (err: unknown) {
    warnings.push({
      code: "PARSER_HTML_ERROR",
      message: `Failed to parse rulesRequirements HTML: ${(err as Error).message}`,
    });
  }

  return { groups, totalCredits: grandTotalCredits, warnings };
}

function inferRuleType(text: string): RuleType {
  const normalized = text.toLowerCase();
  if (/free electives?/.test(normalized)) return "free_elective";
  if (/concentration/.test(normalized)) return "concentration";
  if (/\b\d+\s*credit\(s\)\s*from/.test(normalized)) return "choose_credits";
  if (/\b\d+\s+of the following/.test(normalized) || /complete\s+\d+\s+of/.test(normalized)) return "choose_n";
  return "all_of";
}

function inferMinimumSelections(text: string): number | undefined {
  const match = text.match(/(?:complete\s+)?(\d+)\s+of the following/i);
  return match ? parseInt(match[1], 10) : undefined;
}

function inferMinimumCredits(text: string): number | undefined {
  const match = text.match(/(\d+)\s*credit\(s\)/i);
  return match ? parseInt(match[1], 10) : undefined;
}

function getDirectRuleText($: cheerio.CheerioAPI, element: Element): string {
  const clone = $(element).clone();
  clone.find("ul, ol").remove();
  return clone.text().replace(/\s+/g, " ").trim();
}

function extractRuleMetadata(
  sourceText: string,
  courses: CourseRequirementDomain[]
): RequirementRuleMetadata {
  const metadata: RequirementRuleMetadata = sourceText ? { sourceText } : {};
  const creditMatch = sourceText.match(/(\d+)\s*credit\(s\)/i);
  const rangeMatch = sourceText.match(/\b(\d{3})\s*(?:-|–|to)\s*(\d{3})\b/);
  const subjectMatch = sourceText.match(
    /(?:from\s+(?:subject\(s\):\s*)?)([A-Z]{2,4}(?:\s*,\s*[A-Z]{2,4})*(?:\s*,?\s*(?:or|and)\s*[A-Z]{2,4})?)\s+(?:within|from|in)\b/
  );

  if (creditMatch) metadata.minimumCredits = Number(creditMatch[1]);
  if (rangeMatch) {
    metadata.minimumCourseLevel = Number(rangeMatch[1]);
    metadata.maximumCourseLevel = Number(rangeMatch[2]);
  }
  if (subjectMatch) {
    metadata.eligibleSubjectCodes = subjectMatch[1].match(/\b[A-Z]{2,4}\b/g) || undefined;
  }
  if (courses.length > 0) metadata.explicitCourseCodes = courses.map((course) => course.courseCode);

  const policyNotes = sourceText
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => /\bpolicy\b|must meet|eligibility/i.test(sentence.trim()));
  if (policyNotes.length > 0) metadata.policyNotes = policyNotes;

  return metadata;
}

function parseCourseAnchor(
  $: cheerio.CheerioAPI,
  anchorElement: Element,
  sourcePath: string
): CourseRequirementDomain | null {
  const anchor = $(anchorElement);
  const courseCode = normalizeCourseCode(anchor.text());
  if (!courseCode) return null;

  const href = anchor.attr("href") || "";
  const pidMatch = href.match(/\/courses\/view\/([a-zA-Z0-9_]+)/);
  const parentLiText = anchor.closest("li").text().replace(/\s+/g, " ").trim();
  const titleText = parentLiText.replace(anchor.text(), "").replace(/^\s*-\s*/, "").trim();
  const creditMatch = titleText.match(/\((\d+)(?:\s*-\s*\d+)?\)/);

  return {
    sourcePid: pidMatch ? pidMatch[1] : undefined,
    courseCode,
    title: (creditMatch ? titleText.replace(creditMatch[0], "") : titleText).trim() || courseCode,
    credits: creditMatch ? parseInt(creditMatch[1], 10) : null,
    sourcePath,
  };
}

function directElements($: cheerio.CheerioAPI, owner: Element): Element[] {
  return $(owner).children().toArray().filter((child): child is Element => child.type === "tag");
}

function isRuleView($: cheerio.CheerioAPI, element: Element): boolean {
  return /^ruleView-/.test($(element).attr("data-test") || "");
}

function isGenericWrapper(text: string): boolean {
  return /^(?:complete\s+)?all\s+of\s+the\s+following:?$/i.test(text.replace(/\s+/g, " ").trim());
}

function normalizeRuleTitle(text: string, ruleType: RuleType): string {
  const normalized = text.replace(/\s+/g, " ").trim().replace(/:$/, "");
  if (/^complete$/i.test(normalized)) return "Complete all of the following";
  if (ruleType === "choose_n") {
    const count = inferMinimumSelections(normalized);
    return count ? `Choose ${count} of the following` : normalized || "Choose from the following";
  }
  if (ruleType === "choose_credits") {
    const credits = inferMinimumCredits(normalized);
    return credits ? `Complete ${credits} credits from the following` : normalized || "Complete credits from the following";
  }
  return normalized || "Complete all of the following";
}

function collectCourses(
  $: cheerio.CheerioAPI,
  owner: Element,
  sourcePath: string
): CourseRequirementDomain[] {
  const seen = new Set<string>();
  const courses: CourseRequirementDomain[] = [];
  $(owner).find("a[href*='/courses/view/']").each((index, anchor) => {
    const course = parseCourseAnchor($, anchor, `${sourcePath}.course[${index}]`);
    if (course && !seen.has(course.courseCode)) {
      seen.add(course.courseCode);
      courses.push(course);
    }
  });
  return courses;
}

function addCoursesToParent(parent: RequirementGroupDomain, courses: CourseRequirementDomain[]): void {
  const seen = new Set(parent.courseRequirements.map((course) => course.courseCode));
  for (const course of courses) {
    if (!seen.has(course.courseCode)) {
      seen.add(course.courseCode);
      parent.courseRequirements.push(course);
    }
  }
}

function createSemanticRule(
  $: cheerio.CheerioAPI,
  owner: Element,
  parent: RequirementGroupDomain,
  sourcePath: string,
  index: number
): RequirementGroupDomain {
  const result = $(owner)
    .find("[data-test$='-result']")
    .first()
    .get(0);
  const ruleText = getDirectRuleText($, owner) || (result ? getDirectRuleText($, result) : "");
  const courses = collectCourses($, owner, sourcePath);
  const ruleType = inferRuleType(ruleText);
  const group: RequirementGroupDomain = {
    stableSourcePath: `${sourcePath}.rule[${index}]`,
    title: normalizeRuleTitle(ruleText, ruleType),
    category: parent.category,
    ruleType,
    minimumSelections: inferMinimumSelections(ruleText),
    minimumCredits: inferMinimumCredits(ruleText),
    children: [],
    courseRequirements: courses,
    textRequirements: [],
    rawText: ruleText || undefined,
    warnings: [],
  };
  // Extract after the course list is complete so explicit alternatives are
  // available to persistence and any optional requirement presentation.
  group.ruleMetadata = extractRuleMetadata(ruleText, courses);
  return group;
}

function getWrapperHeading($: cheerio.CheerioAPI, element: Element): string | null {
  if (!$(element).is("div")) return null;
  const span = $(element).children("span").first();
  if (span.length === 0) return null;
  const heading = span.text().replace(/\s+/g, " ").trim();
  if (!heading || /^\d+(?:\s*credit\(s\))?$/i.test(heading)) return null;
  return heading;
}

/**
 * Kuali interleaves invalid-but-browser-tolerated div wrappers and list items.
 * This walks direct DOM children, recognizes a ruleView result as one semantic
 * rule, and intentionally flattens presentation-only "Complete all" wrappers.
 */
function parseRequirementContainer(
  $: cheerio.CheerioAPI,
  owner: Element,
  parent: RequirementGroupDomain,
  parentPath: string,
  skipHeaders = false
): void {
  let position = 0;
  for (const child of directElements($, owner)) {
    if (skipHeaders && $(child).is("header")) continue;
    const childPath = `${parentPath}.node[${position++}]`;
    const heading = getWrapperHeading($, child);

    if (heading) {
      const subgroup: RequirementGroupDomain = {
        stableSourcePath: `${childPath}.heading`,
        title: heading,
        category: parent.category,
        ruleType: "all_of",
        children: [],
        courseRequirements: [],
        textRequirements: [],
        warnings: [],
      };
      parseRequirementContainer($, child, subgroup, subgroup.stableSourcePath);
      if (subgroup.children.length || subgroup.courseRequirements.length || subgroup.textRequirements.length) {
        parent.children.push(subgroup);
      }
      continue;
    }

    if (isRuleView($, child)) {
      parent.children.push(createSemanticRule($, child, parent, parentPath, position));
      continue;
    }

    if ($(child).is("li")) {
      const directText = getDirectRuleText($, child);
      const nestedRuleViews = $(child).find("[data-test^='ruleView-']").length;
      const directCourses = collectCourses($, child, childPath);

      if (
        directCourses.length > 0 &&
        (inferRuleType(directText) === "choose_n" ||
          inferRuleType(directText) === "choose_credits" ||
          (nestedRuleViews === 0 && isGenericWrapper(directText)))
      ) {
        parent.children.push(createSemanticRule($, child, parent, parentPath, position));
      } else if (isGenericWrapper(directText) || nestedRuleViews > 0) {
        // The outer list item expresses presentation structure only. Its nested
        // ruleView containers own the actual instruction and courses.
        parseRequirementContainer($, child, parent, childPath);
      } else if (directCourses.length > 0) {
        addCoursesToParent(parent, directCourses);
      } else if (directText) {
        parent.textRequirements.push(directText);
      }
      continue;
    }

    if ($(child).is("ul, ol, div")) {
      parseRequirementContainer($, child, parent, childPath);
    }
  }
}

export function parseDirectAssessmentTree(
  rawHtml: string,
  basePath = "root"
): { groups: RequirementGroupDomain[]; totalCredits: number; warnings: ParserWarning[] } {
  const warnings: ParserWarning[] = [];
  const groups: RequirementGroupDomain[] = [];
  let grandTotalCredits = 0;

  if (!rawHtml || typeof rawHtml !== "string" || !rawHtml.trim()) {
    warnings.push({
      code: "EMPTY_DIRECT_ASSESSMENT",
      message: "No Direct Assessment HTML content provided for program",
    });
    return { groups: [], totalCredits: 0, warnings };
  }

  try {
    const $ = cheerio.load(rawHtml);

    // Extract grand total credits from headings or text
    $("h1, h2, h3, h4, h5, h6").each((_, heading) => {
      const headingText = $(heading).text().replace(/\s+/g, " ").trim();
      const grandMatch = headingText.match(/grand\s+total(?:\s+credits)?\s*:\s*(\d+)/i);
      if (grandMatch) {
        grandTotalCredits = parseInt(grandMatch[1], 10);
      }
    });

    // Root-level elements in body
    const rootElements = $("body").children().toArray().filter((el): el is Element => el.type === "tag");
    const elementsToProcess =
      rootElements.length === 1 && $(rootElements[0]).is("div") && $(rootElements[0]).children().length > 1
        ? $(rootElements[0]).children().toArray().filter((el): el is Element => el.type === "tag")
        : rootElements;

    let currentGroup: RequirementGroupDomain | null = null;
    let groupIndex = 0;

    const finalizeCurrentGroup = () => {
      if (!currentGroup) return;

      // Section credit reconciliation
      if (typeof currentGroup.minimumCredits === "number" && currentGroup.courseRequirements.length > 0) {
        const compCreditSum = currentGroup.courseRequirements.reduce(
          (acc, c) => acc + (c.credits ?? 0),
          0
        );
        if (currentGroup.ruleType === "all_of" && compCreditSum !== currentGroup.minimumCredits) {
          warnings.push({
            code: "SECTION_CREDIT_MISMATCH",
            message: `Section '${currentGroup.title}' states ${currentGroup.minimumCredits} credits but competencies sum to ${compCreditSum} credits`,
            path: currentGroup.stableSourcePath,
          });
        }
      }

      // If the group has a minimum credit requirement (e.g. associate degree transfer block)
      // but no parsed course or text items, add an informative text requirement so it is not blank.
      if (currentGroup.courseRequirements.length === 0 && currentGroup.textRequirements.length === 0) {
        if (typeof currentGroup.minimumCredits === "number" && currentGroup.minimumCredits > 0) {
          currentGroup.textRequirements.push(
            `${currentGroup.title}: ${currentGroup.minimumCredits} Total Credits`
          );
        }
      }

      groups.push(currentGroup);
      currentGroup = null;
    };

    for (const el of elementsToProcess) {
      const tagName = el.tagName.toLowerCase();

      // Heading elements (e.g. <h4>)
      if (/^h[1-6]$/.test(tagName)) {
        const headingText = $(el).text().replace(/\s+/g, " ").trim();

        // Skip grand total heading as a requirement section
        if (/grand\s+total(?:\s+credits)?\s*:\s*\d+/i.test(headingText)) {
          continue;
        }

        // Section credit header, e.g. "BA Management Competencies: 51 Total Credits"
        const creditMatch = headingText.match(/^(.*?)(?::\s*|\s*–\s*|\s*-\s*)?(\d+)\s*Total\s+Credits/i);
        if (creditMatch) {
          finalizeCurrentGroup();

          const rawTitle = creditMatch[1].replace(/[:–-]\s*$/, "").trim();
          const sectionTitle = rawTitle || "Required Competencies";
          const sectionCredits = parseInt(creditMatch[2], 10);
          const sectionPath = `${basePath}.group[${groupIndex++}]`;
          const isConcentration = /concentration/i.test(sectionTitle);

          currentGroup = {
            stableSourcePath: sectionPath,
            title: sectionTitle,
            category: mapTitleToGroupCategory(sectionTitle),
            ruleType: isConcentration ? "concentration" : "all_of",
            minimumCredits: sectionCredits,
            children: [],
            courseRequirements: [],
            textRequirements: [],
            rawText: headingText,
            warnings: [],
          };
          continue;
        }

        // Heading without explicit "Total Credits" (e.g. introductory program title banner)
        finalizeCurrentGroup();
        const sectionPath = `${basePath}.group[${groupIndex++}]`;
        currentGroup = {
          stableSourcePath: sectionPath,
          title: headingText,
          category: mapTitleToGroupCategory(headingText),
          ruleType: /concentration/i.test(headingText) ? "concentration" : "all_of",
          children: [],
          courseRequirements: [],
          textRequirements: [],
          rawText: headingText,
          warnings: [],
        };
        continue;
      }

      // List elements (<ul>, <ol>)
      if (tagName === "ul" || tagName === "ol") {
        if (!currentGroup) {
          const sectionPath = `${basePath}.group[${groupIndex++}]`;
          currentGroup = {
            stableSourcePath: sectionPath,
            title: "Required Competencies",
            category: "major",
            ruleType: "all_of",
            children: [],
            courseRequirements: [],
            textRequirements: [],
            warnings: [],
          };
        }

        $(el).children("li").each((_, li) => {
          const liText = $(li).text().replace(/\s+/g, " ").trim();
          if (!liText) return;

          // Competency item format: CODE - Title (Credits)
          const compMatch = liText.match(
            /^([A-Z]{2,4}\s*\d{4,5}[A-Z]?)\s*[-–—:]\s*(.*?)(?:\s*\((\d+)\))?$/i
          );

          if (compMatch) {
            const code = compMatch[1].trim();
            const title = compMatch[2].trim() || code;
            const credits = compMatch[3] ? parseInt(compMatch[3], 10) : null;
            const compIndex = currentGroup!.courseRequirements.length;

            currentGroup!.courseRequirements.push({
              courseCode: code,
              title,
              credits,
              sourcePath: `${currentGroup!.stableSourcePath}.competency[${compIndex}]`,
            });
          } else {
            // Informational text requirement (e.g. "Students must select a concentration.")
            currentGroup!.textRequirements.push(liText);
          }
        });
        continue;
      }

      // Paragraph or generic text container
      if (tagName === "p" || tagName === "div") {
        const text = $(el).text().replace(/\s+/g, " ").trim();
        if (text && currentGroup) {
          currentGroup.textRequirements.push(text);
        }
      }
    }

    finalizeCurrentGroup();

    // Filter out uncredited banner headers with no items
    const validGroups = groups.filter(
      (g) =>
        g.courseRequirements.length > 0 ||
        g.textRequirements.length > 0 ||
        (typeof g.minimumCredits === "number" && g.minimumCredits > 0)
    );

    // Re-index stableSourcePath sequentially
    validGroups.forEach((g, idx) => {
      g.stableSourcePath = `${basePath}.group[${idx}]`;
      g.courseRequirements.forEach((cr, cIdx) => {
        cr.sourcePath = `${g.stableSourcePath}.competency[${cIdx}]`;
      });
    });

    // Grand total reconciliation
    if (grandTotalCredits > 0) {
      const sectionTotalSum = validGroups.reduce((acc, g) => acc + (g.minimumCredits ?? 0), 0);
      if (sectionTotalSum !== grandTotalCredits) {
        warnings.push({
          code: "GRAND_TOTAL_MISMATCH",
          message: `Grand total credits ${grandTotalCredits} does not equal sum of section credits ${sectionTotalSum}`,
        });
      }
    }

    return { groups: validGroups, totalCredits: grandTotalCredits, warnings };
  } catch (err: unknown) {
    warnings.push({
      code: "PARSER_HTML_ERROR",
      message: `Failed to parse catDirectAssessmentText HTML: ${(err as Error).message}`,
    });
    return { groups: [], totalCredits: 0, warnings };
  }
}

export function parseProgramDetail(
  raw: unknown,
  catalogId = "6349a3f9164d00001c6c80da"
): CatalogProgram {
  if (!isRawProgramDetail(raw)) {
    throw new Error("Invalid Kuali program detail payload");
  }

  const warnings: ParserWarning[] = [];
  const sourcePid = raw.pid || raw.id || "unknown-pid";
  const title = raw.title || "Untitled Program";
  const credential = normalizeCredential(title, raw.programType?.name);
  const slug = createProgramSlug(title, credential);
  const descriptionSummary = raw.description || "";
  const catalogYearLabel = "2025-2026";
  const sourceUrl = `https://snhu.kuali.co/api/v1/catalog/program/${catalogId}/${sourcePid}`;

  let groups: RequirementGroupDomain[] = [];
  let parsedCredits = 0;

  const hasRulesRequirements = Boolean(
    raw.rulesRequirements &&
      raw.rulesRequirements.trim().length > 0 &&
      /<(?:section|div|ul|ol|li)\b/i.test(raw.rulesRequirements)
  );

  const hasDirectAssessment = Boolean(
    raw.catDirectAssessmentText &&
      raw.catDirectAssessmentText.trim().length > 0 &&
      /<(?:h[1-6]|ul|ol|li|div|p)\b/i.test(raw.catDirectAssessmentText)
  );

  if (hasRulesRequirements && hasDirectAssessment) {
    warnings.push({
      code: "MULTIPLE_REQUIREMENT_SOURCES",
      message:
        "Both rulesRequirements and catDirectAssessmentText contain curriculum content; prioritizing rulesRequirements per precedence rule",
    });
    const result = parseRequirementTree(raw.rulesRequirements || "", `program[${sourcePid}]`);
    groups = result.groups;
    parsedCredits = result.totalCredits;
    warnings.push(...result.warnings);
  } else if (hasRulesRequirements) {
    const result = parseRequirementTree(raw.rulesRequirements || "", `program[${sourcePid}]`);
    groups = result.groups;
    parsedCredits = result.totalCredits;
    warnings.push(...result.warnings);
  } else if (hasDirectAssessment) {
    const result = parseDirectAssessmentTree(raw.catDirectAssessmentText || "", `program[${sourcePid}]`);
    groups = result.groups;
    parsedCredits = result.totalCredits;
    warnings.push(...result.warnings);
  } else {
    warnings.push({
      code: "NO_REQUIREMENTS_SOURCE",
      message: "Neither rulesRequirements nor catDirectAssessmentText contains valid curriculum requirements",
    });
  }

  const totalCredits = parsedCredits > 0 ? parsedCredits : calculateKnownCreditSummary(groups);
  const sourceHash = hashSourcePayload(raw);

  return {
    sourcePid,
    slug,
    title,
    credential,
    catalogId,
    catalogYearLabel,
    totalCredits: totalCredits || null,
    sourceUrl,
    descriptionSummary,
    requirementGroups: groups,
    sourceHash,
    warnings,
  };
}

export function extractCourseReferences(program: CatalogProgram): Array<{ code: string; pid?: string }> {
  const refs = new Map<string, { code: string; pid?: string }>();

  const traverse = (groups: RequirementGroupDomain[]) => {
    for (const group of groups) {
      for (const course of group.courseRequirements) {
        const code = normalizeCourseCode(course.courseCode);
        // Only include conventional catalog courses; exclude CBE competencies that do not exist as courses
        if (
          code &&
          !refs.has(code) &&
          (Boolean(course.sourcePid) || isValidCourseId(normalizeCourseId(code)))
        ) {
          refs.set(code, { code, pid: course.sourcePid });
        }
      }
      if (group.children.length > 0) {
        traverse(group.children);
      }
    }
  };

  traverse(program.requirementGroups);
  return Array.from(refs.values());
}

export function calculateKnownCreditSummary(groups: RequirementGroupDomain[]): number | null {
  let sum = 0;
  for (const group of groups) {
    if (typeof group.minimumCredits === "number" && group.minimumCredits > 0) {
      sum += group.minimumCredits;
    } else {
      for (const cr of group.courseRequirements) {
        if (cr.credits == null) {
          return null; // Partial sum containing unknown components
        }
        sum += cr.credits;
      }
    }
  }
  return sum > 0 ? sum : null;
}
