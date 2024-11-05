# service-definition-validator

This GitHub Action can be used to validate the Cloud Deploy service definition files against predefined templates and identify deviations.

By default it will use the GitHub Actions token. To use a different token, set the `github-token` input or pass a `GITHUB_TOKEN` environment variable.

### Inputs

- `service-definitions` (required): List of service definition file paths provided as a JSON array string. For example: ["./folder1/service-definition1.yaml", "./folder2/service-definition2"]
- `service-type` (required): The type of the service the validation will run for.
- `github-token` (optional): A GitHub token with write access to the repository. 

### Environment variables

- `GITHUB_TOKEN` (optional): A GitHub token with write access to the repository.

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
        uses: extenda/shared-workflows/composite-actions/nodejs-script/service-definition-validator@v0
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