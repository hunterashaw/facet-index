import FacetedSearch from './search'

const index = new FacetedSearch('store.db')

const endpoints = {
    /**
     * @param {Request} request
     */
    'POST/results': request => {
        try {
            const start = performance.now()
            const results = index.getResults(request.body)
            const aggregations = index.getAggregations(request.body?.facets)
            const took = Math.floor(performance.now() - start)
            return new Response(JSON.stringify({
                results,
                aggregations,
                took
            }), {
                headers: {
                    'content-type': 'application/json'
                }
            })
        }
        catch (e) {
            console.error(e)
            return new Response(e.message, {status: 400})
        }
    },
    'POST/maintain': () => {
        console.log('Maintenance started.')
        const start = performance.now()
        index.buildAggregations()
        index.vacuum()
        const took = Math.floor((performance.now() - start) / 1000)
        console.log(`Maintenance finished. Took: ${took} seconds.`)
        return new Response(`Maintenance finished. Took: ${took} seconds.`)
    }
}

export default {
    /**
     * @param {Request} request
     */
    async fetch(request) {
        try {
            const url = new URL(request.url)
            const endpoint = request.method + url.pathname
            if (endpoints[endpoint]) {
                let body
                if (request.headers.get('content-type') === 'application/json')
                    body = await request.json()
                return endpoints[endpoint]({
                    ...request,
                    body,
                    url
                })
            }
    
            return new Response(undefined, { status: 404 })
        }
        catch (e) {
            console.error(e)
            return new Response(undefined, {status: 500})
        }
    }
}
