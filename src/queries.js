export const schema = {
    drops: [
        'drop table if exists terms',
        'drop table if exists term_permutations',
        'drop table if exists aggregations',
        'drop table if exists documents',
        'drop table if exists results'
    ],
    tables: [
        'create table if not exists terms (name text unique)',
        'create table if not exists term_permutations (value text, term integer)',
        'create table if not exists aggregations (facets blob, scalar integer, count integer, min real, max real, avg real)',
        'create table if not exists documents (value text)',
        'create table if not exists results (document integer, aggregation integer, value real)'
    ],
    indexes: [
        'create unique index if not exists term_permutations (value, term)',
        'create unique index if not exists aggregations_unique on aggregations (facets, scalar)',
        'create index if not exists results_sort on results (aggregation, value, document)',
        'create index if not exists results_document on results (document)'
    ]
}

/**
 * Prepare queries
 * @param {Database} db
 */
export function getQueries(db) {
    const prepare = statement => db.prepare(statement)
    return {
        vacuum: prepare('vacuum'),
        terms: {
            get: prepare('select rowid from terms where name = ?'),
            all: prepare('select rowid, name from terms'),
            create: prepare(
                'insert into terms (name) values (?) returning rowid'
            )
        },
        term_permutations: {
            create: prepare('insert into term_permutations (value, term) values (?, ?) on conflict (value, term) do nothing')
        },
        aggregations: {
            get: prepare('select rowid from aggregations where facets = ? and scalar = ?'),
            getByLength: prepare(
                'select facets, count from aggregations where length(facets) = ?'
            ),
            getByFacets: prepare('select scalar, min, max, avg from aggregations where facets = ?'),
            create: prepare(
                'insert into aggregations (facets, scalar) values (?, ?) returning rowid'
            ),
            build: prepare(
                `update aggregations set count = a.count, min = a.min, max = a.max, avg = a.avg
                from (select aggregation, count(rowid) count, min(value) min, max(value) max, avg(value) avg from results group by aggregation) a
                where rowid = a.aggregation`
            )
        },
        documents: {
            get: prepare('select value from documents where rowid = ?'),
            create: prepare(
                'insert into documents (value) values (?) returning rowid'
            ),
            upsert: prepare(
                'insert into documents (rowid, value) values (?, ?) on conflict do update set value = ? where rowid = ? returning rowid'
            )
        },
        results: {
            // Non-paginated query
            get: {
                asc: prepare(
                    'select document from results where aggregation = ? order by value, document limit ?'
                ),
                desc: prepare(
                    'select document from results where aggregation = ? order by value desc, document limit ?'
                )
            },
            // Paginated query
            getAfter: {
                asc: prepare(
                    'select document from results where aggregation = ? and value >= ? and document > ? order by value, document limit ?'
                ),
                desc: prepare(
                    'select document from results where aggregation = ? and value <= ? and document > ? order by value desc, document limit ?'
                )
            },
            create: prepare(
                'insert into results (document, aggregation, value) values (?, ?, ?)'
            ),
            clear: prepare('delete from results where document = ?')
        }
    }
}
