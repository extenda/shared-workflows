# Checkout Engine customization coverage

[`ce-customization-coverage.yml`](../.github/workflows/ce-customization-coverage.yml) comments on a customer
Checkout Engine pull request with the customizations it changes and whether acceptance scenarios test them.
The cucumber suite is the gate for production deploys, and a gate only protects what it tests: a new
configuration value or plugin without a scenario passes every run.

The workflow posts one comment per pull request and updates it on every push. It never fails the build unless
`fail-on` asks it to. It reads the diff, the manifest and the feature files, with no engine or Docker, and
takes seconds.

With `plugin-coverage` in [`ce-acceptance-test.yml`](ce-acceptance-test.md#plugin-coverage), the same comment
also shows which plugin code the scenarios run. The customization coverage appears within seconds of a push, and
the plugin coverage when the acceptance tests have finished. Each workflow replaces only its own section. Until
the plugin coverage reports on a new push, its section says it's for an earlier commit.

## What counts as a customization

Something the customer's engine does differently from standard Checkout Engine that a cashier or customer
could notice, so that a scenario could see the difference through the checkout API: a limit, a prompt, a menu
button, a receipt layout, a tender rule, a loyalty discount. It lives in the customer repository as a
configuration overlay, a plugin, a text or a behaviour switch.

Wiring isn't a customization: the URLs, hosts, secrets, credentials and timeouts that connect the engine to its
environment. Neither are build files, CI, test data or core upgrades.

## How changes are classified

The workflow compares the pull request with its merge base. XML, properties and YAML files are compared value by
value, so formatting, comments and order don't count. Java and other files are compared line by line, without
blank lines, indentation and Java comments. A file moved between kinds of path, for example a plugin class into
`src/test`, counts as a deletion of the old path and an addition of the new one.

| Kind         | Recognised by                                                                                                                                                                        | Needs a test?                       |
|--------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------|
| Test         | `acceptance/**`, `.acceptance/**`                                                                                                                                                    | –                                   |
| Ignored      | `.github/**`, `**/*.md`, `docker-compose*`, `testdata/**`, `refdata/**`, `**/src/test/**`, `**/pom.xml`, `launch-darkly-*.json`, and the manifest's `ignore`                          | No                                  |
| Core upgrade | `FROM …checkout-engine:` in the `Dockerfile`                                                                                                                                         | No, shown as the old and new image  |
| Wiring       | Deploy env vars ending `_URL`, `_HOST`, `_PORT`, `_KEY`, `_SECRET` … or with `sm://` or URL values, deploy settings outside `env`, properties keys like `*.url`, `*.host` or `*timeout*`, XML values named `…Url`, `…Address`, `…Timeout` …, and the manifest's `wiring` | No                                  |
| Text         | `**/language/**/*.properties`                                                                                                                                                        | Yes: a feature file must contain it |
| Behaviour    | Everything else: XML values, `includeapp.xml`, plugin Java, behaviour switches in properties and deploy config, the `Dockerfile`'s other instructions such as `COPY` and `ENTRYPOINT` | Yes: a customization with scenarios |

A change is wiring only when it's recognised as wiring. Anything else counts as behaviour, because a needless
note in the comment costs less than a missed test. A class that registers plugins (`**/config/*Config.java`)
counts with the customizations of the classes named on its changed lines. When those belong to no customization,
it's listed as a change no customization covers.

A text is tested when a feature file contains its value, in any language of its bundle, as a whole: not inside a
longer word, and not in a comment. A text removed from one language is checked like a change, since cashiers
then see another language's text. A text removed from every language is only listed.

## The manifest

Each repository lists its customizations in `acceptance/customizations.yaml` (or `.acceptance/`). A scenario
tests a customization when it, or its feature, is tagged `@customization:<name>`. The tag is the only
technical line in a feature file, so the features stay readable for the business.

```yaml
customizations:
  receipt-layout:
    description: Item id under each item and a 3 digit store in the receipt barcode
    paths:
      # Keys inside a shared file, after a #. XML keys are the group and value names.
      - config/allcountries/config/receipt.xml#Business/Receipt/**
      - plugins/*/src/main/java/com/example/receiptlayout/*.java

  gift-cards:
    description: Issuing gift cards and who may do it
    paths:
      - config/allcountries/config/eft.xml

# Settings that only connect the engine to its environment, on top of the defaults above
wiring:
  keys:
    - grpc.*
  paths:
    - nodes/auth-proxy/**

# Files that aren't customizations, on top of the defaults above
ignore:
  - bundle/**
```

```gherkin
@customization:receipt-layout
Feature: Receipt layout
```

Tag single scenarios instead when a feature tests several customizations. As in Gherkin, tags on a `Rule:` apply to
its scenarios and tags on `Examples:` to their outline. Don't list the classes that register plugins: they
register several customizations.

Without a manifest the workflow still runs, and lists every behaviour change as not known to be tested.

## The comment

It opens with whether any change lacks a known test, then numbered steps for each: the changed key, file and
old and new value, an example manifest entry, an example tag and, for texts, example shared steps. A change is
tested when a scenario exercises it; the manifest entry and tag only link the two. A "Tested" section lists the
customizations with scenarios and asks for a check when their scenarios didn't change. Wiring, core upgrades,
ignored files and the list of all customizations are collapsed at the bottom.

## Usage

```yaml
name: Customization coverage
on:
  pull_request:

permissions:
  contents: read
  pull-requests: write

jobs:
  coverage:
    uses: extenda/shared-workflows/.github/workflows/ce-customization-coverage.yml@v0
```

The workflow skips Dependabot pull requests, whose token can't comment, and cancels older runs of the same pull
request, so the comment matches its head. A pull request whose head commit has `[skip ci]` gets no comment.

## Inputs

| Input     | Default | Description                                                                                                                         |
|-----------|---------|-------------------------------------------------------------------------------------------------------------------------------------|
| `fail-on` | `none`  | `none` never fails. `unmapped` fails on changes no customization covers. `untested` also fails on customizations and texts without scenarios. |

Both workflows use the [`ce-coverage`](../composite-actions/ce-coverage) composite action, which has the scripts.
