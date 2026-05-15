module dead_drop::drop_registry {
    use std::signer;
    use std::string;
    use std::string::String;
    use aptos_framework::timestamp;
    use aptos_framework::event;
    use aptos_std::table::{Self, Table};
    use aptos_framework::account;

    const E_DROP_NOT_FOUND: u64 = 1;
    const E_DROP_EXPIRED: u64 = 2;
    const E_QUOTA_EXHAUSTED: u64 = 3;
    const E_NOT_OWNER: u64 = 4;

    struct Drop has store, drop {
        blob_id: String,
        blob_hash: String,
        owner: address,
        ttl_seconds: u64,
        created_at: u64,
        max_reads: u64,
        reads_remaining: u64,
        is_active: bool,
    }

    struct DropRegistry has key {
        drops: Table<String, Drop>,
        create_events: event::EventHandle<DropCreatedEvent>,
        read_events: event::EventHandle<DropReadEvent>,
        destroy_events: event::EventHandle<DropDestroyedEvent>,
    }

    struct DropCreatedEvent has drop, store {
        drop_id: String,
        blob_id: String,
        owner: address,
        max_reads: u64,
        expires_at: u64,
    }

    struct DropReadEvent has drop, store {
        drop_id: String,
        reader: address,
        reads_remaining: u64,
        timestamp: u64,
    }

    struct DropDestroyedEvent has drop, store {
        drop_id: String,
        reason: String,
        timestamp: u64,
    }

    fun init_module(account: &signer) {
        move_to(account, DropRegistry {
            drops: table::new(),
            create_events: account::new_event_handle<DropCreatedEvent>(account),
            read_events: account::new_event_handle<DropReadEvent>(account),
            destroy_events: account::new_event_handle<DropDestroyedEvent>(account),
        });
    }

    public entry fun register_drop(
        sender: &signer,
        drop_id: String,
        blob_id: String,
        blob_hash: String,
        ttl_seconds: u64,
        max_reads: u64,
    ) acquires DropRegistry {
        let sender_addr = signer::address_of(sender);
        let registry = borrow_global_mut<DropRegistry>(sender_addr);
        let now = timestamp::now_seconds();

        let drop = Drop {
            blob_id,
            blob_hash,
            owner: sender_addr,
            ttl_seconds,
            created_at: now,
            max_reads,
            reads_remaining: max_reads,
            is_active: true,
        };

        table::add(&mut registry.drops, drop_id, drop);

        event::emit_event(&mut registry.create_events, DropCreatedEvent {
            drop_id,
            blob_id,
            owner: sender_addr,
            max_reads,
            expires_at: now + ttl_seconds,
        });
    }

    public entry fun record_read(
        sender: &signer,
        drop_id: String,
    ) acquires DropRegistry {
        let sender_addr = signer::address_of(sender);
        let registry = borrow_global_mut<DropRegistry>(sender_addr);
        let now = timestamp::now_seconds();

        assert!(table::contains(&registry.drops, drop_id), E_DROP_NOT_FOUND);
        let drop = table::borrow_mut(&mut registry.drops, drop_id);

        assert!(now < drop.created_at + drop.ttl_seconds, E_DROP_EXPIRED);
        assert!(drop.reads_remaining > 0, E_QUOTA_EXHAUSTED);
        assert!(drop.is_active, E_QUOTA_EXHAUSTED);

        drop.reads_remaining = drop.reads_remaining - 1;
        let reads_remaining = drop.reads_remaining;

        event::emit_event(&mut registry.read_events, DropReadEvent {
            drop_id,
            reader: sender_addr,
            reads_remaining,
            timestamp: now,
        });

        if (reads_remaining == 0) {
            drop.is_active = false;
            event::emit_event(&mut registry.destroy_events, DropDestroyedEvent {
                drop_id,
                reason: std::string::utf8(b"quota_exhausted"),
                timestamp: now,
            });
        };
    }

    public entry fun destroy_drop(
        sender: &signer,
        drop_id: String,
    ) acquires DropRegistry {
        let sender_addr = signer::address_of(sender);
        let registry = borrow_global_mut<DropRegistry>(sender_addr);
        let now = timestamp::now_seconds();

        assert!(table::contains(&registry.drops, drop_id), E_DROP_NOT_FOUND);
        let drop = table::borrow_mut(&mut registry.drops, drop_id);
        assert!(drop.owner == sender_addr, E_NOT_OWNER);

        drop.is_active = false;

        event::emit_event(&mut registry.destroy_events, DropDestroyedEvent {
            drop_id,
            reason: std::string::utf8(b"manual"),
            timestamp: now,
        });
    }

    #[view]
    public fun get_drop_status(drop_id: String, owner: address): (bool, u64, u64) acquires DropRegistry {
        let registry = borrow_global<DropRegistry>(owner);
        assert!(table::contains(&registry.drops, drop_id), E_DROP_NOT_FOUND);
        let drop = table::borrow(&registry.drops, drop_id);
        let now = timestamp::now_seconds();
        let is_valid = drop.is_active && (now < drop.created_at + drop.ttl_seconds);
        (is_valid, drop.reads_remaining, drop.created_at + drop.ttl_seconds)
    }

    #[view]
    public fun get_blob_hash(drop_id: String, owner: address): String acquires DropRegistry {
        let registry = borrow_global<DropRegistry>(owner);
        assert!(table::contains(&registry.drops, drop_id), E_DROP_NOT_FOUND);
        let drop = table::borrow(&registry.drops, drop_id);
        drop.blob_hash
    }
}
