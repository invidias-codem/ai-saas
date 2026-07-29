import next from 'eslint-config-next';

/** @type {import('eslint').Linter.Config[]} */
const config = [
  ...next,
  {
    ignores: ['anycrawl/**', 'legacy*', 'legacy/**']
  }
];

export default config;
