import type { Pool } from "pg";
import { CATEGORY_PALETTES } from "@/lib/graphLayout";
import { getCourseNodeId, normalizeCourseCode } from "@/lib/courseCode";
import { normalizeDegreeLevel } from "@/lib/kualiParser";
import { resolvePublicCatalogUrl } from "@/lib/snhuCatalog";
import type { DegreeProgram, GroupCategory, RequirementGroup, RequirementItem, RequirementRuleMetadata } from "@/types/program";

export type ProgramExportRow = { id:string; slug:string; title:string; credential:string; catalogYear:string; totalCredits:number|null; description:string|null; sourcePid:string|null; syncedAt:Date|string|null };
export type ProgramGroupRow = { id:string; programId:string; parentId:string|null; title:string; category:GroupCategory; ruleType:string; minimumSelections:number|null; maximumSelections:number|null; minimumCredits:number|null; rawExcerpt:string|null; ruleMetadata:RequirementRuleMetadata|null; sortOrder:number };
export type ProgramCourseRow = { groupId:string; id:string; courseCode:string; title:string; credits:number|null; optional:boolean; sortOrder:number };
export type ProgramTextRow = { groupId:string; id:string; text:string; unparsed:boolean; sortOrder:number };
export type ProgramEdgeRow = { programId:string; source:string; target:string; type:string; label:string|null; title:string|null; credits:number|null; resolutionStatus:DegreeProgram["nodes"][number]["resolutionStatus"]|null };
export type ProgramsExport = { meta:{domain:"programs";counts:{programs:number}}; directory:Array<Pick<DegreeProgram,"slug"|"title"|"degreeLevel"|"credential"|"catalogYear"|"totalCredits"|"requiredCourseCount"|"description"|"sourceCatalogUrl">>; bySlug:Record<string,DegreeProgram>; sitemap:Array<{slug:string;updatedAt:string|null}>; catalogYears:string[]; lastUpdated:string|null };
export type ProgramExportInput = { programs:ProgramExportRow[]; groups:ProgramGroupRow[]; courses:ProgramCourseRow[]; texts:ProgramTextRow[]; edges:ProgramEdgeRow[] };

const byOrder = <T extends {sortOrder:number;id:string}>(a:T,b:T) => a.sortOrder-b.sortOrder || a.id.localeCompare(b.id);
const iso = (value:Date|string|null) => { if(!value) return null; const date=new Date(value); return Number.isNaN(date.getTime())?null:date.toISOString(); };
const itemType = (rule:string, optional:boolean):RequirementItem["type"] => optional?"elective":rule==="choose_n"||rule==="choose_credits"?"choice":rule==="free_elective"||rule==="elective"?"elective":"single";

export function transformPrograms(input:ProgramExportInput):ProgramsExport {
  const programRows=[...input.programs].sort((a,b)=>a.slug.localeCompare(b.slug)||a.id.localeCompare(b.id));
  if(!programRows.length) throw new Error("Refusing empty programs export");
  const slugs=new Set<string>();
  for(const row of programRows){ if(!row.id||!row.slug||!row.title||!row.credential||!row.catalogYear) throw new Error("Program is missing a required field"); if(slugs.has(row.slug)) throw new Error(`Conflicting duplicate program slug: ${row.slug}`); slugs.add(row.slug); }
  const groupById=new Map(input.groups.map(group=>[group.id,group]));
  if(groupById.size!==input.groups.length) throw new Error("Duplicate requirement group identifier");
  for(const group of input.groups){ if(!programRows.some(p=>p.id===group.programId)) throw new Error(`Requirement group ${group.id} has unknown program`); if(group.parentId && !groupById.has(group.parentId)) throw new Error(`Requirement group ${group.id} has missing parent ${group.parentId}`); if(group.parentId && groupById.get(group.parentId)?.programId!==group.programId) throw new Error(`Requirement group ${group.id} crosses program boundaries`); }
  for(const group of input.groups){ const seen=new Set<string>(); let cursor:ProgramGroupRow|undefined=group; while(cursor?.parentId){ if(seen.has(cursor.id)) throw new Error(`Requirement group cycle at ${cursor.id}`); seen.add(cursor.id); cursor=groupById.get(cursor.parentId); } }
  for(const course of input.courses) if(!groupById.has(course.groupId)||!normalizeCourseCode(course.courseCode)||!course.title) throw new Error(`Malformed requirement course ${course.id}`);
  for(const text of input.texts) if(!groupById.has(text.groupId)||!text.text.trim()) throw new Error(`Malformed text requirement ${text.id}`);

  const bySlug:Record<string,DegreeProgram>={};
  for(const programRow of programRows){
    const programGroups=input.groups.filter(g=>g.programId===programRow.id).sort(byOrder);
    if(!programGroups.length) throw new Error(`Program ${programRow.slug} has no requirement groups`);
    const nodes=new Map<string,DegreeProgram["nodes"][number]>();
    const directItems=new Map<string,RequirementItem[]>();
    const unparsed:string[]=[];
    for(const group of programGroups){
      const entries:Array<{order:number;tie:string;item:RequirementItem}>=[];
      for(const course of input.courses.filter(c=>c.groupId===group.id).sort(byOrder)){
        const code=normalizeCourseCode(course.courseCode);
        entries.push({order:course.sortOrder,tie:`c:${course.id}`,item:{id:course.id,title:`${course.courseCode}: ${course.title}`,credits:course.credits,type:itemType(group.ruleType,course.optional),description:course.optional?"Optional Course":undefined}});
        if(!nodes.has(code)) nodes.set(code,{id:getCourseNodeId(code),code,title:course.title,credits:course.credits,groupCode:group.id,groupName:group.title,groupCategory:group.category,prerequisites:[],corequisites:[]});
      }
      for(const text of input.texts.filter(t=>t.groupId===group.id).sort(byOrder)){
        const textKind=text.unparsed?"unparsed":/\bpolicy\b|must meet|eligibility/i.test(text.text)?"policy":"informational";
        entries.push({order:text.sortOrder,tie:`t:${text.id}`,item:{id:text.id,title:text.text,credits:null,type:"single",isUnparsed:text.unparsed,sourceText:text.text,textKind}});
        if(text.unparsed) unparsed.push(text.text);
      }
      directItems.set(group.id,entries.sort((a,b)=>a.order-b.order||a.tie.localeCompare(b.tie)).map(e=>e.item));
    }
    const buildGroupItem=(group:ProgramGroupRow,path:Set<string>):RequirementItem=>{ if(path.has(group.id)) throw new Error(`Requirement group cycle at ${group.id}`); const next=new Set(path).add(group.id); const children=programGroups.filter(g=>g.parentId===group.id).sort(byOrder).map(child=>buildGroupItem(child,next)); return {id:group.id,title:group.title,credits:group.minimumCredits,type:"group",subItems:[...(directItems.get(group.id)??[]),...children],ruleType:group.ruleType,minimumSelections:group.minimumSelections,maximumSelections:group.maximumSelections,minimumCredits:group.minimumCredits,ruleMetadata:group.ruleMetadata??undefined,sourceText:group.rawExcerpt??undefined}; };
    const requirementGroups:RequirementGroup[]=programGroups.filter(g=>!g.parentId).sort(byOrder).map(group=>{ const nested=buildGroupItem(group,new Set()); const palette=CATEGORY_PALETTES[group.category]??CATEGORY_PALETTES.core; return {id:group.id,title:group.title,category:group.category,totalCredits:group.minimumCredits,ruleType:group.ruleType,minimumSelections:group.minimumSelections,maximumSelections:group.maximumSelections,minimumCredits:group.minimumCredits,ruleMetadata:group.ruleMetadata??undefined,sourceText:group.rawExcerpt??undefined,items:nested.subItems??[],colorTheme:{bg:palette.bg,border:palette.border,text:"text-slate-900",badgeBg:palette.badgeBg,badgeText:palette.badgeText}}; });
    const requiredAllOf=new Set<string>(); let requiredChoices=0;
    for(const group of programGroups){ const groupCourses=input.courses.filter(c=>c.groupId===group.id&&!c.optional); if(group.ruleType==="choose_n") requiredChoices+=Math.min(group.minimumSelections??0,new Set(groupCourses.map(c=>normalizeCourseCode(c.courseCode))).size); else if(group.ruleType==="all_of"||!group.ruleType) for(const course of groupCourses) requiredAllOf.add(normalizeCourseCode(course.courseCode)); }
    const graph:DegreeProgram["edges"]=[]; const edgeKeys=new Set<string>();
    for(const edge of input.edges.filter(e=>e.programId===programRow.id).sort((a,b)=>`${a.target}\0${a.source}\0${a.type}`.localeCompare(`${b.target}\0${b.source}\0${b.type}`))){
      if(edge.type!=="prerequisite"&&edge.type!=="corequisite") throw new Error(`Unknown relationship type: ${edge.type}`);
      const source=normalizeCourseCode(edge.source),target=normalizeCourseCode(edge.target),targetNode=nodes.get(target); if(!source||!target||!targetNode) throw new Error(`Broken relationship ${edge.source} -> ${edge.target}`);
      const key=`${source}\0${target}\0${edge.type}`; if(edgeKeys.has(key)) continue; edgeKeys.add(key); const sourceId=getCourseNodeId(source);
      if(!nodes.has(source)) nodes.set(source,{id:sourceId,code:source,title:edge.title??"External Requirement",credits:edge.credits,groupCode:"external",groupName:"External Prerequisites",groupCategory:"other",isExternal:true,prerequisites:[],corequisites:[],resolutionStatus:edge.resolutionStatus??"unavailable"});
      const list=edge.type==="corequisite"?targetNode.corequisites??[]:targetNode.prerequisites??[]; if(!list.includes(sourceId)){ if(edge.type==="corequisite") targetNode.corequisites=[...list,sourceId]; else targetNode.prerequisites=[...list,sourceId]; }
      graph.push({id:`e_${sourceId}_${targetNode.id}_${edge.type}`,source:sourceId,target:targetNode.id,type:edge.type,label:edge.label??undefined});
    }
    bySlug[programRow.slug]={slug:programRow.slug,title:programRow.title,degreeLevel:normalizeDegreeLevel(programRow.credential),credential:programRow.credential,catalogYear:programRow.catalogYear,totalCredits:programRow.totalCredits,requiredCourseCount:requiredAllOf.size+requiredChoices,electiveCredits:null,estimatedDuration:"Not available",sourcePid:programRow.sourcePid?.trim()||undefined,sourceCatalogUrl:resolvePublicCatalogUrl(programRow.sourcePid),sourceName:"SNHU Academic Catalog",description:programRow.description??"",groups:requirementGroups,nodes:[...nodes.values()].sort((a,b)=>a.code.localeCompare(b.code)),edges:graph,unparsedRequirements:unparsed.length?[...new Set(unparsed)]:undefined};
  }
  const directory=Object.values(bySlug).map(program=>({slug:program.slug,title:program.title,degreeLevel:program.degreeLevel,credential:program.credential,catalogYear:program.catalogYear,totalCredits:program.totalCredits,requiredCourseCount:program.requiredCourseCount,description:program.description,sourceCatalogUrl:program.sourceCatalogUrl}));
  const sitemap=programRows.map(row=>({slug:row.slug,updatedAt:iso(row.syncedAt)})); const lastUpdated=sitemap.map(x=>x.updatedAt).filter((v):v is string=>Boolean(v)).sort().at(-1)??null;
  return {meta:{domain:"programs",counts:{programs:directory.length}},directory,bySlug,sitemap,catalogYears:[...new Set(directory.map(p=>p.catalogYear))].sort().reverse(),lastUpdated};
}

export async function exportProgramsFromDatabase(pool:Pick<Pool,"connect">):Promise<ProgramsExport>{
  const client=await pool.connect();
  try{
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const query=async<T>(sql:string)=>(await client.query(sql) as unknown as {rows:T[]}).rows;
    const result=transformPrograms({
      programs:await query<ProgramExportRow>(`SELECT p.id,p.slug,p.title,p.credential,c.year_label AS "catalogYear",p.total_credits AS "totalCredits",p.description_summary AS description,p.source_pid AS "sourcePid",p.synced_at AS "syncedAt" FROM programs p JOIN catalogs c ON c.id=p.catalog_id ORDER BY p.slug,p.id`),
      groups:await query<ProgramGroupRow>(`SELECT id,program_id AS "programId",parent_group_id AS "parentId",title,category,rule_type AS "ruleType",minimum_selections AS "minimumSelections",maximum_selections AS "maximumSelections",minimum_credits AS "minimumCredits",raw_excerpt AS "rawExcerpt",rule_metadata AS "ruleMetadata",sort_order AS "sortOrder" FROM program_requirement_groups ORDER BY program_id,sort_order,id`),
      courses:await query<ProgramCourseRow>(`SELECT id,requirement_group_id AS "groupId",course_code AS "courseCode",title,credits,is_optional AS optional,sort_order AS "sortOrder" FROM program_requirement_courses ORDER BY requirement_group_id,sort_order,id`),
      texts:await query<ProgramTextRow>(`SELECT source_path AS id,requirement_group_id AS "groupId",text,is_unparsed AS unparsed,sort_order AS "sortOrder" FROM program_text_requirements ORDER BY requirement_group_id,sort_order,source_path`),
      edges:await query<ProgramEdgeRow>(`SELECT DISTINCT prg.program_id AS "programId",e.source_course_code AS source,e.target_course_code AS target,e.relationship_type AS type,e.source_text AS label,dc.title,dc.credits,dc.resolution_status AS "resolutionStatus" FROM degree_course_edges e JOIN program_requirement_courses prc ON prc.course_code=e.target_course_code JOIN program_requirement_groups prg ON prg.id=prc.requirement_group_id LEFT JOIN degree_courses dc ON dc.course_code=e.source_course_code ORDER BY prg.program_id,e.target_course_code,e.source_course_code,e.relationship_type`),
    });
    await client.query("COMMIT"); return result;
  }catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}finally{client.release();}
}
