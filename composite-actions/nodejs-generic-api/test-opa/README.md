# Run opa tests action

This is typical action, to run opa tests in nodejs api application.

### Example

```yaml
- uses: extenda/shared-workflows/composite-actions/nodejs-generic-api/test-opa@master
  with:
    SECRET_AUTH: ${{ secrets.SECRET_AUTH }}
    system: <styra system>
    service-name: <name of service in Styra>
```

### Requirements

- You have to have styra rules in you project with tests. 
