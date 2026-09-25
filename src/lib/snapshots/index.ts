export {
  SNAPSHOT_SCHEMA_VERSION,
  SNAPSHOT_RETENTION_PRIOR_VERSIONS,
  EMPTY_MANIFEST,
  type SnapshotDomain,
  type SnapshotManifest,
  type SnapshotMeta,
} from "./types";

export {
  SNAPSHOT_ROOT_PREFIX,
  manifestCurrentPath,
  manifestPreviousPath,
  domainBundlePath,
  domainMetaPath,
  localSnapshotRoot,
  createSnapshotVersion,
} from "./paths";

export {
  createFsSnapshotStore,
  createBlobSnapshotStore,
  getSnapshotStore,
  setSnapshotStoreForTests,
  type SnapshotStore,
} from "./store";

export { durableCache } from "./cache";

export {
  readCurrentManifest,
  readPreviousManifest,
  readDomainBundle,
  readDomainMeta,
  versionForDomain,
  publishDomainSnapshot,
  rollbackToPreviousManifest,
} from "./manifest";

export {
  classifyDbAvailabilityError,
  isDbAvailabilityError,
  type DbAvailabilityClassification,
  type DbAvailabilityReason,
} from "./availability";

export {
  readThroughSnapshot,
  getRequestManifest,
  type ReadThroughSnapshotOptions,
} from "./readThrough";

export { gcSnapshotVersions } from "./gc";

export {
  buildProgramsSnapshotFromDatabase,
  validateProgramsBundle,
  publishProgramsSnapshot,
  type ProgramsSnapshotBundle,
  type ProgramSummary,
  type ProgramSitemapEntry,
  type ProgramSyncStateSnapshot,
} from "./domains/programs";

export {
  buildCoursesSnapshotFromDatabase,
  validateCoursesBundle,
  publishCoursesSnapshot,
  materializeTree,
  type CoursesSnapshotBundle,
  type CourseSnapshotEdge,
} from "./domains/courses";

export {
  buildTransfersSnapshotFromDatabase,
  validateTransfersBundle,
  publishTransfersSnapshot,
  type TransfersSnapshotBundle,
} from "./domains/transfers";

export {
  buildSearchIndexFromBundles,
  buildSearchIndexFromDatabase,
  buildSearchIndexFromPublishedDomains,
  validateSearchBundle,
  assertSearchBuiltFromMatchesManifest,
  publishSearchSnapshot,
  type SearchIndexSnapshot,
  type SearchBuiltFrom,
  type SearchProgramEntry,
  type SearchCourseEntry,
  type SearchTransferEntry,
} from "./domains/search";
