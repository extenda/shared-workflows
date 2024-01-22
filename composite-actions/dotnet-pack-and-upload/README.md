# NuGet Pack Composite Action

Packs a .NET project using NuGet and uploads artifacts to the Nexus Extenda Retail source.

## Usage

### Inputs

- `secret-auth` (required): SECRET_AUTH value from secrets.
- `csproj-path` (required): Path to the *.csproj file to pack.
- `output-path` (optional): Path for the output of the Pack step (default: './NuGet').

### Example

```yaml
on:
  push:
    branches:
      - main

jobs:
  nuget-pack:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v2

      - name: NuGet Pack
        uses: extenda/shared-workflows/composite-actions/dotnet-pack-and-upload@master
        with:
          secret-auth: ${{ secrets.SECRET_AUTH }}
          csproj-path: 'path/to/your/project.csproj'
          output-path: './NuGet'
