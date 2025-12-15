# Publish nodejs library to Artifact Registry

This is typical action, to deploy nodejs api application to google cloud run.

### Example

```yaml
- uses: extenda/shared-workflows/composite-actions/nodejs-lib/publish@master
  with:
    SECRET_AUTH: ${{ secrets.SECRET_AUTH }}
    GCLOUD_AUTH: ${{ secrets.GCLOUD_AUTH_PROD }}
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Requirements

- `auth` script in `package.json` to authenticate to Artifact Registry (usually is `npx --yes google-artifactregistry-auth`)
