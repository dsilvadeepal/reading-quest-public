import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { readFile, stat, mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { resolve, extname, sep } from "node:path";
import worker from "./index";

// Local portfolio demo only. Never bind this unauthenticated preview to a network interface.
await mkdir(".local", { recursive: true });
const sqlite = new DatabaseSync(".local/demo.sqlite");
sqlite.exec(readFileSync("migrations/0001.sql", "utf8"));
const database = {
 prepare(sql: string) {
  let args: any[] = [];
  const statement = {
   bind(...values: any[]) { args = values; return statement; },
   async first() { return sqlite.prepare(sql).get(...args) || null; },
   async run() { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
  };
  return statement;
 }
};
const root = resolve("dist");
const mime: Record<string,string> = {".html":"text/html; charset=utf-8", ".js":"text/javascript", ".css":"text/css", ".svg":"image/svg+xml", ".jpg":"image/jpeg", ".png":"image/png"};
const env: any = {
 DB: database, LOCAL_PREVIEW: "true", VOICE_ENABLED: "false",
 AUTH_SECRET: randomBytes(32).toString("hex"), PARENT_PIN: "1234", // Public local-demo PIN, never production.
 ASSETS: { async fetch(req: Request) {
  if (!["GET","HEAD"].includes(req.method)) return new Response("Not allowed",{status:405});
  const pathname = decodeURIComponent(new URL(req.url).pathname);
  let file = resolve(root, "."+pathname);
  if(file!==root && !file.startsWith(root+sep)) return new Response("Not found",{status:404});
  try { if(!(await stat(file)).isFile()) file=resolve(root,"index.html"); }
  catch { if(extname(pathname)) return new Response("Not found",{status:404}); file=resolve(root,"index.html"); }
  return new Response(req.method==="HEAD"?null:await readFile(file),{headers:{"Content-Type":mime[extname(file)]||"application/octet-stream"}});
 }}
};
const port = 57657;
createServer(async (incoming,outgoing) => {
 try {
  if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(incoming.headers.host||"")) {
   outgoing.writeHead(403);outgoing.end("Local demo only");return;
  }
  const chunks: Buffer[]=[];let size=0;
  for await(const chunk of incoming){size+=chunk.length;if(size>2100000){outgoing.writeHead(413);outgoing.end();return;}chunks.push(chunk);}
  const headers=new Headers();for(const [key,value] of Object.entries(incoming.headers))if(value)headers.set(key,Array.isArray(value)?value.join(","):value);
  const req=new Request(`http://${incoming.headers.host}${incoming.url}`,{method:incoming.method,headers,...(!["GET","HEAD"].includes(incoming.method||"GET")?{body:Buffer.concat(chunks)}:{})});
  const res=await worker.fetch(req,env);
  outgoing.writeHead(res.status,Object.fromEntries(res.headers));outgoing.end(Buffer.from(await res.arrayBuffer()));
 } catch {outgoing.writeHead(500);outgoing.end("Local request failed");}
}).listen(port,"127.0.0.1",()=>console.log(`Local demo: http://127.0.0.1:${port} (sample data only)`));
