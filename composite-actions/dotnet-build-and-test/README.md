# Build and Run Tests Composite Action

Designed for .NET services. It performs setup, adds the custom Extenda Retail Nexus NuGet source, builds the solution, runs tests, and analyzes results with Sonar.

## Usage

### Inputs

- `sln-path` (required): Path to the *.sln file.
- `secret-auth` (required): SECRET_AUTH value from secrets.
- `gcloud-auth-staging` (required): GCLOUD_AUTH_STAGING value from secrets.
- `java-distribution` (optional, default: 'temurin'): Java distribution to use.
- `java-version` (optional, default: '17'): Java version to use.
- `dotnet-version` (optional, default: '8'): .NET SDK version to use.

### Example

```yaml
on:
  push:
    branches:
      - main

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - name: Build and Test
        uses: extenda/shared-workflows/composite-actions/dotnet-build-and-test@master
        with:
          sln-path: 'path/to/your/solution.sln'
          secret-auth: ${{ secrets.SECRET_AUTH }}
          gcloud-auth-staging: ${{ secrets.GCLOUD_AUTH_STAGING }}
          java-distribution: 'temurin'
          java-version: '17'
          dotnet-version: '8'
