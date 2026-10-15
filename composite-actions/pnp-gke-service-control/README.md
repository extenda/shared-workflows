# PnP GKE Service Control Composite Action

Restarts or scales a PnP GKE service (deployment or statefulset) in the `k8s-cluster`
(`europe-west1`). The workload name must match its namespace. Used by the
`pnp-service-restart`, `pnp-service-scale` and `pnp-service-stop` reusable workflows.

## Inputs

| Input                       | Required | Description                                                  |
|-----------------------------|----------|--------------------------------------------------------------|
| `operation`                 | yes      | `restart` or `scale`                                         |
| `replicas`                  | for `scale` | Non-negative integer. `0` stops the service               |
| `service-namespace`         | yes      | Namespace and workload name                                  |
| `gcp-project`               | yes      | GCP project hosting the cluster                              |
| `is-statefulset`            | no       | `true` for a statefulset, `false` (default) for a deployment |
| `service-account-key`       | yes      | GCP service account key for the target environment           |
| `slack-channel`             | no       | Channel to notify on failure. Skipped when empty             |
| `slack-service-account-key` | no       | Service account key used by `slack-notify`                   |

## Usage

```yaml
steps:
  - uses: extenda/shared-workflows/composite-actions/pnp-gke-service-control@master
    with:
      operation: scale
      replicas: '0'
      service-namespace: ${{ secrets.service-namespace }}
      gcp-project: ${{ secrets.gcp-project }}
      service-account-key: ${{ secrets.GCLOUD_AUTH_STAGING }}
      slack-channel: ${{ secrets.slack-channel }}
      slack-service-account-key: ${{ secrets.SECRET_AUTH }}
```
