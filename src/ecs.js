/// A generational entity ID
///
/// Solves the ABA problem by tagging indexes with generations. The generation is used to
/// determine if an entity is the same entity as the one which previously owned an
/// assigned component at a given index.
///
/// # Implementation Notes
///
/// - The first 32-bit integer is the index.
/// - The second 32-bit integer is the generation.
const Entity = new Uint32Array(2);

function entity_new(pos, gen) {
    let entity = new Uint32Array(Entity);
    entity[0] = pos;
    entity[1] = gen;
    return entity;
}

/// Storages hold components of a specific type, and define these associations on entities.
///
/// # Implementation Notes
///
/// Consists of an `Array` which uses the entity ID as the index into that array. Each
/// value in the array is an array which contains the entity's generation, and the
/// component which was assigned to it. The generation is used to determine if an
/// assigned component is stale on component lookup.
var Storage = class Storage {
    constructor() {
        this._store = new Array();
    }

    /// Iterates across each stored component, and their entities
    * iter() {
        let idx = 0;
        for (const [gen, value] of this._store) {
            yield [entity_new(idx, gen), value];
            idx += 1;
        }
    }

    /// Iterates across each stored component
    * iter_values() {
        for (const [_, value] of this._store) {
            yield value;
        }
    }

    /// Finds values which the matching component
    * find(component) {
        let idx = 0;
        for (const [gen, value] of this._store) {
            if (value == component) {
                yield entity_new(idx, gen);
            }
            idx += 1;
        }
    }

    /// Fetches the component for this entity, if it exists.
    get(entity) {
        let [id, gen] = entity;

        let value = this._store[id];

        if (!value || value[0] != gen) return null;

        return value[1];
    }

    /// Fetches the component, and initializing it if it is missing.
    get_or(entity, init) {
        let value = this.get(entity);

        if (!value) {
            value = init();
            if (!value) return null;
            this.insert(entity, value);
        }

        return value;
    }

    /// Assigns component to an entity
    insert(entity, component) {
        let [id, gen] = entity;

        let length = this._store.length;
        if (length >= id) {
            this._store.fill(null, length, id);
        }

        this._store[id] = [gen, component];
    }

    /// Removes the component for this entity, if it exists.
    remove(entity) {
        this._store[entity] = null;
    }
}

/// The world maintains all of the entities, which have their components associated in storages.
///
/// # Implementation Notes
///
/// This implementation consists of two arrays. One for storing entities, and another for storing tags for each entity.
/// Tags are similar to array-backed storages, but are sets containing miscellaneous bits of sparse data.
var World = class World {
    constructor() {
        this.entities = new Array();
        this._tags = new Array();
    }

    tags(entity) {
        return this._tags[entity[0]];
    }

    /// Create a new entity in the world.
    ///
    /// Find the first available slot, and increment the generation.
    create_entity() {
        let entity = this.entities.find((slot) => slot[0] == null);

        if (entity) {
            // Reuse the slot; incrementing the generation. It's acceptable to overflow after `MAXUINT32`.
            entity[1] += 1;
        } else {
            // Create a new slot to append our new entity to.
            entity = entity_new(this.entities.length, 0);
            this.entities.push(entity);
            this._tags.push(new Set());
        }

        return entity;
    }

    /// Deletes an entity from the world.
    ///
    /// Sets the `id` of the entity to `null`, thus marking its slot as unused.
    delete_entity(entity) {
        this.entities[entity[0]][0] = null;
        this.tags(entity).clear();
    }

    add_tag(entity, tag) {
        this.tags(entity).add(tag);
    }

    contains_tag(entity, tag) {
        return this.tags(entity).has(tag);
    }

    delete_tag(entity, tag) {
        this.tags(entity).delete(tag);
    }
}
