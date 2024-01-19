# NuGet Config Composite Action

Configures NuGet by adding default NuGet sources and the Nexus Extenda Retail source to the `NuGet.Config` file.

## Usage

### Inputs

- `secret-auth` (required): SECRET_AUTH value from secrets.

### Example

```yaml
on:
  push:
    branches:
      - main

jobs:
  nuget-config:
    runs-on: ubuntu-latest
    steps:
      - name: Configure NuGet
        uses: extenda/shared-workflows/composite-actions/dotnet-nuget-config@master
        with:
          secret-auth: ${{ secrets.SECRET_AUTH }}
