import type { Pool } from "pg";
import { isValidTransferCourseCode, normalizeTransferCourseCode } from "@/features/transfers/lib/courseCode";
import type { TransferRow } from "@/features/transfers/lib/seoQueries";

export type TransfersExport = { meta:{domain:"transfers";counts:{rows:number}}; rows:TransferRow[]; lastModified:string|null };
export type TransferExportRow = TransferRow;
const clean=(value:string|null|undefined)=>value==null?null:value.trim()||null;
const stableKey=(row:TransferRow)=>[row.courseNumber,row.subjectPrefix,row.groupFilter2Name,row.pid,row.coursePID,row.title,row.eligibilityTimeframe,row.academicLevel].map(v=>v??"").join("\0");
const iso=(value:Date|string|null|undefined)=>{if(!value)return null;const date=new Date(value);return Number.isNaN(date.getTime())?null:date.toISOString();};

/** Pure, lossless transfer-equivalency serialization. It deliberately does not deduplicate rows. */
export function transformTransfers(rows:TransferExportRow[], completedAt:Date|string|null|undefined):TransfersExport{
  const normalized=rows.map((row,index)=>{
    const raw=clean(row.courseNumber); if(!raw||!isValidTransferCourseCode(raw)) throw new Error(`Invalid transfer course number at row ${index}`);
    return {subjectPrefix:clean(row.subjectPrefix),courseNumber:normalizeTransferCourseCode(raw),title:clean(row.title),pid:clean(row.pid),eligibilityTimeframe:clean(row.eligibilityTimeframe),groupFilter2Name:clean(row.groupFilter2Name),academicLevel:clean(row.academicLevel),coursePID:clean(row.coursePID)};
  }).sort((a,b)=>stableKey(a).localeCompare(stableKey(b)));
  if(!normalized.length) throw new Error("Refusing empty transfers export");
  return {meta:{domain:"transfers",counts:{rows:normalized.length}},rows:normalized,lastModified:iso(completedAt)};
}

/** Caller supplies a bounded pool and remains responsible for closing it. */
export async function exportTransfersFromDatabase(pool:Pick<Pool,"connect">):Promise<TransfersExport>{
  const client=await pool.connect();
  try{
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const rows=await client.query<TransferExportRow>("SELECT subjectprefix AS \"subjectPrefix\", coursenumber AS \"courseNumber\", title, pid, eligibilitytimeframe AS \"eligibilityTimeframe\", groupfilter2name AS \"groupFilter2Name\", academiclevel AS \"academicLevel\", coursepid AS \"coursePID\" FROM transfer_courses ORDER BY coursenumber, subjectprefix, groupfilter2name, pid, coursepid");
    const sync=await client.query<{completed_at:Date|string|null}>("SELECT completed_at FROM transfer_sync_state WHERE id = 'transfer'");
    const result=transformTransfers(rows.rows,sync.rows[0]?.completed_at);
    await client.query("COMMIT"); return result;
  }catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}finally{client.release();}
}
