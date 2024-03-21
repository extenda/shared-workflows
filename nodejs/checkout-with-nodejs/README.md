# Checkout and setup Node.js

Checkout and setup Node.js.

## Usage

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: extenda/shared-workflows/nodejs/checkout-with-nodejs@v0

      - name: NPM install
        run: npm ci
```
