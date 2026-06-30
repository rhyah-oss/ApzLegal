#!/usr/bin/env bash
# Create Lexora Qdrant collections on shared instance (do not touch knowledge_*).
set -euo pipefail

QDRANT_URL="${QDRANT_URL:-http://127.0.0.1:6333}"
PREFIX="${QDRANT_COLLECTION_PREFIX:-lexora_}"
VECTOR_SIZE="${VECTOR_SIZE:-768}"

COLLECTIONS=(
  "${PREFIX}documents"
  "${PREFIX}legislation"
  "${PREFIX}corpus"
)

for name in "${COLLECTIONS[@]}"; do
  echo "Creating collection: $name"
  curl -sf -X PUT "${QDRANT_URL}/collections/${name}" \
    -H 'Content-Type: application/json' \
    -d "{
      \"vectors\": {
        \"size\": ${VECTOR_SIZE},
        \"distance\": \"Cosine\"
      }
    }" | python3 -m json.tool 2>/dev/null || echo "  -> created or already exists"
done

echo ""
curl -sf "${QDRANT_URL}/collections" | python3 -c "
import json, sys
data = json.load(sys.stdin)
names = [c['name'] for c in data['result']['collections'] if c['name'].startswith('${PREFIX}')]
print('Lexora collections:', ', '.join(names) or '(none)')
"
