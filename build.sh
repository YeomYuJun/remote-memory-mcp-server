#!/bin/bash

echo "Building Remote Memory MCP Server..."
npm run build

if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
    echo "📁 Built files are in dist/ directory"
    echo ""
    echo "🚀 Next steps:"
    echo "1. Update your Claude Desktop config with GitHub credentials"
    echo "2. Restart Claude Desktop"
    echo "3. Test with: 'create backup with name test-backup'"
    echo ""
    echo "📝 New features added:"
    echo "- Custom commit messages"
    echo "- Semantic commit messages for each operation"
    echo "- Backup creation functionality"
    echo "- Commit history viewing"
    echo "- Better error handling"
else
    echo "❌ Build failed!"
    exit 1
fi