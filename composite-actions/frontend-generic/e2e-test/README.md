# Cloud deploy prod action

This is typical action, to test e2e testing on staging environment, it should be configured as a step.

The action fails (non-zero exit) if any Playwright test fails, after uploading the `playwright-report` artifact and notifying Slack. A caller that needs to keep running steps afterwards (e.g. to skip a deploy without failing the job) should add `continue-on-error: true` to the step that invokes this action and check its `e2e_test_failed` output.

### Example

```yaml
- name: Run e2e tests
  id: e2e-test
  uses: extenda/shared-workflows/composite-actions/frontend-generic/e2e-test@master
  with:
    GCLOUD_AUTH_STAGING: ${{ inputs.GCLOUD_AUTH_STAGING }}
    PLAYWRIGHT_BROWSERS: chromium # optional, empty installs all browsers
```
