#!/bin/bash

# Setup script for Git hooks
# Run this to install pre-commit hooks

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
GIT_HOOKS_DIR="$PROJECT_ROOT/.git/hooks"

echo "🔧 Setting up Git hooks..."

# Create hooks directory if it doesn't exist
mkdir -p "$GIT_HOOKS_DIR"

# Copy pre-commit hook
if [ -f "$SCRIPT_DIR/pre-commit-hook.sh" ]; then
    cp "$SCRIPT_DIR/pre-commit-hook.sh" "$GIT_HOOKS_DIR/pre-commit"
    chmod +x "$GIT_HOOKS_DIR/pre-commit"
    echo "✅ Pre-commit hook installed"
else
    echo "❌ pre-commit-hook.sh not found"
    exit 1
fi

# Create commit-msg hook for conventional commits
cat << 'EOF' > "$GIT_HOOKS_DIR/commit-msg"
#!/bin/bash

# Enforce conventional commit format
commit_msg=$(cat "$1")
pattern="^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?: .{1,100}"

if ! echo "$commit_msg" | grep -qE "$pattern"; then
    echo "❌ Invalid commit message format"
    echo ""
    echo "Commit message must follow conventional commits:"
    echo "  type(scope?): description"
    echo ""
    echo "Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert"
    echo ""
    echo "Examples:"
    echo "  feat: add user authentication"
    echo "  fix(api): resolve rate limiting issue"
    echo "  docs: update API documentation"
    exit 1
fi
EOF

chmod +x "$GIT_HOOKS_DIR/commit-msg"
echo "✅ Commit message hook installed"

echo ""
echo "🎉 Git hooks setup complete!"
echo ""
echo "Hooks installed:"
echo "  - pre-commit: Runs security tests before commit"
echo "  - commit-msg: Enforces conventional commit format"
echo ""
echo "To bypass hooks (not recommended):"
echo "  git commit --no-verify"
