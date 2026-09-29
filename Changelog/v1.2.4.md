# Changelog v1.2.4

### Fixes

- Restored inline screenshots and image attachments in newly created and synced GitHub issues using durable repository URLs with `?raw=1`. Other attachments remain clickable links.

### Maintenance

- Updated `bun run repair-github-links` to restore inline images from both temporary download URLs and plain repository links produced by the v1.2.3 repair. The command preserves other issue content, saves local backups, and skips images already using the corrected format.
