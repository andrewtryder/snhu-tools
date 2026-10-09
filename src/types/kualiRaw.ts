export interface RawKualiOffering {
  online?: boolean;
  campus?: boolean;
}

export interface RawKualiProgramType {
  name?: string;
  id?: string;
  translatedNames?: Record<string, string>;
}

export interface RawKualiCatalogCategory {
  name?: string;
  id?: string;
  customFields?: Record<string, string>;
}

export interface RawKualiProgramListItem {
  pid?: string;
  id?: string;
  code?: string;
  title?: string;
  programType?: RawKualiProgramType;
  catalogCategory?: RawKualiCatalogCategory;
  offering?: RawKualiOffering;
  dateStart?: string;
  catalogActivationDate?: string;
  _score?: number;
  [key: string]: unknown;
}

export interface RawKualiSpecialization {
  pid?: string;
  id?: string;
  title?: string;
  description?: string;
  rulesRequirements?: string;
  inheritedFrom?: string;
  [key: string]: unknown;
}

export interface RawKualiProgramDetail extends RawKualiProgramListItem {
  description?: string;
  rulesRequirements?: string;
  catDirectAssessmentText?: string;
  outcomes?: Array<{ id?: string; code?: string; value?: string }>;
  specializations?: RawKualiSpecialization[];
  additionalInfoCampus?: string;
  additionalInfoOnline?: string;
  [key: string]: unknown;
}

export interface RawKualiCourseItem {
  pid?: string;
  id?: string;
  code?: string;
  title?: string;
  description?: string;
  credits?: unknown; // can be number, string, object { min, max }, etc.
  rulesPrerequisites?: string;
  subjectCode?: {
    name?: string;
    description?: string;
  };
  [key: string]: unknown;
}

/* ========================================================================== */
/* TYPE GUARDS                                                                */
/* ========================================================================== */

export function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null;
}

export function isRawProgramListItem(val: unknown): val is RawKualiProgramListItem {
  if (!isObject(val)) return false;
  return typeof val.pid === "string" || typeof val.title === "string";
}

export function isRawProgramDetail(val: unknown): val is RawKualiProgramDetail {
  if (!isRawProgramListItem(val)) return false;
  return (
    typeof val.rulesRequirements === "string" ||
    typeof val.catDirectAssessmentText === "string" ||
    typeof val.description === "string"
  );
}

export function isRawCourseItem(val: unknown): val is RawKualiCourseItem {
  if (!isObject(val)) return false;
  return typeof val.pid === "string" || typeof val.code === "string" || typeof val.title === "string";
}
