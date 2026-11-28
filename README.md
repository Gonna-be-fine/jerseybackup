## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## API documentation

Start the backend in development mode and open:

`http://localhost:4000/api/docs`

The OpenAPI JSON document is available at:

`http://localhost:4000/api/docs-json`

Swagger UI is enabled by default outside production. In production it is disabled unless
`SWAGGER_ENABLED=true` is explicitly configured.
