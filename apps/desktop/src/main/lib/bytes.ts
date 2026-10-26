/**
 * A reader for a fetch response body. Node's types declare the body as
 * ReadableStream<any>; it always yields bytes, so this cast is safe.
 */
export function byteReader(body: ReadableStream): ReadableStreamDefaultReader<Uint8Array> {
  return (body as ReadableStream<Uint8Array>).getReader();
}
