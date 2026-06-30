import { AdminSection } from "@/components/admin/admin-section";
import { StatusPill } from "@/components/ui/primitives";

export default function AdminHealthPage() {
  return (
    <AdminSection
      title="Deployment Health"
      headers={["Service", "Endpoint", "Status"]}
      rows={[
        ["Web app", "localhost:8100", <StatusPill key="1" status="verified" />],
        ["PostgreSQL", "postgres:5432", <StatusPill key="2" status="verified" />],
        ["Redis", "redis:6379", <StatusPill key="3" status="verified" />],
        ["MinIO", "minio:9000", <StatusPill key="4" status="verified" />],
        ["Qdrant", "qdrant:6333", <StatusPill key="5" status="verified" />],
        ["OpenSearch", "opensearch:9200", <StatusPill key="6" status="pending" />],
        ["Ollama", "ollama:11434", <StatusPill key="7" status="verified" />],
      ]}
    />
  );
}
