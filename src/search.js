import { Database } from 'bun:sqlite'
import Lookup from './lookup'
import getQueries from './queries'

/**
 * SQLite-backed faceted-search
 */
export default class FacetedSearch {
    /**
     * @param {string} filename
     */
    constructor(filename) {
        this.db = new Database(filename)
        this.db.run('pragma journal_mode = WAL')
        this.queries = getQueries(this.db)
        this.runStatement = statement => this.db.run(statement)
        this.createSchema()
    }

    /**
     * Create tables & indexes necessary for indexing documents
     */
    createSchema() {
        const { tables, indexes } = this.queries.schema
        tables.forEach(this.runStatement)
        indexes.forEach(this.runStatement)
    }

    /**
     * Drop & re-create schema - deletes all indexed data
     */
    clearSchema() {
        this.queries.schema.drops.forEach(this.runStatement)
        this.createSchema()
    }

    /**
     * Vacuum database
     */
    vacuum() {
        this.queries.vacuum.run()
    }

    /**
     * Delete existing facets & scalars for existing document
     * @param {number} document_id
     */
    clearDocument(document_id) {
        const {
            facets: { clear: clearFacets },
            scalars: { clear: clearScalars }
        } = this.queries.document
        clearFacets.run(document_id)
        clearScalars.run(document_id)
    }

    /**
     * Get or create scalar ID by name
     * @param {string} name
     * @returns {number} Scalar ID
     */
    getScalarID(name, readonly = false) {
        const { get, create } = this.queries.scalars
        return readonly
            ? get.get(name)?.rowid
            : get.get(name)?.rowid ?? create.get(name).rowid
    }

    /**
     * Get or create facet ID by name
     * @param {string} name
     * @returns {number} Facet ID
     */
    getFacetID(name, readonly = false) {
        const { get, create } = this.queries.facets
        return readonly
            ? get.get(name)?.rowid
            : get.get(name)?.rowid ?? create.get(name).rowid
    }

    /**
     * @param {number[]} ids
     * @returns {Buffer}
     */
    getBuffer(ids) {
        return Buffer.from(new Uint16Array(ids.sort((a, b) => a - b)).buffer)
    }

    /**
     * Index a new or existing document
     * @param {Record<string, boolean | number | string | any>} document
     * @returns {number} Document ID
     */
    index(document) {
        const {
            create,
            update,
            scalars: { create: createScalar, clear: clearScalars },
            facets: { create: createFacet, clear: clearFacets }
        } = this.queries.document

        if (document.id) {
            if (typeof document.id !== 'number')
                throw new Error(`Document 'id' must be a number.`)
            if (this.queries.document.countOne.get(document.id).count === 0)
                throw new Error(`Document doesn't exist: ${document.id}.`)
        }
            

        const value = JSON.stringify(document)
        const { rowid: document_id } = document.id
            ? update.get(document.id, value, value, document.id)
            : create.get(value)
        if (document.id) this.clearDocument(document_id)
        createScalar.run(document_id, this.getScalarID('updated'), Date.now() / 1000)

        /** @type {number[]} */
        const facets = []
        Object.entries(document).forEach(([key, value]) => {
            // Scalar
            if (typeof value === 'number')
                return createScalar.run(
                    document_id,
                    this.getScalarID(key.toLowerCase()),
                    value
                )
            // Single-Value Facet
            if (typeof value === 'string')
                facets.push(
                    this.getFacetID(`${key}:${value.trim()}`.toLowerCase())
                )
            // Multi-Value Facet
            if (
                Array.isArray(value) &&
                value.every(value => typeof value === 'string')
            )
                value.forEach(value =>
                    facets.push(
                        this.getFacetID(`${key}:${value.trim()}`.toLowerCase())
                    )
                )
            // Boolean Facet
            if (typeof value === 'boolean')
                return facets.push(this.getFacetID(key.toLowerCase()))
        })

        // Index facet permutations
        for (let i = 0; i < facets.length; i++) {
            createFacet.run(document_id, this.getBuffer([facets[i]]))
            for (let start = i + 1; start < facets.length; start++) {
                for (let length = 1; length <= facets.length - start; length++)
                    createFacet.run(
                        document_id,
                        this.getBuffer([
                            facets[i],
                            ...facets.slice(start, start + length)
                        ])
                    )
            }
        }
    }

    /**
     *
     * @param {object} parameters
     * @param {string[] | undefined} parameters.facets Facets to filter results by (AND query) - default: []
     * @param {string | undefined} parameters.sort_by Scalar to sort results by - default: 'updated'
     * @param {boolean | undefined} parameters.desc Sort descending - default: false
     * @param {number | undefined} parameters.size Results to return - default: 48
     * @param {number | undefined} parameters.documents Results to return document values for - default: 12
     * @param {number | undefined} parameters.offset Results to skip - default: 0
     */
    getResults(parameters = {}) {
        const sortID = this.getScalarID(parameters.sort_by ?? 'updated', true)
        if (sortID === undefined)
            throw new Error(
                `Scalar "${parameters.sort_by ?? 'updated'}" not found.`
            )

        const size = parameters?.size ?? 48
        const offset = parameters?.offset ?? 0

        let results
        // Un-filtered results
        if (!parameters.facets?.length)
            results = parameters?.desc
                ? this.queries.search.unfiltered.desc
                      .values(sortID, size, offset)
                      ?.flat()
                : this.queries.search.unfiltered.asc
                      .values(sortID, size, offset)
                      ?.flat()
        // Filtered results
        else {
            const facets = this.getBuffer(
                parameters.facets
                    .map(name => {
                        const id = this.getFacetID(name, true)
                        if (id === undefined)
                            throw new Error(`Facet "${name}" not found.`)
                        return id
                    })
            )
            results = parameters?.desc
                ? this.queries.search.filtered.desc
                      .values(sortID, facets, size, offset)
                      ?.flat()
                : this.queries.search.filtered.asc
                      .values(sortID, facets, size, offset)
                      ?.flat()
        }

        const documents = parameters?.documents ?? 12
        for (let i = 0; i < documents && i < results?.length; i++) {
            const id = results[i]
            const { value } = this.queries.document.get.get(id)
            results[i] = {
                id,
                value: JSON.parse(value)
            }
        }

        return results ?? []
    }

    /**
     * @param {number[]} document_ids
     */
    getDocuments(document_ids) {
        return document_ids.map(id => {
            const { value } = this.queries.document.get.get(results[i])
            return {
                id,
                value: JSON.parse(value)
            }
        })
    }

    /**
     * Build aggregation cache - run after indexing new documents - will take 30+ seconds on large indexes
     */
    buildAggregations() {
        this.queries.facets.aggregations.build.run()
        this.queries.scalars.aggregations.build.run()
        this.queries.scalars.aggregations.buildUnfiltered.run()
    }

    /**
     * Returns possible facet queries with document counts
     * @param {string[]} facets
     * @returns {{facets: Record<string, number | Record<string, number>>, scalars: {name: string, min: number, max: number, average: number}[]}}
     */
    getAggregations(facets = []) {
        const facetLookup = new Lookup(this.queries.facets.all.values())
        const aggregations = {}

        const setAggregation = (key, value, count) => {
            // Boolean facet
            if (value === undefined) return (aggregations[key] = count)
            // Multi-value facet
            if (aggregations[key] === undefined) aggregations[key] = {}
            aggregations[key][value] = count
        }

        const possiblePermutations =
            this.queries.facets.aggregations.getByLength.values(
                (facets.length + 1) * 2
            )
        const required = facets.map(name => {
            const id = facetLookup.getID(name)
            if (id === undefined) throw new Error(`Facet "${name}" not found.`)
            return id
        })

        possiblePermutations.forEach(([{ buffer }, count]) => {
            const permutationIDs = new Uint16Array(buffer)

            // Doesn't contain current requirements
            if (!required.every(id => permutationIDs.includes(id))) return

            // Map next possible facet to aggregations
            const nextFacetID = permutationIDs.find(
                id => !required.includes(id)
            )
            const [key, value] = facetLookup.getName(nextFacetID).split(':')
            setAggregation(key, value, count)
        })

        return {
            facets: aggregations,
            scalars: required.length
                ? this.queries.scalars.aggregations.getByFacets.all(
                      this.getBuffer(required)
                  )
                : this.queries.scalars.aggregations.getUnfiltered.all()
        }
    }
}
