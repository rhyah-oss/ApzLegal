import { AdminSection } from "@/components/admin/admin-section";

export default function AdminAiPage() {
  return (
    <AdminSection
      title="AI Model Settings"
      headers={["Setting", "Value"]}
      rows={[
        ["Provider", "Ollama (local)"],
        ["Base URL", "http://ollama:11434/v1"],
        ["Text model", "qwen2.5:32b"],
        ["Embed model", "nomic-embed-text"],
        ["Max concurrency", "1"],
        ["Timeout", "300s"],
        ["Jurisdiction default", "South Africa"],
      ]}
    />
  );
}
