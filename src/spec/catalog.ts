import type { EndpointSummary, ModuleView } from "../shared/protocol";
import type { NormalizedSpec, Operation } from "./model";

export interface Catalog {
  modules: ModuleView[];
  operations: Map<string, Operation>;
}

/**
 * Groups operations into modules. A module is a tag (in the order the spec
 * declares its tags); untagged operations are grouped by their first path
 * segment, e.g. `/orders/{id}` → `orders`.
 */
export function buildCatalog(spec: NormalizedSpec): Catalog {
  const modules = new Map<string, ModuleView>();
  const operations = new Map<string, Operation>();

  for (const tag of spec.tags) {
    modules.set(tag.name, { name: tag.name, description: tag.description, endpoints: [] });
  }

  for (const operation of spec.operations) {
    const id = endpointId(operation);
    operations.set(id, operation);
    const summary = toSummary(id, operation);
    const groups = operation.tags.length ? operation.tags : [firstSegment(operation.path)];
    for (const group of groups) {
      if (!modules.has(group)) {
        modules.set(group, { name: group, endpoints: [] });
      }
      modules.get(group)!.endpoints.push(summary);
    }
  }

  return {
    modules: [...modules.values()].filter((module) => module.endpoints.length > 0),
    operations,
  };
}

export function endpointId(operation: Operation): string {
  return `${operation.method.toUpperCase()} ${operation.path}`;
}

function toSummary(id: string, operation: Operation): EndpointSummary {
  return {
    id,
    method: operation.method.toUpperCase(),
    path: operation.path,
    title: operation.summary || operation.path,
    deprecated: operation.deprecated === true,
  };
}

function firstSegment(path: string): string {
  return path.split("/").find((segment) => segment.length > 0) ?? "/";
}
