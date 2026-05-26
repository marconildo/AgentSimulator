# Embeddings and Vector Search

An embedding is a list of numbers — a vector — that represents the meaning of a
piece of text. Texts with similar meaning map to vectors that are close together
in this high-dimensional space, while unrelated texts map far apart. Embeddings
are what make semantic search possible: you can find relevant text even when it
shares no exact words with the query.

To compare two embeddings, vector databases use a distance or similarity metric.
**Cosine similarity** measures the angle between two vectors and ignores their
magnitude, which makes it the most common choice for text. A cosine similarity
of 1.0 means the vectors point in the same direction (very similar), 0.0 means
they are unrelated, and negative values mean they point in opposite directions.
Some systems report cosine *distance*, which is simply one minus the similarity.

A **vector database** such as Chroma stores embeddings alongside the original
text and metadata, and provides fast approximate nearest-neighbor search.
Instead of comparing the query against every stored vector, it uses an index
(commonly HNSW, a navigable small-world graph) to find the closest vectors in
sub-linear time. This is what lets retrieval stay fast as the corpus grows to
millions of chunks.

The embedding model used for ingestion must be the same one used for queries.
Vectors from different models live in different spaces and are not comparable.
This is why switching embedding models requires re-indexing the entire corpus.
