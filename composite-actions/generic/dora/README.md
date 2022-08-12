# Dora

This is a generic action, to write dora metrics.
Original action - https://github.com/extenda/actions/tree/master/dora-metrics.

### Example

```yaml
- uses: extenda/shared-workflows/composite-actions/generic/dora@master
  with: 
    SECRET_AUTH: ${{ secrets.SECRET_AUTH }}
    GCLOUD_AUTH: ${{ secrets.GCLOUD_AUTH_PROD }}
    product-name: <system name in styra>
    product-component: <name of the service in cloud run>
    jira-project-key: ${{ env.IMAGE_NAME }}
```
### Requirements
  
None
