# API Explorer

API Explorer brings an OpenAPI browser directly into a VS Code Activity Bar
view. It renders inside VS Code—no browser tab is opened. Browse the operations
in one OpenAPI 3.0 or 3.1 document and generate cURL commands without leaving
your editor.

## Features

- Browse operations grouped by path and HTTP method.
- Inspect operation summaries, descriptions, parameters, and request bodies.
- Generate and copy a cURL command for an operation.
- Refresh the configured document with the view's refresh button. A failed
  request or invalid document does not replace the last valid document.

The extension displays specifications and generates commands; it does not send
API requests.

## Setup

Set `apiExplorer.specUrl` in VS Code settings to the URL of an OpenAPI 3.0 or
3.1 JSON or YAML document. Then select the API Explorer icon in the Activity Bar.
The view loads the document when opened and can be refreshed from its title bar.

Generated cURL commands use the first server declared by the document (or
`http://localhost` if none is declared), parameter examples/defaults where
available, and request-body examples/schema defaults where available. JSON,
text, URL-encoded, and simple multipart form bodies are supported. Replace
placeholder values before running a command. Authentication credentials are
not inferred or fetched by the extension.

The Marketplace publisher identifier in `package.json` is a placeholder and
must be changed to your publisher ID before publishing.

## Development

```sh
npm install
npm test
```

Press `F5` in VS Code to launch an Extension Development Host.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
