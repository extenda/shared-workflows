# Should-I-Liquibase Composite Action

Calculates whether Liquibase changeset files have been modified.

## Usage

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    needs: compile
    outputs:
      run-liquibase: ${{ steps.should-i-liquibase.outputs.should-run }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
         
      - name: Run liquibase?
        id: should-i-liquibase
        uses: extenda/shared-workflows/generic/should-i-liquibase@v0
        path: /path/to/changesets
    ...

  liquibase-staging:
    if: github.ref == 'refs/heads/master' && needs.test.outputs.run-liquibase == 'true'
    ...
  
  deploy-staging:
    if: github.ref == 'refs/heads/master' && !(failure() || cancelled())
    runs-on: ubuntu-latest
    needs:
      - test
      - test-opa
      - liquibase-staging
    ...

  liquibase-prod:
    if: github.ref == 'refs/heads/master' && needs.test.outputs.run-liquibase == 'true'
    ...
    
  deploy-prod:
    if: github.ref == 'refs/heads/master' && !(failure() || cancelled())
    runs-on: ubuntu-latest
    needs:
      - release
      - liquibase-prod
    ...
