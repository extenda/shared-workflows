# processor-service-definition-validator

This GitHub Action can be used to validate the service definition files of Kafka Stream processors against predefined templates and identify deviations.

### Inputs

- `service-definitions` (required): List of service definition file paths provided as a JSON array string. For example: ["./folder1/service-definition1.yaml", "./folder2/service-definition2"]

### Environment variables

The following environment variables are required:
- `GITHUB_TOKEN` - A GitHub token with write access to the repository.

## Example

This example will validate the service definitions files according to the templates for staging and production.

```yaml
jobs:
  validate-service-definition-files:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Validate service definition files
        uses: extenda/shared-workflows/composite-actions/nodejs-script/processor-service-definition-validator@master
        with:
          service-definitions : ${{ inputs.service-definitions }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Bundling source files

To bundle the source files follow these steps:
1. Open a terminal in the root directory of the GitHub Action.
2. Install the dependencies via `npm ci` command.
3. Run `npm run bulid` command.