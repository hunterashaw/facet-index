import DocumentStore from './search'

const index = new DocumentStore('store.db')

const endpoints = {
    /**
     * @param {Request} request
     */
    'POST/results': request => {
        try {
            const start = performance.now()
            const results = index.getResults(request.body)
            const aggregations = index.getAggregations(request.body?.filters)
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
