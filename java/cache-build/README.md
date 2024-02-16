# Cache Build Action

Caches a Maven target folder for later re-use.

## Usage

```yaml
jobs:
  compile:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version-file: .java-version
          cache: maven

      - name: Compile and validate POMs
        uses: extenda/actions/maven@v0
        with:
          service-account-key: ${{ secrets.SECRET_AUTH }}
          args: test-compile

      - name: Cache Maven build
        uses: extenda/shared-workflows/java/cache-build@v0
