import { Database } from 'bun:sqlite'
import Lookup from './lookup'
import { schema, getQueries } from './queries'

/**
 * SQLite-backed faceted-search
 */
export default class DocumentStore {
    /**
     * @param {string} filename
     */
    constructor(filename) {
        // TODO: add configuration for term pointer size
        this.db = new Database(filename)
        this.db.run('pragma journal_mode = WAL')
        this.runStatement = statement => this.db.run(statement)
        this.createSchema()
        this.queries = getQueries(this.db)
    }

    /**
     * Close DB connection
     */
    close() {
        this.db.close()
    }

    /**
     * Create tables & indexes necessary for indexing documents
     */
    createSchema() {
        const { tables, indexes } = schema
        tables.forEach(this.runStatement)
        indexes.forEach(this.runStatement)
    }

    /**
     * Drop & re-create schema - deletes all indexed data
     */
    clearSchema() {
        schema.drops.forEach(this.runStatement)
        this.createSchema()
    }

    /**
     * Vacuum database - run periodically
     */
    vacuum() {
        this.queries.vacuum.run()
    }

    /**
     * Build aggregation cache - run after indexing new documents
     */
    buildAggregations() {
        this.queries.aggregations.build.run()
    }

    /**
     * Get or create term ID by name
     * @param {string} name
     * @param {boolean} readonly Throw error if term is not found
     * @returns {number} Term ID
     */
    getTermID(name, readonly = false) {
        const { get, create } = this.queries.terms

        if (!readonly) return get.get(name)?.rowid ?? create.get(name).rowid

        const id = get.get(name)?.rowid
        if (id === undefined) throw new Error(`Term '${name}' not found.`)
        return id
    }

    /**
     * @param {number[]} facet_ids
     * @returns {Buffer}
     */
    getFacetBuffer(facet_ids) {
        return Buffer.from(
            new Uint16Array([...facet_ids.sort((a, b) => a - b)]).buffer
        )
    }

    /**
     * Get or create aggregaton ID by terms
     * @param {number[]} facets
     * @param {number} scalar
     * @param {boolean} readonly Return undefined if not found
     * @returns {number}
     */
    getAggregationID(facets, scalar, readonly = false) {
        const { get, create } = this.queries.aggregations
        const buffer = this.getFacetBuffer(facets)

        if (!readonly)
            return (
                get.get(buffer, scalar)?.rowid ??
                create.get(buffer, scalar).rowid
            )
        return get.get(buffer, scalar)?.rowid
    }

    /**
     * Create or update document by id
     * @param {object} document
     * @param {number | undefined} document.id
     * @returns {number}
     */
    upsertDocument(document) {
        const { create, upsert } = this.queries.documents
        const { clear } = this.queries.results
        const id = document.id
        const value = JSON.stringify(document)
        if (id === undefined) return create.get(value).rowid

        if (typeof id !== 'number')
            throw new Error(`Document 'id' must be a number.`)
        clear.run(id)
        return upsert.run(id, value, value, id).rowid
    }

    /**
     * Index a new or existing document
     * @param {Record<string, boolean | number | string | any>} document
     * @returns {number} Document ID
     */
    index(document) {
        const {
            results: { create }
        } = this.queries

        const id = this.db.transaction(() => {
            const id = this.upsertDocument(document)
            if (document.id) delete document.id

            /** @type {Record<number, number>} */
            const scalars = {}
            scalars[this.getTermID('updated')] = parseInt(Date.now() / 1000)
            /** @type {number[]} */
            const facets = []

            // Find root-level document scalars (number) and facets (boolean, string, string[])
            Object.entries(document).forEach(([key, value]) => {
                if (typeof value === 'number')
                    return (scalars[this.getTermID(key.toLowerCase())] = value)

                if (typeof value === 'string')
                    return facets.push(
                        this.getTermID(`${key}:${value.trim()}`.toLowerCase())
                    )

                if (
                    Array.isArray(value) &&
                    value.every(value => typeof value === 'string')
                )
                    return value.forEach(value =>
                        facets.push(
                            this.getTermID(
                                `${key}:${value.trim()}`.toLowerCase()
                            )
                        )
                    )

                if (typeof value === 'boolean')
                    return facets.push(this.getTermID(key.toLowerCase()))
            })

            // Create 1 result per scalar
            const indexScalars = (facets = []) =>
                Object.entries(scalars).forEach(([scalar, value]) =>
                    create.run(id, this.getAggregationID(facets, scalar), value)
                )
            indexScalars()
            // Permutate all facets
            for (let i = 0; i < facets.length; i++) {
                indexScalars([facets[i]])
                for (let start = i + 1; start < facets.length; start++) {
                    for (
                        let length = 1;
                        length <= facets.length - start;
                        length++
                    )
                        indexScalars([
                            facets[i],
                            ...facets.slice(start, start + length)
                        ])
                }
            }

            return id
        })()

        return id
    }

    /**
     *
     * @param {object} parameters
     * @param {string | undefined} parameters.sort_by Scalar to sort results by - default: 'updated'
     * @param {string[] | undefined} parameters.filters Facets to filter results by (AND query) - default: []
     * @param {boolean | undefined} parameters.desc Sort descending - default: false
     * @param {number | undefined} parameters.size Amount of results to return - default: 10
     * @param {number | undefined} parameters.start Return results after sort_by
     * @param {number | undefined} parameters.after Return results after document ID
     * @returns {object[]}
     */
    getResults(parameters = {}) {
        const { get, getAfter } = this.queries.results
        const sort_by = this.getTermID(parameters.sort_by ?? 'updated', true)
        const facets =
            parameters?.filters.map(facet => this.getTermID(facet, true)) ?? []
        const desc = parameters?.desc
        const size = parameters?.size ?? 10
        const after = parameters?.after
        const start = parameters?.start

        if (after !== undefined && start === undefined)
            throw new Error(`'start' must be provided if 'after' is used.`)
        if (start !== undefined && after === undefined)
            throw new Error(`'after' must be provided if 'start' is used.`)

        const aggregation = this.getAggregationID(facets, sort_by, true)
        if (aggregation === undefined) return []

        const getDocuments = values =>
            values.map(([id]) => ({
                id,
                ...JSON.parse(this.queries.documents.get.get(id).value)
            })) ?? []

        if (start !== undefined)
            return desc
                ? getDocuments(
                      getAfter.desc.values(aggregation, start, after, size)
                  )
                : getDocuments(
                      getAfter.asc.values(aggregation, start, after, size)
                  )

        return desc
            ? getDocuments(get.desc.values(aggregation, size))
            : getDocuments(get.asc.values(aggregation, size))
    }

    /**
     * Returns possible facet queries with document counts
     * @param {string[]} filters
     * @returns {{facets: Record<string, number | Record<string, number>>, scalars: {name: string, min: number, max: number, average: number}[]}}
     */
    getAggregations(filters = []) {
        const { getByLength, getByFacets } = this.queries.aggregations
        const lookup = new Lookup(this.queries.terms.all.values())
        const aggregations = {}

        const setAggregation = (key, value, count) => {
            // Boolean facet
            if (value === undefined) return (aggregations[key] = count)
            // Multi-value facet
            if (aggregations[key] === undefined) aggregations[key] = {}
            aggregations[key][value] = count
        }

        const possiblePermutations = getByLength.values(
            (filters.length + 1) * 2
        )
        const required = filters
            .map(name => lookup.getID(name))
            .sort((a, b) => a - b)

        possiblePermutations.forEach(([{ buffer }, count]) => {
            const permutationIDs = new Uint16Array(buffer)

            // Doesn't contain current requirements
            if (!required.every(id => permutationIDs.includes(id))) return

            // Map next possible facet to aggregations
            const nextFacetID = permutationIDs.find(
                id => !required.includes(id)
            )
            const [key, value] = lookup.getName(nextFacetID).split(':')
            setAggregation(key, value, count)
        })

        const sort_by = Object.fromEntries(
            getByFacets
                .all(this.getFacetBuffer(required))
                .map(({ scalar, min, max, avg }) => {
                    return [lookup.getName(scalar), { min, max, avg }]
                })
        )

        return {
            filters: aggregations,
            sort_by
        }
    }
}
