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


## AI SVG pattern generation

The AI pattern pipeline is exposed at:

`POST /api/ai/patterns/generate`

Example request:

```json
{
  "brief": "Angular lightning shards and diagonal speed lines",
  "designIdea": "线条由左上向右下倾斜，边缘无缝衔接，纹理不要过密。",
  "productType": "basketball",
  "patternColor": "#ffffff"
}
```

The endpoint uses the configured Zhipu GLM model to generate editable vector geometry.
LangGraph runs a generate -> validate -> repair loop with a maximum of 3 generation
attempts. Deterministic checks cover SVG structure, allowed elements/attributes,
external resources, path syntax and tile bounds. Unsafe or invalid SVG is rejected.
The response includes the SVG source, a data URL, attempt count and validation report.

The same pipeline is used by `POST /api/ai/design` when the design agent selects
`source: "generated_svg"`. Region-specific patterns are discarded if their target
region IDs do not exist in the actual template; they are never silently broadened
to the whole garment.

SVG pattern generation costs 8 points when called through the standalone endpoint.
