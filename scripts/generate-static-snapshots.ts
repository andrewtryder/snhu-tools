import { Pool } from "pg";
import path from "node:path";
import { exportCoursesFromDatabase } from "../src/lib/static-export/courses";
import { exportProgramsFromDatabase } from "../src/lib/static-export/programs";
import { transformSearch } from "../src/lib/static-export/search";
import { exportTransfersFromDatabase } from "../src/lib/static-export/transfers";
import { loadBundles, loadManifest, promoteSnapshot, stageSnapshot, verifyManifest, type SnapshotBundles } from "../src/lib/static-export/snapshot";

type Mode={kind:"fixture"}|{kind:"json";directory:string}|{kind:"postgres"};
const active=path.resolve("src/data/snapshots");
function parse(argv:string[]):{mode:Mode;promote:boolean}{const fixture=argv.includes("--fixture");const postgres=argv.includes("--from-postgres");const index=argv.indexOf("--from-json");const json=index>=0?argv[index+1]:undefined;if([fixture,postgres,Boolean(json)].filter(Boolean).length!==1)throw new Error("Choose exactly one: --fixture, --from-json <directory>, or --from-postgres");if(index>=0&&!json)throw new Error("--from-json requires a directory");return {mode:fixture?{kind:"fixture"}:postgres?{kind:"postgres"}:{kind:"json",directory:path.resolve(json!)},promote:argv.includes("--promote")};}
async function markers(pool:Pool){const client=await pool.connect();try{const result=await client.query<{catalog:string|null;programs:string|null;transfers:string|null}>("SELECT (SELECT completed_at::text FROM catalog_sync_state WHERE id='catalog') AS catalog, (SELECT completed_at::text FROM program_sync_state WHERE id='program_sync') AS programs, (SELECT completed_at::text FROM transfer_sync_state WHERE id='transfer') AS transfers");return result.rows[0]??{catalog:null,programs:null,transfers:null};}finally{client.release();}}
async function bundlesFor(mode:Mode):Promise<{bundles:SnapshotBundles;fixture:boolean;consistency?:string}>{
 if(mode.kind==="fixture")return {bundles:await loadBundles(active),fixture:true};
 if(mode.kind==="json"){const manifest=await loadManifest(mode.directory);if(!manifest||manifest.fixture)throw new Error("--from-json requires a complete non-fixture manifest");const bundles=await loadBundles(mode.directory);verifyManifest(bundles,manifest);return {bundles,fixture:false};}
 if(process.env.STATIC_EXPORT_APPROVED!=="true"||!process.env.POSTGRES_URL)throw new Error("--from-postgres requires STATIC_EXPORT_APPROVED=true and POSTGRES_URL");
 const pool=new Pool({connectionString:process.env.POSTGRES_URL,max:1,connectionTimeoutMillis:10_000,idleTimeoutMillis:5_000,statement_timeout:60_000,application_name:"snhu-static-export"});
 try{const before=await markers(pool);const programs=await exportProgramsFromDatabase(pool);const courses=await exportCoursesFromDatabase(pool);const transfers=await exportTransfersFromDatabase(pool);const after=await markers(pool);if(JSON.stringify(before)!==JSON.stringify(after))throw new Error("Cross-domain source timestamps changed during export; retry in a synchronization-safe window");return {bundles:{programs,courses,transfers,search:transformSearch(programs,courses,transfers)},fixture:false,consistency:JSON.stringify(before)};}finally{await pool.end();}
}
export async function runStaticExport(argv:string[]){const {mode,promote}=parse(argv);const source=await bundlesFor(mode);const baseline=await loadManifest(active);const staged=await stageSnapshot(source.bundles,source.fixture,active,baseline);if(promote){const backup=await promoteSnapshot(staged.directory,active);return {...staged,promoted:true,backup};}return {...staged,promoted:false};}
if(process.argv[1]?.endsWith("generate-static-snapshots.ts"))runStaticExport(process.argv.slice(2)).then(result=>console.log(JSON.stringify({staged:result.directory,promoted:result.promoted,report:result.report},null,2))).catch(error=>{console.error(error instanceof Error?error.message:error);process.exitCode=1;});
