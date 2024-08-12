# Database migration action

An action to run database migration in nodejs api application.

### Example

```yaml
- name: Run migration
        uses: extenda/shared-workflows/composite-actions/nodejs-generic-api/cloud-sql-db-migrate@master
        with:
          IMAGE: eu.gcr.io/extenda/user-profiles-api-migration
          GCLOUD_AUTH: ${{ secrets.GCLOUD_AUTH_STAGING }}
          db_instance_connection_name_secret_name: postgresql_clan_instance_connection_name
          db_port_secret_name: skip
          db_name_secret_name: postgres_clan_user_profile_db_name
          db_user_secret_name: postgres_clan_user_profile_role_name
          db_pass_secret_name: postgres_clan_user_profile_role_password
```

### Requirements

- Your application have to be compatible with node 16.
- You have to have valid ```cloud-run.yaml``` file in the root of your project.
- You should have npm script ```npm run db-migrate``` to run the migration
