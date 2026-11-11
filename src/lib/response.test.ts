import {afterEach,expect,it,vi} from "vitest";
import {readText,readNativeText} from "./response";

afterEach(()=>vi.useRealTimers());
it("bounds an uncooperative body and does not wait for cancellation",async()=>{
  vi.useFakeTimers();
  const r=new Response(new ReadableStream({pull:()=>new Promise(()=>{}),cancel:()=>new Promise(()=>{})}));
  const failure=expect(readText(r,Date.now()+20)).rejects.toMatchObject({status:504});
  await vi.advanceTimersByTimeAsync(25);await failure;
});
it("rejects advertised overflow before reading and preserves failed HTTP status",async()=>{
  const r=new Response('not read',{status:503,headers:{'content-length':String(2*1024*1024+1)}});
  await expect(readNativeText(r,Date.now()+1000)).rejects.toMatchObject({status:503,data:{http_status:503,body_unavailable:true}});
});
it("preserves full failed HTTP evidence, BOM, multibyte text and line endings",async()=>{
  const text='\uFEFFα🧬\r\n'.repeat(1000);
  await expect(readText(new Response(text))).resolves.toBe(text);
  await expect(readNativeText(new Response(text,{status:400}),Date.now()+1000)).rejects.toMatchObject({status:400,data:{response:text}});
});
it("rejects malformed UTF-8 instead of substituting characters",async()=>{
  await expect(readText(new Response(new Uint8Array([0xc3,0x28])))).rejects.toThrow('UTF-8');
});
