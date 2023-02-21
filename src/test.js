import FacetedSearch from './search'

const search = new FacetedSearch('store.db')

/**
 * Create sample documents
 * @param {number} count
 */
function populate(count) {
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
        search.createDocument({
            name: random(names),
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

    search.vacuum()
}

const getResults = parameters => {
    const start = performance.now()
    const results = search.getResults(parameters)
    console.log('getResults took:', Math.floor(performance.now() - start), 'ms')
    return results
}

const getAggregations = parameters => {
    const start = performance.now()
    const results = search.getAggregations(parameters.facets)
    console.log(
        'getAggregations took:',
        Math.floor(performance.now() - start),
        'ms'
    )
    return results
}

const parameters = {
    sort_by: 'price'
}

const facetSets = [
    ['material:wood', 'name:hat'],
    ['material:steel'],
    ['material:wood', 'name:tv'],
    ['color:black', 'material:wood'],
    ['name:fast', 'color:red'],
    ['name:oval'],
    ['color:toupe']
]
const random = array => array[Math.floor(Math.random() * array.length)]

for (let i = 0; i < 10; i++) {
    const facets = random(facetSets)
    getAggregations({ ...parameters, facets })
    getResults({ ...parameters, facets })
}
