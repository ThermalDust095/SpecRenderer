# Changelog

## 0.2.0

- Renamed to **Spec Renderer**. The setting is now `specRenderer.specUrl`.
- New sidebar: endpoints listed by method and path, grouped into collapsible modules.
- Docs-style look using the bundled Geist and Geist Mono fonts: pill method tags,
  uppercase section labels, and a boxed highlight on the selected row.
- Endpoint details open in a single editor tab that is reused for each endpoint.
  It is a two-column docs page: reference on the left, sticky cURL and example
  response cards on the right.
- Setting `specRenderer.openEndpointIn`: open endpoint details in the active
  editor group (default) or in a split beside it.
- Right-click an endpoint in the sidebar → **Copy cURL**.
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
