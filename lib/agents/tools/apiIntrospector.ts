import { z } from 'zod';
import type { Tool } from '@/lib/agents/core/types';
import type { AgentContext } from '@/lib/agents/core/types';
import { auditEnterprise } from '@/lib/security/auditLog';

/* ─── Types ─────────────────────────────────────────────────────────── */

export interface GraphQLField {
  name: string;
  description?: string;
  type: GraphQLTypeRef;
  isRequired: boolean;
  isList: boolean;
  enumValues?: string[];
}

export interface GraphQLTypeRef {
  kind: 'SCALAR' | 'OBJECT' | 'INPUT_OBJECT' | 'ENUM' | 'NON_NULL' | 'LIST';
  name?: string;
  ofType?: GraphQLTypeRef;
}

export interface GraphQLInputField {
  name: string;
  description?: string;
  type: GraphQLTypeRef;
  isRequired: boolean;
  isList: boolean;
  enumValues?: string[];
  defaultValue?: any;
}

export interface GraphQLInputType {
  kind: 'INPUT_OBJECT';
  name: string;
  inputFields: GraphQLInputField[];
}

export interface ApiOperation {
  id: string;
  name: string;
  description: string;
  method: 'query' | 'mutation';
  path?: string;
  inputFields: GraphQLInputField[];
  outputTypeName?: string;
  isMutative: boolean;
  source: 'graphql';
}

/* ─── Introspection Query ──────────────────────────────────────────── */

const INTROSPECTION_QUERY = `
query IntrospectionQuery {
  __schema {
    queryType { name }
    mutationType { name }
    types {
      kind
      name
      enumValues(includeDeprecated: true) {
        name
      }
      inputFields {
        name
        description
        type {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
              }
            }
          }
        }
        defaultValue
      }
      fields {
        name
        description
        type {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
            }
          }
        }
        args {
          name
          description
          type {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
              }
            }
          }
          defaultValue
        }
      }
    }
  }
}
`;

/* ─── Type Parsing ─────────────────────────────────────────────────── */

function unwrapType(raw: any): GraphQLTypeRef {
  if (!raw) return { kind: 'SCALAR', name: 'String' };
  if (raw.kind === 'NON_NULL') {
    const inner = unwrapType(raw.ofType);
    return { ...inner, kind: 'NON_NULL', ofType: inner };
  }
  if (raw.kind === 'LIST') {
    const inner = unwrapType(raw.ofType);
    return { kind: 'LIST', name: inner.name, ofType: inner };
  }
  return {
    kind: raw.kind || 'SCALAR',
    name: raw.name,
    ofType: raw.ofType ? unwrapType(raw.ofType) : undefined,
  };
}

function isTypeRequired(type: GraphQLTypeRef): boolean {
  return type.kind === 'NON_NULL';
}

function isTypeList(type: GraphQLTypeRef): boolean {
  return type.kind === 'LIST';
}

function getEnumValues(type: GraphQLTypeRef): string[] | undefined {
  const current: GraphQLTypeRef | undefined = type.kind === 'NON_NULL' || type.kind === 'LIST'
    ? type.ofType
    : type;
  if (current?.kind === 'ENUM') {
    // Enum values are resolved later from the type map
    return undefined;
  }
  return undefined;
}

function resolveScalar(name: string): z.ZodTypeAny {
  const map: Record<string, z.ZodTypeAny> = {
    ID: z.string(),
    String: z.string(),
    Int: z.number().int(),
    Float: z.number(),
    Boolean: z.boolean(),
    DateTime: z.string().datetime().or(z.string()),
    Date: z.string().datetime().or(z.string()),
  };
  return map[name] ?? z.string();
}

/* ─── Zod Builder ──────────────────────────────────────────────────── */

function buildZodFromType(
  type: GraphQLTypeRef,
  typeMap: Map<string, any>
): z.ZodTypeAny {
  // Strip NON_NULL for structure building; required handled separately
  const core = type.kind === 'NON_NULL' || type.kind === 'LIST' ? type.ofType! : type;

  if (core.kind === 'SCALAR') {
    return resolveScalar(core.name || 'String');
  }

  if (core.kind === 'ENUM') {
    const def = typeMap.get(core.name!);
    const values = def?.enumValues?.map((ev: any) => ev.name) ?? [];
    return z.enum(values as [string, ...string[]]);
  }

  if (core.kind === 'INPUT_OBJECT') {
    return buildZodFromInputObject(core.name!, typeMap);
  }

  return z.string();
}

function buildZodFromInputObject(
  name: string,
  typeMap: Map<string, any>
): z.ZodObject<any> {
  const def = typeMap.get(name);
  if (!def || !def.inputFields) {
    return z.object({});
  }

  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of def.inputFields) {
    const rawType = unwrapType(field.type);
    const required = isTypeRequired(rawType);
    const list = isTypeList(rawType);
    let schema = buildZodFromType(rawType, typeMap);

    if (list) {
      schema = z.array(schema);
    }

    if (!required) {
      schema = schema.optional();
    }

    if (field.description) {
      schema = schema.describe(field.description);
    }

    shape[field.name] = schema;
  }

  return z.object(shape).describe(`GraphQL input type: ${name}`);
}

/* ─── Introspection Engine ─────────────────────────────────────────── */

export async function introspectGraphQLSchema(
  endpoint: string,
  headers: Record<string, string> = {}
): Promise<Map<string, any>> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({ query: INTROSPECTION_QUERY }),
  });

  if (!res.ok) {
    throw new Error(`GraphQL introspection failed: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`GraphQL introspection errors: ${json.errors.map((e: any) => e.message).join(', ')}`);
  }

  const types = json.data?.__schema?.types ?? [];
  const typeMap = new Map<string, any>();
  for (const t of types) {
    typeMap.set(t.name, t);
  }

  return typeMap;
}

export function extractOperationsFromIntrospection(
  typeMap: Map<string, any>,
  mutationTypeName?: string,
  queryTypeName?: string
): ApiOperation[] {
  const operations: ApiOperation[] = [];
  const queryType = typeMap.get(queryTypeName || 'Query');
  const mutationType = typeMap.get(mutationTypeName || 'Mutation');

  function processFields(fields: any[], method: 'query' | 'mutation', opNamePrefix: string) {
    if (!fields?.length) return;

    for (const field of fields) {
      const isMutative = method === 'mutation';
      const inputFields: GraphQLInputField[] = [];

      for (const arg of field.args ?? []) {
        const rawType = unwrapType(arg.type);
        inputFields.push({
          name: arg.name,
          description: arg.description,
          type: rawType,
          isRequired: isTypeRequired(rawType),
          isList: isTypeList(rawType),
          enumValues: rawType.name ? undefined : undefined,
          defaultValue: arg.defaultValue,
        });
      }

      operations.push({
        id: `gql_${method}_${field.name}`,
        name: `gql_${method}_${field.name}`,
        description: field.description || `GraphQL ${method}: ${field.name}`,
        method,
        inputFields,
        outputTypeName: field.type.name,
        isMutative,
        source: 'graphql',
      });
    }
  }

  processFields(queryType?.fields, 'query', 'query_');
  processFields(mutationType?.fields, 'mutation', 'mutation_');

  return operations;
}

/* ─── Zod Builder from Operations ──────────────────────────────────── */

export function buildZodSchemaForOperation(
  operation: ApiOperation,
  typeMap: Map<string, any>
): z.ZodTypeAny {
  if (operation.inputFields.length === 0) {
    return z.object({});
  }

  const singleInput = operation.inputFields.length === 1
    ? operation.inputFields[0]
    : null;
  const singleInputIsObject = !!(
    singleInput &&
    singleInput.type.name &&
    typeMap.get(singleInput.type.name)?.kind === 'INPUT_OBJECT'
  );

  const innerShape: Record<string, z.ZodTypeAny> = {};
  for (const field of operation.inputFields) {
    const rawType = field.type;
    let schema = buildZodFromType(rawType, typeMap);

    if (field.isList) {
      schema = z.array(schema);
    }

    if (!field.isRequired) {
      schema = schema.optional();
    }

    if (field.description) {
      schema = schema.describe(field.description);
    }

    innerShape[field.name] = schema;
  }

  const innerSchema = z.object(innerShape).describe(operation.description);

  if (singleInputIsObject) {
    return z.object({
      input: innerSchema.describe(singleInput!.description || `Input for ${operation.name}`),
    }).describe(operation.description);
  }

  return innerSchema;
}

/* ─── Tool Factory ─────────────────────────────────────────────────── */

export async function introspectGraphQLTools(
  endpoint: string,
  opts?: {
    headers?: Record<string, string>;
    mutationTypeName?: string;
    queryTypeName?: string;
    authHeaderName?: string;
    authHeaderValue?: string;
    vaultSecretKeys?: {
      shopDomain?: string;
      storefrontToken?: string;
      authHeaderName?: string;
      authHeaderValue?: string;
    };
  }
): Promise<Tool[]> {
  const baseHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts?.headers ?? {}),
  };

  if (opts?.authHeaderName && opts?.authHeaderValue) {
    baseHeaders[opts.authHeaderName] = opts.authHeaderValue;
  }

  const baseEndpoint = endpoint;
  const vault = opts?.vaultSecretKeys;

  const typeMap = await introspectGraphQLSchema(baseEndpoint, baseHeaders);
  const mutationTypeName = opts?.mutationTypeName || 'Mutation';
  const queryTypeName = opts?.queryTypeName || 'Query';
  const operations = extractOperationsFromIntrospection(
    typeMap,
    mutationTypeName,
    queryTypeName
  );

  const tools: Tool[] = [];

  for (const op of operations) {
    const schema = buildZodSchemaForOperation(op, typeMap);

    tools.push({
      name: op.name,
      description: op.description,
      schema,
      risk: op.isMutative ? 'mutative' : 'read-only',
      requiresApproval: op.isMutative,
      timeoutMs: 15_000,
      execute: async (rawInput: Record<string, any>, context: AgentContext) => {
        const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
        let endpoint = baseEndpoint;
        const headers: Record<string, string> = { ...baseHeaders };

        if (vault) {
          const { resolveOrgSecret } = await import('@/lib/security/orgVault');
          const orgId = context.orgContext?.orgId;

          if (!orgId) {
            throw new Error('Execution Denied: Missing orgContext for vault resolution');
          }

          if (vault.shopDomain) {
            const shopDomain = await resolveOrgSecret(orgId, vault.shopDomain);
            if (!shopDomain) {
              throw new Error(`Execution Denied: Missing Shopify shop domain for org ${orgId}`);
            }
            endpoint = `https://${shopDomain}/api/2026-01/graphql.json`;
          }

          const tokenKey = vault.authHeaderValue ?? vault.storefrontToken;
          if (tokenKey) {
            const token = await resolveOrgSecret(orgId, tokenKey);
            if (!token) {
              throw new Error(`Execution Denied: Missing Shopify storefront token for org ${orgId}`);
            }
            headers[vault.authHeaderName ?? 'X-Shopify-Storefront-Access-Token'] = token;
          }
        }

        const singleArg = op.inputFields.length === 1 ? op.inputFields[0] : null;
        const input = singleArg && singleArg.name === 'input' && typeof rawInput?.input === 'object'
          ? rawInput.input
          : rawInput;

        const variableDefs = op.inputFields
          .map(f => {
            const t = f.type.name || 'String';
            return `$${f.name}: ${t}${f.isRequired ? '!' : ''}`;
          })
          .join(', ');

        const selectionSet = op.outputTypeName
          ? `{ __typename }`
          : `{ result }`;

        const gql = `${op.method} ${op.name.replace(/^gql_(query|mutation)_/, '')}(${variableDefs}) ${selectionSet}`;

        const res = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            query: gql,
            variables: input,
          }),
        });

        if (!res.ok) {
          const durationMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime);
          void auditEnterprise(
            'tool.external_action',
            context.userId,
            { operation: op.name, durationMs, status: res.status },
            {
              orgId: context.orgContext?.orgId,
              actorId: context.userId,
              eventType: 'tool.external_action',
              harness: op.name,
              decision: 'DENY',
              traceId: context.sessionId,
              payload: { operation: op.name, durationMs, status: res.status, error: `${res.status} ${res.statusText}` },
            }
          );
          throw new Error(`GraphQL request failed: ${res.status} ${res.statusText}`);
        }

        const json = await res.json();
        if (json.errors?.length) {
          const durationMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime);
          void auditEnterprise(
            'tool.external_action',
            context.userId,
            { operation: op.name, durationMs, status: 'graphql_errors', errors: json.errors },
            {
              orgId: context.orgContext?.orgId,
              actorId: context.userId,
              eventType: 'tool.external_action',
              harness: op.name,
              decision: 'DENY',
              traceId: context.sessionId,
              payload: { operation: op.name, durationMs, status: 'graphql_errors', errors: json.errors },
            }
          );
          throw new Error(`GraphQL errors: ${json.errors.map((e: any) => e.message).join(', ')}`);
        }

        const durationMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime);
        void auditEnterprise(
          'tool.external_action',
          context.userId,
          { operation: op.name, durationMs, status: res.status },
          {
            orgId: context.orgContext?.orgId,
            actorId: context.userId,
            eventType: 'tool.external_action',
            harness: op.name,
            decision: 'ALLOW',
            traceId: context.sessionId,
            payload: { operation: op.name, durationMs, status: res.status },
          }
        );

        return json.data ?? json;
      },
    });
  }

  return tools;
}
