import { buildZodSchemaForOperation } from '@/lib/agents/tools/apiIntrospector';

const MOCK_TYPE_MAP = new Map<string, any>([
  ['Query', {
    kind: 'OBJECT',
    name: 'Query',
    fields: [
      {
        name: 'shop',
        description: 'Get shop info',
        type: { kind: 'OBJECT', name: 'Shop', ofType: undefined },
        args: []
      }
    ]
  }],
  ['Mutation', {
    kind: 'OBJECT',
    name: 'Mutation',
    fields: [
      {
        name: 'checkoutCreate',
        description: 'Create a checkout',
        type: { kind: 'OBJECT', name: 'Checkout', ofType: undefined },
        args: [
          {
            name: 'input',
            description: 'Checkout input',
            type: {
              kind: 'INPUT_OBJECT',
              name: 'CheckoutCreateInput',
              ofType: undefined
            },
            defaultValue: null
          }
        ]
      }
    ]
  }],
  ['CheckoutCreateInput', {
    kind: 'INPUT_OBJECT',
    name: 'CheckoutCreateInput',
    inputFields: [
      {
        name: 'email',
        description: 'Contact email',
        type: { kind: 'SCALAR', name: 'String', ofType: undefined },
        defaultValue: null
      },
      {
        name: 'lineItems',
        description: 'Line items',
        type: {
          kind: 'LIST',
          name: undefined,
          ofType: {
            kind: 'INPUT_OBJECT',
            name: 'CheckoutLineItemInput',
            ofType: undefined
          }
        },
        defaultValue: null
      },
      {
        name: 'allowPartialAddresses',
        description: 'Allow partial addresses',
        type: { kind: 'SCALAR', name: 'Boolean', ofType: undefined },
        defaultValue: null
      }
    ]
  }],
  ['CheckoutLineItemInput', {
    kind: 'INPUT_OBJECT',
    name: 'CheckoutLineItemInput',
    inputFields: [
      {
        name: 'variantId',
        description: 'Product variant ID',
        type: { kind: 'NON_NULL', name: 'ID', ofType: { kind: 'SCALAR', name: 'ID', ofType: undefined } },
        defaultValue: null
      },
      {
        name: 'quantity',
        description: 'Quantity',
        type: { kind: 'NON_NULL', name: 'Int', ofType: { kind: 'SCALAR', name: 'Int', ofType: undefined } },
        defaultValue: null
      }
    ]
  }],
  ['Checkout', { kind: 'OBJECT', name: 'Checkout', fields: [] }],
  ['Shop', { kind: 'OBJECT', name: 'Shop', fields: [] }],
  ['String', { kind: 'SCALAR', name: 'String' }],
  ['Boolean', { kind: 'SCALAR', name: 'Boolean' }],
  ['ID', { kind: 'SCALAR', name: 'ID' }],
  ['Int', { kind: 'SCALAR', name: 'Int' }]
]);

describe('GraphQL API Introspector', () => {
  test('extracts operations from mocked introspection', () => {
    const { extractOperationsFromIntrospection } = require('@/lib/agents/tools/apiIntrospector');
    const ops = extractOperationsFromIntrospection(MOCK_TYPE_MAP);
    const names = ops.map((o: any) => o.name);
    expect(names).toContain('gql_query_shop');
    expect(names).toContain('gql_mutation_checkoutCreate');
  });

  test('generates valid Zod schemas from operation input fields', () => {
    const { extractOperationsFromIntrospection, buildZodSchemaForOperation } = require('@/lib/agents/tools/apiIntrospector');
    const ops = extractOperationsFromIntrospection(MOCK_TYPE_MAP);
    const checkoutOp = ops.find((o: any) => o.name === 'gql_mutation_checkoutCreate');
    expect(checkoutOp).toBeDefined();

    const schema = buildZodSchemaForOperation(checkoutOp!, MOCK_TYPE_MAP);
    expect(() => schema.parse({
      input: {
        email: 'test@example.com',
        lineItems: [{ variantId: 'gid://shopify/ProductVariant/1', quantity: 2 }],
        allowPartialAddresses: true
      }
    })).not.toThrow();
  });

  test('introspectGraphQLTools respects auth headers and returns tools', async () => {
    const { introspectGraphQLTools } = await import('@/lib/agents/tools/apiIntrospector');
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const headers = (init as RequestInit)?.headers as Record<string, string> | undefined;
      expect(headers?.['X-Shopify-Storefront-Access-Token']).toBe('test-token');
      return new Response(
        JSON.stringify({
          data: {
            __schema: {
              types: Array.from(MOCK_TYPE_MAP.values())
            }
          }
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    try {
      const tools = await introspectGraphQLTools('https://example.com/graphql', {
        authHeaderName: 'X-Shopify-Storefront-Access-Token',
        authHeaderValue: 'test-token'
      });

      const names = tools.map(t => t.name);
      expect(names).toContain('gql_mutation_checkoutCreate');
      expect(names).toContain('gql_query_shop');

      const checkoutTool = tools.find(t => t.name === 'gql_mutation_checkoutCreate');
      expect(checkoutTool?.risk).toBe('mutative');
      expect(checkoutTool?.requiresApproval).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
