#!/usr/bin/env node
// Writes one section of the coverage comment on a Checkout Engine pull request and keeps the others. The
// customization coverage and the plugin coverage come from different workflows, so each replaces only its own.
//
// Usage: node comment.mjs --section customization|plugin --report <file> --sha <head commit> [--pr <number>]
// Without --pr, or with an empty one, it comments on the open pull request with that head commit.
// Reads GITHUB_TOKEN, GITHUB_REPOSITORY and GITHUB_API_URL from the environment.
import { readFileSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';
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

// The sections of a comment, without their notes: section -> { sha, content }
function sectionsOf(body) {
  const sections = new Map();
  for (const s of SECTIONS) {
    const found = new RegExp(`<!-- section:${s}(?: sha=([0-9a-f]+))? -->\\n([\\s\\S]*?)\\n${end(s)}`).exec(body ?? '');
    if (found) sections.set(s, { sha: found[1], content: found[2].replace(STALE, '') });
  }
  return sections;
}

// The comment with its sections in order. A section for an earlier commit than the one just written says so,
// until its own workflow reports on that commit. That may not happen, e.g. when the acceptance tests ignore
// the pushed paths, so the note doesn't promise it.
function bodyOf(sections, written, sha) {
  return [
    MARKER,
    ...SECTIONS.filter((s) => sections.has(s)).flatMap((s) => {
      const { sha: of, content } = sections.get(s);
      const stale =
        s !== written && of && sha && of !== sha
          ? [`<!-- stale -->\n> [!NOTE]\n> This is for an earlier commit, \`${short(of)}\`.\n<!-- /stale -->`]
          : [];
      return [begin(s, of), ...stale, content, end(s), ''];
    }),
  ].join('\n');
}

// The comment with one section replaced for a commit, the others kept from the current body
export function updateBody(body, section, report, sha) {
  const sections = sectionsOf(body);
  sections.set(section, { sha, content: report.trim() });
  return bodyOf(sections, section, sha);
}

// The body of an existing comment in the current format. A legacy comment holds only the customization coverage.
export function currentBody(body) {
  if (body == null || body.startsWith(MARKER)) return body;
  return updateBody('', 'customization', body.replace(/^<!--.*?-->\n/, ''), undefined);
}

export const isCoverageComment = (body) => [MARKER, ...LEGACY_MARKERS].some((m) => body?.startsWith(m));

// The pull request's coverage comments, oldest first
async function coverageComments(api, repo, pr) {
  const found = [];
  for (let page = 1; ; page++) {
    const comments = await api('GET', `repos/${repo}/issues/${pr}/comments?per_page=100&page=${page}`);
    found.push(...comments.filter((c) => isCoverageComment(c.body)));
    if (comments.length < 100) return found;
  }
}

// Writes the section, then reads the comment back. The other workflow can write at the same time: one write can
// then drop the other's section, or both can create a comment. So it writes again until its section is there, and
// keeps the oldest coverage comment with the sections of the others. Only a report for the pull request's head is
// written, so an older run never replaces a newer report. Returns what it did.
export async function writeSection(api, repo, pr, section, report, sha, pause = () => setTimeout(3000)) {
  const ours = report.trim();
  for (let attempt = 0; ; attempt++) {
    const pull = await api('GET', `repos/${repo}/pulls/${pr}`);
    if (pull.head.sha !== sha) {
      return `The head of pull request #${pr} is ${short(pull.head.sha)} now, so the ${section} coverage of ${short(sha)} isn't written`;
    }
    const [comment, ...duplicates] = await coverageComments(api, repo, pr);
    const sections = sectionsOf(currentBody(comment?.body));
    for (const duplicate of duplicates) {
      for (const [s, value] of sectionsOf(currentBody(duplicate.body))) if (!sections.has(s)) sections.set(s, value);
    }
    const current = sections.get(section);
    if (attempt > 0 && !duplicates.length && current?.sha === sha && current.content === ours) {
      return `Wrote the ${section} coverage on pull request #${pr}`;
    }
    if (attempt === 3) return `::warning::The ${section} coverage on pull request #${pr} was overwritten three times`;
    sections.set(section, { sha, content: ours });
    const body = bodyOf(sections, section, sha);
    if (comment) await api('PATCH', `repos/${repo}/issues/comments/${comment.id}`, { body });
    else await api('POST', `repos/${repo}/issues/${pr}/comments`, { body });
    for (const duplicate of duplicates) await api('DELETE', `repos/${repo}/issues/comments/${duplicate.id}`);
    await pause();
  }
}

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
    return response.status === 204 ? null : response.json();
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
    console.log(await writeSection(api, repo, pr, opts.section, readFileSync(opts.report, 'utf8'), opts.sha));
  } catch (error) {
    if (error.status !== 403) throw error;
    console.log(`::warning::Can't comment on pull request #${pr}. Give the workflow pull-requests: write.`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
