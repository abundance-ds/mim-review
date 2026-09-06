import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { instructions, readGuidance } from '../src/content.js';
import { workflowDocument } from '../src/docs.js';

const source = JSON.parse(await readFile(new URL('./original-review-prompts.json', import.meta.url), 'utf8'));

for (const role of source.roles) {
  test(`${role.heading} preserves the original app prompt with only documented mechanical substitutions`, () => {
    let expected = role.original;
    for (const [before, after] of role.mechanical_replacements) {
      assert.ok(expected.includes(before), `Outdated substitution in ${role.id}`);
      expected = expected.replaceAll(before, after);
    }
    const heading = `## ${role.heading}\n`;
    const actual = instructions.split(heading)[1]?.split('\n## ')[0].trim();
    assert.equal(actual, expected);
    const standalone = readGuidance(`reviewers/${role.id}`).content;
    assert.equal(standalone.slice(standalone.indexOf('\n') + 1).trim(), expected);
    assert.ok(workflowDocument('https://review.example').includes(expected));
  });
}

test('The coordinator launches three reviewers and performs synthesis itself', () => {
  assert.match(instructions, /MUST launch exactly three independent reviewer subagents/);
  assert.match(instructions, /Run them in parallel/);
  assert.match(instructions, /Wait for all three results/);
  assert.match(instructions, /main agent then writes the summary itself/);
  assert.match(instructions, /Do not launch a fourth report-writing or synthesis agent/);
});
