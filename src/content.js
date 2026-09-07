import { ServiceError } from './service-error.js';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export const skillRoot = fileURLToPath(new URL('../skills/peer-review/', import.meta.url));
export const instructions = await readFile(join(skillRoot, 'SKILL.md'), 'utf8');
const entries = new Map();
for (const [id, title] of [['technical', 'Technical reviewer'], ['editorial', 'Editorial reviewer'], ['references', 'Reference checker'], ['synthesis', 'Synthesis']]) {
  const heading = `## ${title}\n`;
  const start = instructions.indexOf(heading);
  if (start === -1) throw new Error(`Missing reviewer role: ${title}`);
  const end = instructions.indexOf('\n## ', start + heading.length);
  const content = `# ${title}\n` + instructions.slice(start + heading.length, end === -1 ? undefined : end);
  entries.set(`reviewers/${id}`, { id: `reviewers/${id}`, category: 'reviewers', title, content });
}
for (const category of ['statistics', 'reporting-standards', 'general', 'modelling', 'appraisal', 'hta']) {
  for (const filename of (await readdir(join(skillRoot, 'references/guidance', category))).sort()) {
    if (!filename.endsWith('.md')) continue;
    const content = await readFile(join(skillRoot, 'references/guidance', category, filename), 'utf8');
    const id = `${category}/${filename.slice(0, -3)}`;
    entries.set(id, { id, category, title: content.match(/^# (.+)$/m)?.[1] || filename, content });
  }
}
export const listGuidance = () => [...entries.values()].map(({ content, ...entry }) => ({ ...entry, characters: content.length }));
export function readGuidance(id) {
  const entry = entries.get(id);
  if (!entry) throw new ServiceError('guidance_unavailable', 'Unknown guidance ID.', 'Call list_guidance and use an exact returned ID.');
  return entry;
}
