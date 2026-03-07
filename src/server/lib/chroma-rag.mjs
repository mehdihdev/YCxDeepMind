/**
 * Chroma RAG for Forge RDE
 *
 * Indexes PDF datasheets and provides RAG-based Q&A for part compatibility
 * and specification queries.
 *
 * Environment variables:
 * - CHROMA_HOST: Chroma server host (default: localhost)
 * - CHROMA_PORT: Chroma server port (default: 8000)
 * - GOOGLE_AI_API_KEY: For embeddings via Gemini
 */

const CHROMA_HOST = process.env.CHROMA_HOST || "localhost";
const CHROMA_PORT = process.env.CHROMA_PORT || "8000";
const CHROMA_URL = `http://${CHROMA_HOST}:${CHROMA_PORT}`;
const COLLECTION_NAME = "forge_datasheets";

// In-memory fallback when Chroma is not available
let inMemoryStore = {
  documents: [],
  embeddings: [],
  metadatas: [],
  ids: []
};

let chromaAvailable = null;

/**
 * Check if Chroma server is available
 */
async function isChromaAvailable() {
  if (chromaAvailable !== null) return chromaAvailable;

  try {
    const response = await fetch(`${CHROMA_URL}/api/v1/heartbeat`, {
      method: "GET",
      signal: AbortSignal.timeout(2000)
    });
    chromaAvailable = response.ok;
  } catch {
    chromaAvailable = false;
  }

  if (!chromaAvailable) {
    console.warn("Chroma not available, using in-memory vector store");
  }

  return chromaAvailable;
}

/**
 * Get or create collection
 */
async function getCollection() {
  if (!(await isChromaAvailable())) {
    return null;
  }

  try {
    // Try to get existing collection
    const getResponse = await fetch(
      `${CHROMA_URL}/api/v1/collections/${COLLECTION_NAME}`,
      { method: "GET" }
    );

    if (getResponse.ok) {
      return await getResponse.json();
    }

    // Create new collection
    const createResponse = await fetch(`${CHROMA_URL}/api/v1/collections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: COLLECTION_NAME,
        metadata: { description: "Forge RDE datasheet embeddings" }
      })
    });

    if (createResponse.ok) {
      return await createResponse.json();
    }

    return null;
  } catch (error) {
    console.error("Error getting/creating Chroma collection:", error.message);
    return null;
  }
}

/**
 * Generate embeddings using Gemini
 * Falls back to simple TF-IDF-like approach if API unavailable
 */
async function generateEmbeddings(texts) {
  const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    // Simple fallback: create basic embeddings from text
    return texts.map((text) => createSimpleEmbedding(text));
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/embedding-001:embedContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/embedding-001",
          content: {
            parts: texts.map((t) => ({ text: t }))
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Embedding API error: ${response.status}`);
    }

    const data = await response.json();
    return data.embedding?.values ? [data.embedding.values] : texts.map(createSimpleEmbedding);
  } catch (error) {
    console.error("Embedding generation error:", error.message);
    return texts.map(createSimpleEmbedding);
  }
}

/**
 * Simple embedding fallback using character n-grams
 */
function createSimpleEmbedding(text) {
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  const words = normalized.split(/\s+/).filter(Boolean);

  // Create a simple 256-dimensional embedding from word hashes
  const embedding = new Array(256).fill(0);

  for (const word of words) {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = ((hash << 5) - hash + word.charCodeAt(i)) | 0;
    }
    const index = Math.abs(hash) % 256;
    embedding[index] += 1;
  }

  // Normalize
  const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0)) || 1;
  return embedding.map((v) => v / magnitude);
}

/**
 * Calculate cosine similarity between two embeddings
 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB) || 1);
}

/**
 * Chunk text into smaller pieces for indexing
 */
function chunkText(text, chunkSize = 500, overlap = 50) {
  const words = text.split(/\s+/);
  const chunks = [];

  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunk = words.slice(i, i + chunkSize).join(" ");
    if (chunk.length > 50) {
      chunks.push(chunk);
    }
  }

  return chunks;
}

/**
 * Extract text from PDF buffer
 * Note: Requires pdf-parse to be installed
 */
async function extractPdfText(pdfBuffer) {
  try {
    // Dynamic import to avoid issues if pdf-parse not installed
    const pdfParse = await import("pdf-parse").then((m) => m.default || m);
    const data = await pdfParse(pdfBuffer);
    return data.text;
  } catch (error) {
    console.error("PDF extraction error:", error.message);
    return "";
  }
}

/**
 * Index a datasheet into the vector store
 * @param {Buffer|string} content - PDF buffer or text content
 * @param {object} metadata - Part metadata (title, partId, url, etc.)
 * @returns {Promise<{success: boolean, chunkCount: number}>}
 */
export async function indexDatasheet(content, metadata) {
  let text = "";

  if (Buffer.isBuffer(content)) {
    text = await extractPdfText(content);
  } else {
    text = String(content);
  }

  if (!text || text.length < 100) {
    return { success: false, chunkCount: 0, error: "Insufficient content" };
  }

  const chunks = chunkText(text);
  const embeddings = await generateEmbeddings(chunks);
  const ids = chunks.map((_, i) => `${metadata.partId || "unknown"}-${i}-${Date.now()}`);
  const metadatas = chunks.map(() => ({
    ...metadata,
    indexedAt: new Date().toISOString()
  }));

  const collection = await getCollection();

  if (collection) {
    // Add to Chroma
    try {
      await fetch(`${CHROMA_URL}/api/v1/collections/${collection.id}/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids,
          embeddings,
          documents: chunks,
          metadatas
        })
      });
    } catch (error) {
      console.error("Chroma add error:", error.message);
    }
  }

  // Also store in memory (backup / fallback)
  inMemoryStore.ids.push(...ids);
  inMemoryStore.documents.push(...chunks);
  inMemoryStore.embeddings.push(...embeddings);
  inMemoryStore.metadatas.push(...metadatas);

  return { success: true, chunkCount: chunks.length };
}

/**
 * Query datasheets using semantic search
 * @param {string} question - Natural language question
 * @param {object} filters - Optional metadata filters
 * @returns {Promise<Array<{text: string, metadata: object, score: number}>>}
 */
export async function queryDatasheets(question, filters = {}) {
  const queryEmbedding = (await generateEmbeddings([question]))[0];
  const nResults = 5;

  const collection = await getCollection();

  if (collection) {
    try {
      const response = await fetch(
        `${CHROMA_URL}/api/v1/collections/${collection.id}/query`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query_embeddings: [queryEmbedding],
            n_results: nResults,
            where: Object.keys(filters).length ? filters : undefined
          })
        }
      );

      if (response.ok) {
        const data = await response.json();
        const documents = data.documents?.[0] || [];
        const metadatas = data.metadatas?.[0] || [];
        const distances = data.distances?.[0] || [];

        return documents.map((doc, i) => ({
          text: doc,
          metadata: metadatas[i],
          score: 1 - (distances[i] || 0) // Convert distance to similarity
        }));
      }
    } catch (error) {
      console.error("Chroma query error:", error.message);
    }
  }

  // Fallback to in-memory search
  if (inMemoryStore.documents.length === 0) {
    return [];
  }

  const scores = inMemoryStore.embeddings.map((emb, i) => ({
    index: i,
    score: cosineSimilarity(queryEmbedding, emb)
  }));

  scores.sort((a, b) => b.score - a.score);

  return scores.slice(0, nResults).map((s) => ({
    text: inMemoryStore.documents[s.index],
    metadata: inMemoryStore.metadatas[s.index],
    score: s.score
  }));
}

/**
 * Find compatible parts for a requirement using RAG
 * @param {object} requirement - Requirement object with title/description
 * @returns {Promise<Array<{text: string, metadata: object, score: number}>>}
 */
export async function findCompatibleParts(requirement) {
  const query = `${requirement.title} ${requirement.description || ""} compatible specifications`;
  return queryDatasheets(query);
}

/**
 * Answer a question about indexed datasheets using RAG
 * @param {string} question - User's question
 * @param {string} partId - Optional: limit to specific part
 * @returns {Promise<{answer: string, sources: Array}>}
 */
export async function askAboutDatasheet(question, partId = null) {
  const filters = partId ? { partId } : {};
  const relevantChunks = await queryDatasheets(question, filters);

  if (relevantChunks.length === 0) {
    return {
      answer: "No relevant datasheet information found. Try indexing a datasheet first.",
      sources: []
    };
  }

  // Build context from relevant chunks
  const context = relevantChunks
    .slice(0, 3)
    .map((chunk, i) => `[Source ${i + 1}]: ${chunk.text}`)
    .join("\n\n");

  // Generate answer using Gemini
  const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    // Return raw chunks if no API key
    return {
      answer: `Based on the datasheet:\n\n${relevantChunks[0].text.slice(0, 500)}...`,
      sources: relevantChunks.map((c) => c.metadata)
    };
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `You are a robotics engineer assistant. Answer the following question using ONLY the provided datasheet excerpts. Be concise and technical.

Question: ${question}

Datasheet excerpts:
${context}

Answer:`
                }
              ]
            }
          ],
          generationConfig: {
            maxOutputTokens: 500,
            temperature: 0.3
          }
        })
      }
    );

    if (response.ok) {
      const data = await response.json();
      const answer =
        data.candidates?.[0]?.content?.parts?.[0]?.text ||
        "Unable to generate answer from datasheet.";

      return {
        answer,
        sources: relevantChunks.map((c) => ({
          title: c.metadata.title,
          partId: c.metadata.partId,
          url: c.metadata.url,
          score: c.score
        }))
      };
    }
  } catch (error) {
    console.error("RAG answer generation error:", error.message);
  }

  return {
    answer: relevantChunks[0].text.slice(0, 500),
    sources: relevantChunks.map((c) => c.metadata)
  };
}

/**
 * Download and index a datasheet from URL
 * @param {string} url - PDF or webpage URL
 * @param {object} metadata - Part metadata
 * @returns {Promise<{success: boolean, chunkCount: number}>}
 */
export async function indexDatasheetFromUrl(url, metadata) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
      }
    });

    if (!response.ok) {
      return { success: false, error: `Failed to fetch: ${response.status}` };
    }

    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("pdf")) {
      const buffer = Buffer.from(await response.arrayBuffer());
      return indexDatasheet(buffer, { ...metadata, url, type: "pdf" });
    }

    // HTML page - extract text
    const html = await response.text();
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return indexDatasheet(textContent, { ...metadata, url, type: "html" });
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get stats about indexed datasheets
 */
export async function getIndexStats() {
  const collection = await getCollection();
  let chromaCount = 0;

  if (collection) {
    try {
      const response = await fetch(
        `${CHROMA_URL}/api/v1/collections/${collection.id}/count`,
        { method: "GET" }
      );
      if (response.ok) {
        chromaCount = await response.json();
      }
    } catch {
      // ignore
    }
  }

  return {
    chromaAvailable: chromaAvailable === true,
    chromaDocuments: chromaCount,
    inMemoryDocuments: inMemoryStore.documents.length,
    totalChunks: chromaCount + inMemoryStore.documents.length
  };
}

export default {
  indexDatasheet,
  indexDatasheetFromUrl,
  queryDatasheets,
  findCompatibleParts,
  askAboutDatasheet,
  getIndexStats
};
