# Logical data model (draft)

This is conceptual; do not treat it as finalized migrations.

| Entity | Important fields |
| --- | --- |
| users | id, display_name, disabled_at |
| invitations | user_id, token_hash, expires_at, consumed_at, created_by |
| sessions | user_id, token_hash, expires_at, revoked_at |
| campaigns | id, owner_user_id, foundry_world_title, display_title_override, system_id |
| campaign_members | campaign_id, user_id, role |
| foundry_integrations | id (UUID), campaign_id, local_world_id, credential_reference, sync_status |
| catalog_revisions | campaign_id, revision_id, versions, settings_hash, checksum, active_at |
| catalog_packs | revision_id, collection_key, package_id, metadata |
| catalog_items | revision_id, compendium_uuid, item_type, level, normalized_data, source_reference |
| characters | id, campaign_id, owner_user_id, name, linked_actor_uuid_nullable |
| actor_snapshots | character_id, imported_at, foundry_actor_version, actor_data |
| character_creations | character_id, creation_version, creation_data |
| character_plans | character_id, catalog_revision_id, plan_version, levels_data, status |
| plan_history | plan_id, author_user_id, saved_at, data |
| spell_loadouts | character_id, entry_key, name, prepared_spells |
| planned_equipment | character_id, item_uuid, target_character_level, quantity, configuration, wishlist_link |
| equipment_configurations | character_id, base_item_uuid, rune_uuids, intended_level |
| wishlist_entries | character_id, item_uuid_nullable, name_fallback, item_level, price, quantity, target_level_nullable, priority, status, notes |

## Invariants

- Owned equipment and live spell preparation come from actor snapshots; planned selections and wishlists **never mutate** live Foundry actor data by themselves.
- Item level and target character level are not the same field. Desired level must be nullable; standard playable target range is 1–20.
- Every character, catalog query and wishlist update is authorized against campaign membership server-side.
- One active complete catalog revision per campaign; interrupted upload cannot overwrite a complete revision.
- Store minimal fallback labels for missing compendium items and flag unresolved references.
- Treat personal browser sessions and Foundry pairing credentials as revocable separately.
