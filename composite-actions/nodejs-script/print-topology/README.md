## Hiiretail Item Identifier streaming
This is an application for processing Item identifier entities.

General service description can be found [here](https://github.com/extenda/enterprise-pnp-common/blob/master/docs/services/additional-item-id.md#additional-item-id-stream-processing-service).
### Kafka Stream Topology
```mermaid
graph TD
pnp.private.input.item-identifiers.v4[pnp.private.input.item-identifiers.v4] --> KSTREAM-SOURCE-0000000000
repartition-based-on-bu-or-bug-key-of-item-identifier-repartition[repartition-based-on-bu-or-bug-key-of-item-identifier-repartition] --> repartition-based-on-bu-or-bug-key-of-item-identifier-repartition-source
repartition-to-move-command-to-buGroup-partition-repartition[repartition-to-move-command-to-buGroup-partition-repartition] --> repartition-to-move-command-to-buGroup-partition-repartition-source
retrieve-buG-item-definition(retrieve-<br>buG-<br>item-<br>definition) --> item-identifier-store[(item-<br>identifier-<br>store)]
apply-patch-or-forward-exceptions-to-dlq(apply-<br>patch-<br>or-<br>forward-<br>exceptions-<br>to-<br>dlq) --> item-identifier-store[(item-<br>identifier-<br>store)]
repartition-based-on-original-key-after-gtin-duplication-check-repartition[repartition-based-on-original-key-after-gtin-duplication-check-repartition] --> repartition-based-on-original-key-after-gtin-duplication-check-repartition-source
enrich-delete-records-with-data-from-state-store(enrich-<br>delete-<br>records-<br>with-<br>data-<br>from-<br>state-<br>store) --> item-identifier-store[(item-<br>identifier-<br>store)]
repartition-based-on-original-key-after-primary-state-update-repartition[repartition-based-on-original-key-after-primary-state-update-repartition] --> repartition-based-on-original-key-after-primary-state-update-repartition-source
apply-item-identifier-is-primary-state-update(apply-<br>item-<br>identifier-<br>is-<br>primary-<br>state-<br>update) --> item-identifier-store[(item-<br>identifier-<br>store)]
repartition-based-on-original-key-after-delete-in-item-id-collection-repartition[repartition-based-on-original-key-after-delete-in-item-id-collection-repartition] --> repartition-based-on-original-key-after-delete-in-item-id-collection-repartition-source
store-entity-state(store-<br>entity-<br>state) --> item-identifier-store[(item-<br>identifier-<br>store)]
KSTREAM-SINK-0000000143(KSTREAM-<br>SINK-<br>0000000143) --> pnp.public.output.item-identifiers.v2[pnp.public.output.item-identifiers.v2]
KSTREAM-SINK-0000000144(KSTREAM-<br>SINK-<br>0000000144) --> pnp.public.output.change-detection.v2[pnp.public.output.change-detection.v2]
repartition-based-on-item-id-for-primary-state-update-repartition-sink(repartition-<br>based-<br>on-<br>item-<br>id-<br>for-<br>primary-<br>state-<br>update-<br>repartition-<br>sink) --> repartition-based-on-item-id-for-primary-state-update-repartition[repartition-based-on-item-id-for-primary-state-update-repartition]
repartition-based-on-item-id-key-for-delete-in-item-id-collection-repartition-sink(repartition-<br>based-<br>on-<br>item-<br>id-<br>key-<br>for-<br>delete-<br>in-<br>item-<br>id-<br>collection-<br>repartition-<br>sink) --> repartition-based-on-item-id-key-for-delete-in-item-id-collection-repartition[repartition-based-on-item-id-key-for-delete-in-item-id-collection-repartition]
repartition-based-on-item-id-value-for-gtin-duplication-check-repartition-sink(repartition-<br>based-<br>on-<br>item-<br>id-<br>value-<br>for-<br>gtin-<br>duplication-<br>check-<br>repartition-<br>sink) --> repartition-based-on-item-id-value-for-gtin-duplication-check-repartition[repartition-based-on-item-id-value-for-gtin-duplication-check-repartition]
repartition-to-move-command-based-on-item-id-key-repartition-sink(repartition-<br>to-<br>move-<br>command-<br>based-<br>on-<br>item-<br>id-<br>key-<br>repartition-<br>sink) --> repartition-to-move-command-based-on-item-id-key-repartition[repartition-to-move-command-based-on-item-id-key-repartition]
repartition-to-move-command-to-buGroup-partition-repartition-sink(repartition-<br>to-<br>move-<br>command-<br>to-<br>buGroup-<br>partition-<br>repartition-<br>sink) --> repartition-to-move-command-to-buGroup-partition-repartition[repartition-to-move-command-to-buGroup-partition-repartition]
pnp.private.input.business-units.v1[pnp.private.input.business-units.v1] --> KSTREAM-SOURCE-0000000002
KTABLE-SOURCE-0000000003(KTABLE-<br>SOURCE-<br>0000000003) --> pnp.private.input.business-units.v1-STATE-STORE-0000000001[(pnp.private.input.business-<br>units.v1-<br>STATE-<br>STORE-<br>0000000001)]
repartition-to-move-command-based-on-item-id-key-repartition[repartition-to-move-command-based-on-item-id-key-repartition] --> repartition-to-move-command-based-on-item-id-key-repartition-source
repartition-based-on-item-id-for-primary-state-update-repartition[repartition-based-on-item-id-for-primary-state-update-repartition] --> repartition-based-on-item-id-for-primary-state-update-repartition-source
generate-item-identifier-delete-records-data(generate-<br>item-<br>identifier-<br>delete-<br>records-<br>data) --> item-ids-collection-store[(item-<br>ids-<br>collection-<br>store)]
generate-item-identifier-is-primary-state-update(generate-<br>item-<br>identifier-<br>is-<br>primary-<br>state-<br>update) --> item-ids-collection-store[(item-<br>ids-<br>collection-<br>store)]
repartition-based-on-item-id-key-for-delete-in-item-id-collection-repartition[repartition-based-on-item-id-key-for-delete-in-item-id-collection-repartition] --> repartition-based-on-item-id-key-for-delete-in-item-id-collection-repartition-source
delete-item-identifier-from-item-ids-collection-state-store(delete-<br>item-<br>identifier-<br>from-<br>item-<br>ids-<br>collection-<br>state-<br>store) --> item-ids-collection-store[(item-<br>ids-<br>collection-<br>store)]
repartition-based-on-bu-or-bug-key-of-item-identifier-repartition-sink(repartition-<br>based-<br>on-<br>bu-<br>or-<br>bug-<br>key-<br>of-<br>item-<br>identifier-<br>repartition-<br>sink) --> repartition-based-on-bu-or-bug-key-of-item-identifier-repartition[repartition-based-on-bu-or-bug-key-of-item-identifier-repartition]
repartition-based-on-original-key-after-delete-in-item-id-collection-repartition-sink(repartition-<br>based-<br>on-<br>original-<br>key-<br>after-<br>delete-<br>in-<br>item-<br>id-<br>collection-<br>repartition-<br>sink) --> repartition-based-on-original-key-after-delete-in-item-id-collection-repartition[repartition-based-on-original-key-after-delete-in-item-id-collection-repartition]
repartition-based-on-original-key-after-primary-state-update-repartition-sink(repartition-<br>based-<br>on-<br>original-<br>key-<br>after-<br>primary-<br>state-<br>update-<br>repartition-<br>sink) --> repartition-based-on-original-key-after-primary-state-update-repartition[repartition-based-on-original-key-after-primary-state-update-repartition]
repartition-based-on-item-id-value-for-gtin-duplication-check-repartition[repartition-based-on-item-id-value-for-gtin-duplication-check-repartition] --> repartition-based-on-item-id-value-for-gtin-duplication-check-repartition-source
check-item-identifiers-on-duplication(check-<br>item-<br>identifiers-<br>on-<br>duplication) --> item-identifier-values-store[(item-<br>identifier-<br>values-<br>store)]
repartition-based-on-original-key-after-gtin-duplication-check-repartition-sink(repartition-<br>based-<br>on-<br>original-<br>key-<br>after-<br>gtin-<br>duplication-<br>check-<br>repartition-<br>sink) --> repartition-based-on-original-key-after-gtin-duplication-check-repartition[repartition-based-on-original-key-after-gtin-duplication-check-repartition]
save-to-value-state-store-value(save-<br>to-<br>value-<br>state-<br>store-<br>value) --> item-identifier-values-store[(item-<br>identifier-<br>values-<br>store)]
subgraph Sub-Topology: 0
KSTREAM-SOURCE-0000000000(KSTREAM-<br>SOURCE-<br>0000000000) --> report-input-to-data-flow-observability(report-<br>input-<br>to-<br>data-<br>flow-<br>observability)
report-input-to-data-flow-observability(report-<br>input-<br>to-<br>data-<br>flow-<br>observability) --> operation-type-(operation-<br>type-<br>)
operation-type-(operation-<br>type-<br>) --> operation-type-command(operation-<br>type-<br>command)
operation-type-(operation-<br>type-<br>) --> operation-type-crud(operation-<br>type-<br>crud)
repartition-based-on-bu-or-bug-key-of-item-identifier-repartition-source(repartition-<br>based-<br>on-<br>bu-<br>or-<br>bug-<br>key-<br>of-<br>item-<br>identifier-<br>repartition-<br>source) --> set-headers-to-command-generated-item-identifier-operation(set-<br>headers-<br>to-<br>command-<br>generated-<br>item-<br>identifier-<br>operation)
set-headers-to-command-generated-item-identifier-operation(set-<br>headers-<br>to-<br>command-<br>generated-<br>item-<br>identifier-<br>operation) --> set-crud-op-header-to-command-generated-item-identifier-operation(set-<br>crud-<br>op-<br>header-<br>to-<br>command-<br>generated-<br>item-<br>identifier-<br>operation)
set-crud-op-header-to-command-generated-item-identifier-operation(set-<br>crud-<br>op-<br>header-<br>to-<br>command-<br>generated-<br>item-<br>identifier-<br>operation) --> create-item-identifier-delete-operation-for-update-item-identifier-command(create-<br>item-<br>identifier-<br>delete-<br>operation-<br>for-<br>update-<br>item-<br>identifier-<br>command)
create-item-identifier-delete-operation-for-update-item-identifier-command(create-<br>item-<br>identifier-<br>delete-<br>operation-<br>for-<br>update-<br>item-<br>identifier-<br>command) --> merge-item-identifier-operations-by-update-item-identifiers-for-item-id-command(merge-<br>item-<br>identifier-<br>operations-<br>by-<br>update-<br>item-<br>identifiers-<br>for-<br>item-<br>id-<br>command)
operation-type-crud(operation-<br>type-<br>crud) --> merge-item-identifier-operations-by-update-item-identifiers-for-item-id-command(merge-<br>item-<br>identifier-<br>operations-<br>by-<br>update-<br>item-<br>identifiers-<br>for-<br>item-<br>id-<br>command)
merge-item-identifier-operations-by-update-item-identifiers-for-item-id-command(merge-<br>item-<br>identifier-<br>operations-<br>by-<br>update-<br>item-<br>identifiers-<br>for-<br>item-<br>id-<br>command) --> is-bu-group-from-header(is-<br>bu-<br>group-<br>from-<br>header)
is-bu-group-from-header(is-<br>bu-<br>group-<br>from-<br>header) --> is-bu-group-(is-<br>bu-<br>group-<br>)
is-bu-group-(is-<br>bu-<br>group-<br>) --> is-bu-group-false(is-<br>bu-<br>group-<br>false)
is-bu-group-(is-<br>bu-<br>group-<br>) --> is-bu-group-true(is-<br>bu-<br>group-<br>true)
is-bu-group-true(is-<br>bu-<br>group-<br>true) --> map-bu-group-pair-to-item-identifier(map-<br>bu-<br>group-<br>pair-<br>to-<br>item-<br>identifier)
map-bu-group-pair-to-item-identifier(map-<br>bu-<br>group-<br>pair-<br>to-<br>item-<br>identifier) --> bu-group-operation-(bu-<br>group-<br>operation-<br>)
bu-group-operation-(bu-<br>group-<br>operation-<br>) --> bu-group-operation-delete(bu-<br>group-<br>operation-<br>delete)
bu-group-operation-(bu-<br>group-<br>operation-<br>) --> bu-group-operation-patch(bu-<br>group-<br>operation-<br>patch)
bu-group-operation-(bu-<br>group-<br>operation-<br>) --> bu-group-operation-upsert(bu-<br>group-<br>operation-<br>upsert)
is-bu-group-false(is-<br>bu-<br>group-<br>false) --> map-bu-pair-to-item-identifier(map-<br>bu-<br>pair-<br>to-<br>item-<br>identifier)
map-bu-pair-to-item-identifier(map-<br>bu-<br>pair-<br>to-<br>item-<br>identifier) --> bu-operation-(bu-<br>operation-<br>)
bu-operation-(bu-<br>operation-<br>) --> bu-operation-delete(bu-<br>operation-<br>delete)
bu-operation-(bu-<br>operation-<br>) --> bu-operation-patch(bu-<br>operation-<br>patch)
bu-operation-(bu-<br>operation-<br>) --> bu-operation-upsert(bu-<br>operation-<br>upsert)
bu-group-operation-delete(bu-<br>group-<br>operation-<br>delete) --> map-null-to-item-identifier-for-bu-group(map-<br>null-<br>to-<br>item-<br>identifier-<br>for-<br>bu-<br>group)
map-null-to-item-identifier-for-bu-group(map-<br>null-<br>to-<br>item-<br>identifier-<br>for-<br>bu-<br>group) --> copy-headers-to-value(copy-<br>headers-<br>to-<br>value)
copy-headers-to-value(copy-<br>headers-<br>to-<br>value) --> KSTREAM-MAPVALUES-0000000050(KSTREAM-<br>MAPVALUES-<br>0000000050)
KSTREAM-MAPVALUES-0000000050(KSTREAM-<br>MAPVALUES-<br>0000000050) --> join-with-BU-hierarchy-delete(join-<br>with-<br>BU-<br>hierarchy-<br>delete)
join-with-BU-hierarchy-delete(join-<br>with-<br>BU-<br>hierarchy-<br>delete) --> KSTREAM-MAPVALUES-0000000052(KSTREAM-<br>MAPVALUES-<br>0000000052)
KSTREAM-MAPVALUES-0000000052(KSTREAM-<br>MAPVALUES-<br>0000000052) --> remove-items-for-child-BUs(remove-<br>items-<br>for-<br>child-<br>BUs)
bu-operation-delete(bu-<br>operation-<br>delete) --> map-null-to-item-identifier-for-bu(map-<br>null-<br>to-<br>item-<br>identifier-<br>for-<br>bu)
remove-items-for-child-BUs(remove-<br>items-<br>for-<br>child-<br>BUs) --> update-BUId-header-for-hard-deleted-child-BUs-records(update-<br>BUId-<br>header-<br>for-<br>hard-<br>deleted-<br>child-<br>BUs-<br>records)
map-null-to-item-identifier-for-bu(map-<br>null-<br>to-<br>item-<br>identifier-<br>for-<br>bu) --> merge-bu-group-delete-with-bu-delete(merge-<br>bu-<br>group-<br>delete-<br>with-<br>bu-<br>delete)
update-BUId-header-for-hard-deleted-child-BUs-records(update-<br>BUId-<br>header-<br>for-<br>hard-<br>deleted-<br>child-<br>BUs-<br>records) --> merge-bu-group-delete-with-bu-delete(merge-<br>bu-<br>group-<br>delete-<br>with-<br>bu-<br>delete)
merge-bu-group-delete-with-bu-delete(merge-<br>bu-<br>group-<br>delete-<br>with-<br>bu-<br>delete) --> merge-deletes(merge-<br>deletes)
merge-bu-group-delete-with-bu-delete(merge-<br>bu-<br>group-<br>delete-<br>with-<br>bu-<br>delete) --> merge-validated-deletes(merge-<br>validated-<br>deletes)
bu-group-operation-patch(bu-<br>group-<br>operation-<br>patch) --> map-to-entity-patch-for-bu-group(map-<br>to-<br>entity-<br>patch-<br>for-<br>bu-<br>group)
map-to-entity-patch-for-bu-group(map-<br>to-<br>entity-<br>patch-<br>for-<br>bu-<br>group) --> KSTREAM-PEEK-0000000058(KSTREAM-<br>PEEK-<br>0000000058)
KSTREAM-PEEK-0000000058(KSTREAM-<br>PEEK-<br>0000000058) --> join-with-BU-hierarchy-patch(join-<br>with-<br>BU-<br>hierarchy-<br>patch)
bu-group-operation-upsert(bu-<br>group-<br>operation-<br>upsert) --> map-to-item-identifier-for-bu-group-upsert(map-<br>to-<br>item-<br>identifier-<br>for-<br>bu-<br>group-<br>upsert)
join-with-BU-hierarchy-patch(join-<br>with-<br>BU-<br>hierarchy-<br>patch) --> KSTREAM-MAPVALUES-0000000060(KSTREAM-<br>MAPVALUES-<br>0000000060)
KSTREAM-MAPVALUES-0000000060(KSTREAM-<br>MAPVALUES-<br>0000000060) --> KSTREAM-FLATMAP-0000000061(KSTREAM-<br>FLATMAP-<br>0000000061)
map-to-item-identifier-for-bu-group-upsert(map-<br>to-<br>item-<br>identifier-<br>for-<br>bu-<br>group-<br>upsert) --> join-with-BU-hierarchy-upsert(join-<br>with-<br>BU-<br>hierarchy-<br>upsert)
KSTREAM-FLATMAP-0000000061(KSTREAM-<br>FLATMAP-<br>0000000061) --> update-BUId-header-for-child-BU-patches(update-<br>BUId-<br>header-<br>for-<br>child-<br>BU-<br>patches)
bu-operation-patch(bu-<br>operation-<br>patch) --> map-to-entity-patch-for-bu(map-<br>to-<br>entity-<br>patch-<br>for-<br>bu)
join-with-BU-hierarchy-upsert(join-<br>with-<br>BU-<br>hierarchy-<br>upsert) --> KSTREAM-MAPVALUES-0000000069(KSTREAM-<br>MAPVALUES-<br>0000000069)
repartition-to-move-command-to-buGroup-partition-repartition-source(repartition-<br>to-<br>move-<br>command-<br>to-<br>buGroup-<br>partition-<br>repartition-<br>source) --> retrieve-buG-item-definition(retrieve-<br>buG-<br>item-<br>definition)
KSTREAM-MAPVALUES-0000000069(KSTREAM-<br>MAPVALUES-<br>0000000069) --> KSTREAM-FLATMAP-0000000070(KSTREAM-<br>FLATMAP-<br>0000000070)
map-to-entity-patch-for-bu(map-<br>to-<br>entity-<br>patch-<br>for-<br>bu) --> merge-bu-group-patch-with-bu-patch(merge-<br>bu-<br>group-<br>patch-<br>with-<br>bu-<br>patch)
retrieve-buG-item-definition(retrieve-<br>buG-<br>item-<br>definition) --> KSTREAM-FILTER-0000000016(KSTREAM-<br>FILTER-<br>0000000016)
update-BUId-header-for-child-BU-patches(update-<br>BUId-<br>header-<br>for-<br>child-<br>BU-<br>patches) --> merge-bu-group-patch-with-bu-patch(merge-<br>bu-<br>group-<br>patch-<br>with-<br>bu-<br>patch)
KSTREAM-FILTER-0000000016(KSTREAM-<br>FILTER-<br>0000000016) --> propagate-source-buG-identifier-for-command-target-bu(propagate-<br>source-<br>buG-<br>identifier-<br>for-<br>command-<br>target-<br>bu)
KSTREAM-FLATMAP-0000000070(KSTREAM-<br>FLATMAP-<br>0000000070) --> update-BUId-header-for-child-BU-records(update-<br>BUId-<br>header-<br>for-<br>child-<br>BU-<br>records)
bu-operation-upsert(bu-<br>operation-<br>upsert) --> map-to-item-identifier-for-bu-upsert(map-<br>to-<br>item-<br>identifier-<br>for-<br>bu-<br>upsert)
merge-bu-group-patch-with-bu-patch(merge-<br>bu-<br>group-<br>patch-<br>with-<br>bu-<br>patch) --> apply-patch-or-forward-exceptions-to-dlq(apply-<br>patch-<br>or-<br>forward-<br>exceptions-<br>to-<br>dlq)
apply-patch-or-forward-exceptions-to-dlq(apply-<br>patch-<br>or-<br>forward-<br>exceptions-<br>to-<br>dlq) --> KSTREAM-FILTER-0000000066(KSTREAM-<br>FILTER-<br>0000000066)
map-to-item-identifier-for-bu-upsert(map-<br>to-<br>item-<br>identifier-<br>for-<br>bu-<br>upsert) --> merge-bu-group-upsert-with-bu-specific-upsert(merge-<br>bu-<br>group-<br>upsert-<br>with-<br>bu-<br>specific-<br>upsert)
propagate-source-buG-identifier-for-command-target-bu(propagate-<br>source-<br>buG-<br>identifier-<br>for-<br>command-<br>target-<br>bu) --> update-BUId-header-for-command-propagated-record(update-<br>BUId-<br>header-<br>for-<br>command-<br>propagated-<br>record)
update-BUId-header-for-child-BU-records(update-<br>BUId-<br>header-<br>for-<br>child-<br>BU-<br>records) --> merge-bu-group-upsert-with-bu-specific-upsert(merge-<br>bu-<br>group-<br>upsert-<br>with-<br>bu-<br>specific-<br>upsert)
KSTREAM-FILTER-0000000066(KSTREAM-<br>FILTER-<br>0000000066) --> merge-patches(merge-<br>patches)
merge-bu-group-upsert-with-bu-specific-upsert(merge-<br>bu-<br>group-<br>upsert-<br>with-<br>bu-<br>specific-<br>upsert) --> merge-patches(merge-<br>patches)
update-BUId-header-for-command-propagated-record(update-<br>BUId-<br>header-<br>for-<br>command-<br>propagated-<br>record) --> set-correlation-header-for-command-propagated-record(set-<br>correlation-<br>header-<br>for-<br>command-<br>propagated-<br>record)
merge-patches(merge-<br>patches) --> merge-deletes(merge-<br>deletes)
set-correlation-header-for-command-propagated-record(set-<br>correlation-<br>header-<br>for-<br>command-<br>propagated-<br>record) --> set-crud-op-header-command-for-propagated-record(set-<br>crud-<br>op-<br>header-<br>command-<br>for-<br>propagated-<br>record)
merge-deletes(merge-<br>deletes) --> merge-command-propagated(merge-<br>command-<br>propagated)
set-crud-op-header-command-for-propagated-record(set-<br>crud-<br>op-<br>header-<br>command-<br>for-<br>propagated-<br>record) --> merge-command-propagated(merge-<br>command-<br>propagated)
merge-command-propagated(merge-<br>command-<br>propagated) --> operation-(operation-<br>)
operation-(operation-<br>) --> operation-non-delete(operation-<br>non-<br>delete)
operation-(operation-<br>) --> operation-delete(operation-<br>delete)
operation-non-delete(operation-<br>non-<br>delete) --> upsert-identifier-type-(upsert-<br>identifier-<br>type-<br>)
upsert-identifier-type-(upsert-<br>identifier-<br>type-<br>) --> upsert-identifier-type-any-GTIN(upsert-<br>identifier-<br>type-<br>any-<br>GTIN)
upsert-identifier-type-(upsert-<br>identifier-<br>type-<br>) --> upsert-identifier-type-non-GTIN(upsert-<br>identifier-<br>type-<br>non-<br>GTIN)
repartition-based-on-original-key-after-gtin-duplication-check-repartition-source(repartition-<br>based-<br>on-<br>original-<br>key-<br>after-<br>gtin-<br>duplication-<br>check-<br>repartition-<br>source) --> merge-non-gtin-upserts(merge-<br>non-<br>gtin-<br>upserts)
upsert-identifier-type-non-GTIN(upsert-<br>identifier-<br>type-<br>non-<br>GTIN) --> merge-non-gtin-upserts(merge-<br>non-<br>gtin-<br>upserts)
merge-non-gtin-upserts(merge-<br>non-<br>gtin-<br>upserts) --> upserts-with-item-id-(upserts-<br>with-<br>item-<br>id-<br>)
upserts-with-item-id-(upserts-<br>with-<br>item-<br>id-<br>) --> upserts-with-item-id-present(upserts-<br>with-<br>item-<br>id-<br>present)
upserts-with-item-id-(upserts-<br>with-<br>item-<br>id-<br>) --> upserts-with-item-id-missing(upserts-<br>with-<br>item-<br>id-<br>missing)
operation-delete(operation-<br>delete) --> enrich-delete-records-with-data-from-state-store(enrich-<br>delete-<br>records-<br>with-<br>data-<br>from-<br>state-<br>store)
enrich-delete-records-with-data-from-state-store(enrich-<br>delete-<br>records-<br>with-<br>data-<br>from-<br>state-<br>store) --> KSTREAM-FILTER-0000000088(KSTREAM-<br>FILTER-<br>0000000088)
repartition-based-on-original-key-after-primary-state-update-repartition-source(repartition-<br>based-<br>on-<br>original-<br>key-<br>after-<br>primary-<br>state-<br>update-<br>repartition-<br>source) --> apply-item-identifier-is-primary-state-update(apply-<br>item-<br>identifier-<br>is-<br>primary-<br>state-<br>update)
KSTREAM-FILTER-0000000088(KSTREAM-<br>FILTER-<br>0000000088) --> KSTREAM-MAPVALUES-0000000089(KSTREAM-<br>MAPVALUES-<br>0000000089)
apply-item-identifier-is-primary-state-update(apply-<br>item-<br>identifier-<br>is-<br>primary-<br>state-<br>update) --> filter-null-records(filter-<br>null-<br>records)
KSTREAM-MAPVALUES-0000000089(KSTREAM-<br>MAPVALUES-<br>0000000089) --> deletes-with-item-id-(deletes-<br>with-<br>item-<br>id-<br>)
filter-null-records(filter-<br>null-<br>records) --> merge-upserts-with-item-id-missing(merge-<br>upserts-<br>with-<br>item-<br>id-<br>missing)
upserts-with-item-id-missing(upserts-<br>with-<br>item-<br>id-<br>missing) --> merge-upserts-with-item-id-missing(merge-<br>upserts-<br>with-<br>item-<br>id-<br>missing)
deletes-with-item-id-(deletes-<br>with-<br>item-<br>id-<br>) --> deletes-with-item-id-present(deletes-<br>with-<br>item-<br>id-<br>present)
deletes-with-item-id-(deletes-<br>with-<br>item-<br>id-<br>) --> deletes-with-item-id-missing(deletes-<br>with-<br>item-<br>id-<br>missing)
merge-upserts-with-item-id-missing(merge-<br>upserts-<br>with-<br>item-<br>id-<br>missing) --> merge-validated-deletes(merge-<br>validated-<br>deletes)
merge-validated-deletes(merge-<br>validated-<br>deletes) --> get-change-detection-flag(get-<br>change-<br>detection-<br>flag)
get-change-detection-flag(get-<br>change-<br>detection-<br>flag) --> route-to-change-detection-(route-<br>to-<br>change-<br>detection-<br>)
operation-type-command(operation-<br>type-<br>command) --> command-(command-<br>)
route-to-change-detection-(route-<br>to-<br>change-<br>detection-<br>) --> route-to-change-detection-false(route-<br>to-<br>change-<br>detection-<br>false)
route-to-change-detection-(route-<br>to-<br>change-<br>detection-<br>) --> route-to-change-detection-true(route-<br>to-<br>change-<br>detection-<br>true)
command-(command-<br>) --> command-update-item-identifiers-for-item-id(command-<br>update-<br>item-<br>identifiers-<br>for-<br>item-<br>id)
command-(command-<br>) --> command-propagate-buG-entity-to-bu(command-<br>propagate-<br>buG-<br>entity-<br>to-<br>bu)
upsert-identifier-type-any-GTIN(upsert-<br>identifier-<br>type-<br>any-<br>GTIN) --> adjust-item-identifier-values(adjust-<br>item-<br>identifier-<br>values)
adjust-item-identifier-values(adjust-<br>item-<br>identifier-<br>values) --> validate-GTIN-item-identifiers-by-value(validate-<br>GTIN-<br>item-<br>identifiers-<br>by-<br>value)
deletes-with-item-id-missing(deletes-<br>with-<br>item-<br>id-<br>missing) --> KSTREAM-MERGE-0000000099(KSTREAM-<br>MERGE-<br>0000000099)
repartition-based-on-original-key-after-delete-in-item-id-collection-repartition-source(repartition-<br>based-<br>on-<br>original-<br>key-<br>after-<br>delete-<br>in-<br>item-<br>id-<br>collection-<br>repartition-<br>source) --> KSTREAM-MERGE-0000000099(KSTREAM-<br>MERGE-<br>0000000099)
KSTREAM-MERGE-0000000099(KSTREAM-<br>MERGE-<br>0000000099) --> filter-non-gtins-deletes(filter-<br>non-<br>gtins-<br>deletes)
validate-GTIN-item-identifiers-by-value(validate-<br>GTIN-<br>item-<br>identifiers-<br>by-<br>value) --> filter-invalid-gtins-upserts(filter-<br>invalid-<br>gtins-<br>upserts)
filter-invalid-gtins-upserts(filter-<br>invalid-<br>gtins-<br>upserts) --> KSTREAM-MAPVALUES-0000000086(KSTREAM-<br>MAPVALUES-<br>0000000086)
filter-non-gtins-deletes(filter-<br>non-<br>gtins-<br>deletes) --> KSTREAM-TRANSFORM-0000000102(KSTREAM-<br>TRANSFORM-<br>0000000102)
KSTREAM-MAPVALUES-0000000086(KSTREAM-<br>MAPVALUES-<br>0000000086) --> KSTREAM-TRANSFORM-0000000101(KSTREAM-<br>TRANSFORM-<br>0000000101)
KSTREAM-TRANSFORM-0000000102(KSTREAM-<br>TRANSFORM-<br>0000000102) --> change-item-identifier-values-back-to-null-for-delete-operation(change-<br>item-<br>identifier-<br>values-<br>back-<br>to-<br>null-<br>for-<br>delete-<br>operation)
route-to-change-detection-false(route-<br>to-<br>change-<br>detection-<br>false) --> map-change-detection-entity-and-false-pair-to-entity(map-<br>change-<br>detection-<br>entity-<br>and-<br>false-<br>pair-<br>to-<br>entity)
KSTREAM-TRANSFORM-0000000101(KSTREAM-<br>TRANSFORM-<br>0000000101) --> KSTREAM-MERGE-0000000104(KSTREAM-<br>MERGE-<br>0000000104)
change-item-identifier-values-back-to-null-for-delete-operation(change-<br>item-<br>identifier-<br>values-<br>back-<br>to-<br>null-<br>for-<br>delete-<br>operation) --> KSTREAM-MERGE-0000000104(KSTREAM-<br>MERGE-<br>0000000104)
command-propagate-buG-entity-to-bu(command-<br>propagate-<br>buG-<br>entity-<br>to-<br>bu) --> rekey-command-to-source-buGroup-identifier(rekey-<br>command-<br>to-<br>source-<br>buGroup-<br>identifier)
command-update-item-identifiers-for-item-id(command-<br>update-<br>item-<br>identifiers-<br>for-<br>item-<br>id) --> rekey-command-based-on-item-id-key(rekey-<br>command-<br>based-<br>on-<br>item-<br>id-<br>key)
deletes-with-item-id-present(deletes-<br>with-<br>item-<br>id-<br>present) --> change-key-based-on-item-id-for-deletes(change-<br>key-<br>based-<br>on-<br>item-<br>id-<br>for-<br>deletes)
map-change-detection-entity-and-false-pair-to-entity(map-<br>change-<br>detection-<br>entity-<br>and-<br>false-<br>pair-<br>to-<br>entity) --> store-entity-state(store-<br>entity-<br>state)
route-to-change-detection-true(route-<br>to-<br>change-<br>detection-<br>true) --> map-change-detection-entity-and-ture-pair-to-entity(map-<br>change-<br>detection-<br>entity-<br>and-<br>ture-<br>pair-<br>to-<br>entity)
upserts-with-item-id-present(upserts-<br>with-<br>item-<br>id-<br>present) --> change-key-based-on-item-id-for-upserts(change-<br>key-<br>based-<br>on-<br>item-<br>id-<br>for-<br>upserts)
KSTREAM-MERGE-0000000104(KSTREAM-<br>MERGE-<br>0000000104) --> repartition-based-on-item-id-value-for-gtin-duplication-check-repartition-filter(repartition-<br>based-<br>on-<br>item-<br>id-<br>value-<br>for-<br>gtin-<br>duplication-<br>check-<br>repartition-<br>filter)
change-key-based-on-item-id-for-deletes(change-<br>key-<br>based-<br>on-<br>item-<br>id-<br>for-<br>deletes) --> repartition-based-on-item-id-key-for-delete-in-item-id-collection-repartition-filter(repartition-<br>based-<br>on-<br>item-<br>id-<br>key-<br>for-<br>delete-<br>in-<br>item-<br>id-<br>collection-<br>repartition-<br>filter)
change-key-based-on-item-id-for-upserts(change-<br>key-<br>based-<br>on-<br>item-<br>id-<br>for-<br>upserts) --> repartition-based-on-item-id-for-primary-state-update-repartition-filter(repartition-<br>based-<br>on-<br>item-<br>id-<br>for-<br>primary-<br>state-<br>update-<br>repartition-<br>filter)
map-change-detection-entity-and-ture-pair-to-entity(map-<br>change-<br>detection-<br>entity-<br>and-<br>ture-<br>pair-<br>to-<br>entity) --> report-change-detection-output-to-data-flow-observability(report-<br>change-<br>detection-<br>output-<br>to-<br>data-<br>flow-<br>observability)
rekey-command-based-on-item-id-key(rekey-<br>command-<br>based-<br>on-<br>item-<br>id-<br>key) --> repartition-to-move-command-based-on-item-id-key-repartition-filter(repartition-<br>to-<br>move-<br>command-<br>based-<br>on-<br>item-<br>id-<br>key-<br>repartition-<br>filter)
rekey-command-to-source-buGroup-identifier(rekey-<br>command-<br>to-<br>source-<br>buGroup-<br>identifier) --> repartition-to-move-command-to-buGroup-partition-repartition-filter(repartition-<br>to-<br>move-<br>command-<br>to-<br>buGroup-<br>partition-<br>repartition-<br>filter)
store-entity-state(store-<br>entity-<br>state) --> report-output-to-data-flow-observability(report-<br>output-<br>to-<br>data-<br>flow-<br>observability)
repartition-based-on-item-id-for-primary-state-update-repartition-filter(repartition-<br>based-<br>on-<br>item-<br>id-<br>for-<br>primary-<br>state-<br>update-<br>repartition-<br>filter) --> repartition-based-on-item-id-for-primary-state-update-repartition-sink(repartition-<br>based-<br>on-<br>item-<br>id-<br>for-<br>primary-<br>state-<br>update-<br>repartition-<br>sink)
repartition-based-on-item-id-key-for-delete-in-item-id-collection-repartition-filter(repartition-<br>based-<br>on-<br>item-<br>id-<br>key-<br>for-<br>delete-<br>in-<br>item-<br>id-<br>collection-<br>repartition-<br>filter) --> repartition-based-on-item-id-key-for-delete-in-item-id-collection-repartition-sink(repartition-<br>based-<br>on-<br>item-<br>id-<br>key-<br>for-<br>delete-<br>in-<br>item-<br>id-<br>collection-<br>repartition-<br>sink)
repartition-based-on-item-id-value-for-gtin-duplication-check-repartition-filter(repartition-<br>based-<br>on-<br>item-<br>id-<br>value-<br>for-<br>gtin-<br>duplication-<br>check-<br>repartition-<br>filter) --> repartition-based-on-item-id-value-for-gtin-duplication-check-repartition-sink(repartition-<br>based-<br>on-<br>item-<br>id-<br>value-<br>for-<br>gtin-<br>duplication-<br>check-<br>repartition-<br>sink)
repartition-to-move-command-based-on-item-id-key-repartition-filter(repartition-<br>to-<br>move-<br>command-<br>based-<br>on-<br>item-<br>id-<br>key-<br>repartition-<br>filter) --> repartition-to-move-command-based-on-item-id-key-repartition-sink(repartition-<br>to-<br>move-<br>command-<br>based-<br>on-<br>item-<br>id-<br>key-<br>repartition-<br>sink)
repartition-to-move-command-to-buGroup-partition-repartition-filter(repartition-<br>to-<br>move-<br>command-<br>to-<br>buGroup-<br>partition-<br>repartition-<br>filter) --> repartition-to-move-command-to-buGroup-partition-repartition-sink(repartition-<br>to-<br>move-<br>command-<br>to-<br>buGroup-<br>partition-<br>repartition-<br>sink)
report-change-detection-output-to-data-flow-observability(report-<br>change-<br>detection-<br>output-<br>to-<br>data-<br>flow-<br>observability) --> KSTREAM-SINK-0000000144(KSTREAM-<br>SINK-<br>0000000144)
report-output-to-data-flow-observability(report-<br>output-<br>to-<br>data-<br>flow-<br>observability) --> KSTREAM-SINK-0000000143(KSTREAM-<br>SINK-<br>0000000143)
end
subgraph Sub-Topology: 1
KSTREAM-SOURCE-0000000002(KSTREAM-<br>SOURCE-<br>0000000002) --> KTABLE-SOURCE-0000000003(KTABLE-<br>SOURCE-<br>0000000003)
end
subgraph Sub-Topology: 2
repartition-to-move-command-based-on-item-id-key-repartition-source(repartition-<br>to-<br>move-<br>command-<br>based-<br>on-<br>item-<br>id-<br>key-<br>repartition-<br>source) --> KSTREAM-MAPVALUES-0000000025(KSTREAM-<br>MAPVALUES-<br>0000000025)
KSTREAM-MAPVALUES-0000000025(KSTREAM-<br>MAPVALUES-<br>0000000025) --> generate-item-identifier-delete-records-data(generate-<br>item-<br>identifier-<br>delete-<br>records-<br>data)
repartition-based-on-item-id-for-primary-state-update-repartition-source(repartition-<br>based-<br>on-<br>item-<br>id-<br>for-<br>primary-<br>state-<br>update-<br>repartition-<br>source) --> generate-item-identifier-is-primary-state-update(generate-<br>item-<br>identifier-<br>is-<br>primary-<br>state-<br>update)
generate-item-identifier-delete-records-data(generate-<br>item-<br>identifier-<br>delete-<br>records-<br>data) --> KSTREAM-FLATMAP-0000000026(KSTREAM-<br>FLATMAP-<br>0000000026)
generate-item-identifier-is-primary-state-update(generate-<br>item-<br>identifier-<br>is-<br>primary-<br>state-<br>update) --> KSTREAM-FLATMAP-0000000126(KSTREAM-<br>FLATMAP-<br>0000000126)
repartition-based-on-item-id-key-for-delete-in-item-id-collection-repartition-source(repartition-<br>based-<br>on-<br>item-<br>id-<br>key-<br>for-<br>delete-<br>in-<br>item-<br>id-<br>collection-<br>repartition-<br>source) --> delete-item-identifier-from-item-ids-collection-state-store(delete-<br>item-<br>identifier-<br>from-<br>item-<br>ids-<br>collection-<br>state-<br>store)
KSTREAM-FLATMAP-0000000026(KSTREAM-<br>FLATMAP-<br>0000000026) --> repartition-based-on-bu-or-bug-key-of-item-identifier-repartition-filter(repartition-<br>based-<br>on-<br>bu-<br>or-<br>bug-<br>key-<br>of-<br>item-<br>identifier-<br>repartition-<br>filter)
KSTREAM-FLATMAP-0000000126(KSTREAM-<br>FLATMAP-<br>0000000126) --> repartition-based-on-original-key-after-primary-state-update-repartition-filter(repartition-<br>based-<br>on-<br>original-<br>key-<br>after-<br>primary-<br>state-<br>update-<br>repartition-<br>filter)
delete-item-identifier-from-item-ids-collection-state-store(delete-<br>item-<br>identifier-<br>from-<br>item-<br>ids-<br>collection-<br>state-<br>store) --> repartition-based-on-original-key-after-delete-in-item-id-collection-repartition-filter(repartition-<br>based-<br>on-<br>original-<br>key-<br>after-<br>delete-<br>in-<br>item-<br>id-<br>collection-<br>repartition-<br>filter)
repartition-based-on-bu-or-bug-key-of-item-identifier-repartition-filter(repartition-<br>based-<br>on-<br>bu-<br>or-<br>bug-<br>key-<br>of-<br>item-<br>identifier-<br>repartition-<br>filter) --> repartition-based-on-bu-or-bug-key-of-item-identifier-repartition-sink(repartition-<br>based-<br>on-<br>bu-<br>or-<br>bug-<br>key-<br>of-<br>item-<br>identifier-<br>repartition-<br>sink)
repartition-based-on-original-key-after-delete-in-item-id-collection-repartition-filter(repartition-<br>based-<br>on-<br>original-<br>key-<br>after-<br>delete-<br>in-<br>item-<br>id-<br>collection-<br>repartition-<br>filter) --> repartition-based-on-original-key-after-delete-in-item-id-collection-repartition-sink(repartition-<br>based-<br>on-<br>original-<br>key-<br>after-<br>delete-<br>in-<br>item-<br>id-<br>collection-<br>repartition-<br>sink)
repartition-based-on-original-key-after-primary-state-update-repartition-filter(repartition-<br>based-<br>on-<br>original-<br>key-<br>after-<br>primary-<br>state-<br>update-<br>repartition-<br>filter) --> repartition-based-on-original-key-after-primary-state-update-repartition-sink(repartition-<br>based-<br>on-<br>original-<br>key-<br>after-<br>primary-<br>state-<br>update-<br>repartition-<br>sink)
end
subgraph Sub-Topology: 3
repartition-based-on-item-id-value-for-gtin-duplication-check-repartition-source(repartition-<br>based-<br>on-<br>item-<br>id-<br>value-<br>for-<br>gtin-<br>duplication-<br>check-<br>repartition-<br>source) --> check-item-identifiers-on-duplication(check-<br>item-<br>identifiers-<br>on-<br>duplication)
check-item-identifiers-on-duplication(check-<br>item-<br>identifiers-<br>on-<br>duplication) --> filter-invalid-records(filter-<br>invalid-<br>records)
filter-invalid-records(filter-<br>invalid-<br>records) --> KSTREAM-MAPVALUES-0000000110(KSTREAM-<br>MAPVALUES-<br>0000000110)
KSTREAM-MAPVALUES-0000000110(KSTREAM-<br>MAPVALUES-<br>0000000110) --> filter-delete-records(filter-<br>delete-<br>records)
KSTREAM-MAPVALUES-0000000110(KSTREAM-<br>MAPVALUES-<br>0000000110) --> KSTREAM-MAPVALUES-0000000111(KSTREAM-<br>MAPVALUES-<br>0000000111)
filter-delete-records(filter-<br>delete-<br>records) --> KSTREAM-MAPVALUES-0000000114(KSTREAM-<br>MAPVALUES-<br>0000000114)
KSTREAM-MAPVALUES-0000000114(KSTREAM-<br>MAPVALUES-<br>0000000114) --> change-key-to-original-state-based-on-headers(change-<br>key-<br>to-<br>original-<br>state-<br>based-<br>on-<br>headers)
change-key-to-original-state-based-on-headers(change-<br>key-<br>to-<br>original-<br>state-<br>based-<br>on-<br>headers) --> repartition-based-on-original-key-after-gtin-duplication-check-repartition-filter(repartition-<br>based-<br>on-<br>original-<br>key-<br>after-<br>gtin-<br>duplication-<br>check-<br>repartition-<br>filter)
KSTREAM-MAPVALUES-0000000111(KSTREAM-<br>MAPVALUES-<br>0000000111) --> save-to-value-state-store-value(save-<br>to-<br>value-<br>state-<br>store-<br>value)
repartition-based-on-original-key-after-gtin-duplication-check-repartition-filter(repartition-<br>based-<br>on-<br>original-<br>key-<br>after-<br>gtin-<br>duplication-<br>check-<br>repartition-<br>filter) --> repartition-based-on-original-key-after-gtin-duplication-check-repartition-sink(repartition-<br>based-<br>on-<br>original-<br>key-<br>after-<br>gtin-<br>duplication-<br>check-<br>repartition-<br>sink)
end
pnp.private.input.item-identifiers.v4
repartition-based-on-bu-or-bug-key-of-item-identifier-repartition
repartition-to-move-command-to-buGroup-partition-repartition
repartition-based-on-original-key-after-gtin-duplication-check-repartition
repartition-based-on-original-key-after-primary-state-update-repartition
repartition-based-on-original-key-after-delete-in-item-id-collection-repartition
pnp.private.input.business-units.v1
repartition-to-move-command-based-on-item-id-key-repartition
repartition-based-on-item-id-for-primary-state-update-repartition
repartition-based-on-item-id-key-for-delete-in-item-id-collection-repartition
repartition-based-on-item-id-value-for-gtin-duplication-check-repartition
pnp.public.output.item-identifiers.v2
pnp.public.output.change-detection.v2
repartition-based-on-item-id-for-primary-state-update-repartition
repartition-based-on-item-id-key-for-delete-in-item-id-collection-repartition
repartition-based-on-item-id-value-for-gtin-duplication-check-repartition
repartition-to-move-command-based-on-item-id-key-repartition
repartition-to-move-command-to-buGroup-partition-repartition
repartition-based-on-bu-or-bug-key-of-item-identifier-repartition
repartition-based-on-original-key-after-delete-in-item-id-collection-repartition
repartition-based-on-original-key-after-primary-state-update-repartition
repartition-based-on-original-key-after-gtin-duplication-check-repartition
item-identifier-store
item-identifier-store
item-identifier-store
item-identifier-store
item-identifier-store
pnp.private.input.business-units.v1-STATE-STORE-0000000001
item-ids-collection-store
item-ids-collection-store
item-ids-collection-store
item-identifier-values-store
item-identifier-values-store
```
----