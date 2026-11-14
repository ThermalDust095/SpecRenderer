# Changelog

## 0.2.0

- Renamed to **Spec Renderer**. The setting is now `specRenderer.specUrl`.
- New sidebar: endpoints listed by method and path, grouped into collapsible modules.
- Endpoint details open in a single editor tab that is reused for each endpoint.
- Added Swagger 2.0 support.
- Spec discovery from docs pages such as `/docs` and `/swagger-ui/index.html`.
- Specs with validation errors load with a warning instead of failing.
- cURL: multi-line output, `@file` uploads, auth placeholders, and only required
  or example-backed query parameters.
- Response examples and field tables.
- New monochrome Activity Bar icon and Marketplace icon.
- Bundled with esbuild.

## 0.1.0

- Initial release: OpenAPI 3.0/3.1 browser with cURL generation.
