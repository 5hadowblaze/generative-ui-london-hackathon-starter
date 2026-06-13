export function GET() {
  return Response.json({
    threads: [],
    hasMore: false,
    nextCursor: null,
  });
}
