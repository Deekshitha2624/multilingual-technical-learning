// Splits a long lesson into pieces that fit comfortably in one model call.
// Splits on paragraphs first, then sentences, and only hard-cuts as a last resort.
export function splitIntoChunks(text: string, max: number): string[] {
  if (!Number.isInteger(max) || max < 1) throw new Error('Chunk size must be a positive integer.');
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const pieces: string[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph.length <= max) {
      pieces.push(paragraph);
      continue;
    }
    let buffer = '';
    for (const sentence of paragraph.split(/(?<=[.!?।])\s+/)) {
      if (sentence.length > max) {
        if (buffer) pieces.push(buffer);
        buffer = '';
        for (let i = 0; i < sentence.length; i += max) pieces.push(sentence.slice(i, i + max));
        continue;
      }
      const candidate = buffer ? `${buffer} ${sentence}` : sentence;
      if (candidate.length > max) {
        if (buffer) pieces.push(buffer);
        buffer = sentence;
      } else {
        buffer = candidate;
      }
    }
    if (buffer) pieces.push(buffer);
  }

  const chunks: string[] = [];
  let current = '';
  for (const piece of pieces) {
    if (current && current.length + 2 + piece.length > max) {
      chunks.push(current);
      current = piece;
    } else {
      current = current ? `${current}\n\n${piece}` : piece;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

// Runs an async mapper over items with a fixed concurrency, keeping result order.
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('Concurrency limit must be a positive integer.');
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}
