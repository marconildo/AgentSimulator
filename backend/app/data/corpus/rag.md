# Retrieval-Augmented Generation (RAG)

Retrieval-Augmented Generation is a pattern that grounds a language model in
external knowledge. Instead of relying only on what the model memorized during
training, the system retrieves relevant documents at query time and places them
in the prompt as context. This reduces hallucinations and lets the model answer
questions about private or recent data it never saw during training.

A typical RAG pipeline has two phases. The offline **ingestion** phase loads
source documents, splits them into chunks, computes an embedding vector for each
chunk, and stores those vectors in a vector database. The online **retrieval**
phase embeds the user's query with the same model, performs a nearest-neighbor
search to find the most similar chunks, and injects the top matches into the
prompt sent to the LLM.

Chunking matters: chunks that are too large dilute relevance and waste context
tokens, while chunks that are too small lose meaning. A common starting point is
a few hundred tokens per chunk with some overlap so ideas that straddle a
boundary are not cut in half. The number of chunks retrieved is the parameter
`k` (top-k); larger `k` increases recall but costs more tokens and can add noise.

The quality of a RAG system depends on retrieval quality. If the right chunk is
never retrieved, no amount of prompting will recover the answer. This is why
embedding choice, chunking strategy, and the similarity metric are the levers
that most affect RAG accuracy.
