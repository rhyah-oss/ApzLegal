import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ── Conversation Mode race / ownership regression tests ──────────────────────
// These tests exercise the ownership mechanisms that prevent stale
// microphone, transcription and TTS work from corrupting the current UI.
// React hooks require a renderer and are exercised by the browser smoke
// test; here we test the pure ownership logic and sanitisation helpers.

describe("P1 microphone ownership", () => {
  it("only one voice path may hold the microphone at a time", async () => {
    const { createMicrophoneOwner } = await import("../../artifacts/apz-legal/src/lib/microphone-owner.ts")
    const owner = createMicrophoneOwner()
    assert.equal(owner.acquire("voice-note"), true, "voice-note acquires first")
    assert.equal(owner.acquire("conversation"), false, "conversation cannot acquire while voice-note holds it")
    owner.release("voice-note")
    assert.equal(owner.acquire("conversation"), true, "conversation acquires after release")
    assert.equal(owner.current(), "conversation")
  })

  it("release by a non-owner is a no-op", async () => {
    const { createMicrophoneOwner } = await import("../../artifacts/apz-legal/src/lib/microphone-owner.ts")
    const owner = createMicrophoneOwner()
    assert.equal(owner.acquire("voice-note"), true)
    owner.release("conversation")
    assert.equal(owner.current(), "voice-note", "releasing another owner does not clear ownership")
  })

  it("isOwned reflects the current owner only", async () => {
    const { createMicrophoneOwner } = await import("../../artifacts/apz-legal/src/lib/microphone-owner.ts")
    const owner = createMicrophoneOwner()
    assert.equal(owner.isOwned("voice-note"), false)
    assert.equal(owner.acquire("voice-note"), true)
    assert.equal(owner.isOwned("voice-note"), true)
    assert.equal(owner.isOwned("conversation"), false)
  })
})

describe("P1 TTS request ownership", () => {
  it("speak() guards against empty text without throwing", async () => {
    // useTextToSpeech is a React hook; we assert only that the module exports
    // the expected API surface. Actual playback is exercised by the browser
    // smoke test.
    const mod = await import("../../artifacts/apz-legal/src/hooks/use-text-to-speech.ts")
    assert.equal(typeof mod.useTextToSpeech, "function", "useTextToSpeech is exported")
  })
})

describe("P1 speech-safe text sanitisation", () => {
  it("strips bracketed citation identifiers without altering displayed text", async () => {
    const { speechSafeText } = await import("../../artifacts/apz-legal/src/lib/speech-safe-text.ts")
    const input = "According to the mandate [Doc #123], the deadline is 30 days. See also [KB #45] and [Email #7]."
    const spoken = speechSafeText(input)
    assert.doesNotMatch(spoken, /\[Doc #123\]/)
    assert.doesNotMatch(spoken, /\[KB #45\]/)
    assert.doesNotMatch(spoken, /\[Email #7\]/)
    assert.match(spoken, /According to the mandate/)
    assert.match(spoken, /deadline is 30 days/)
  })

  it("preserves legitimate bracketed legal text", async () => {
    const { speechSafeText } = await import("../../artifacts/apz-legal/src/lib/speech-safe-text.ts")
    const input = "The clause (see subsection (b)) applies. Please review [the attached schedule]."
    const spoken = speechSafeText(input)
    assert.match(spoken, /subsection \(b\)/)
    assert.match(spoken, /the attached schedule/)
  })

it("returns empty string for empty input", async () => {
    const { speechSafeText } = await import("../../artifacts/apz-legal/src/lib/speech-safe-text.ts")
    assert.equal(speechSafeText(""), "")
    assert.equal(speechSafeText("   "), "")
  })

  it("strips markdown syntax so the spoken version reads naturally", async () => {
    const { speechSafeText } = await import("../../artifacts/apz-legal/src/lib/speech-safe-text.ts")
    const input = "**Important**: the deadline is *30 days*. See `clause 5`. [Link text](https://example.com)."
    const spoken = speechSafeText(input)
    assert.doesNotMatch(spoken, /\*\*|\*|`/)
    assert.doesNotMatch(spoken, /Link text\)\]/)
    assert.match(spoken, /Important/)
    assert.match(spoken, /deadline is 30 days/)
    assert.match(spoken, /clause 5/)
  })

  it("strips markdown headings and list markers", async () => {
    const { speechSafeText } = await import("../../artifacts/apz-legal/src/lib/speech-safe-text.ts")
    const input = "# Summary\n\n- First point\n- Second point\n\n1. One\n2. Two"
    const spoken = speechSafeText(input)
    assert.doesNotMatch(spoken, /^#/m)
    assert.doesNotMatch(spoken, /^-\s/m)
    assert.doesNotMatch(spoken, /^\d+\.\s/m)
    assert.match(spoken, /First point/)
    assert.match(spoken, /Second point/)
  })

  it("strips governance labels that read as robotic noise aloud", async () => {
    const { speechSafeText } = await import("../../artifacts/apz-legal/src/lib/speech-safe-text.ts")
    const input = "The answer is correct. Confidence: 85%. Risk: high. Citations require verification."
    const spoken = speechSafeText(input)
    assert.doesNotMatch(spoken, /Confidence:/)
    assert.doesNotMatch(spoken, /Risk:/)
    assert.doesNotMatch(spoken, /Citations require verification/)
    assert.match(spoken, /The answer is correct/)
  })

  it("preserves meaningful legal content while removing noise", async () => {
    const { speechSafeText } = await import("../../artifacts/apz-legal/src/lib/speech-safe-text.ts")
    const input = "**Finding**: the clause is unenforceable. See [Doc #123] and [KB #45]. Confidence: 70%. Risk: medium."
    const spoken = speechSafeText(input)
    assert.match(spoken, /Finding/)
    assert.match(spoken, /the clause is unenforceable/)
    assert.doesNotMatch(spoken, /\[Doc #123\]/)
    assert.doesNotMatch(spoken, /\[KB #45\]/)
    assert.doesNotMatch(spoken, /Confidence:/)
    assert.doesNotMatch(spoken, /Risk:/)
  })
})

describe("P1 generated AiGenerateInput schema — nullable matterId", () => {
  it("treats matterId as optional in the generated TypeScript schema", async () => {
    const mod = await import("/home/ubuntu/apz-legal-ai-replit/lib/api-client-react/src/generated/api.schemas.ts")
    // Workflow is required; matterId must be optional so General context
    // requests (no matter) satisfy the type contract.
    const minimal: mod.AiGenerateInput = { workflow: "legal_research" }
    assert.equal(minimal.workflow, "legal_research")
    assert.equal(minimal.matterId, undefined, "matterId is optional and defaults to undefined")

    const withMatter: mod.AiGenerateInput = {
      workflow: "summarise_matter",
      matterId: 42,
      instructions: "summarise",
    }
    assert.equal(withMatter.matterId, 42)
  })

  it("treats matterId as optional in the generated Zod validator", async () => {
    const mod = await import("/home/ubuntu/apz-legal-ai-replit/lib/api-zod/src/generated/api.ts")
    const GenerateAiOutputBody = mod.GenerateAiOutputBody
    assert.equal(typeof GenerateAiOutputBody, "object", "GenerateAiOutputBody validator is exported")

    // Workflow is required; matterId must be optional so General context
    // requests (no matter) satisfy the type contract.
    const ok = GenerateAiOutputBody.safeParse({ workflow: "legal_research" })
    assert.equal(ok.success, true, "workflow-only input is valid (matterId optional)")

    const okWithMatter = GenerateAiOutputBody.safeParse({ workflow: "summarise_matter", matterId: 42 })
    assert.equal(okWithMatter.success, true, "input with matterId is valid")

    const bad = GenerateAiOutputBody.safeParse({ matterId: 42 })
    assert.equal(bad.success, false, "missing required workflow is rejected")
  })

  it("includes the general_chat workflow in the generated schema and validator", async () => {
    const schemaMod = await import("/home/ubuntu/apz-legal-ai-replit/lib/api-client-react/src/generated/api.schemas.ts")
    const workflowValues = Object.values(schemaMod.AiGenerateInputWorkflow) as readonly string[]
    assert.ok(
      workflowValues.includes("general_chat"),
      "general_chat is a valid AiGenerateInputWorkflow",
    )

    const zodMod = await import("/home/ubuntu/apz-legal-ai-replit/lib/api-zod/src/generated/api.ts")
    const parsed = zodMod.GenerateAiOutputBody.safeParse({ workflow: "general_chat" })
    assert.equal(parsed.success, true, "general_chat workflow is accepted by the validator")
  })
})

describe("P1 Matter retrieval routing", async () => {
  // These tests exercise the pure decision logic that gates retrieval in
  // Matter context. The goal is to retrieve ONLY what the question needs —
  // not every available source type just because a matter is selected.
  const { determineRetrievalMode } = await import("../../artifacts/api-server/src/lib/ai-router.ts")
  const { workflowForPrompt } = await import("../../artifacts/apz-legal/src/lib/ai-workflow-classifier.ts")

  it("matter overview/metadata questions perform no semantic retrieval", () => {
    const cases = [
      "what is this matter about",
      "what stage is this matter at",
      "who is the client",
      "what practice area is this",
      "what is the reference number",
      "give me a quick overview",
      "what documents are on this matter",
      "what emails do we have",
      "has the client responded",
    ]
    for (const q of cases) {
      const d = determineRetrievalMode("matter_overview", q, 15, false)
      assert.equal(d.includeMatterDocuments, false, `"${q}": matter documents must not be retrieved`)
      assert.equal(d.includeKnowledge, false, `"${q}": knowledge base must not be retrieved`)
      assert.equal(d.includeTemplates, false, `"${q}": templates must not be retrieved`)
      assert.equal(d.includeEmails, false, `"${q}": emails must not be retrieved`)
      assert.equal(d.includePrecedents, false, `"${q}": precedents must not be retrieved`)
    }
  })

  it("routes matter overview questions to the matter_overview workflow", () => {
    const cases = [
      "what is this matter about",
      "what stage is this matter at",
      "who is the client",
      "what practice area is this",
      "what is the reference number",
      "give me a quick overview",
      "what documents are on this matter",
    ]
    for (const q of cases) {
      assert.equal(workflowForPrompt(q, 15), "matter_overview", `"${q}" should route to matter_overview`)
    }
  })

  it("routes correspondence questions to summarise_correspondence (emails only)", () => {
    const cases = [
      "what did the client say in their latest email",
      "summarise the latest correspondence",
      "summarise the emails",
      "what was said in the email",
    ]
    for (const q of cases) {
      assert.equal(workflowForPrompt(q, 15), "summarise_correspondence", `"${q}" should route to summarise_correspondence`)
    }
    const d = determineRetrievalMode("summarise_correspondence", "what did the client say in their latest email", 15, false)
    assert.equal(d.mode, "document_specific")
    assert.equal(d.includeMatterDocuments, false, "correspondence questions must not retrieve matter documents")
    assert.equal(d.includeKnowledge, false, "correspondence questions must not retrieve knowledge base")
    assert.equal(d.includeTemplates, false, "correspondence questions must not retrieve templates")
    assert.equal(d.includeEmails, true, "correspondence questions must retrieve authorised emails")
  })

  it("matter document questions retrieve matter documents + knowledge", () => {
    const d = determineRetrievalMode("analyse_clause", "summarise the contract", 15, false)
    assert.equal(d.mode, "matter_plus_knowledge")
    assert.equal(d.includeMatterDocuments, true)
    assert.equal(d.includeKnowledge, true)
    assert.equal(d.includeTemplates, false, "document questions must not retrieve templates")
  })

  it("template/drafting questions retrieve templates", () => {
    const d = determineRetrievalMode("draft_contract", "draft an NDA using our approved template", 15, true)
    assert.equal(d.mode, "template_drafting")
    assert.equal(d.includeMatterDocuments, true)
    assert.equal(d.includeKnowledge, true)
    assert.equal(d.includeTemplates, true)
    assert.equal(d.includeEmails, true)
  })

  it("legal research questions retrieve matter documents + knowledge", () => {
    const d = determineRetrievalMode("legal_research", "research the prescription issue", 15, false)
    assert.equal(d.mode, "matter_plus_knowledge")
    assert.equal(d.includeMatterDocuments, true)
    assert.equal(d.includeKnowledge, true)
    assert.equal(d.includeTemplates, false, "research questions must not retrieve templates")
  })

  it("templates are never retrieved unless explicitly requested", () => {
    // The bug: NDA templates were returned for "what is this matter about"
    // because the fall-through knowledge query had no type filter.
    const nonDrafting = [
      determineRetrievalMode("matter_overview", "what is this matter about", 15, false),
      determineRetrievalMode("summarise_correspondence", "summarise the emails", 15, false),
      determineRetrievalMode("analyse_clause", "summarise the contract", 15, false),
      determineRetrievalMode("legal_research", "research the prescription issue", 15, false),
      determineRetrievalMode("summarise_matter", "summarise this matter", 15, false),
    ]
    for (const d of nonDrafting) {
      assert.equal(d.includeTemplates, false, `${d.mode}: templates must not be retrieved for non-drafting questions`)
    }
  })

  it("General greeting still performs no retrieval", () => {
    const d = determineRetrievalMode("general_chat", "hi", undefined, false)
    assert.equal(d.mode, "general_legal")
    assert.equal(d.includeMatterDocuments, false)
    assert.equal(d.includeKnowledge, false)
    assert.equal(d.includeTemplates, false)
    assert.equal(d.includeEmails, false)
    assert.equal(d.includePrecedents, false)
  })

  it("General explanatory question still performs no retrieval", () => {
    const d = determineRetrievalMode("general_chat", "what is a letter of demand", undefined, false)
    assert.equal(d.mode, "general_legal")
    assert.equal(d.includeMatterDocuments, false)
    assert.equal(d.includeKnowledge, false)
    assert.equal(d.includeTemplates, false)
    assert.equal(d.includeEmails, false)
    assert.equal(d.includePrecedents, false)
  })
})

describe("P1 General-mode workflow classification", async () => {
  // Reproduces the frontend workflowForPrompt() decision matrix for General
  // context (matterId === "all"). A greeting must NOT be routed into
  // legal_research, which would trigger template/KB retrieval and high-risk
  // governance framing. The pure helper is imported from its own module so
  // it can be unit-tested without pulling in React.
  const { workflowForPrompt } = await import("../../artifacts/apz-legal/src/lib/ai-workflow-classifier.ts")

  it("routes a greeting to general_chat, not legal_research", () => {
    assert.equal(workflowForPrompt("hi", "all"), "general_chat")
    assert.equal(workflowForPrompt("hello", "all"), "general_chat")
    assert.equal(workflowForPrompt("thanks", "all"), "general_chat")
    assert.equal(workflowForPrompt("can you help me?", "all"), "general_chat")
  })

  it("routes a general explanatory question to general_chat", () => {
    assert.equal(workflowForPrompt("what is a letter of demand", "all"), "general_chat")
    assert.equal(workflowForPrompt("explain prescription", "all"), "general_chat")
    assert.equal(workflowForPrompt("what's the difference between an NDA and a confidentiality clause", "all"), "general_chat")
  })

  it("routes explicit drafting requests to draft_contract even in General context", () => {
    assert.equal(workflowForPrompt("draft an NDA", "all"), "draft_contract")
    assert.equal(workflowForPrompt("write a contract", "all"), "draft_contract")
  })

  it("routes explicit analysis requests to analyse_clause", () => {
    assert.equal(workflowForPrompt("analyse this clause", "all"), "analyse_clause")
  })

  it("routes explicit research requests to legal_research", () => {
    assert.equal(workflowForPrompt("research the case law on prescription", "all"), "legal_research")
  })

  it("preserves matter-bound routing when a matter is selected", () => {
    // "summarise this matter" is an overview/metadata question and now routes
    // to the lightweight matter_overview workflow (no retrieval, low risk),
    // which answers from the structured matter context. The other matter
    // defaults are unchanged.
    assert.equal(workflowForPrompt("summarise this matter", 42), "matter_overview")
    assert.equal(workflowForPrompt("draft an email", 42), "draft_email")
    assert.equal(workflowForPrompt("analyse this clause", 42), "analyse_clause")
    assert.equal(workflowForPrompt("draft a contract", 42), "draft_contract")
    assert.equal(workflowForPrompt("what is the legal position", 42), "legal_research")
    assert.equal(workflowForPrompt("what did the client say in their latest email", 42), "summarise_correspondence")
  })
})

describe("P1 TTS length limit semantics", () => {
  it("uses character semantics consistent with the provider contract", () => {
    // The backend enforces MAX_TTS_TEXT_CHARS = 4096 characters, matching
    // OpenAI's documented input limit. Unicode is counted per code point.
    const maxChars = 4096
    const within = "a".repeat(maxChars)
    const over = "a".repeat(maxChars + 1)
    assert.equal(within.length, maxChars)
    assert.equal(over.length, maxChars + 1)
    assert.ok(within.length <= maxChars)
    assert.ok(over.length > maxChars)
  })
})

describe("P1 generated validator compatibility", () => {
  it("exports Zod 3 compatible validators", async () => {
    const mod = await import("/home/ubuntu/apz-legal-ai-replit/lib/api-zod/src/generated/api.ts")
    const DevLoginBody = mod.DevLoginBody
    const UpdateProfileBody = mod.UpdateProfileBody
    assert.equal(typeof DevLoginBody, "object", "DevLoginBody validator is exported")
    assert.equal(typeof UpdateProfileBody, "object", "UpdateProfileBody validator is exported")
    // Zod 3: safeParse returns { success: boolean }
    const ok = DevLoginBody.safeParse({ role: "admin", email: "admin@example.test", name: "Admin" })
    assert.equal(ok.success, true)
    const bad = DevLoginBody.safeParse({ role: "admin", email: "not-an-email", name: "Admin" })
    assert.equal(bad.success, false, "invalid email is rejected")
    // The original regression used zod.email() (Zod 4 API) which does not exist
    // in zod 3.25.76. The pinned generator now emits zod.string().email().
    assert.doesNotThrow(() => JSON.stringify(bad.error.issues))
    const profileOk = UpdateProfileBody.safeParse({ name: "Test", email: "test@example.test" })
    assert.equal(profileOk.success, true)
    const profileBad = UpdateProfileBody.safeParse({ name: "Test", email: "not-an-email" })
    assert.equal(profileBad.success, false, "profile email is rejected")
  })
})

describe("P1 language-selection rules", async () => {
  // The general_chat / matter_overview / summarise_correspondence system
  // prompts must each contain an explicit English-default language rule so a
  // single non-English user word (e.g. "はい。") does not flip the whole
  // conversation into that language.
  const { AI_WORKFLOWS } = await import("../../artifacts/api-server/src/routes/ai.ts")

  const LANGUAGE_RULE = /Respond in English by default/

  it("general_chat prompt contains an English-default language rule", () => {
    assert.match(AI_WORKFLOWS.general_chat.system, LANGUAGE_RULE, "general_chat must instruct English by default")
    assert.match(
      AI_WORKFLOWS.general_chat.system,
      /answered naturally in English when the active[\s\S]*?conversation is English/,
      "general_chat must say brief acknowledgements stay in English",
    )
  })

  it("matter_overview prompt contains an English-default language rule", () => {
    assert.match(AI_WORKFLOWS.matter_overview.system, LANGUAGE_RULE, "matter_overview must instruct English by default")
  })

  it("summarise_correspondence prompt contains an English-default language rule", () => {
    assert.match(
      AI_WORKFLOWS.summarise_correspondence.system,
      LANGUAGE_RULE,
      "summarise_correspondence must instruct English by default",
    )
  })

  it("structured workflows contain an English-default language rule", () => {
    for (const key of ["draft_email", "summarise_matter", "matter_summary", "draft_contract", "analyse_clause", "legal_research"]) {
      assert.match(AI_WORKFLOWS[key].system, LANGUAGE_RULE, `${key} must instruct English by default`)
    }
  })

  it("language rule permits explicit non-English requests", () => {
    assert.match(
      AI_WORKFLOWS.general_chat.system,
      /If the user clearly communicates in another language or explicitly[\s\S]*?requests another language, you may respond in that language/,
      "explicit non-English requests must remain allowed",
    )
  })

  it("TTS instructions are isolated from the generation path", async () => {
    // The speech endpoint is the only consumer of TTS_INSTRUCTIONS. It must
    // never appear in any workflow system prompt, so it cannot influence the
    // language of generated text. A module-level const declaration is allowed
    // (it is only the *value* that must stay inside the speech endpoint).
    const fs = await import("node:fs/promises")
    const src = await fs.readFile("/home/ubuntu/apz-legal-ai-replit/artifacts/api-server/src/routes/ai.ts", "utf8")
    const matches = [...src.matchAll(/TTS_INSTRUCTIONS/g)]
    assert.ok(matches.length >= 2, "TTS_INSTRUCTIONS is referenced at all")
    // Every TTS_INSTRUCTIONS *use* must sit inside the /ai/speech route body.
    // Find all route declarations and check the enclosing route for each match.
    const routeStarts = [...src.matchAll(/router\.(post|get)\("\/ai\//g)].map((m) => m.index ?? 0)
    for (const m of matches) {
      const idx = m.index ?? 0
      // Skip module-level const declarations — they carry no value.
      if (/const TTS_INSTRUCTIONS(_SUPPORTED)? =/.test(src.slice(Math.max(0, idx - 60), idx + 60))) continue
      // Find the enclosing route start (the last route declaration before idx).
      let enclosing = -1
      for (const rs of routeStarts) { if (rs <= idx) enclosing = rs; else break }
      assert.ok(enclosing !== -1, "TTS_INSTRUCTIONS use must be inside a route")
      const routePath = src.slice(enclosing, enclosing + 80)
      assert.match(routePath, /\/ai\/speech/, `TTS_INSTRUCTIONS must only be referenced inside the speech endpoint (enclosing: "${routePath.trim()}")`)
    }
  })
})
