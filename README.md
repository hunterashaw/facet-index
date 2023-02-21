# SQLite Faceted Search

This is an implementation of [faceted search](https://en.wikipedia.org/wiki/Faceted_search) using [SQLite3](https://www.sqlite.org/index.html) and the [bun](https://bun.sh/) javascript runtime.

## Goal
A lightweight but powerful faceted-search tool (like those used in eCommerce) that can power rich search results pages.

## Features
 - ~20ms response times (on 1 million documents)
 - Facet aggregations
 - Scalable - tested with 1 million documents
 - Durable - [SQLite3 is ACID compliant](https://www.sqlite.org/transactional.html)
 - Efficient - Uses orders of magnitude less memory & CPU during indexing & querying (compared to [Elasticsearch](https://www.elastic.co/))
 - Dynamic indexing

## WIP
Left to finish:
 - Sort after
 - Aggregation cache (buildable)
 - Don't split facets on space
 - Sort options on aggregations?