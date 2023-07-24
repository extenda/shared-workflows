# Run pull request checks action

This is a generic action to run common checks on pull requests.

This actions will:

- Check your PR title.
- Run linting, testing and build.
- Analyze code coverage with SonarCloud.

### Example

```yaml
- uses: extenda/shared-workflows/composite-actions/frontend-generic/test@master
  with:
    SECRET_AUTH: ${{ secrets.SECRET_AUTH }}
    BUILD_TOOL: 'yarn'
```

### Requirements

- You have to have a `test/example.env` file, with all env variables needed to run tests.

If you are using `npm` as your build tool, you have to have the following scripts:

- You have to have a `npm run lint:ci` script.
- You have to have a `npm run test:cov` script.
- You have to have a `npm run build` script.

If you are using `yarn` as your build tool, you have to have the following scripts:

- You have to have a `yarn lint:ci` script.
- You have to have a `yarn test:cov` script.
- You have to have a `yarn build` script.
