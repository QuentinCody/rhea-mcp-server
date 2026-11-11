/// <reference types="node" />
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
import { McpServer } from "@bio-mcp/shared/mcp";
import { verifyCitationEnvelope } from "@bio-mcp/shared";
import { DynamicWorkerExecutor } from "@bio-mcp/shared/codemode/execute-tool";
vi.mock("cloudflare:workers", () => ({ RpcTarget: class {}, DurableObject: class { constructor(public ctx: unknown, public env: unknown) {} } }));
import { RheaDataDO } from "../do";
import { registerCodeMode } from "./code-mode";
import { registerQueryData } from "./query-data";
import { registerGetSchema } from "./get-schema";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function createStore() {
  const database = new DatabaseSync(":memory:");
  let ready = Promise.resolve();
  const exec = (query: string, ...values: any[]) => {
    const rows = database.prepare(query).all(...values);
    const iterator = rows[Symbol.iterator]();
    return { toArray: () => rows, one: () => rows[0], next: () => iterator.next(), [Symbol.iterator]: () => iterator };
  };
  const transactionSync = <T>(run: () => T): T => {
    database.exec("BEGIN");
    try { const result = run(); database.exec("COMMIT"); return result; }
    catch (error) { database.exec("ROLLBACK"); throw error; }
  };
  const ctx = { blockConcurrencyWhile: (run: () => Promise<void>) => { ready = run(); return ready; }, storage: { sql: { exec }, transactionSync } };
  const instance = new RheaDataDO(ctx as unknown as DurableObjectState, {} as Cloudflare.Env);
  return { database, instance, ready };
}

function fixture() {
  // Exercise generated API helpers and user code; replace only the platform isolate.
  vi.spyOn(DynamicWorkerExecutor.prototype, "execute").mockImplementation(async (code, functions) => {
    const staged: Array<Record<string, unknown>> = [];
    try {
      const run = new Function("codemode", "__stagedResults", "console", `return (${code})();`);
      const result = await run(functions, staged, { warn() {}, log() {} });
      return { result: JSON.parse(JSON.stringify(result)), __stagedResults: staged };
    } catch (error) { return { error: String((error as Error).message), __stagedResults: staged }; }
  });
  const stores = new Map<string, ReturnType<typeof createStore>>();
  const namespace = { idFromName: (name: string) => name, get: (id: string) => ({ fetch: async (request: Request) => {
    let store = stores.get(id);
    if (!store) { store = createStore(); stores.set(id, store); }
    await store.ready;
    return store.instance.fetch(request);
  } }) };
  const env = { RHEA_DATA_DO: namespace, CODE_MODE_LOADER: { get: () => ({}) } } as unknown as Parameters<typeof registerCodeMode>[1];
  const server = new McpServer({ name: "fixture", version: "1" });
  registerCodeMode(server, env); registerQueryData(server, env); registerGetSchema(server, env);
  const tools = (server as unknown as { _registeredTools: Record<string, { handler: (args: unknown, extra: unknown) => Promise<any> }> })._registeredTools;
  return { tools, close: () => { for (const store of stores.values()) store.database.close(); } };
}

async function recover(f: ReturnType<typeof fixture>, id: string, prefix: string) {
  const rows = async (sql: string) => {
    const output = await f.tools[`${prefix}rhea_query_data`].handler({ data_access_id: id, sql }, {});
    expect(output.isError, JSON.stringify(output)).not.toBe(true);
    expect(output.structuredContent.staged).not.toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(output)).byteLength).toBeLessThan(30720);
    return output.structuredContent.data.rows;
  };
  const text = async (table: string, column: string, where: string) => {
    const [{ n }] = await rows(`SELECT length(${column}) AS n FROM ${table} WHERE ${where}`);
    let result = "";
    for (let start = 1; start <= n; start += 1000) {
      const [row] = await rows(`SELECT substr(${column}, ${start}, 1000) AS part FROM ${table} WHERE ${where}`);
      result += row.part;
    }
    return result;
  };
  let raw = await text("payloads", "root_json", "id = 1");
  if (raw.startsWith("__CHUNKED__:")) {
    const chunk = raw.slice("__CHUNKED__:".length);
    expect(chunk).toMatch(/^chunk_[a-f0-9]{32}$/);
    const parts = await rows(`SELECT chunk_index FROM content_chunks WHERE content_id = '${chunk}' ORDER BY chunk_index`);
    raw = "";
    for (const part of parts) raw += await text("content_chunks", "chunk_data", `content_id = '${chunk}' AND chunk_index = ${part.chunk_index}`);
  }
  const decoded = JSON.parse(raw);
  return typeof decoded === "string" ? JSON.parse(decoded) : decoded;
}


const uri = (value: string) => ({type:"uri",value});
const literal = (value: string,extra = {}) => ({type:"literal",value,...extra});
const release = '<h1>SPARQL Rhea 2026_03</h1><p>Rhea data of release 2026_03 (2026-09-02)</p>';

it("preserves RDF terms, optional bindings, page coverage and large SQL recovery through both aliases", async () => {
  const f=fixture();
  const vars=["rhea","side","participant","compound","mapping","chebi","name","coefficient","position","reactivePart","coefficientPredicate","sideOrder","sideRelation"];
  const bindings=Array.from({length:150},(_,i)=>({rhea:uri("http://rdf.rhea-db.org/10336"),side:uri("http://rdf.rhea-db.org/10336_L"),sideRelation:uri("http://rdf.rhea-db.org/side"),participant:uri(`http://rdf.rhea-db.org/Participant_${i}`),compound:uri(`http://rdf.rhea-db.org/Compound_${i}`),mapping:literal(["direct","reactive_part","polymer_underlying"][i%3]),chebi:uri(`http://purl.obolibrary.org/obo/CHEBI_${i+1}`),name:literal("α🧬".repeat(100),{"xml:lang":"en"}),...(i%2?{coefficient:literal("2",{datatype:"http://www.w3.org/2001/XMLSchema#integer"})}:{}),...(i%3?{position:literal("L")}: {})}));
  const native={head:{vars},results:{bindings}};
  vi.stubGlobal("fetch",vi.fn(async(url:string)=>url.includes('/.well-known/void')?new Response(release):Response.json(native,{headers:{"content-type":"application/sparql-results+json"}})));
  try{for(const prefix of ["","mcp_"]){
    const args={code:"return await api.get('/sparql/participants',{rhea_id:'RHEA:10336',limit:150});"};
    const output=await f.tools[prefix+'rhea_execute'].handler(args,{});
    expect(output.isError,JSON.stringify(output)).not.toBe(true);
    expect(output.structuredContent._meta.completeness).toMatchObject({complete:false,returned:150});
    const id=output.structuredContent.data.data_access_id;
    const recovered=await recover(f,id,prefix);
    expect(recovered).toMatchObject(native);expect(recovered._rhea.at_limit).toBe(true);
    const checked=await verifyCitationEnvelope({citation:output.structuredContent._meta.citation,structuredContent:output.structuredContent,toolArguments:args,materialized:{value:recovered}});
    expect(checked.verification).toMatchObject({query:"verified",result:"verified"});
    const q={data_access_id:id,sql:'SELECT participant_value,mapping_value,coefficient_value,coefficient_datatype FROM bindings ORDER BY _rowid',limit:200};
    const rows=await f.tools[prefix+'rhea_query_data'].handler(q,{});
    expect(rows.isError,JSON.stringify(rows)).not.toBe(true);
    expect(rows.structuredContent.data.rows).toEqual(bindings.map((r:any)=>({participant_value:r.participant.value,mapping_value:r.mapping.value,coefficient_value:r.coefficient?.value??null,coefficient_datatype:r.coefficient?.datatype??null})));
    const large=await f.tools[prefix+'rhea_query_data'].handler({data_access_id:id,sql:'SELECT * FROM bindings',limit:50},{});
    expect(large.isError,JSON.stringify(large)).not.toBe(true);
    expect((await recover(f,large.structuredContent.data_access_id,prefix)).structuredContent.data.rows).toHaveLength(50);
    const schemaArgs={data_access_id:id};
    const schema=await f.tools[prefix+'rhea_get_schema'].handler(schemaArgs,{});
    const schemaProof=await verifyCitationEnvelope({citation:schema.structuredContent._meta.citation,structuredContent:schema.structuredContent,toolArguments:schemaArgs});
    expect(schemaProof.verification).toMatchObject({query:"verified",result:"verified"});
  }}finally{f.close();}
});

it("retains native search records and conservative composed coverage",async()=>{
  const f=fixture();const native={count:100,results:Array.from({length:100},(_,i)=>({id:String(i),equation:'α🧬'.repeat(100),balanced:true,transport:false}))};
  vi.stubGlobal("fetch",vi.fn(async()=>Response.json(native)));
  try{for(const prefix of ["","mcp_"]){
    const result=await f.tools[prefix+'rhea_execute'].handler({code:"return {lookup:await api.get('/rhea',{query:'fixture',limit:100})};"},{});
    expect(result.isError,JSON.stringify(result)).not.toBe(true);
    expect(result.structuredContent._meta.completeness).toMatchObject({complete:false,returned:100});
    expect(result.structuredContent._meta.completeness.total_available).toBeUndefined();
    const inner=result.structuredContent.data.lookup;
    expect(await recover(f,inner.data_access_id,prefix)).toEqual(native);
    const sql=await f.tools[prefix+'rhea_query_data'].handler({data_access_id:inner.data_access_id,sql:'SELECT id,balanced,transport FROM reactions ORDER BY _rowid',limit:200},{});
    expect(sql.isError,JSON.stringify(sql)).not.toBe(true);
    expect(sql.structuredContent.data.rows).toEqual(native.results.map(x=>({id:x.id,balanced:1,transport:0})));
  }}finally{f.close();}
});

it("retains complete native HTTP error evidence and stages large user programs",async()=>{
  const f=fixture();const body="native failure α🧬".repeat(6000);
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(body,{status:400})));
  try{for(const prefix of ["","mcp_"]){
    const r=await f.tools[prefix+'rhea_execute'].handler({code:"return await api.get('/sparql/release');"},{});
    expect(r).toMatchObject({isError:true,content:expect.any(Array),structuredContent:{success:false,data:{status:400}}});
    const evidence=await recover(f,r.structuredContent.data.data.data_access_id,prefix);
    expect(evidence).toEqual({response:body});
    const big=await f.tools[prefix+'rhea_execute'].handler({code:"return {text:'α🧬'.repeat(15000)};"},{});
    expect(new TextEncoder().encode(JSON.stringify(big)).byteLength).toBeLessThan(30720);
    expect((await recover(f,big.structuredContent.data_access_id,prefix)).structuredContent.data.text).toBe('α🧬'.repeat(15000));
  }}finally{f.close();}
});
