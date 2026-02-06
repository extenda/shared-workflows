# Should-I-Deploy Composite Action

Checks if the current time is Monday to Thursday and within work hours, and fails the workflow if it is not. This is to prevent deployments on Fridays, weekends and outside of work hours.

You can bypass this check by including `[force deploy]` anywhere in your commit message.

## Inputs

| Input | Description | Default |
| --- | --- | --- |
| `time-zone` | The time zone to check | `UTC` |
| `work-hours-start` | The start of the work hours (HH:MM) | `08:00` |
| `work-hours-end` | The end of the work hours (HH:MM) | `17:00` |

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
          work-hours-start: '08:00'
          work-hours-end: '17:00'
```
