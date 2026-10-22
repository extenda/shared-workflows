// Tests for the sections of the coverage comment. Usage: node --test composite-actions/ce-coverage/comment.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { currentBody, isCoverageComment, MARKER, updateBody, writeSection } from './comment.mjs';

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
  assert.ok(pushed.includes('This is for an earlier commit, `aaaaaaa`.'));
  // Under the section's own heading, so it isn't read as part of the section above it
  assert.ok(pushed.indexOf('earlier commit') > pushed.indexOf('### Plugin coverage'));
  // Written again for the new commit, the note goes away and leaves the section as it was
  const caughtUp = updateBody(pushed, 'plugin', PLUGIN, 'bbbbbbb2');
  assert.ok(!caughtUp.includes('earlier commit'));
  assert.equal(caughtUp.match(/stale/g), null);
  assert.equal(updateBody(pushed, 'customization', CUSTOMIZATION, 'bbbbbbb2'), pushed);
  assert.equal(caughtUp, updateBody(updateBody(undefined, 'customization', CUSTOMIZATION, 'bbbbbbb2'), 'plugin', PLUGIN, 'bbbbbbb2'));
});

test('a note written before the heading by an earlier version moves under it', () => {
  const old = [
    MARKER,
    '<!-- section:customization sha=bbbbbbb2 -->', CUSTOMIZATION, '<!-- /section:customization -->', '',
    '<!-- section:plugin sha=aaaaaaa1 -->',
    '<!-- stale -->\n> [!NOTE]\n> This is for an earlier commit, `aaaaaaa`.\n<!-- /stale -->',
    PLUGIN, '<!-- /section:plugin -->', '',
  ].join('\n');
  const body = updateBody(old, 'customization', CUSTOMIZATION, 'ccccccc3');
  assert.equal(body.match(/earlier commit/g).length, 1);
  assert.ok(body.indexOf('earlier commit') > body.indexOf('### Plugin coverage'));
  assert.ok(updateBody(old, 'plugin', PLUGIN, 'bbbbbbb2').includes(`<!-- section:plugin sha=bbbbbbb2 -->\n${PLUGIN}\n`));
});

test('a section without a heading gets the note first', () => {
  const first = updateBody(updateBody(undefined, 'customization', CUSTOMIZATION, 'aaaaaaa1'), 'plugin', 'No heading', 'aaaaaaa1');
  const pushed = updateBody(first, 'customization', CUSTOMIZATION, 'bbbbbbb2');
  assert.ok(pushed.includes('<!-- /stale -->\n\nNo heading'));
  assert.ok(updateBody(pushed, 'plugin', 'No heading', 'bbbbbbb2').includes('<!-- section:plugin sha=bbbbbbb2 -->\nNo heading\n'));
});

test('a stale note is replaced, not repeated', () => {
  let body = updateBody(updateBody(undefined, 'customization', CUSTOMIZATION, 'aaaaaaa1'), 'plugin', PLUGIN, 'aaaaaaa1');
  body = updateBody(body, 'customization', CUSTOMIZATION, 'bbbbbbb2');
  body = updateBody(body, 'customization', CUSTOMIZATION, 'ccccccc3');
  assert.equal(body.match(/earlier commit/g).length, 1);
});

test('other comments are left alone', () => {
  assert.ok(!isCoverageComment('LGTM'));
  assert.ok(!isCoverageComment(undefined));
});

// An in-memory GitHub with one pull request. other() runs while writeSection pauses, like the other workflow.
function fakeGitHub(head, other = () => {}) {
  const state = { head, comments: [], next: 1 };
  const id = (path) => Number(path.split('/').at(-1));
  const api = async (method, path, body) => {
    if (method === 'GET' && /\/pulls\/\d+$/.test(path)) return { head: { sha: state.head } };
    if (method === 'GET') return path.endsWith('page=1') ? state.comments.map((c) => ({ ...c })) : [];
    if (method === 'POST') state.comments.push({ id: state.next++, body: body.body });
    if (method === 'PATCH') state.comments.find((c) => c.id === id(path)).body = body.body;
    if (method === 'DELETE') state.comments = state.comments.filter((c) => c.id !== id(path));
    return null;
  };
  let pauses = 0;
  const pause = async () => other(state, ++pauses);
  return { state, write: (section, report, sha) => writeSection(api, 'o/r', 1, section, report, sha, pause) };
}

test('a section is written and read back', async () => {
  const github = fakeGitHub('aaaaaaa1');
  assert.match(await github.write('customization', CUSTOMIZATION, 'aaaaaaa1'), /^Wrote the customization coverage/);
  assert.equal(github.state.comments.length, 1);
  assert.ok(github.state.comments[0].body.includes(CUSTOMIZATION));
});

test('a section the other workflow overwrote at the same time is written again', async () => {
  // The other workflow read the comment before this one wrote, and writes its section on the old body
  const github = fakeGitHub('aaaaaaa1', (state, n) => {
    if (n === 1) state.comments[0].body = updateBody(undefined, 'plugin', PLUGIN, 'aaaaaaa1');
  });
  await github.write('customization', CUSTOMIZATION, 'aaaaaaa1');
  assert.equal(github.state.comments.length, 1);
  assert.ok(github.state.comments[0].body.includes(CUSTOMIZATION));
  assert.ok(github.state.comments[0].body.includes(PLUGIN));
});

test('two comments created at the same time become the oldest one', async () => {
  const github = fakeGitHub('aaaaaaa1', (state, n) => {
    if (n === 1) state.comments.push({ id: state.next++, body: updateBody(undefined, 'plugin', PLUGIN, 'aaaaaaa1') });
  });
  await github.write('customization', CUSTOMIZATION, 'aaaaaaa1');
  assert.deepEqual(github.state.comments.map((c) => c.id), [1]);
  assert.ok(github.state.comments[0].body.includes(CUSTOMIZATION));
  assert.ok(github.state.comments[0].body.includes(PLUGIN));
});

test('a report for an earlier commit than the head is not written', async () => {
  const github = fakeGitHub('bbbbbbb2');
  github.state.comments.push({ id: github.state.next++, body: updateBody(undefined, 'plugin', PLUGIN, 'bbbbbbb2') });
  assert.match(await github.write('plugin', '### Plugin coverage\n\nold', 'aaaaaaa1'), /isn't written/);
  assert.ok(github.state.comments[0].body.includes(PLUGIN));
});

test('it stops after three overwrites', async () => {
  const github = fakeGitHub('aaaaaaa1', (state) => {
    state.comments[0].body = updateBody(undefined, 'plugin', PLUGIN, 'aaaaaaa1');
  });
  assert.match(await github.write('customization', CUSTOMIZATION, 'aaaaaaa1'), /overwritten three times/);
});
