/**
 * Prepare queries
 * @param {Database} db
 */
export default function getQueries(db) {
    return {
        schema: {
            drops: [
                'drop table if exists facets',
                'drop table if exists facet_aggregations',
                'drop table if exists facet_aggregation_scalars',
                'drop table if exists scalars',
                'drop table if exists documents',
                'drop table if exists document_facets',
                'drop table if exists document_scalars'
            ],
            tables: [
                'create table if not exists documents (value text)',
                'create table if not exists facets (name text unique)',
                'create table if not exists facet_aggregations (facets blob unique, count integer)',
                'create table if not exists facet_aggregation_scalars (facets blob, scalar integer, min real, max real, avg real)',
                'create table if not exists document_facets (document integer, facets blob)',
                'create table if not exists scalars (name text unique, min real, max real, avg real)',
                'create table if not exists document_scalars (document integer, scalar integer, value integer)'
            ],
            indexes: [
                'create unique index if not exists facet_aggregation_scalars_facets on facet_aggregation_scalars (facets, scalar)',
                'create index if not exists document_facets_facets on document_facets (facets, document)',
                'create index if not exists document_facets_document on document_facets (document)',
                'create index if not exists document_scalars_sort on document_scalars (document, scalar, value)'
            ]
        },
        vacuum: db.prepare('vacuum'),
        facets: {
            get: db.prepare('select rowid from facets where name = ?'),
            all: db.prepare('select rowid, name from facets'),
            aggregations: {
                build: db.prepare(
                    `insert into facet_aggregations (facets, count)
                    select facets, count(*) as count from document_facets
                    group by facets
                    on conflict (facets) do update set count = count where facets = facets`
                ),
                getByLength: db.prepare(
                    'select facets, count from facet_aggregations where length(facets) = ?'
                )
            },
            create: db.prepare(
                'insert into facets (name) values (?) returning rowid'
            )
        },
        scalars: {
            get: db.prepare('select rowid from scalars where name = ?'),
            all: db.prepare('select rowid, name from scalars'),
            create: db.prepare(
                'insert into scalars (name) values (?) returning rowid'
            ),
            aggregations: {
                build: db.prepare(
                    `insert into facet_aggregation_scalars (facets, scalar, min, max, avg)
                    select
                        facet_aggregations.facets,
                        document_scalars.scalar,
                        min(document_scalars.value) as min,
                        max(document_scalars.value) as max,
                        avg(document_scalars.value) as avg
                    from facet_aggregations
                    join document_facets on facet_aggregations.facets = document_facets.facets
                    join document_scalars on document_facets.document = document_scalars.document
                    group by facet_aggregations.facets, document_scalars.scalar
                    on conflict (facets, scalar) do update set min = min, max = max, avg = avg where facets = facets and scalar = scalar`
                ),
                buildUnfiltered: db.prepare(
                    `update scalars set min = b.min, max = b.max, avg = b.avg from (
                        select scalar, min(value) as min, max(value) as max, avg(value) as avg from document_scalars group by scalar
                    ) as b where rowid = b.scalar`
                ),
                getUnfiltered: db.prepare(
                    'select name, min, max, avg from scalars'
                ),
                getByFacets: db.prepare(
                    `select name, facet_aggregation_scalars.min, facet_aggregation_scalars.max, facet_aggregation_scalars.avg from facet_aggregation_scalars
                    join scalars on facet_aggregation_scalars.scalar = scalars.rowid
                    where facets = ?`
                )
            }
        },
        document: {
            create: db.prepare(
                'insert into documents (value) values (?) returning rowid'
            ),
            get: db.prepare('select value from documents where rowid = ?'),
            countOne: db.prepare('select count(rowid) as count from documents where rowid = ?'),
            update: db.prepare(
                'update documents set value = ? where rowid = ? returning rowid'
            ),
            facets: {
                clear: db.prepare(
                    'delete from document_facets where document = ?'
                ),
                create: db.prepare(
                    'insert into document_facets (document, facets) values (?, ?)'
                )
            },
            scalars: {
                clear: db.prepare(
                    'delete from document_scalars where document = ?'
                ),
                create: db.prepare(
                    'insert into document_scalars (document, scalar, value) values (?, ?, ?)'
                )
            }
        },
        search: {
            unfiltered: {
                asc: db.prepare(
                    'select document from document_scalars where scalar = ? order by document_scalars.value limit ? offset ?'
                ),
                desc: db.prepare(
                    'select document from document_scalars where scalar = ? order by document_scalars.value desc limit ? offset ?'
                )
            },
            filtered: {
                asc: db.prepare(
                    `select document_facets.document from document_facets
                    join document_scalars on document_facets.document = document_scalars.document
                    and document_scalars.scalar = ?
                    where facets = ?
                    order by document_scalars.value
                    limit ? offset ?`
                ),
                desc: db.prepare(
                    `select document_facets.document from document_facets
                    join document_scalars on document_facets.document = document_scalars.document
                    and document_scalars.scalar = ?
                    where facets = ?
                    order by document_scalars.value desc
                    limit ? offset ?`
                )
            }
        }
    }
}
