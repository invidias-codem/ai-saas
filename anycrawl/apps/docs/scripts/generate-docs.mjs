import { generateFiles } from 'fumadocs-openapi';
import { rimraf } from 'rimraf';

// Clean previous generated docs
await rimraf('./content/docs/openapi/(generated)');
await rimraf('./content/docs/openapi-template/(generated)');

// Default API docs (non-template schema)
void generateFiles({
    input: ['./openapi.json'],
    output: './content/docs/openapi/(generated)',
    per: 'tag',
    includeDescription: true,
});

// Template-mode API docs
void generateFiles({
    input: ['./openapi.template.json'],
    output: './content/docs/openapi-template/(generated)',
    per: 'tag',
    includeDescription: true,
});
