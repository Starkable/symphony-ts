# V1.3 stage output schemas (stubs)

Schema ids referenced by `output_schema` in WORKFLOW (e.g. `review@v1`) are validated
incrementally. Gate `schema_valid` currently enforces JSON shape for `review.json`
and file presence for other deliverables.

Future: add JSON Schema files per id in this directory.
