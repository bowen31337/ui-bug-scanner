# GitHub Pages Setup

GitHub Pages has been configured to automatically deploy documentation when changes are pushed to the `main` branch.

## Automatic Deployment

The `.github/workflows/pages.yml` workflow will:
1. Build a documentation site from markdown files
2. Deploy to GitHub Pages automatically
3. Update on every push to `main` branch

## Manual Setup (if needed)

If GitHub Pages is not automatically enabled, you can enable it manually:

1. Go to repository Settings → Pages
2. Under "Source", select "GitHub Actions"
3. The workflow will automatically deploy on the next push

## Accessing the Site

Once deployed, your documentation will be available at:
- `https://bowen31337.github.io/ui-bug-scanner/`

## Release Workflow

The `.github/workflows/release.yml` workflow will:
1. Create a GitHub Release when a tag is pushed (e.g., `v1.0.0`)
2. Build release archives (tar.gz and zip)
3. Upload artifacts to the release

To create a release:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Or use the GitHub CLI:

```bash
gh release create v1.0.0 --title "Release v1.0.0" --notes "Initial release"
```
