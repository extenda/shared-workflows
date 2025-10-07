# k6 Performance Testing Composite Action

## Overview

This GitHub Action is a composite action designed to run k6 performance tests. It facilitates running k6 scripts and uploads test results for further analysis or storage.

## Inputs

| Input         | Description                                  | Default   |
|---------------|----------------------------------------------|-----------|
| `SECRET_AUTH` | GCP Auth                                    | _required_|
| `script-path` | Path to the k6 script to run                 | `test.js` |
| `test-name`   | The name of the k6 test being run            | _required_|
| `k6-flags`    | Additional flags to pass to k6                | (none)    |
| `service-name`| The service name to use when uploading results| _required_|
| `project-id`  | The staging GCP project ID where the service is deployed | _required_|

## Usage Example

```yaml
jobs:
  performance-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0

      - name: Get identity token
        uses: extenda/actions/identity-token@v0
        ...

      - name: Run k6 Performance Test
        uses: extenda/shared-workflows/generic/k6-performance-test@v0
        with:
          SECRET_AUTH: ${{ secrets.GCP_CREDENTIALS }}
          script-path: tests/performance-test.js
          test-name: performance-test
          service-name: hiiretail-service
          project-id: my-gcp-project
          k6-flags: --env AUTH_TOKEN=${{ env.IDENTITY_TOKEN }} --vus 10 --duration 30s
```
