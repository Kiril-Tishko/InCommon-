/**
 * Splits a JSON document into the objects found at a given nesting depth,
 * without ever holding the whole document as one string. Takeout files can be
 * hundreds of megabytes, which is more than a phone browser will JSON.parse.
 *
 *   depth 1: `[ {…}, {…} ]`                      (My Activity)
 *   depth 2: `{ "Browser History": [ {…}, … ] }`  (Chrome)
 */
export class JsonObjectSplitter {
  private depth = 0;
  private inString = false;
  private escaped = false;
  private capturing = false;
  private carry: string[] = [];

  constructor(
    private readonly targetDepth: number,
    private readonly onObject: (json: string) => void,
  ) {}

  push(chunk: string): void {
    let start = this.capturing ? 0 : -1;
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk.charCodeAt(i);
      if (this.inString) {
        if (this.escaped) this.escaped = false;
        else if (c === 92 /* \ */) this.escaped = true;
        else if (c === 34 /* " */) this.inString = false;
        continue;
      }
      if (c === 34) {
        this.inString = true;
      } else if (c === 123 /* { */ || c === 91 /* [ */) {
        if (c === 123 && !this.capturing && this.depth === this.targetDepth) {
          this.capturing = true;
          start = i;
        }
        this.depth++;
      } else if (c === 125 /* } */ || c === 93 /* ] */) {
        this.depth--;
        if (this.capturing && this.depth === this.targetDepth) {
          this.carry.push(chunk.slice(start, i + 1));
          const text = this.carry.join("");
          this.carry = [];
          this.capturing = false;
          start = -1;
          this.onObject(text);
        }
      }
    }
    if (this.capturing) this.carry.push(chunk.slice(start));
  }
}
