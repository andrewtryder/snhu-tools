import { createHash } from "node:crypto";
import { mkdtemp, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CoursesExport } from "./courses";
import type { ProgramsExport } from "./programs";
import type { TransfersExport } from "./transfers";
import type { SearchExport } from "./search";

export type DomainName="programs"|"courses"|"transfers"|"search";
export type SnapshotBundles={programs:ProgramsExport;courses:CoursesExport;transfers:TransfersExport;search:SearchExport};
export type SnapshotManifest={schemaVersion:1;createdAt:string;fixture:boolean;domains:Record<DomainName,{file:string;sha256:string;required:true;counts:Record<string,number>}>};
export type SnapshotReport={fixture:boolean;baseline:"none"|"fixture"|"approved";counts:Record<DomainName,number>;rawBytes:Record<DomainName,number>;warnings:string[]};
const names:[DomainName,DomainName,DomainName,DomainName]=["programs","courses","transfers","search"];
const stable=(value:unknown)=>JSON.stringify(value,null,2)+"\n";
const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const containsSecret=(value:unknown,pathName="root"):string|undefined=>{if(!value||typeof value!=="object")return;for(const [key,child] of Object.entries(value as Record<string,unknown>)){if(/password|secret|token|postgres|connection|string/i.test(key)&&!/description/i.test(key))return `${pathName}.${key}`;const found=containsSecret(child,`${pathName}.${key}`);if(found)return found;}};
const count=(name:DomainName,bundle:SnapshotBundles[DomainName])=>name==="programs"?(bundle as ProgramsExport).directory.length:name==="courses"?(bundle as CoursesExport).ids.length:name==="transfers"?(bundle as TransfersExport).rows.length:(bundle as SearchExport).meta.counts.entries;

export function validateSnapshot(bundles:SnapshotBundles,fixture:boolean,baseline?:SnapshotManifest|null,minimumRetention=0.5):SnapshotReport{
  for(const name of names){const bundle=bundles[name];if(bundle.meta.domain!==name||count(name,bundle)!==Object.values(bundle.meta.counts)[0]&&name!=="courses")throw new Error(`Invalid ${name} count`);const secret=containsSecret(bundle);if(secret)throw new Error(`Potential secret in ${name} at ${secret}`);}
  if(bundles.programs.directory.some(p=>!bundles.programs.bySlug[p.slug]))throw new Error("Program directory has unresolved slug");
  if(bundles.courses.ids.some(id=>!bundles.courses.records[id]))throw new Error("Course ID has unresolved record");
  if(Object.keys(bundles.programs.bySlug).some(slug=>!bundles.programs.directory.some(p=>p.slug===slug)))throw new Error("Program detail missing from directory");
  for(const id of bundles.courses.ids){const seen=new Set<string>();const walk=(node:string)=>{if(seen.has(node))return;seen.add(node);for(const edge of bundles.courses.edges.filter(e=>e.parentId===node))walk(edge.childId);};walk(id);}
  const expectedSearch=bundles.programs.directory.length+bundles.courses.summaries.length+bundles.transfers.rows.length;
  if(bundles.search.meta.counts.entries!==expectedSearch||bundles.search.programs.length!==bundles.programs.directory.length||bundles.search.courses.length!==bundles.courses.summaries.length||bundles.search.transfers.length!==bundles.transfers.rows.length)throw new Error("Search index does not match source data");
  const baselineKind=baseline?.fixture?"fixture":baseline?"approved":"none";
  const warnings:string[]=[];
  if(baseline&&!baseline.fixture){for(const name of names){const before=Object.values(baseline.domains[name].counts)[0]??0;const after=count(name,bundles[name]);if(before&&after/before<minimumRetention)throw new Error(`${name} count fell below ${minimumRetention*100}% of approved baseline`);}}else warnings.push("No approved production baseline was available for count comparison");
  const counts=Object.fromEntries(names.map(name=>[name,count(name,bundles[name])])) as SnapshotReport["counts"];
  const rawBytes=Object.fromEntries(names.map(name=>[name,Buffer.byteLength(stable(bundles[name]))])) as SnapshotReport["rawBytes"];
  return {fixture,baseline:baselineKind,counts,rawBytes,warnings};
}

export function createManifest(bundles:SnapshotBundles,fixture:boolean,createdAt=new Date().toISOString()):SnapshotManifest{return {schemaVersion:1,createdAt,fixture,domains:Object.fromEntries(names.map(name=>[name,{file:`${name}.json`,sha256:hash(bundles[name]),required:true,counts:bundles[name].meta.counts}])) as unknown as SnapshotManifest["domains"]};}
export function verifyManifest(bundles:SnapshotBundles,manifest:SnapshotManifest){if(manifest.schemaVersion!==1)throw new Error("Unsupported snapshot manifest schema");for(const name of names){const entry=manifest.domains?.[name];if(!entry?.required||entry.file!==`${name}.json`||entry.sha256!==hash(bundles[name]))throw new Error(`Manifest checksum mismatch for ${name}`);}}
export async function loadBundles(directory:string):Promise<SnapshotBundles>{const result={} as SnapshotBundles;for(const name of names)result[name]=JSON.parse(await readFile(path.join(directory,`${name}.json`),"utf8"));return result;}
export async function loadManifest(directory:string):Promise<SnapshotManifest|null>{try{return JSON.parse(await readFile(path.join(directory,"manifest.json"),"utf8")) as SnapshotManifest;}catch{return null;}}
export async function stageSnapshot(bundles:SnapshotBundles,fixture:boolean,activeDirectory:string,baseline?:SnapshotManifest|null):Promise<{directory:string;manifest:SnapshotManifest;report:SnapshotReport}>{const report=validateSnapshot(bundles,fixture,baseline);const manifest=createManifest(bundles,fixture);const stage=await mkdtemp(path.join(path.dirname(activeDirectory),".snapshot-stage-"));for(const name of names)await writeFile(path.join(stage,`${name}.json`),stable(bundles[name]));await writeFile(path.join(stage,"manifest.json"),stable(manifest));await writeFile(path.join(stage,"report.json"),stable(report));const reread=await loadBundles(stage);const remanifest=await loadManifest(stage);if(!remanifest)throw new Error("Staged snapshot manifest is missing");verifyManifest(reread,remanifest);validateSnapshot(reread,fixture,baseline);return {directory:stage,manifest,report};}
export async function promoteSnapshot(stage:string,active:string):Promise<string>{await stat(stage);const backup=`${active}.previous-${Date.now()}`;let moved=false;try{await rename(active,backup);moved=true;await rename(stage,active);return backup;}catch(error){if(moved){try{await rename(backup,active);}catch{throw new Error("Promotion failed and rollback failed");}}throw error;}}
