# PnP GKE Service Control Composite Action

Restarts or scales a PnP GKE service (deployment or statefulset) in the given GKE cluster
(`europe-west1`): `pnp-cluster-prod` or `pnp-cluster-staging`. The workload name must match
its namespace. Used by the `pnp-service-restart`, `pnp-service-scale` and `pnp-service-stop`
reusable workflows, which pick the cluster from their `prod` input.

## Inputs

| Input                       | Required | Description                                                  |
|-----------------------------|----------|--------------------------------------------------------------|
| `operation`                 | yes      | `restart` or `scale`                                         |
| `replicas`                  | for `scale` | Non-negative integer. `0` stops the service               |
| `service-namespace`         | yes      | Namespace and workload name                                  |
| `gcp-project`               | yes      | GCP project hosting the cluster                              |
| `cluster-name`              | yes      | GKE cluster, e.g. `pnp-cluster-prod` or `pnp-cluster-staging` |
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
      cluster-name: pnp-cluster-staging
      service-account-key: ${{ secrets.GCLOUD_AUTH_STAGING }}
      slack-channel: ${{ secrets.slack-channel }}
      slack-service-account-key: ${{ secrets.SECRET_AUTH }}
```
