# Prompt Engineering

A prompt is the full input given to a language model, and its structure
strongly shapes the output. Most production prompts are assembled from several
parts: a **system message** that sets the model's role and rules, the retrieved
**context** from RAG, the **conversation history**, any **tool results**, and
finally the user's current message. Understanding what actually gets sent is one
of the most useful debugging skills in AI engineering.

The system message is where you encode behavior: the persona, the tone, hard
constraints, and instructions about how to use the provided context. A good
system prompt tells the model to ground its answers in the retrieved context and
to say when it does not know, rather than inventing facts.

Order and formatting matter. Models pay more attention to the beginning and end
of a long prompt, so the most important instructions belong there. Clear
delimiters — headings, fenced blocks, labels like "Retrieved context" — help the
model separate instructions from data and reduce the chance it confuses the two.

Prompt engineering is iterative. Small wording changes can have outsized effects,
so it pays to inspect the assembled prompt, change one thing at a time, and
evaluate against real examples. The prompt is not an afterthought; it is part of
the system's logic.
