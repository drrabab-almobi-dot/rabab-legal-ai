# Project transfer backup

This directory preserves files that could not be written to active GitHub Actions paths by the current GitHub connection.

- rabab-legal-ai-source-transfer.zip is the source transfer archive.
- github-workflows/ci.yml and github-workflows/claude.yml are workflow backups.

To activate the workflows, move the two YAML files to .github/workflows/ in a commit made through GitHub with the required workflow permission.
