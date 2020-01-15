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
const Entity = new Uint32Array(64);

function entity_new(pos, gen) {
    let entity = new Uint32Array(Entity);
    entity[0] = pos;
    entity[1] = gen;
    return entity;
}

/// Storages hold components of a specific type, and define these associations on entities.
///
/// # Implementation notes
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
    components() {
        return this._store.map((value, pos) => [entity_new(pos, value[0]), value[1]]);
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

    /// Finds values which the matching component
    find(component) {
        return this.components()
            .filter((slot) => slot[1] == component)
            .map((slot) => slot[0])
    }

    /// Fetches the component for this entity, if it exists.
    get(entity) {
        let [id, gen] = entity;

        let value = this._store[id];

        // If the generation is not a match, unset the component.
        if (value[0] != gen) {
            return null;
        }

        return value[1];
    }

    /// Removes the component for this entity, if it exists.
    remove(entity) {
        this._store[entity] = null;
    }
}

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
