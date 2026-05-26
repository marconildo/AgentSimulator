# Large Language Models and Tokens

A large language model predicts the next token given the tokens before it. A
**token** is a chunk of text — often a word fragment of a few characters — and
the model works entirely in terms of tokens, not characters or words. Both the
input prompt and the generated output are measured in tokens, and that count
drives both cost and latency.

Generation is **autoregressive**: the model produces one token at a time, and
each new token is appended to the input before predicting the next. This is why
responses can be streamed — the application can display each token the moment it
is produced instead of waiting for the whole answer. It is also why longer
answers take longer: every token is a separate forward pass through the network.

Two knobs control the style of generation. **Temperature** scales randomness:
near zero the model picks the most likely token almost every time (deterministic
and focused), while higher values sample more diverse, creative continuations.
The **context window** is the maximum number of tokens the model can attend to
at once; everything — system prompt, retrieved context, history, and the answer
being generated — must fit inside it.

Because models are stateless between calls, the application is responsible for
managing context: deciding what history to keep, what to retrieve, and what to
drop when the window fills up. Managing the context window well is a core part
of building reliable LLM applications.
