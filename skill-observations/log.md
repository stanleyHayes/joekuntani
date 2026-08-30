# Skill Observation Log

Observations captured during task-oriented work.

**Status key:** OPEN = not yet actioned | ACTIONED (YYYY-MM-DD) = skill updated/created | DECLINED (YYYY-MM-DD) = user decided not to pursue — resolved statuses always carry their resolution date

---

## 2026-08-30

### Observation 1: Source-based portfolio imports need completeness gates

**Status:** OPEN
**Date:** 2026-08-30
**Session context:** Post-delivery review of portfolio records created from multi-page source designs.
**Skill:** New skill candidate: source-to-portfolio publishing
**Type:** open-source
**Phase/Area:** Acceptance criteria and publication verification

**Issue:** A multi-page visual source was reduced to a short prose summary and one representative image, yet the task was treated as complete. Route availability proved publication, but did not prove faithful visual or editorial coverage of the source.

**Suggested improvement:** Require an explicit source inventory, page-to-gallery image mapping, content coverage matrix, minimum narrative depth, rendered gallery verification, and a user-visible disclosure whenever source assets cannot be uploaded before a source-derived portfolio item may be marked complete.

**Principle:** Completion for source-derived publishing must verify fidelity and coverage, not merely that the destination record exists and loads.

### Observation 2: Narrative media must follow the story structure

**Status:** OPEN
**Date:** 2026-08-30
**Session context:** Correcting a source-based portfolio import after a complete image gallery still felt visually disconnected from the long-form story.
**Skill:** design-taste-frontend
**Type:** open-source
**Phase/Area:** Portfolio content architecture and verification

**Issue:** A technically complete gallery can still be the wrong presentation when images illustrate distinct chapters. Separating all media from one long narrative forces readers to mentally reconstruct the relationship between each image and the source material.

**Suggested improvement:** Add a source-to-section mapping gate for editorial portfolio work. When source pages contain distinct topics, create ordered text-and-image blocks, verify every image is paired with its relevant chapter, and test the composed sequence at desktop and mobile widths.

**Principle:** Completeness is structural as well as numerical; media should appear where it carries meaning in the narrative.

### Observation 3: Provider retirement should preserve old playback

**Status:** OPEN
**Date:** 2026-08-30
**Session context:** Replacing paid video ingestion with social-link aggregation while an existing hosted library remains published.
**Skill:** design-taste-frontend
**Type:** open-source
**Phase/Area:** Migration architecture and interface copy

**Issue:** Replacing a media provider is both a data migration and a product-language change. Removing the old playback path would break published work, while leaving upload-oriented controls and copy would imply a cost-bearing workflow that is no longer intended.

**Suggested improvement:** Treat provider changes as additive migrations: preserve read/playback compatibility for existing records, route new writes through the replacement model, and audit admin actions, empty states, public labels, schemas, and tests for provider-specific assumptions.

**Principle:** Retire the write path first; preserve the read path until legacy content has been deliberately migrated.
