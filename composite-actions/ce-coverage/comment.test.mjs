// Tests for the sections of the coverage comment. Usage: node --test composite-actions/ce-coverage/comment.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { currentBody, isCoverageComment, MARKER, updateBody } from './comment.mjs';

const CUSTOMIZATION = '### Customization coverage\n\n✅ **This pull request changes no customizations.**';
const PLUGIN = '### Plugin coverage\n\n**78.2%** of the plugins\' lines ran';

test('a new comment has the one section', () => {
  const body = updateBody(undefined, 'customization', `${CUSTOMIZATION}\n`);
  assert.equal(body, `${MARKER}\n<!-- section:customization -->\n${CUSTOMIZATION}\n<!-- /section:customization -->\n`);
  assert.ok(isCoverageComment(body));
});

test('the plugin coverage is added after the customization coverage', () => {
  const body = updateBody(updateBody(undefined, 'customization', CUSTOMIZATION), 'plugin', PLUGIN);
  assert.ok(body.indexOf(CUSTOMIZATION) < body.indexOf(PLUGIN));
});

test('the customization coverage keeps its place when it comes last', () => {
  const body = updateBody(updateBody(undefined, 'plugin', PLUGIN), 'customization', CUSTOMIZATION);
  assert.ok(body.indexOf(CUSTOMIZATION) < body.indexOf(PLUGIN));
});

test('a section is replaced and the other kept', () => {
  const both = updateBody(updateBody(undefined, 'customization', CUSTOMIZATION), 'plugin', PLUGIN);
  const body = updateBody(both, 'customization', '### Customization coverage\n\n⚠️ Changed');
  assert.ok(body.includes('⚠️ Changed'));
  assert.ok(!body.includes(CUSTOMIZATION));
  assert.ok(body.includes(PLUGIN));
  assert.equal(body.match(/section:plugin -->/g).length, 2);
});

test('a legacy comment becomes the customization section', () => {
  const legacy = `<!-- customization-coverage -->\n${CUSTOMIZATION}\n`;
  assert.ok(isCoverageComment(legacy));
  const body = updateBody(currentBody(legacy), 'plugin', PLUGIN);
  assert.ok(body.startsWith(MARKER));
  assert.ok(body.includes(`<!-- section:customization -->\n${CUSTOMIZATION}\n<!-- /section:customization -->`));
  assert.ok(body.includes(PLUGIN));
});

test('a section for an earlier commit says so, until its own report arrives', () => {
  const first = updateBody(updateBody(undefined, 'customization', CUSTOMIZATION, 'aaaaaaa1'), 'plugin', PLUGIN, 'aaaaaaa1');
  assert.ok(!first.includes('earlier commit'));
  const pushed = updateBody(first, 'customization', CUSTOMIZATION, 'bbbbbbb2');
  assert.ok(pushed.includes('This is for an earlier commit, `aaaaaaa`. The report for `bbbbbbb` hasn\'t arrived yet.'));
  assert.ok(pushed.indexOf('earlier commit') > pushed.indexOf('section:plugin'));
  // Written again for the new commit, the note goes away
  const caughtUp = updateBody(pushed, 'plugin', PLUGIN, 'bbbbbbb2');
  assert.ok(!caughtUp.includes('earlier commit'));
  assert.equal(caughtUp.match(/stale/g), null);
});

test('a stale note is replaced, not repeated', () => {
  let body = updateBody(updateBody(undefined, 'customization', CUSTOMIZATION, 'aaaaaaa1'), 'plugin', PLUGIN, 'aaaaaaa1');
  body = updateBody(body, 'customization', CUSTOMIZATION, 'bbbbbbb2');
  body = updateBody(body, 'customization', CUSTOMIZATION, 'ccccccc3');
  assert.equal(body.match(/earlier commit/g).length, 1);
  assert.ok(body.includes('The report for `ccccccc` hasn\'t arrived yet.'));
});

test('other comments are left alone', () => {
  assert.ok(!isCoverageComment('LGTM'));
  assert.ok(!isCoverageComment(undefined));
});
