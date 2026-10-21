#!/usr/bin/env node
// Customization coverage: compares the values a pull request changes in each file and reports which
// customizations it touches and whether acceptance scenarios test them.
//
// Usage: node customization-coverage.mjs --base <rev> [--head <rev>] [--repo <dir>] [--out <file>]
//                                         [--fail-on none|unmapped|untested]
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { parse as parseYaml } from 'yaml';

const TAG_PREFIX = '@customization:';

// Rules for every Checkout Engine repo. A repo adds to them in its manifest.
const DEFAULTS = {
  manifest: ['acceptance/customizations.yaml', '.acceptance/customizations.yaml'],
  features: ['acceptance/cucumber/features', '.acceptance/cucumber/features'],
  tests: ['{,.}acceptance/**'],
  ignore: [
    '.github/**', '.claude/**', '.run/**', '.mvn/**', '.api-collection/**',
    '**/*.md', '.*ignore', '.editorconfig', '.pre-commit-config.yaml', '.java-version', '.nvmrc',
    'mvnw', 'mvnw.cmd', 'docker-compose*.yaml', 'docker-compose*.yml',
    'launch-darkly-*.json', // Only read without a LaunchDarkly key, never in the cloud
    '{,.}testdata/**', '{,.}refdata/**', '**/src/test/**',
    // Module lists, build plugins and versions aren't behaviour; the module's own files are, and the
    // core version is the Dockerfile's FROM.
    '**/pom.xml',
  ],
  text: ['**/language/**/*.properties'],
  deploy: ['**/cloud-deploy*.yaml', '**/cloud-deploy*.yml'],
  // Spring configuration that registers the plugins' beans. A change here counts with the
  // customization it registers.
  registration: ['**/src/main/java/**/config/*Config.java'],
};

// Names that only point the engine at its environment. Matched against the last part of a key.
const WIRING = {
  envKey: /(_URL|_URI|_HOST|_PORT|_ADDRESS|_ENDPOINT|_BUCKET|_KEY|_SECRET|_PASSWORD|_TOKEN|_AUDIENCE|_CLIENT_ID)$/,
  envValue: /^['"]?(sm:\/\/|https?:\/\/)/,
  propertyKey: /(^|\.)(url|uri|host|port|address|serveraddress|endpoint|audience|clientid|clientsecret|tokenendpointurl|apikey|api\.key)$|timeout/i,
  xmlName: /(Url|Uri|Host|Port|Address|Endpoint|ApiKey|Timeout)$/,
};

const { values: opts } = parseArgs({
  options: {
    repo: { type: 'string', default: '.' },
    base: { type: 'string' },
    head: { type: 'string', default: 'HEAD' },
    out: { type: 'string' },
    'fail-on': { type: 'string', default: 'none' },
  },
});
if (!opts.base) {
  console.error('--base is required');
  process.exit(2);
}

const run = (args, encoding) =>
  execFileSync('git', ['-C', opts.repo, '-c', 'core.quotePath=false', ...args], {
    encoding,
    maxBuffer: 1 << 28,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
const git = (...args) => run(args, 'utf8');

const globCache = new Map();
function globToRegExp(glob) {
  let re = '';
  let braces = 0;
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      i++;
      if (glob[i + 1] === '/') {
        i++;
        re += '(?:.*/)?';
      } else {
        re += '.*';
      }
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else if (c === '{') {
      braces++;
      re += '(?:';
    } else if (c === '}' && braces) {
      braces--;
      re += ')';
    } else if (c === ',' && braces) re += '|';
    else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}
function matches(globs, value) {
  if (!globs || value == null) return false;
  return globs.some((glob) => {
    if (!globCache.has(glob)) globCache.set(glob, globToRegExp(glob));
    return globCache.get(glob).test(value);
  });
}

// Java reads properties files as ISO-8859-1 when they aren't valid UTF-8, and so does this.
const utf8 = new TextDecoder('utf-8', { fatal: true });
const latin1 = new TextDecoder('latin1');
function decode(buffer) {
  try {
    return utf8.decode(buffer);
  } catch {
    return latin1.decode(buffer);
  }
}

// A file's text at a revision, or null when the file doesn't exist there.
const contentCache = new Map();
function contentAt(rev, path) {
  const key = `${rev}:${path}`;
  if (!contentCache.has(key)) {
    try {
      contentCache.set(key, decode(run(['show', key], 'buffer')));
    } catch {
      contentCache.set(key, null);
    }
  }
  return contentCache.get(key);
}

// Changed files, with the path before and after. A path is null when the file is added or deleted. Renames
// (R) have both paths.
function readChanges(base) {
  const fields = git('diff', '--name-status', '-z', '-M', base, opts.head).split('\0').slice(0, -1);
  const files = [];
  while (fields.length) {
    const status = fields.shift();
    const oldPath = fields.shift();
    const newPath = status.startsWith('R') ? fields.shift() : oldPath;
    files.push({
      oldPath: status === 'A' ? null : oldPath,
      newPath: status === 'D' ? null : newPath,
      path: status === 'D' ? oldPath : newPath,
    });
  }
  return files;
}

// The rest of each file is flattened to its values, keyed like a manifest key, so formatting,
// comments and order don't count as changes. Each entry is { value, sig }: the value to show, and
// what must stay the same for the entry to be unchanged.

const XML_TOKEN =
  /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<[?!][^>]*>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
const XML_ATTR = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

// Every named element, keyed by the names around it, e.g. Business/Receipt/BarCode/RetailStoreIdLength.
// Unnamed elements and CDATA belong to the named element around them, so a change inside a menu tree
// is a change of the Menus value. The document element's attributes, e.g. <config version="1">, belong to
// the file's own key '' when rootAttributes is set, for files that exist before and after.
function flattenXml(text, rootAttributes) {
  const entries = new Map();
  const entry = (key) => {
    if (!entries.has(key)) entries.set(key, { value: '', sig: '' });
    return entries.get(key);
  };
  // A named element without content or named children, e.g. <value name="X"/>, is a key of its own.
  // A group's name alone is structure: the values inside are the change.
  const closeNamed = (element) => {
    if (!element.parent && !entries.has(element.key)) entry(element.key).sig = '<empty>';
  };
  const stack = [{ key: '', named: true }];
  for (const [, cdata, closeTag, openTag, attrText, selfClose, chars] of text.matchAll(XML_TOKEN)) {
    const owner = stack.findLast((e) => e.named);
    if (chars != null || cdata != null) {
      const value = (chars ?? cdata).replace(/\s+/g, ' ').trim();
      if (!value) continue;
      const e = entry(owner.key);
      e.value = e.value ? `${e.value} ${value}` : value;
      e.sig += ` ${value}`;
    } else if (openTag) {
      const attrs = [...attrText.matchAll(XML_ATTR)].map(([, name, double, single]) => [name, double ?? single]);
      const name = attrs.find(([n]) => n === 'name')?.[1];
      const rest = attrs.filter(([n]) => n !== 'name').map(([n, v]) => `${n}="${v}"`).sort().join(' ');
      if (name != null) {
        const key = owner.key ? `${owner.key}/${name}` : name;
        owner.parent = true;
        if (rest) entry(key).sig += rest;
        const element = { tag: openTag, key, named: true };
        if (selfClose) closeNamed(element);
        else stack.push(element);
      } else {
        const root = stack.length === 1;
        if (root) {
          if (rest && rootAttributes) entry('').sig += `<${openTag} ${rest}>`;
        } else {
          entry(owner.key).sig += `<${openTag} ${rest}${selfClose}>`;
        }
        if (!selfClose) stack.push({ tag: openTag, named: false, root });
      }
    } else if (closeTag) {
      const index = stack.findLastIndex((e) => e.tag === closeTag);
      if (index > 0) {
        const element = stack[index];
        if (element.named) closeNamed(element);
        else if (!element.root) entry(owner.key).sig += `</${closeTag}>`;
        stack.length = index;
      }
    }
  }
  return entries;
}

// As java.util.Properties reads them: the key ends at the first unescaped =, : or whitespace
const PROPERTY = /^((?:\\.|[^\s=:\\])*)\s*[=:]?\s*(.*)$/;
const unescapeProperty = (text) =>
  text.replace(/\\u([0-9a-fA-F]{4})|\\(.)/g, (_, hex, char) => (hex ? String.fromCharCode(parseInt(hex, 16)) : char));

function flattenProperties(text) {
  const entries = new Map();
  for (const raw of text.replace(/\\\r?\n\s*/g, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^[#!]/.test(line)) continue;
    const [, key, value] = PROPERTY.exec(line);
    entries.set(unescapeProperty(key), { value: unescapeProperty(value), sig: value });
  }
  return entries;
}

// Leaf values keyed by their path, e.g. environments.production.env.VOYADO_URL. Null when the file
// isn't valid YAML.
function flattenYaml(text) {
  let doc;
  try {
    doc = parseYaml(text, { merge: true });
  } catch {
    return null;
  }
  const entries = new Map();
  const walk = (node, path) => {
    if (node && typeof node === 'object') {
      for (const [key, child] of Object.entries(node)) walk(child, [...path, key]);
    } else {
      // Compared with its type, so false, "false" and null are different values
      entries.set(path.join('.'), { value: node == null ? '' : String(node), sig: JSON.stringify(node ?? null), path });
    }
  };
  walk(doc, []);
  return entries;
}

// Null for files that aren't configuration; those are compared as code. both is set when the file exists
// before and after.
function flatten(path, text, both) {
  if (text == null) return new Map();
  if (path.endsWith('.xml')) return flattenXml(text, both);
  if (path.endsWith('.properties')) return flattenProperties(text);
  if (/\.ya?ml$/.test(path)) return flattenYaml(text);
  return null;
}

// The checkout-engine images it's built FROM, its ENV values and its other instructions by name, e.g. COPY.
function readDockerfile(text) {
  const dockerfile = { images: [], env: new Map(), other: new Map() };
  for (const raw of (text ?? '').replace(/\\\r?\n/g, ' ').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const image = /^FROM\s+(?:--\S+\s+)*(\S*checkout-engine:\S*)/i.exec(line)?.[1];
    const env = /^ENV\s+(.+)$/i.exec(line)?.[1];
    if (image) dockerfile.images.push(image);
    else if (env) {
      const pairs = /^[\w.]+=/.test(env)
        ? [...env.matchAll(/([\w.]+)=("[^"]*"|\S*)/g)].map(([, key, value]) => [key, value])
        : [[env.split(/\s+/)[0], env.replace(/^\S+\s*/, '')]];
      for (const [key, value] of pairs) dockerfile.env.set(key, { value, sig: value });
    } else {
      const instruction = line.split(/\s+/)[0].toUpperCase();
      const value = [dockerfile.other.get(instruction)?.value, line.replace(/^\S+\s*/, '')].filter(Boolean).join('\n');
      dockerfile.other.set(instruction, { value, sig: value });
    }
  }
  return dockerfile;
}

// Java without its comments. Strings, characters and text blocks are kept as they are, so "http://x" isn't
// a comment, and a line that starts with * outside a comment is code, e.g. a wrapped multiplication.
function stripJavaComments(text) {
  let code = '';
  let i = 0;
  const skipTo = (end, after) => {
    const found = text.indexOf(end, after);
    return found < 0 ? text.length : found;
  };
  while (i < text.length) {
    if (text.startsWith('//', i)) i = skipTo('\n', i);
    else if (text.startsWith('/*', i)) i = skipTo('*/', i + 2) + 2;
    else if (text.startsWith('"""', i)) {
      const end = skipTo('"""', i + 3) + 3;
      code += text.slice(i, end);
      i = end;
    } else if (text[i] === '"' || text[i] === "'") {
      let end = i + 1;
      while (end < text.length && text[end] !== text[i] && text[end] !== '\n') end += text[end] === '\\' ? 2 : 1;
      code += text.slice(i, end + 1);
      i = end + 1;
    } else code += text[i++];
  }
  return code;
}

// Trimmed lines without blank lines and, in Java, without comments.
const codeOf = (path, text) =>
  (path.endsWith('.java') ? stripJavaComments(text ?? '') : (text ?? ''))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');

function changedKeys(before, after) {
  return [...new Set([...before.keys(), ...after.keys()])]
    .filter((key) => before.get(key)?.sig !== after.get(key)?.sig)
    .map((key) => ({
      key,
      from: before.get(key)?.value ?? null,
      to: after.get(key)?.value ?? null,
      path: (after.get(key) ?? before.get(key)).path,
    }));
}

// The changes in one file, each with its kind: upgrade, ignore, wiring, text or behaviour.
function classifyFile(file, before, after, rules) {
  const { path } = file;
  const wiringOr = (isWiring, key) => (isWiring || matches(rules.wiringKeys, key) ? 'wiring' : 'behaviour');

  if (basename(path) === 'Dockerfile') {
    const [old, now] = [readDockerfile(before), readDockerfile(after)];
    const changes = changedKeys(old.env, now.env).map((c) => ({ ...c, kind: wiringOr(WIRING.envKey.test(c.key), c.key) }));
    if (old.images.join() !== now.images.join()) changes.push({ kind: 'upgrade', from: old.images, to: now.images });
    // COPY, ARG, ENTRYPOINT … change what the engine runs, so they count unless the manifest calls them wiring
    changes.push(...changedKeys(old.other, now.other).map((c) => ({ ...c, kind: wiringOr(false, c.key) })));
    return changes;
  }

  const both = before != null && after != null;
  const [old, now] = [flatten(path, before, both), flatten(path, after, both)];
  let changes;
  if (!old || !now) {
    const key = path.endsWith('.java') ? basename(path, '.java') : null;
    const [oldLines, newLines] = [codeOf(path, before).split('\n'), codeOf(path, after).split('\n')];
    // The added and removed lines, for telling which classes a registration class registers
    const lines = [...newLines.filter((l) => !oldLines.includes(l)), ...oldLines.filter((l) => !newLines.includes(l))];
    changes = oldLines.join('\n') === newLines.join('\n') ? [] : [{ key, kind: wiringOr(false, key), lines }];
  } else {
    changes = changedKeys(old, now).map((c) => {
      if (matches(rules.text, path)) return { ...c, kind: 'text' };
      if (matches(rules.deploy, path)) {
        if (!c.path.includes('env')) return { ...c, kind: 'wiring' };
        const name = c.path.at(-1);
        return { ...c, key: name, kind: wiringOr(WIRING.envKey.test(name) || WIRING.envValue.test(c.to ?? c.from), name) };
      }
      if (path.endsWith('.properties')) return { ...c, kind: wiringOr(WIRING.propertyKey.test(c.key), c.key) };
      if (path.endsWith('.xml')) return { ...c, kind: wiringOr(WIRING.xmlName.test(c.key.split('/').at(-1)), c.key) };
      return { ...c, kind: wiringOr(false, c.key) };
    });
  }
  // A file added, deleted or moved without a changed key of its own still changes what the engine loads, e.g.
  // a config file with only <config version="1"> or one moved to another country module. Texts are compared
  // by key, wherever their file is.
  if (!changes.length && file.oldPath !== file.newPath && !matches(rules.text, path)) {
    changes.push({ key: null, kind: 'behaviour' });
  }
  return changes;
}

function readManifest() {
  for (const path of DEFAULTS.manifest) {
    const text = contentAt(opts.head, path);
    if (text) return { path, ...(parseYaml(text) ?? {}) };
  }
  return null;
}

// Scenarios with their tags, and the feature text without comments for finding texts. As in Gherkin, feature
// tags apply to every scenario in the feature, rule tags to the scenarios of the rule, and examples tags to
// their outline.
function readFeatures(dirs) {
  const features = [];
  for (const dir of dirs) {
    const files = git('ls-tree', '-r', '--name-only', opts.head, '--', dir).split('\n').filter((f) => f.endsWith('.feature'));
    for (const path of files) {
      const lines = (contentAt(opts.head, path) ?? '').split('\n').map((l) => l.trim()).filter((l) => !l.startsWith('#'));
      const scenarios = [];
      let pending = [];
      let featureTags = [];
      let ruleTags = [];
      for (const line of lines) {
        if (line.startsWith('@')) pending.push(...line.replace(/\s#.*$/, '').split(/\s+/));
        else if (line.startsWith('Feature:')) [featureTags, pending] = [pending, []];
        else if (line.startsWith('Rule:')) [ruleTags, pending] = [pending, []];
        else if (/^(Scenario|Scenario Outline|Scenario Template|Example):/.test(line)) {
          scenarios.push({ name: line.replace(/^[^:]+:\s*/, ''), tags: new Set([...featureTags, ...ruleTags, ...pending]) });
          pending = [];
        } else if (/^(Examples|Scenarios):/.test(line)) {
          for (const tag of pending) scenarios.at(-1)?.tags.add(tag);
          pending = [];
        }
      }
      features.push({ path, text: lines.join('\n'), scenarios });
    }
  }
  return features;
}

// Whether the feature text contains a text as a whole: not inside a longer word, like "Refund" in
// ToggleRefundOnlyCommand. Comments are already left out of the feature text.
function containsText(featureText, value) {
  if (value.length < 3) return false;
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u').test(featureText);
}

// A text's value in every language of its bundle, e.g. strings.properties and strings_sv.properties.
function translations(path, key) {
  const bundle = (p) => basename(p).replace(/(_[a-z]{2}(_[A-Z]{2})?)?\.properties$/, '');
  return git('ls-tree', '--name-only', opts.head, `${dirname(path)}/`)
    .split('\n')
    .filter((p) => p.endsWith('.properties') && bundle(p) === bundle(path))
    .map((p) => flattenProperties(contentAt(opts.head, p) ?? '').get(key)?.value)
    .filter(Boolean);
}

// The repo's rules: the defaults, plus what its manifest adds
function rulesOf(manifest) {
  return {
    ...DEFAULTS,
    ignore: [...DEFAULTS.ignore, ...(manifest?.ignore ?? [])],
    text: [...DEFAULTS.text, ...(manifest?.text ?? [])],
    wiringKeys: manifest?.wiring?.keys ?? [],
    wiringPaths: manifest?.wiring?.paths ?? [],
  };
}

// Every change, one item per changed key: { kind, path, key, from, to, lines }, plus the changed test files
// and the core upgrade.
function readItems(base, rules) {
  const items = new Map(); // kind|path|key -> item
  const add = (kind, path, change = {}) => {
    const key = change.key || null;
    const id = `${kind}|${path}|${key ?? ''}`;
    if (!items.has(id)) items.set(id, { kind, path, key, from: change.from ?? null, to: change.to ?? null, lines: change.lines ?? [] });
  };
  const changedTests = new Set();
  const upgrades = { from: [], to: [] };

  // A file moved between kinds of path, e.g. a plugin class into src/test, leaves the engine: it's a
  // deletion of the old path and an addition of the new one
  const category = (path) =>
    ['tests', 'ignore', 'wiringPaths'].find((rule) => matches(rules[rule], path)) ?? 'customization';
  const files = readChanges(base).flatMap((file) =>
    file.oldPath && file.newPath && category(file.oldPath) !== category(file.newPath)
      ? [
          { oldPath: file.oldPath, newPath: null, path: file.oldPath },
          { oldPath: null, newPath: file.newPath, path: file.newPath },
        ]
      : [file],
  );

  for (const file of files) {
    if (matches(rules.tests, file.path)) changedTests.add(file.path);
    else if (matches(rules.ignore, file.path)) add('ignore', file.path);
    else if (matches(rules.wiringPaths, file.path)) add('wiring', file.path);
    else {
      const before = file.oldPath && contentAt(base, file.oldPath);
      const after = file.newPath && contentAt(opts.head, file.newPath);
      for (const change of classifyFile(file, before, after, rules)) {
        if (change.kind === 'upgrade') {
          upgrades.from.push(...change.from);
          upgrades.to.push(...change.to);
        } else {
          add(change.kind, file.path, change);
        }
      }
    }
  }
  return { items: [...items.values()], changedTests, upgrades };
}

// The customizations the behaviour changes belong to, each with its changes, and the changes no
// customization covers.
function mapToCustomizations(items, customizations, rules) {
  // A path entry may name keys inside the file: config/receipt.xml#Business/Receipt/**
  const matchCustomizations = (item) =>
    customizations.filter((c) =>
      (c.paths ?? []).some((entry) => {
        const [path, key] = entry.split('#');
        return matches([path], item.path) && (!key || matches([key], item.key));
      }),
    );
  const touched = new Map(); // name -> { customization, items }
  const touch = (c, item) => {
    if (!touched.has(c.name)) touched.set(c.name, { customization: c, items: [] });
    touched.get(c.name).items.push(item);
  };
  const unmapped = [];
  for (const item of items.filter((i) => i.kind === 'behaviour')) {
    const found = matchCustomizations(item);
    for (const c of found) touch(c, item);
    if (!found.length) unmapped.push(item);
  }

  // A class that registers plugins counts with the customizations of the classes named on its changed lines.
  // When they belong to none, it stays unmapped, with a note.
  const pluginClasses = git('ls-tree', '-r', '--name-only', opts.head)
    .split('\n')
    .filter((p) => p.endsWith('.java') && p.includes('/src/main/') && !matches(rules.registration, p));
  for (const item of unmapped.filter((i) => matches(rules.registration, i.path))) {
    const names = new Set(item.lines.flatMap((line) => line.match(/\b[A-Z]\w*\b/g) ?? []));
    const registered = pluginClasses.filter((p) => names.has(basename(p, '.java')));
    const found = [...new Set(registered.flatMap((p) => matchCustomizations({ path: p, key: basename(p, '.java') })))];
    if (found.length) {
      for (const c of found) touch(c, item);
      unmapped.splice(unmapped.indexOf(item), 1);
    } else {
      item.registration = true;
    }
  }
  return { touched: [...touched.values()], unmapped };
}

// The changed texts by key. A text is tested when a scenario checks it in any language, whatever customization
// it belongs to. A text removed from one language falls back to another, so it's checked like a change; removed
// from every language, it's no longer shown.
function checkTexts(items, features) {
  const byKey = new Map(); // key -> changed and removed texts in every language
  for (const item of items.filter((i) => i.kind === 'text')) byKey.set(item.key, [...(byKey.get(item.key) ?? []), item]);
  return [...byKey].map(([key, list]) => {
    const remaining = [...new Set(list.flatMap((i) => translations(i.path, key)))];
    const values = [...list.map((i) => i.to).filter((v) => v != null), ...remaining];
    const removed = !values.length;
    return { key, items: list, removed, tested: !removed && features.find((f) => values.some((v) => containsText(f.text, v))) };
  });
}

function analyse() {
  // Compared with the merge base, like a PR does, even when the target branch has moved on
  const base = git('merge-base', opts.base, opts.head).trim();
  const manifest = readManifest();
  const rules = rulesOf(manifest);
  const customizations = Object.entries(manifest?.customizations ?? {}).map(([name, c]) => ({ name, ...c }));
  const features = readFeatures(manifest?.features ? [manifest.features] : DEFAULTS.features);
  const scenariosOf = (name) =>
    features.flatMap((f) => f.scenarios.filter((s) => s.tags.has(TAG_PREFIX + name)).map((s) => ({ ...s, path: f.path })));

  const { items, changedTests, upgrades } = readItems(base, rules);
  const { touched, unmapped } = mapToCustomizations(items, customizations, rules);
  const knownTags = new Set(customizations.map((c) => TAG_PREFIX + c.name));
  const featuresDir = features[0] ? dirname(features[0].path) : DEFAULTS.features[0];
  return {
    manifest,
    manifestPath: manifest?.path ?? (featuresDir.startsWith('.') ? DEFAULTS.manifest[1] : DEFAULTS.manifest[0]),
    featuresDir,
    customizations,
    summary: customizations.map((c) => ({ ...c, scenarios: scenariosOf(c.name) })),
    touched: touched.map((t) => {
      const scenarios = scenariosOf(t.customization.name);
      return { ...t, scenarios, scenariosChanged: scenarios.some((s) => changedTests.has(s.path)) };
    }),
    unmapped,
    texts: checkTexts(items, features),
    wiring: items.filter((i) => i.kind === 'wiring'),
    ignored: items.filter((i) => i.kind === 'ignore'),
    upgrades,
    changedTests,
    unknownTags: [...new Set(features.flatMap((f) => f.scenarios.flatMap((s) => [...s.tags])))].filter(
      (t) => t.startsWith(TAG_PREFIX) && !knownTags.has(t),
    ),
  };
}

const code = (s) => `\`${String(s).replaceAll('`', "'")}\``;
const cell = (s) => String(s).replaceAll('|', '\\|').replaceAll('\n', ' ');
const short = (s, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const kebab = (s) =>
  s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

function listByFile(items, limit = 8) {
  const byFile = new Map();
  for (const item of items) byFile.set(item.path, [...(byFile.get(item.path) ?? []), item]);
  return [...byFile].slice(0, 40).map(([path, list]) => {
    const keys = [...new Set(list.map((i) => i.key).filter(Boolean))];
    const shown = keys.slice(0, limit).map(code).join(', ');
    const more = keys.length > limit ? ` and ${keys.length - limit} more` : '';
    return `- ${code(path)}${keys.length ? `: ${shown}${more}` : ''}`;
  });
}

// The old and new value when they're short enough to read, e.g. `7` → `14`.
function valueChange({ from, to }) {
  const value = (v) => code(v === '' ? '""' : v);
  if (from === to || (from == null && to == null) || [from, to].some((v) => v?.length > 40)) return '';
  if (to == null) return `, removed (was ${value(from)})`;
  return from == null ? ` → ${value(to)}` : `: ${value(from)} → ${value(to)}`;
}

// One bullet per change: the key, the file and the value when there is one.
function changeList(items, limit = 15) {
  const lines = items.slice(0, limit).map((i) => {
    const note = i.registration ? ' (registers beans, counts with the customization it registers)' : '';
    return i.key && !i.path.endsWith('.java') ? `- ${code(i.key)} in ${code(i.path)}${valueChange(i)}` : `- ${code(i.path)}${note}`;
  });
  if (items.length > limit) lines.push(`- and ${items.length - limit} more`);
  return lines;
}

// The manifest path entry for a change: the whole file, or the keys around the changed key.
function manifestEntry(item) {
  if (!item.key || item.path.endsWith('.java')) return item.path;
  const parts = item.key.split('/');
  return parts.length > 2 ? `${item.path}#${parts.slice(0, 2).join('/')}/**` : `${item.path}#${item.key}`;
}

function suggestName(items) {
  const java = items.find((i) => i.path.endsWith('.java') && !/Config(uration)?$/.test(i.key));
  if (java) {
    // RefundLimitBeforeTenderAddedAction -> refund-limit, SybBeforeItemVoidedAction -> item-voided
    const name = java.key.replace(/(Action|Impl|Command|Handler)$/, '');
    const [, before, after] = /^(.*?)(?:Before|After)(.*)$/.exec(name) ?? [];
    return kebab((before?.length > 4 ? before : after) || name);
  }
  const keyed = items.find((i) => i.key);
  if (keyed?.path.endsWith('.xml')) {
    const parts = keyed.key.split('/');
    return kebab(parts[parts.length > 2 ? 1 : parts.length - 1]);
  }
  if (keyed) return kebab(keyed.key.replace(/\.enabled$/, ''));
  return kebab(basename(items[0].path).replace(/\.[^.]+$/, ''));
}

const scenarioSnippet = (name) => ['```gherkin', `@customization:${name}`, 'Scenario: <what the cashier does and sees>', '```'];

// The English text when there is one, since the scenarios run in English.
function preferredText(texts) {
  const rank = (t) => (/_en\.properties$/.test(t.path) ? 0 : /_[a-z]{2}\.properties$/.test(t.path) ? 2 : 1);
  return [...texts].sort((a, b) => rank(a) - rank(b))[0];
}

const it = (items) => (items.length === 1 ? 'it' : 'them');

// The changes no customization covers, with an example manifest entry and tag to start from
function unmappedStep(r) {
  const name = suggestName(r.unmapped);
  const sameFile = r.customizations
    .filter((c) => (c.paths ?? []).some((e) => r.unmapped.some((i) => matches([e.split('#')[0]], i.path))))
    .map((c) => `**${c.name}**`);
  const entries = [...new Set(r.unmapped.filter((i) => !i.registration).map(manifestEntry))];
  return [
    `Test ${r.unmapped.length === 1 ? 'this change' : 'these changes'}`,
    ...changeList(r.unmapped),
    '',
    r.manifest
      ? `No customization in ${code(r.manifestPath)} covers ${it(r.unmapped)}, so it isn't known whether a scenario tests ${it(r.unmapped)}.`
      : `This repo has no ${code(r.manifestPath)} yet, so it isn't known whether a scenario tests ${it(r.unmapped)}.`,
    '',
    `Write or extend a scenario that exercises ${it(r.unmapped)}, then link the scenario to a customization in the manifest. An example entry${r.manifest ? '' : ' for a new manifest'}:`,
    '',
    '```yaml',
    ...(r.manifest ? [] : ['customizations:']),
    `  ${name}:`,
    '    description: <what it changes for the cashier>',
    '    paths:',
    ...entries.map((e) => `      - ${e}`),
    '```',
    '',
    ...(entries.length > 1 ? ['Split it into several customizations if the changes do different things.', ''] : []),
    ...(sameFile.length
      ? [`If it's part of a customization that already uses the same file (${sameFile.join(', ')}), add the path to that one instead.`, '']
      : []),
    `And an example tag on the scenario in ${code(r.featuresDir)}:`,
    '',
    ...scenarioSnippet(name),
    '',
    'If it only connects the engine to its environment, like a URL, host or secret, list it under `wiring` in the manifest instead.',
  ];
}

// A changed customization that no scenario tests yet
function customizationStep(t, r) {
  const { name, description } = t.customization;
  return [
    `Test ${code(name)}`,
    ...changeList(t.items),
    '',
    `${t.items.length === 1 ? 'This change belongs' : 'These changes belong'} to **${name}**${description ? ` (${cell(description)})` : ''}, but no scenario tests ${name} yet. Write a scenario in ${code(r.featuresDir)} that exercises the change and tag it, for example:`,
    '',
    ...scenarioSnippet(name),
  ];
}

// The changed texts no feature file contains, with example steps that check them
function textStep(texts) {
  const language = (t) => /_([a-z]{2})\.properties$/.exec(t.path)?.[1] ?? 'default';
  const newText = (items) => preferredText(items.filter((t) => t.to != null))?.to;
  const rows = texts.slice(0, 20).map(({ key, items }) => {
    const languages = items.map((t) => (t.to == null ? `${language(t)} (removed)` : language(t)));
    const text = newText(items);
    return `| ${code(key)} | ${text == null ? '(removed, another language is shown)' : cell(short(text))} | ${languages.join(', ')} |`;
  });
  // The message step matches a regular expression, so the example stops before placeholders like {0}
  const example = (pattern) => {
    const withText = texts.filter(({ items }) => newText(items) != null);
    const found = withText.find(({ key }) => pattern.test(key)) ?? withText[0];
    return (found ? newText(found.items) : '').split(/[{}()[\]?*+\\^$|]/)[0].trim() || '<text>';
  };
  const title = example(/title|header|heading/i);
  const message = example(/message|text|body|description/i);
  return [
    `Check the changed ${texts.length === 1 ? 'text' : 'texts'} in a scenario`,
    'Cashiers see these texts, but no feature file contains them in any language. A wrong text in a prompt or on a receipt confuses the cashier.',
    '',
    '| Key | Text | Languages |',
    '|---|---|---|',
    ...rows,
    '',
    'Check each text in the scenario where the cashier sees it. Example steps, depending on where it appears:',
    '',
    '```gherkin',
    `Then the "${title}" prompt should be displayed`,
    `Then the prompt message should contain "${message}"`,
    `Then the receipt should contain "${title}" text`,
    '```',
  ];
}

// Tags that name no customization in the manifest
function tagStep(r) {
  return [
    'Fix the customization tags',
    '',
    `${r.unknownTags.map(code).join(', ')} ${r.unknownTags.length === 1 ? "doesn't" : "don't"} match a customization in ${code(r.manifestPath)}. Add the customization there or correct the tag.`,
  ];
}

// The changed customizations and texts that scenarios test
function testedLines(r) {
  return [
    ...r.touched
      .filter((t) => t.scenarios.length)
      .map((t) => {
        const files = [...new Set(t.scenarios.map((s) => basename(s.path)))].map(code).join(', ');
        const check = t.scenariosChanged ? '' : ' None of them changed here, so check that they still describe the new behaviour.';
        return `- ✅ **${t.customization.name}**: ${plural(t.scenarios.length, 'scenario')} in ${files}.${check}`;
      }),
    ...r.texts.filter((t) => t.tested).map((t) => `- ✅ Text ${code(t.key)} is checked in ${code(basename(t.tested.path))}.`),
  ];
}

// Core upgrades, wiring, removed texts, tests and ignored files, collapsed
function notCountedSection(r) {
  const removedTexts = r.texts.filter((t) => t.removed);
  const notCounted = [
    r.upgrades.to.length &&
      `**Core upgrade:** ${r.upgrades.from.map(code).join(', ') || '–'} → ${r.upgrades.to.map(code).join(', ')}. The full acceptance suite runs on every push.`,
    r.wiring.length && `**Wiring** (URLs, hosts, secrets, timeouts, deploy settings):\n\n${listByFile(r.wiring).join('\n')}`,
    removedTexts.length && `**Removed texts** (from every language, so no longer shown): ${removedTexts.map((t) => code(t.key)).join(', ')}`,
    r.changedTests.size && `**Tests:** ${plural(r.changedTests.size, 'file')} under the acceptance folder.`,
    r.ignored.length && `**Ignored:** ${plural(new Set(r.ignored.map((i) => i.path)).size, 'file')} (build, CI, test and reference data).`,
  ].filter(Boolean);
  if (!notCounted.length) return [];
  return ['<details><summary>Not counted as customization changes</summary>', '', ...notCounted.flatMap((n) => [n, '']), '</details>', ''];
}

// Every customization in the manifest, with its number of scenarios, collapsed
function summarySection(r) {
  if (!r.summary.length) return [];
  const covered = r.summary.filter((c) => c.scenarios.length).length;
  return [
    `<details><summary>All customizations: ${covered} of ${r.summary.length} have scenarios</summary>`,
    '',
    '| | Customization | Scenarios |',
    '|---|---|---|',
    ...r.summary.map((c) => `| ${c.scenarios.length ? '✅' : '❌'} | **${c.name}**${c.description ? ` – ${cell(c.description)}` : ''} | ${c.scenarios.length} |`),
    '',
    '</details>',
    '',
  ];
}

const untestedTexts = (r) => r.texts.filter((t) => !t.tested && !t.removed);

function render(r) {
  // Each step is a change without a known test, except the last one about tags, which fixes the manifest
  const untested = [
    ...(r.unmapped.length ? [unmappedStep(r)] : []),
    ...r.touched.filter((t) => !t.scenarios.length).map((t) => customizationStep(t, r)),
    ...(untestedTexts(r).length ? [textStep(untestedTexts(r))] : []),
  ];
  const steps = [...untested, ...(r.unknownTags.length ? [tagStep(r)] : [])];
  const tested = testedLines(r);

  const out = ['### Customization coverage', ''];
  if (untested.length) {
    out.push(
      '⚠️ **No scenario is known to test some of the changes in this pull request.**',
      '',
      "The examples below show where to start. A change is tested when a scenario exercises it; a manifest entry or a tag only links the two. If a test isn't needed, explain why in the pull request.",
      '',
    );
  } else if (steps.length) {
    out.push("⚠️ **Some scenarios are tagged with customizations the manifest doesn't have.**", '');
  }
  if (steps.length) steps.forEach(([title, ...body], n) => out.push(`#### ${n + 1}. ${title}`, '', ...body, ''));
  else if (tested.length) out.push('✅ **Every customization this pull request changes has scenarios.**', '');
  else out.push('✅ **This pull request changes no customizations.**', '');
  if (tested.length) out.push('#### Tested', '', ...tested, '');
  out.push(...notCountedSection(r), ...summarySection(r));
  return out.join('\n');
}

const result = analyse();
const markdown = render(result);
if (opts.out) writeFileSync(opts.out, markdown);
else console.log(markdown);

const failed = {
  none: false,
  unmapped: result.unmapped.length > 0,
  untested: result.unmapped.length > 0 || result.touched.some((t) => !t.scenarios.length) || untestedTexts(result).length > 0,
}[opts['fail-on']];
if (failed) {
  console.error(`Customization coverage failed (--fail-on ${opts['fail-on']})`);
  process.exit(1);
}
