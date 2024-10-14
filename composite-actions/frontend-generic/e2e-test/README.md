# Cloud deploy prod action

This is typical action, to test e2e testing on staging environment, it should be configured as a step

### Example

```yaml
- name: Run e2e tests
  id: e2e-test
  uses: extenda/shared-workflows/composite-actions/frontend-generic/e2e-test@master
```

### Requirements

- You have to have valid `Dockerfile`, in the root of your project.
- You have to have valid `cloud-deploy.yaml` file in the root of your project.
