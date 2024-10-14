# Cloud deploy prod action

This is typical action, to test e2e testing on staging environment, it should be configured as a step

### Example

```yaml
- name: Run e2e tests
  id: e2e-test
  uses: extenda/shared-workflows/composite-actions/frontend-generic/e2e-test@master
  with:
    GCLOUD_AUTH_STAGING: ${{ inputs.GCLOUD_AUTH_STAGING }}
```
