# Should-I-Deploy Composite Action

Checks if the current time is Monday to Thursday and fails the workflow if it is not. This is to prevent deployments on Fridays and weekends.

You can bypass this check by including `[force deploy]` anywhere in your commit message.

## Usage

```yaml
jobs:
  check-deployment:
    runs-on: ubuntu-latest
    steps:
      - name: Should I deploy?
        uses: extenda/shared-workflows/generic/should-i-deploy@v0
        with:
          time-zone: 'Europe/Stockholm'
```
