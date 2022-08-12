# Dora

This is a generic action, to write dora metrics.
Original action - https://github.com/extenda/actions/tree/master/dora-metrics.

### Example

```yaml
- uses: extenda/shared-workflows/composite-actions/generic/dora@master
  with: 
    SECRET_AUTH: ${{ secrets.SECRET_AUTH }}
    GCLOUD_AUTH: ${{ secrets.GCLOUD_AUTH_PROD }}
    product-name: <Name of the product, that this service belongs to in Jira> # example - IAM
    product-component: <Name of the product component, that this service belongs to in Jira> # example - IAM
    jira-project-key: <Key of the product, that this service belongs to in Jira> # example - HII
```
### Requirements
  
None
