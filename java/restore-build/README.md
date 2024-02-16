# Restore Build Composite Action

Restores a Maven target folder.

## Usage

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    needs: compile
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Restore Maven build
        uses: extenda/shared-workflows/java/restore-build@v0

      - name: Run tests
        uses: extenda/actions/maven@v0
        timeout-minutes: 5
        with:
          args: verify -DskipCompile -T1C
          service-account-key: ${{ secrets.SECRET_AUTH }}
