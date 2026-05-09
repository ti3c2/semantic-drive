# History of developments


### Initial prompt
Let's plan out my new project - Semantic Drive.

The idea is to make a very interactive and fast storage for media files with search.

User path:
- User drops a file there: image, video, audio. You might do it however you want: paste from clipboard or upload file. If the image has text on it, it gets transcribed to become searchable, the audio gets transcribed, the video also (transcribe audio from video). For now we can do this all via openai API. This content gets embedded (via openai embeddings) and stored in Qdrant DB.
- User might add title, description, tags to it or to organize it in a folder.
- Then there is a searchbar, user enters query there and the system performs search and provides the user with the closest results. I would also test the Cohere's reranking via API.
- The user picks the image they want and can use it in multiple ways: copy to clipboard, download as a file, or copy an embeddable link (currently I am not sure how these are made, but I see in messengers people send things and they are represented as downloaded files).

Minimalistic design, intuitive interface, clear features, zero friction.

Are there such tools on the market already?

Suggest design and an detailed implementation plan for a coding agent. We use python for backend and Astra for frontend.

