# Scalable video and monetization architecture

## Product rules implemented now

- A playback session has one opaque session key and is idempotent.
- A view qualifies only after meaningful watch time: 30% of duration, capped at 30 seconds and floored at 3 seconds, or 80% completion.
- Refreshes and repeated heartbeats update the same ledger row instead of creating views.
- Monetization activates at 1,000 followers and 5,000 valid public-video watch hours.
- Suspended accounts never reactivate automatically.

## Scale-out target

```text
Clients -> CDN/WAF -> View ingestion API -> durable event stream
                                      |-> fraud/risk processor
                                      |-> watch-time aggregator -> counters/cache
                                      |-> analytics warehouse

Uploads -> resumable upload API -> object storage -> transcode workers -> CDN

Creator settings -> monetization service -> eligibility ledger -> payout service
```

## Rollout phases

### Phase 1: transactional launch

Use the current PostgreSQL view ledger, unique session keys, HLS/object storage and transactional counters. Run multiple stateless API replicas behind a load balancer. Use connection pooling and CDN caching for public metadata.

### Phase 2: high traffic

Move view heartbeats to a dedicated ingestion service. Publish append-only events to a partitioned durable stream keyed by video ID. Consumers aggregate watch time and qualified views in micro-batches, then update Redis counters and PostgreSQL snapshots. Add rate limits per account/device/network and signed playback sessions.

### Phase 3: large analytics

Store raw playback events in inexpensive object storage and a columnar analytics database. Keep PostgreSQL for product truth only. Pre-compute creator/day/video rollups. Reconcile counter snapshots from the event log so consumers can replay safely.

### Phase 4: monetization and payouts

Separate eligibility, ad revenue, creator balance and payouts into isolated ledgers. Every money movement must be immutable, double-entry and idempotent. Add identity/tax verification, regional policy, copyright claims, fraud holds, manual suspension and auditable appeals before real payouts.

### Phase 5: multi-region

Serve media and public reads at the edge. Route playback events to the nearest region and replicate the event log. Keep a single home region per creator/account for strongly consistent mutations. Partition high-volume data by time and hashed creator/video identifiers.

## Operational requirements

- SLOs and alerts for upload success, playback startup, buffering, event lag and counter drift.
- Dead-letter queues, replay tools and schema-versioned events.
- Encryption, short-lived signed media URLs, secret rotation and least-privilege access.
- Automated backups and regularly tested recovery procedures.
- Load tests at every phase; capacity must be proven before traffic is increased.
