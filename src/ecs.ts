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

export type Entity = [number, number];

export function entity_eq(a: Entity, b: Entity): boolean {
    return a[0] == b[0] && b[1] == b[1];
}

export function entity_new(pos: number, gen: number): Entity {
    return [pos, gen];
}

/// Storages hold components of a specific type, and define these associations on entities
///
/// # Implementation Notes
///
/// Consists of an `Array` which uses the entity ID as the index into that array. Each
/// value in the array is an array which contains the entity's generation, and the
/// component which was assigned to it. The generation is used to determine if an
/// assigned component is stale on component lookup.
export class Storage<T> {
    private store: Array<[number, T] | null>;

    constructor() {
        this.store = new Array();
    }

    /// Private method for iterating across allocated slots
    * _iter(): IterableIterator<[number, [number, T]]> {
        let idx = 0;
        for (const slot of this.store) {
            if (slot) yield [idx, slot];
            idx += 1;
        }
    }

    /// Iterates across each stored component, and their entities
    * iter(): IterableIterator<[Entity, T]> {
        for (const [idx, [gen, value]] of this._iter()) {
            yield [entity_new(idx, gen), value];
        }
    }

    /// Finds values with the matching component
    * find(func: (value: T) => boolean): IterableIterator<Entity> {
        for (const [idx, [gen, value]] of this._iter()) {
            if (func(value)) yield entity_new(idx, gen);
        }
    }

    /// Iterates across each stored component
    * values(): IterableIterator<T> {
        for (const [, [, value]] of this._iter()) {
            yield value;
        }
    }

    /**
     * Checks if the component associated with this entity exists
     *
     * @param {Entity} entity
     */
    contains(entity: Entity): boolean {
        return this.get(entity) != null;
    }

    /// Fetches the component for this entity, if it exists
    get(entity: Entity): T | null {
        let [id, gen] = entity;
        const val = this.store[id];
        return (val && val[0] == gen) ? val[1] : null;
    }

    /// Fetches the component, and initializing it if it is missing
    get_or(entity: Entity, init: () => T): T {
        let value = this.get(entity);

        if (!value) {
            value = init();
            this.insert(entity, value);
        }

        return value;
    }

    /// Assigns component to an entity
    insert(entity: Entity, component: T) {
        let [id, gen] = entity;

        let length = this.store.length;
        if (length >= id) {
            this.store.fill(null, length, id);
        }

        this.store[id] = [gen, component];
    }

    /// Removes the component for this entity, if it exists
    remove(entity: Entity): T | null {
        const comp = this.get(entity);
        if (comp) {
            this.store[entity[0]] = null;
        };
        return comp;
    }

    /**
     * Takes the component associated with the `entity`, and passes it into the `func` callback
     *
     * @param {Entity} entity
     * @param {function} func
     */
    take_with<X>(entity: Entity, func: (component: T) => X): X | null {
        const component = this.remove(entity);
        return component ? func(component) : null;
    }

    /// Apply a function to the component when it exists
    with<X>(entity: Entity, func: (component: T) => X): X | null {
        const component = this.get(entity);
        return component ? func(component) : null
    }
}

/// The world maintains all of the entities, which have their components associated in storages
///
/// # Implementation Notes
///
/// This implementation consists of:
///
/// - An array for storing entities
/// - An array for storing a list of registered storages
/// - An array for containing a list of free slots to allocate
/// - An array for storing tags associated with an entity
export class World {
    private entities_: Array<Entity>;
    private storages: Array<Storage<any>>;
    private tags_: Array<any>;
    private free_slots: Array<number>;

    constructor() {
        this.entities_ = new Array();
        this.storages = new Array();
        this.tags_ = new Array();
        this.free_slots = new Array();
    }

    /// The total capacity of the entity array
    get capacity(): number {
        return this.entities_.length;
    }

    /// The number of unallocated entity slots
    get free(): number {
        return this.free_slots.length;
    }

    /// The number of allocated entities
    get length(): number {
        return this.capacity - this.free;
    }

    /// Fetches tags associated with an entity
    ///
    /// Tags are essentially a dense set of small components
    tags(entity: Entity): any {
        return this.tags_[entity[0]];
    }

    /// Iterates across entities in the world
    * entities(): IterableIterator<Entity> {
        for (const entity of this.entities_.values()) {
            if (!(this.free_slots.indexOf(entity[0]) > -1)) yield entity;
        }
    }

    /// Create a new entity in the world
    ///
    /// Find the first available slot, and increment the generation.
    create_entity(): Entity {
        let slot = this.free_slots.pop();

        if (slot) {
            var entity = this.entities_[slot];
            entity[1] += 1;
        } else {
            var entity = entity_new(this.capacity, 0);
            this.entities_.push(entity);
            this.tags_.push(new Set());
        }

        return entity;
    }

    /// Deletes an entity from the world
    ///
    /// Sets the `id` of the entity to `null`, thus marking its slot as unused.
    delete_entity(entity: Entity) {
        this.tags(entity).clear();
        for (const storage of this.storages) {
            storage.remove(entity);
        }

        this.free_slots.push(entity[0]);
    }

    /// Adds a new tag to the given entity
    add_tag(entity: Entity, tag: any) {
        this.tags(entity).add(tag);
    }

    /// Returns `true` if this tag exists for the given entity
    contains_tag(entity: Entity, tag: any): boolean {
        return this.tags(entity).has(tag);
    }

    /// Deletes a tag from the given entity
    delete_tag(entity: Entity, tag: any) {
        this.tags(entity).delete(tag);
    }

    /// Registers a new component storage for our world
    ///
    /// This will be used to easily remove components when deleting an entity.
    register_storage<T>(): Storage<T> {
        let storage = new Storage<T>();
        this.storages.push(storage);
        return storage;
    }

    /// Unregisters an old component storage from our world
    unregister_storage(storage: Storage<any>) {
        let matched = this.storages.indexOf(storage);
        if (matched) {
            swap_remove(this.storages, matched);
        }
    }
}

function swap_remove<T>(array: Array<T>, index: number): T | undefined {
    const last = array.length - 1;
    array[index] = array[last];
    return array.pop();
}
