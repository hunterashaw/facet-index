/**
 * Prepare queries
 * @param {Database} db
 */
export default function getQueries(db) {
    return {
        schema: {
            drops: [
                'drop table if exists facets',
                'drop table if exists scalars',
                'drop table if exists documents',
                'drop table if exists document_facets',
                'drop table if exists document_scalars'
            ],
            tables: [
                'create table if not exists documents (value text)',
                'create table if not exists facets (name text unique)',
                'create table if not exists document_facets (document integer, facets blob)',
                'create table if not exists scalars (name text unique)',
                'create table if not exists document_scalars (document integer, scalar integer, value integer)'
            ],
            indexes: [
                'create index if not exists document_facets_facets on document_facets (facets, document)',
                'create index if not exists document_facets_document on document_facets (document)',
                'create index if not exists document_scalars_sort on document_scalars (document, scalar, value)'
            ]
        },
        vacuum: db.prepare('vacuum'),
        facets: {
            get: db.prepare('select rowid from facets where name = ?'),
            all: db.prepare('select rowid, name from facets'),
            count: db.prepare('select count(*) as count from document_facets where facets = ?'),
            countByLength: db.prepare('select facets, count(*) from document_facets where length(facets) = ? group by facets'),
            create: db.prepare(
                'insert into facets (name) values (?) returning rowid'
            )
        },
        scalars: {
            get: db.prepare('select rowid from scalars where name = ?'),
            all: db.prepare('select rowid, name from scalars'),
            create: db.prepare(
                'insert into scalars (name) values (?) returning rowid'
            )
        },
        document: {
            create: db.prepare(
                'insert into documents (value) values (?) returning rowid'
            ),
            get: db.prepare('select value from documents where rowid = ?'),
            update: db.prepare('update documents set value = ? where rowid = ?'),
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
                asc: db.prepare('select document from document_scalars where scalar = ? order by document_scalars.value limit ? offset ?'),
                desc: db.prepare('select document from document_scalars where scalar = ? order by document_scalars.value desc limit ? offset ?')
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
