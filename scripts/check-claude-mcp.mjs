import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { createService } from '../src/server.js';
await mkdir('data', { recursive: true });
const directory = await mkdtemp(resolve('data/claude-private-'));
const admin = 'claude-private-test-admin-at-least-32-characters';
const service = await createService({baseUrl:'http://127.0.0.1:0',protectApp:true,adminToken:admin,accessDb:join(directory,'access.sqlite')});
const origin = await service.listen(0);
const post = (url,body,headers={})=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
let child;
try {
 const invitation = await post(origin+'/api/admin/invitations',{name:'Claude CLI test'},{Authorization:'Bearer '+admin}).then(r=>r.json());
 const redeemed = await post(origin+'/api/access/redeem',{code:invitation.code},{Origin:origin});
 const cookie = redeemed.headers.get('set-cookie').split(';')[0];
 const endpoint = await post(origin+'/api/access/handoff',{},{Origin:origin,Cookie:cookie}).then(r=>r.json());
 const config = join(directory,'mcp.json');
 await writeFile(config,JSON.stringify({mcpServers:{'review-check':{type:'http',url:endpoint.url}}}),{mode:0o600});
 child=spawn('claude',['-p','This is a connection test, not a manuscript review. Call mcp__review-check__get_review_instructions once, then say only whether it succeeded. Do not review anything or launch agents.','--mcp-config',config,'--strict-mcp-config','--setting-sources','','--no-session-persistence','--tools','','--allowedTools','mcp__review-check__get_review_instructions','--output-format','json'],{cwd:directory,stdio:['ignore','pipe','pipe']});
 let output='',errors=''; child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>errors+=d);
 const timer=setTimeout(()=>child.kill('SIGTERM'),90000);
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});clearTimeout(timer);
 await writeFile(join(directory,'result.json'),output,{mode:0o600});
 const summary=await fetch(origin+'/api/admin/summary',{headers:{Authorization:'Bearer '+admin}}).then(r=>r.json());
 const called=summary.events.some(e=>e.operation==='get_review_instructions'&&e.outcome==='success');
 console.log(JSON.stringify({exit_code:code,native_tool_call_verified:called}));
 assert.equal(code,0);assert.equal(called,true,'Native Claude Code must actually call the tool');
} finally { if(child?.exitCode===null)child.kill();await service.close(); }
