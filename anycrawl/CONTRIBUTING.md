# Contributing to AnyCrawl

Thank you for your interest in contributing to AnyCrawl! This document provides guidelines and instructions for contributing to the project.

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct. Please read it before contributing.

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in the Issues section
2. If not, create a new issue with:
    - Clear and descriptive title
    - Steps to reproduce
    - Expected behavior
    - Actual behavior
    - Environment details (OS, Node.js version, etc.)
    - Screenshots if applicable

### Suggesting Features

1. Check if the feature has already been suggested
2. Create a new issue with:
    - Clear and descriptive title
    - Detailed description of the feature
    - Use cases and benefits
    - Any implementation ideas you have

### Pull Requests

1. Fork the repository
2. Create a new branch for your feature/fix
3. Make your changes
4. Write/update tests
5. Update documentation
6. Submit a pull request

### Development Setup

1. Clone the repository:

```bash
git clone https://github.com/any4ai/anycrawl.git
cd anycrawl
```

2. Install dependencies:

```bash
pnpm install
```

````

### Code Style

- Follow the existing code style
- Use TypeScript for all new code
- Write meaningful commit messages
- Keep functions small and focused
- Add comments for complex logic
- Use meaningful variable names

### Testing

- Write tests for new features
- Update tests for bug fixes
- Ensure all tests pass before submitting PR
- Maintain or improve test coverage

```bash
# Run tests
pnpm test
````

### Documentation

- Update README.md if needed
- Add JSDoc comments for new functions
- Update API documentation
- Add examples for new features

### Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

Types:

- feat: New feature
- fix: Bug fix
- docs: Documentation changes
- style: Code style changes
- refactor: Code refactoring
- test: Adding/updating tests
- chore: Maintenance tasks

### Pull Request Process

1. Update documentation
2. Add tests for new functionality
3. Ensure all tests pass
4. Update the CHANGELOG.md
5. Request review from maintainers
6. Address review comments
7. Wait for approval and merge

### Review Process

- All PRs require at least one review
- Maintainers will review within 48 hours
- Address all review comments
- Keep PRs focused and small
- Rebase on main if needed

### Release Process

1. Version bump
2. Update CHANGELOG.md
3. Create release tag
4. Publish to npm
5. Update documentation

## Getting Help

- Check existing issues and discussions
- Join our community chat
- Contact maintainers

## License

By contributing to AnyCrawl, you agree that your contributions will be licensed under the project's MIT License.
