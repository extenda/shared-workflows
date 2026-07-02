// For any component schema with a `oneOf` whose branches are tagged `x-country` on the branch
// component itself, keeps only the branch matching the configured `country` and deletes now-
// unreferenced x-country-tagged components. Modeled on Redocly's built-in `remove-x-internal`
// decorator (walk components.schemas, delete tagged nodes).
function StripOtherCountries({ country }) {
  if (!country) {
    throw new Error('country-filter/strip-other-countries requires a `country` option');
  }
  return {
    Root: {
      leave(root) {
        const schemas = root?.components?.schemas;
        if (!schemas) return;

        for (const [schemaName, schema] of Object.entries(schemas)) {
          if (!Array.isArray(schema?.oneOf)) continue;

          const before = schema.oneOf;
          schema.oneOf = before.filter((branch) => {
            const branchName = refName(branch?.$ref);
            const branchCountry = branchName && schemas[branchName]?.['x-country'];
            return !branchCountry || branchCountry === country;
          });

          for (const branch of before) {
            if (!schema.oneOf.includes(branch)) {
              console.log(
                `country-filter: removed '${refName(branch?.$ref)}' from '${schemaName}.oneOf' (x-country != ${country})`
              );
            }
          }

          if (schema.oneOf.length === 0) {
            throw new Error(
              `country-filter: no branch of '${schemaName}' tagged x-country: ${country} — add ` +
                `one before configuring redocly.yaml's '${country}' apis entry.`
            );
          }

          // A single surviving branch makes the oneOf wrapper pointless — collapse the branch's
          // content into the wrapper itself so consumers see one plain schema, not a oneOf of one.
          if (schema.oneOf.length === 1) {
            const branchName = refName(schema.oneOf[0].$ref);
            const branchSchema = schemas[branchName];
            delete schema.oneOf;
            Object.assign(schema, branchSchema);
            delete schema['x-country'];
            delete schema['title'];
            console.log(`country-filter: '${branchName}' is copied into '${schemaName}'`);
          }
        }

        for (const [schemaName, schema] of Object.entries(schemas)) {
          if (schema?.['x-country'] && !isReferenced(schemas, schemaName)) {
            delete schemas[schemaName];
            console.log(`country-filter: dropped unreferenced component '${schemaName}'`);
          }
        }
      }
    }
  };
}

function refName(ref) {
  return typeof ref === 'string' && ref.startsWith('#/components/schemas/')
    ? ref.slice('#/components/schemas/'.length)
    : undefined;
}

// ponytail: string-scan ref check, not a real ref-graph walk — fine while component names are
// unique tokens; swap for a proper walker if a name ever collides as a substring of another ref.
function isReferenced(schemas, name) {
  return JSON.stringify(schemas).includes(`#/components/schemas/${name}`);
}

module.exports = function countryFilterPlugin() {
  return {
    id: 'country-filter',
    decorators: {
      oas3: {
        'strip-other-countries': StripOtherCountries
      }
    }
  };
};
