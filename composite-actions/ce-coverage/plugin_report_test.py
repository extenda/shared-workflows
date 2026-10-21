"""Tests for plugin_report.py. Usage: python3 -m unittest discover -s composite-actions/ce-coverage -p '*_test.py'"""
import contextlib
import io
import os
import tempfile
import unittest

import plugin_report as report

HEADER = 'GROUP,PACKAGE,CLASS,INSTRUCTION_MISSED,INSTRUCTION_COVERED,BRANCH_MISSED,BRANCH_COVERED,LINE_MISSED,LINE_COVERED'


class ReportTest(unittest.TestCase):
    def setUp(self):
        self.cwd = os.getcwd()
        self.dir = tempfile.TemporaryDirectory()
        os.chdir(self.dir.name)

    def tearDown(self):
        os.chdir(self.cwd)
        self.dir.cleanup()

    def country(self, name, outcome, data=True):
        os.makedirs(f'coverage/plugin-coverage-{name}')
        with open(f'coverage/plugin-coverage-{name}/{name}.outcome', 'w') as file:
            file.write(f'{outcome}\n')
        if data:
            open(f'coverage/plugin-coverage-{name}/{name}.exec', 'w').close()

    def csv(self, *rows):
        with open('coverage.csv', 'w') as file:
            file.write('\n'.join([HEADER, *rows]) + '\n' if rows else '')

    def run_report(self, countries):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            report.main(countries, '5820681cdeadbeef', 'https://example.com/run')
        return out.getvalue(), err.getvalue().splitlines()

    def test_below_the_threshold(self):
        self.country('SE', 'success')
        self.csv('p,com.x,A,0,0,1,1,337,1206')
        out, warnings = self.run_report(['SE'])
        self.assertIn("**78.1%** of the plugins' lines ran in the acceptance tests (1206 of 1543), and 50.0% of their"
                      ' branches. Countries: SE. Commit: `5820681`.', out)
        self.assertIn('The plugin coverage is below 85%.', out)
        self.assertEqual(warnings, ['The plugin coverage is below 85%'])
        self.assertIn('| `com.x.A` | 337 | 1206 |', out)

    def test_rounded_down_and_at_the_threshold(self):
        self.country('SE', 'success')
        self.csv('p,com.x,A,0,0,0,0,1504,8496')
        out, _ = self.run_report(['SE'])
        self.assertIn('**84.9%**', out)
        self.assertIn('below 85%', out)
        self.csv('p,com.x,A,0,0,0,0,1500,8500')
        out, warnings = self.run_report(['SE'])
        self.assertIn('**85.0%**', out)
        self.assertEqual(warnings, [])

    def test_incomplete_countries_are_named_and_not_compared(self):
        self.country('SE', 'success')
        self.country('NO', 'failure')
        self.country('FI', 'skipped', data=False)
        self.csv('p,com.x,A,0,0,0,0,10,90')
        out, warnings = self.run_report(['SE', 'NO', 'FI', 'DE'])
        self.assertIn('Countries: SE, NO.', out)
        self.assertIn("The coverage is incomplete: NO (scenarios failed), FI (scenarios didn't run), DE (no result).", out)
        self.assertNotIn('below 85%', out)
        self.assertEqual(len(warnings), 1)

    def test_without_data(self):
        self.country('SE', 'skipped', data=False)
        self.csv()
        out, warnings = self.run_report(['SE'])
        self.assertIn("No plugin coverage was measured for `5820681`, because no country has data from its scenarios:"
                      " SE (scenarios didn't run).", out)
        self.assertEqual(warnings, ['No plugin coverage was measured'])

    def test_data_that_does_not_match_the_classes(self):
        self.country('SE', 'success')
        self.csv('p,p,A,0,0,0,0,3,0')
        with open('jacoco.log', 'w') as file:
            file.write('[WARN] Execution data for class p/A does not match.\n')
        out, warnings = self.run_report(['SE'])
        self.assertIn("The coverage data of 1 class doesn't match the class files, so they count as not run: `p.A`.", out)
        self.assertIn("The coverage data of 1 class doesn't match the class files", warnings)


if __name__ == '__main__':
    unittest.main()
