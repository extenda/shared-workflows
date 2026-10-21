#!/usr/bin/env python3
"""Writes the plugin coverage report of a Checkout Engine acceptance test run.

The report goes to stdout as Markdown, and its warnings to stderr, one per line. It reads, in the
working directory:
  coverage/plugin-coverage-<country>/<country>.outcome  how the country's scenarios went
  coverage/plugin-coverage-<country>/<country>.exec     the country's coverage data, when there is any
  coverage.csv                                          JaCoCo's CSV report, empty without data
  jacoco.log                                            JaCoCo's output, for data that doesn't match the classes

Usage: plugin_report.py <countries as a JSON array> <head commit> <run URL>
"""
import collections
import csv
import json
import os
import re
import sys

# The plugin coverage every customer engine should reach; below it the report warns
THRESHOLD = 85
REASONS = {
    'failure': 'scenarios failed',
    'skipped': "scenarios didn't run",
    'no-data': 'no data from the engine',
    'missing': 'no result',
    'cancelled': 'cancelled',
}


def read(path, default=''):
    try:
        with open(path) as file:
            return file.read()
    except FileNotFoundError:
        return default


def percent(covered, missed):
    """Rounded down, so a coverage below the threshold never shows as the threshold."""
    return f'{1000 * covered // (covered + missed) / 10:.1f}%' if covered + missed else '–'


def total(rows, column):
    return sum(int(row[column]) for row in rows)


def warn(message):
    print(message, file=sys.stderr)


def main(countries, sha, run_url):
    outcomes = {c: read(f'coverage/plugin-coverage-{c}/{c}.outcome', 'missing').strip() for c in countries}
    measured = [c for c in countries if os.path.exists(f'coverage/plugin-coverage-{c}/{c}.exec')]
    incomplete = [
        f"{c} ({REASONS.get(o, o) if o != 'success' else 'no data'})"
        for c, o in outcomes.items()
        if o != 'success' or c not in measured
    ]
    rows = list(csv.DictReader(read('coverage.csv').splitlines()))

    print('### Plugin coverage\n')
    if not rows:
        print(f"No plugin coverage was measured for `{sha[:7]}`, because no country has data from its"
              f" scenarios: {', '.join(incomplete)}. See [the run]({run_url}).")
        warn('No plugin coverage was measured')
        return

    lines, missed = total(rows, 'LINE_COVERED'), total(rows, 'LINE_MISSED')
    branches = percent(total(rows, 'BRANCH_COVERED'), total(rows, 'BRANCH_MISSED'))
    print(f"**{percent(lines, missed)}** of the plugins' lines ran in the acceptance tests ({lines} of {lines + missed}),"
          f" and {branches} of their branches. Countries: {', '.join(measured)}. Commit: `{sha[:7]}`.\n")

    if incomplete:
        # A partial run says too little about the coverage to judge it against the threshold
        print(f"> [!WARNING]\n> The coverage is incomplete: {', '.join(incomplete)}. It's lower than with every"
              f" country's scenarios, so it isn't compared with {THRESHOLD:g}%.\n")
        warn(f"The plugin coverage is incomplete: {', '.join(incomplete)}")
    elif lines + missed and 100 * lines / (lines + missed) < THRESHOLD:
        print(f'> [!WARNING]\n> The plugin coverage is below {THRESHOLD:g}%. Add scenarios for the plugin code that no'
              ' scenario runs, starting with the classes below.\n')
        warn(f'The plugin coverage is below {THRESHOLD:g}%')

    # JaCoCo counts a class whose data doesn't match its class file as not run
    mismatched = sorted(set(re.findall(r'Execution data for class (\S+) does not match', read('jacoco.log'))))
    if mismatched:
        shown = ', '.join(f"`{c.replace('/', '.')}`" for c in mismatched[:10])
        classes = f"{len(mismatched)} {'class' if len(mismatched) == 1 else 'classes'}"
        print(f"> [!WARNING]\n> The coverage data of {classes} doesn't match the class files, so they count as not"
              f" run: {shown}. The countries' builds differ.\n")
        warn(f"The coverage data of {classes} doesn't match the class files")

    packages = collections.defaultdict(list)
    for row in rows:
        packages[row['PACKAGE']].append(row)
    print('<details><summary>Lines run per package</summary>\n')
    print('| Package | Lines run | |\n|---|---|---|')
    for name, package in sorted(packages.items()):
        covered, missed = total(package, 'LINE_COVERED'), total(package, 'LINE_MISSED')
        print(f'| `{name}` | {covered} of {covered + missed} | {percent(covered, missed)} |')

    print('\n</details>\n\n<details><summary>Classes with the most lines no scenario runs</summary>\n')
    print('| Class | Lines not run | Lines run |\n|---|---|---|')
    for row in sorted(rows, key=lambda r: -int(r['LINE_MISSED']))[:15]:
        if int(row['LINE_MISSED']):
            print(f"| `{row['PACKAGE']}.{row['CLASS']}` | {row['LINE_MISSED']} | {row['LINE_COVERED']} |")
    print(f'\n</details>\n\nThe line-by-line report is in the `plugin-coverage-report` artifact of [the run]({run_url}).')


if __name__ == '__main__':
    main(json.loads(sys.argv[1]), sys.argv[2], sys.argv[3])
