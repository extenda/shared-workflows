#!/usr/bin/env bash
# Tests for customization-coverage.mjs. Each case builds a throwaway Checkout Engine repo with a manifest and a
# tagged feature, commits a change on top of a base commit and asserts on the Markdown report.
#
# Usage: composite-actions/ce-coverage/customization-coverage.test.sh (after npm ci in this directory)
# The expected texts are Markdown, so their backticks are literal:
# shellcheck disable=SC2016
set -uo pipefail

SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/customization-coverage.mjs"
WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

passed=0
failed=0

MANIFEST='customizations:
  receipt-barcode:
    description: A 3 digit store in the receipt barcode
    paths:
      - config/allcountries/config/receipt.xml#Business/Receipt/**
  cash-drawer:
    description: No cash drawer on refund
    paths:
      - config/allcountries/config/receipt.xml#Business/Refund/**'

FEATURE='@customization:receipt-barcode
Feature: Receipt barcode

  Scenario: The barcode has a 3 digit store
    Given a cashier session in store 001
    Then the prompt message should contain "Customer not found"'

RECEIPT='<config version="1">
  <group name="Business">
    <group name="Receipt">
      <value name="RetailStoreIdLength" type="Integer" modifier="replace">3</value>
    </group>
    <group name="Refund">
      <value name="OpenCashDrawer" type="Boolean" modifier="replace">false</value>
    </group>
  </group>
</config>'

DEPLOY='environments:
  production:
    env: &env
      VOYADO_URL: https://example.com/api/v2
      COUNTRY_MODULE: SE
  staging:
    env:
      <<: *env'

new_repo() {
  REPO="$WORK_DIR/repo-$RANDOM$RANDOM"
  mkdir -p "$REPO"
  git -C "$REPO" init -q -b master
  git -C "$REPO" config user.email test@example.com
  git -C "$REPO" config user.name test
  write_files \
    acceptance/customizations.yaml "$MANIFEST" \
    acceptance/cucumber/features/receipt.feature "$FEATURE" \
    config/allcountries/config/receipt.xml "$RECEIPT" \
    nodes/checkout-api/cloud-deploy.yaml "$DEPLOY" \
    plugins/app/src/main/resources/language/strings_en.properties 'customer.title=Customer not found' \
    plugins/app/src/main/resources/language/strings_sv.properties 'other.title=Annat'
  git -C "$REPO" add -A
  git -C "$REPO" commit -q -m base
  BASE=$(git -C "$REPO" rev-parse HEAD)
}

write_files() {
  while [ $# -gt 0 ]; do
    mkdir -p "$(dirname "$REPO/$1")"
    printf '%s\n' "$2" > "$REPO/$1"
    shift 2
  done
}

# A change on a branch from the base commit
commit() {
  git -C "$REPO" add -A
  git -C "$REPO" commit -q -m change
  HEAD=$(git -C "$REPO" rev-parse HEAD)
}

# Arguments: <test name> <text the report must contain>... Prefix a text with ! for must not contain.
assert_report() {
  local name="$1" report ok=true expected
  shift
  report=$(node "$SCRIPT" --repo "$REPO" --base "$BASE" --head "$HEAD" 2>&1)
  for expected in "$@"; do
    if [[ "$expected" == !* ]]; then
      grep -qF -- "${expected:1}" <<< "$report" && ok=false
    else
      grep -qF -- "$expected" <<< "$report" || ok=false
    fi
  done
  if $ok; then
    echo "PASS  $name"
    passed=$((passed + 1))
  else
    echo "FAIL  $name (expected: $*)"
    echo "      ${report//$'\n'/$'\n'      }"
    failed=$((failed + 1))
  fi
}

# --- Behaviour --------------------------------------------------------------------------

new_repo
write_files config/allcountries/config/receipt.xml "${RECEIPT/>3</>4<}"
commit
assert_report "changed value of a tested customization" \
  'Every customization this pull request changes has scenarios' '**receipt-barcode**: 1 scenario'

new_repo
write_files config/allcountries/config/receipt.xml "${RECEIPT/>false</>true<}"
commit
assert_report "changed value of a customization without scenarios" \
  'Test `cash-drawer`' '`Business/Refund/OpenCashDrawer` in `config/allcountries/config/receipt.xml`: `false` → `true`'

new_repo
write_files config/allcountries/config/baseconfig.xml '<config><group name="Business"><group name="Suspend">
  <value name="MaxDaysOld" type="Integer" modifier="replace">14</value></group></group></config>'
commit
assert_report "override no customization covers" \
  'Test this change' '`Business/Suspend/MaxDaysOld` in `config/allcountries/config/baseconfig.xml` → `14`' \
  '- config/allcountries/config/baseconfig.xml#Business/Suspend/**'

new_repo
reindented=${RECEIPT//$'\n'  /$'\n'}
write_files config/allcountries/config/receipt.xml "${reindented/<group name=\"Refund\">/<!-- No drawer -->$'\n'<group name=\"Refund\">}"
commit
assert_report "re-indented XML with a new comment" 'This pull request changes no customizations'

# The target branch moves on after the branch was made: a removed value keeps its key
new_repo
git -C "$REPO" checkout -q -b feature
write_files config/allcountries/config/receipt.xml "$(grep -v OpenCashDrawer <<< "$RECEIPT")"
commit
git -C "$REPO" checkout -q master
write_files config/allcountries/config/receipt.xml "${RECEIPT/<group name=\"Refund\">/<value name=\"A\">1</value><value name=\"B\">2</value><group name=\"Refund\">}"
git -C "$REPO" commit -qam "master moves"
BASE=$(git -C "$REPO" rev-parse master)
assert_report "removed value when the target branch has moved on" \
  'Test `cash-drawer`' '`Business/Refund/OpenCashDrawer` in `config/allcountries/config/receipt.xml`, removed (was `false`)'

# --- Wiring and deploy config -----------------------------------------------------------

new_repo
write_files nodes/checkout-api/cloud-deploy.yaml "${DEPLOY/v2/v3}"
commit
assert_report "deploy URL is wiring" 'This pull request changes no customizations' '`VOYADO_URL`'

new_repo
write_files nodes/checkout-api/cloud-deploy.yaml "${DEPLOY/COUNTRY_MODULE: SE/COUNTRY_MODULE: NO}"
commit
assert_report "deploy country module is behaviour" 'Test this change' '`COUNTRY_MODULE` in `nodes/checkout-api/cloud-deploy.yaml`: `SE` → `NO`'

# --- Texts ------------------------------------------------------------------------------

new_repo
write_files plugins/app/src/main/resources/language/strings_sv.properties 'other.title=Annat
customer.title=Kunden hittades inte'
commit
assert_report "translation of a text checked in another language" 'Text `customer.title` is checked in `receipt.feature`' '!Check the changed text'

new_repo
printf 'other.title=Annat\nnew.title=F\xf6rs\xe4ljning sp\xe4rrad\n' > "$REPO/plugins/app/src/main/resources/language/strings_sv.properties"
commit
assert_report "new Latin-1 text without a scenario" 'Check the changed text in a scenario' '| `new.title` | Försäljning spärrad | sv |'

# --- Other files ------------------------------------------------------------------------

new_repo
write_files README.md 'docs' pom.xml '<project><version>2</version></project>' .github/workflows/ci.yml 'on: push'
commit
assert_report "docs, build and CI" 'This pull request changes no customizations' 'Ignored:** 3 files'

new_repo
write_files Dockerfile 'FROM eu.gcr.io/extenda/checkout-engine:v2.0.0'
git -C "$REPO" add -A && git -C "$REPO" commit -q -m docker && BASE=$(git -C "$REPO" rev-parse HEAD)
write_files Dockerfile 'FROM eu.gcr.io/extenda/checkout-engine:v2.1.0'
commit
assert_report "core upgrade" '**Core upgrade:** `eu.gcr.io/extenda/checkout-engine:v2.0.0` → `eu.gcr.io/extenda/checkout-engine:v2.1.0`'

new_repo
write_files acceptance/cucumber/features/other.feature '@customization:unknown
Feature: Other

  Scenario: Something else'
commit
assert_report "tag without a customization" 'Fix the customization tags' '`@customization:unknown`'

# --- Moves, registration and code -------------------------------------------------------

ACTION='package com.x.refund;
public class RefundLimitAction {
  public long limit(long price, long qty) {
    return price
        * qty;
  }
}'

new_repo
write_files plugins/p/src/main/java/com/x/refund/RefundLimitAction.java "$ACTION"
git -C "$REPO" add -A && git -C "$REPO" commit -q -m plugin && BASE=$(git -C "$REPO" rev-parse HEAD)
mkdir -p "$REPO/plugins/p/src/test/java"
git -C "$REPO" mv plugins/p/src/main/java/com/x/refund/RefundLimitAction.java plugins/p/src/test/java/RefundLimitAction.java
commit
assert_report "plugin class moved into src/test leaves the engine" \
  'Test this change' '`plugins/p/src/main/java/com/x/refund/RefundLimitAction.java`' '!changes no customizations'

new_repo
write_files plugins/p/src/main/java/com/x/refund/RefundLimitAction.java "$ACTION"
git -C "$REPO" add -A && git -C "$REPO" commit -q -m plugin && BASE=$(git -C "$REPO" rev-parse HEAD)
write_files plugins/p/src/main/java/com/x/refund/RefundLimitAction.java "${ACTION/\* qty/* 2}"
commit
assert_report "code line that starts with * is code" 'Test this change' '`plugins/p/src/main/java/com/x/refund/RefundLimitAction.java`'

new_repo
write_files plugins/p/src/main/java/com/x/refund/RefundLimitAction.java "/**
 * The refund limit
 */
$ACTION"
commit
git -C "$REPO" add -A && BASE=$(git -C "$REPO" rev-parse HEAD)
write_files plugins/p/src/main/java/com/x/refund/RefundLimitAction.java "/**
 * The refund limit for one receipt
 */
$ACTION"
commit
assert_report "Javadoc change is no change" 'This pull request changes no customizations'

CONFIG='package com.x.config;
public class PluginConfig {
}'
REGISTERED='package com.x.config;
public class PluginConfig {
  @Bean
  public RefundLimitAction refundLimit() { return new RefundLimitAction(); }
}'

new_repo
write_files plugins/p/src/main/java/com/x/config/PluginConfig.java "$CONFIG" \
  plugins/p/src/main/java/com/x/refund/RefundLimitAction.java "$ACTION"
git -C "$REPO" add -A && git -C "$REPO" commit -q -m plugin && BASE=$(git -C "$REPO" rev-parse HEAD)
write_files plugins/p/src/main/java/com/x/config/PluginConfig.java "$REGISTERED" \
  config/allcountries/config/receipt.xml "${RECEIPT/>3</>4<}"
commit
assert_report "registration of a class no customization covers isn't credited to another" \
  'Test this change' '`plugins/p/src/main/java/com/x/config/PluginConfig.java` (registers beans' '!Every customization this pull request changes has scenarios'

new_repo
write_files plugins/p/src/main/java/com/x/config/PluginConfig.java "$CONFIG" \
  plugins/p/src/main/java/com/x/refund/RefundLimitAction.java "$ACTION" \
  acceptance/customizations.yaml "$MANIFEST
  refund-limit:
    paths:
      - plugins/*/src/main/java/com/x/refund/*.java" \
  acceptance/cucumber/features/refund.feature '@customization:refund-limit
Feature: Refund limit

  Scenario: A refund over the limit'
git -C "$REPO" add -A && git -C "$REPO" commit -q -m plugin && BASE=$(git -C "$REPO" rev-parse HEAD)
write_files plugins/p/src/main/java/com/x/config/PluginConfig.java "$REGISTERED"
commit
assert_report "registration counts with the customization of the class it registers" \
  'Every customization this pull request changes has scenarios' '**refund-limit**: 1 scenario'

new_repo
write_files Dockerfile 'FROM eu.gcr.io/extenda/checkout-engine:v2.0.0
COPY target/ .'
git -C "$REPO" add -A && git -C "$REPO" commit -q -m docker && BASE=$(git -C "$REPO" rev-parse HEAD)
write_files Dockerfile 'FROM eu.gcr.io/extenda/checkout-engine:v2.0.0
COPY target/ .
COPY txengine_prod.properties .'
commit
assert_report "Dockerfile COPY change is behaviour" 'Test this change' '`COPY` in `Dockerfile`'

# --- Tags and texts in features ---------------------------------------------------------

new_repo
write_files acceptance/cucumber/features/receipt.feature 'Feature: Receipt barcode

  @customization:cash-drawer
  Rule: Refunds

    Scenario: No drawer on refund

  Scenario Outline: Drawer per tender

    @customization:receipt-barcode
    Examples:
      | tender |'
commit
# Both scenarios are in the rule, which lasts until the next Rule: whatever the indentation
assert_report "tags on Rule and Examples apply to their scenarios" \
  '| ✅ | **receipt-barcode** – A 3 digit store in the receipt barcode | 1 |' '| ✅ | **cash-drawer** – No cash drawer on refund | 2 |'

new_repo
write_files acceptance/cucumber/features/receipt.feature "$FEATURE
    # Customer not found is shown in Swedish too" \
  plugins/app/src/main/resources/language/strings_en.properties 'customer.title=Customer not found
order.command=Order
note.text=Swedish note'
git -C "$REPO" add -A && git -C "$REPO" commit -q -m texts && BASE=$(git -C "$REPO" rev-parse HEAD)
write_files plugins/app/src/main/resources/language/strings_en.properties 'customer.title=Customer not found
order.command=Order!
note.text=Swedish'
write_files acceptance/cucumber/features/receipt.feature "${FEATURE/Customer not found/CancelOrder!Command}
    # Swedish"
commit
assert_report "texts inside a longer word or a comment aren't tested" \
  '| `order.command` | Order! |' '| `note.text` | Swedish |'

new_repo
write_files plugins/app/src/main/resources/language/strings_sv.properties 'other.title=Annat
extra.title=Extra'
git -C "$REPO" add -A && git -C "$REPO" commit -q -m sv && BASE=$(git -C "$REPO" rev-parse HEAD)
write_files plugins/app/src/main/resources/language/strings_sv.properties 'extra.title=Extra'
write_files plugins/app/src/main/resources/language/strings_en.properties 'customer.title=Customer not found
other.title=Other'
commit
assert_report "text removed from one language falls back to another" \
  '| `other.title` | Other | en, sv (removed) |'

new_repo
write_files plugins/app/src/main/resources/language/strings_sv.properties 'extra.title=Extra'
commit
assert_report "text removed from every language" 'Removed texts** (from every language, so no longer shown): `other.title`'

new_repo
write_files acceptance/cucumber/features/other.feature '@customization:unknown
Feature: Other

  Scenario: Something else'
commit
assert_report "an unknown tag alone doesn't say changes are untested" \
  "Some scenarios are tagged with customizations the manifest doesn't have" '!No scenario is known to test'

# --- XML --------------------------------------------------------------------------------

new_repo
write_files config/allcountries/config/receipt.xml "${RECEIPT/<config version=\"1\">/<config version=\"2\">}"
commit
assert_report "root element attribute change" 'Test this change' '- `config/allcountries/config/receipt.xml`'

new_repo
write_files config/allcountries/config/receipt.xml "${RECEIPT/<group name=\"Refund\">/<value name=\"Flag\"/><group name=\"Refund\">}"
commit
assert_report "added empty named element" 'Test this change' '`Business/Flag` in `config/allcountries/config/receipt.xml`'

# --- Review comments on the pull request ------------------------------------------------

new_repo
write_files plugins/p/src/main/resources/survey/survey.yaml 'enabled: false'
git -C "$REPO" add -A && git -C "$REPO" commit -q -m survey && BASE=$(git -C "$REPO" rev-parse HEAD)
write_files plugins/p/src/main/resources/survey/survey.yaml 'enabled: "false"'
commit
assert_report "YAML value that changes type" 'Test this change' '`enabled` in `plugins/p/src/main/resources/survey/survey.yaml`'

new_repo
write_files plugins/p/src/main/java/com/x/Url.java 'class Url {
  String url = "http://example.com/a"; // the old service
}'
git -C "$REPO" add -A && git -C "$REPO" commit -q -m url && BASE=$(git -C "$REPO" rev-parse HEAD)
write_files plugins/p/src/main/java/com/x/Url.java 'class Url {
  String url = "http://example.com/a"; // the new service
}'
commit
assert_report "trailing Java comment change is no change" 'This pull request changes no customizations'
write_files plugins/p/src/main/java/com/x/Url.java 'class Url {
  String url = "http://example.com/b"; // the new service
}'
commit
assert_report "change after // inside a Java string is code" 'Test this change' '`plugins/p/src/main/java/com/x/Url.java`'

new_repo
write_files config/allcountries/config/empty.xml '<config version="1"/>'
commit
assert_report "added XML file without keys" 'Test this change' '- `config/allcountries/config/empty.xml`'

# --- fail-on ----------------------------------------------------------------------------

new_repo
write_files config/allcountries/config/baseconfig.xml '<config><group name="Business"><value name="X">1</value></group></config>'
commit
if node "$SCRIPT" --repo "$REPO" --base "$BASE" --head "$HEAD" --fail-on unmapped >/dev/null 2>&1; then
  echo "FAIL  --fail-on unmapped should exit non-zero for an unmapped change"
  failed=$((failed + 1))
else
  echo "PASS  --fail-on unmapped exits non-zero for an unmapped change"
  passed=$((passed + 1))
fi

if node "$SCRIPT" --repo "$REPO" --head "$HEAD" >/dev/null 2>&1; then
  echo "FAIL  missing --base should exit non-zero"
  failed=$((failed + 1))
else
  echo "PASS  missing --base exits non-zero"
  passed=$((passed + 1))
fi

echo
echo "$passed passed, $failed failed"
[ "$failed" -eq 0 ]
