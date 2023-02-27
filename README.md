# SQLite-Backed Faceted-Document Store

This is a faceted document store that can be used to power [faceted search](https://en.wikipedia.org/wiki/Faceted_search) or other listings that require fast (<10ms) response times.

It is designed be a lightweight replacement for [Elasticsearch](https://www.elastic.co/) in these use cases.

It uses [SQLite3](https://www.sqlite.org/index.html) and the [bun](https://bun.sh/) javascript runtime.

## Features
 - Single-digit millisecond response times
 - Provides aggregations (count, min, max, average) and query permutations
 - Lightweight - Uses orders of magnitude less memory & CPU than [Elasticsearch](https://www.elastic.co/)

