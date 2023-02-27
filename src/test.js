import DocumentStore from './search'

const search = new DocumentStore('store.db')

/**
 * Create sample documents
 * @param {number} count
 */
function populate(count) {
    search.clearSchema()
    console.log(`Indexing ${count} documents:`)

    const names = [
        '10ft cable',
        'neat trucker hat',
        'good table',
        'oval mirror',
        'neat desk',
        'comfortable chair',
        'fast computer',
        'large tv',
        'square small mousepad',
        'small monitor',
        'big screen',
        '4in phone',
        'large book',
        'white paper',
        'camping watter bottle',
        'good camping food'
    ]
    const materials = [
        'stone',
        'brick',
        'wood',
        'steel',
        'aluminum',
        'leather',
        'cotton',
        'plastic'
    ]
    const colors = [
        'black',
        'red',
        'green',
        'yellow',
        'beige',
        'gray',
        'toupe',
        'magenta',
        'blue',
        'purple'
    ]
    const random = array => array[Math.floor(Math.random() * array.length)]

    const start = performance.now()
    for (let i = 0; i < count; i++) {
        if (i % 100 === 0) console.log(`${((i / count) * 100).toFixed(1)}%`)
        search.index({
            name: random(names).split(' '),
            price: parseFloat((Math.random() * 1000).toFixed(2)),
            material: random(materials),
            color: random(colors)
        })
    }
    console.log(
        `Indexing ${count} documents took: ${
            Math.floor(performance.now() - start) / 1000
        } seconds`
    )

    console.log('Building aggregations')
    search.buildAggregations()
    console.log('Vacuuming')
    search.vacuum()
    console.log('Done')
}

populate(100000)

search.close()