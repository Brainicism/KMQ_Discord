# Instructions
## Prerequisites
- MySQL (tested on 5.7)
- NodeJS (Requires at least v12)

## Setup
------------
1. Modify configuration files in `config/` as required
3. `npm install` to install Node dependeices
4. `npm run seed` to seed the database with latest kpop song data
5. Apply migration files using `npx knex migrate:latest --knexfile config/knexfile_kmq.js`
6. `npm run dev` to start the K-pop Music Quiz bot


## Creating Migrations
In order to modify the database schema, you need to create a migration file. This can be done using `npx knex migrate:make migration_name --knexfile config/knexfile_kmq.js`. Modify the created migration file to describe the change in schema. [Details here](http://knexjs.org/#Migrations).
