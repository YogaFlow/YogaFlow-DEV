type SessionHttpHandler = (url: string, response: Response) => void;

let handler: SessionHttpHandler | null = null;

export function setSessionHttpHandler(next: SessionHttpHandler): void {
  handler = next;
}

export function notifySessionHttp(url: string, response: Response): void {
  handler?.(url, response);
}

export function resolveRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}
