#!/usr/bin/env node
// Writes one section of the coverage comment on a Checkout Engine pull request and keeps the others. The
// customization coverage and the plugin coverage come from different workflows, so each replaces only its own.
//
// Usage: node comment.mjs --section customization|plugin --report <file> --sha <head commit> [--pr <number>]
// Without --pr, or with an empty one, it comments on the open pull request with that head commit.
// Reads GITHUB_TOKEN, GITHUB_REPOSITORY and GITHUB_API_URL from the environment.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const MARKER = '<!-- ce-coverage -->';
// Comments from before the plugin coverage, which are taken over
const LEGACY_MARKERS = ['<!-- customization-coverage -->'];
// In the order they appear in the comment
export const SECTIONS = ['customization', 'plugin'];

const begin = (section, sha) => `<!-- section:${section}${sha ? ` sha=${sha}` : ''} -->`;
const end = (section) => `<!-- /section:${section} -->`;
const STALE = /<!-- stale -->\n[\s\S]*?<!-- \/stale -->\n/;
const short = (sha) => sha.slice(0, 7);

// The comment with one section replaced for a commit, the others kept from the current body. A section
// for an earlier commit says so, until its own workflow reports on this one.
export function updateBody(body, section, report, sha) {
  const sections = new Map();
  for (const s of SECTIONS) {
    const found = new RegExp(`<!-- section:${s}(?: sha=([0-9a-f]+))? -->\\n([\\s\\S]*?)\\n${end(s)}`).exec(body ?? '');
    if (found) sections.set(s, { sha: found[1], content: found[2].replace(STALE, '') });
  }
  sections.set(section, { sha, content: report.trim() });
  return [
    MARKER,
    ...SECTIONS.filter((s) => sections.has(s)).flatMap((s) => {
      const { sha: of, content } = sections.get(s);
      const stale =
        s !== section && of && sha && of !== sha
          ? [`<!-- stale -->\n> [!NOTE]\n> This is for an earlier commit, \`${short(of)}\`. The report for \`${short(sha)}\` hasn't arrived yet.\n<!-- /stale -->`]
          : [];
      return [begin(s, of), ...stale, content, end(s), ''];
    }),
  ].join('\n');
}

// The body of an existing comment in the current format. A legacy comment holds only the customization coverage.
export function currentBody(body) {
  if (body == null || body.startsWith(MARKER)) return body;
  return updateBody('', 'customization', body.replace(/^<!--.*?-->\n/, ''), undefined);
}

export const isCoverageComment = (body) => [MARKER, ...LEGACY_MARKERS].some((m) => body?.startsWith(m));

async function main() {
  const { values: opts } = parseArgs({
    options: { section: { type: 'string' }, report: { type: 'string' }, pr: { type: 'string' }, sha: { type: 'string' } },
  });
  if (!SECTIONS.includes(opts.section) || !opts.report || !opts.sha) {
    console.error(`Usage: comment.mjs --section ${SECTIONS.join('|')} --report <file> --sha <head commit> [--pr <number>]`);
    process.exit(2);
  }
  const repo = process.env.GITHUB_REPOSITORY;
  const api = async (method, path, body) => {
    const response = await fetch(`${process.env.GITHUB_API_URL ?? 'https://api.github.com'}/${path}`, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        'x-github-api-version': '2022-11-28',
      },
      body: body && JSON.stringify(body),
    });
    if (!response.ok) {
      const error = new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  };

  let pr = opts.pr;
  if (!pr) {
    // A push has no pull request in its event, so find the open one with this commit as its head
    const pulls = await api('GET', `repos/${repo}/commits/${opts.sha}/pulls`);
    pr = pulls.find((p) => p.state === 'open' && p.head.sha === opts.sha)?.number;
    if (!pr) {
      console.log(`No open pull request has ${opts.sha} as its head, so there's nothing to comment on`);
      return;
    }
  }

  try {
    let existing;
    for (let page = 1; !existing; page++) {
      const comments = await api('GET', `repos/${repo}/issues/${pr}/comments?per_page=100&page=${page}`);
      existing = comments.find((c) => isCoverageComment(c.body));
      if (comments.length < 100) break;
    }
    const body = updateBody(currentBody(existing?.body), opts.section, readFileSync(opts.report, 'utf8'), opts.sha);
    if (existing) await api('PATCH', `repos/${repo}/issues/comments/${existing.id}`, { body });
    else await api('POST', `repos/${repo}/issues/${pr}/comments`, { body });
    console.log(`Wrote the ${opts.section} coverage on pull request #${pr}`);
  } catch (error) {
    if (error.status !== 403) throw error;
    console.log(`::warning::Can't comment on pull request #${pr}. Give the workflow pull-requests: write.`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
