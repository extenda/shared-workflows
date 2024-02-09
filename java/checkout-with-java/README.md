# Checkout and setup Java

Checkout and setup Java.

## Usage

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: extenda/shared-workflows/java/checkout-with-java@master

      - name: Run tests
        uses: extenda/actions/maven@v0
        with:
          args: verify
          service-account-key: ${{ secrets.SECRET_AUTH }}
