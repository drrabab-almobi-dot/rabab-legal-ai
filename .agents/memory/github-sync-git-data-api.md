---
name: Safe GitHub Sync
description: How to preserve remote project files when synchronizing through the connected GitHub account without a local upstream.
---

When the local `main` branch has no configured upstream but GitHub is connected, preserve the remote repository tree and add only the local files changed since the previous backup. Create blobs, build a tree using the current remote tree as `base_tree`, create one commit whose parent is the current remote `main`, then update `refs/heads/main` with `force: false`.

**Why:** A full replacement can erase remote-only backup files or changes made outside the workspace; a non-forced fast-forward update stops safely if the remote changes mid-sync.

**How to apply:** Confirm the target repository, identify the local delta, stage binary and text files as blobs, and verify that the final `main` ref points to the new commit with the expected changed-file list.