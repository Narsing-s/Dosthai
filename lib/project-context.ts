const COOKIE_NAME = 'dosthai-project-context';
const MAX_CONTEXT = 3500;

function decode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return '';
  }
}

export function readProjectContext(request: Request) {
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.split(';').map(part => part.trim()).find(part => part.startsWith(`${COOKIE_NAME}=`));
  if (!match) return '';
  const value = decode(match.slice(COOKIE_NAME.length + 1));
  return value.slice(0, MAX_CONTEXT).trim();
}

export { COOKIE_NAME, MAX_CONTEXT };
