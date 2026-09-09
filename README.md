# Aleron canonical documents

Generated public GitHub Pages bundle for travel-safe access.

Source of truth: the `yimjason01-blip/aleron-md-workspace` repository, recorded as
`source_repository` in `canonical-manifest.json`.
Source revision: `8945541dbc8349cbbed9d0e35534e489ccb8c0c7`.

`canonical-manifest.json` records the revision the *generated* content came from.
It is not bumped by the `al-*` proposal branches described below, so the design
system in `product-design-system/` can be newer than the revision named there —
read `product-design-system/manifest.json` for the design system's own version.
Direct edits to this generated repository are drift and will be replaced.
Rebuilt from the source workspace with `python3 scripts/deploy-canonical-documents.py --deploy`.
That script lives in the source repository, not here, so the rebuild cannot be run
from a clone of this one.

Which documents are current, and which versions they superseded, is indexed in
[VERSIONING.md](VERSIONING.md). Check it before trusting a version number written
anywhere else.

## In-flight canonical proposals

This fork additionally carries proposed design-system changes on `al-*` branches,
authored here because the source workspace is not available to every contributor.
Those branches are not drift: they are the reviewable form of a change destined
for the source repository, and each names its Jira ticket in the commit trailer.
Once upstreamed and redeployed, the generated bundle supersedes them.
