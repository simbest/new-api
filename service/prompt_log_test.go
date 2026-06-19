package service

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/dto"
)

func TestExtractPromptLogTextKeepsLastUserTextOnly(t *testing.T) {
	request := &dto.GeneralOpenAIRequest{
		Messages: []dto.Message{
			{Role: "system", Content: "system prompt"},
			{Role: "assistant", Content: "previous answer"},
			{Role: "user", Content: "hello"},
			{Role: "user", Content: []any{
				map[string]any{"type": "text", "text": "world"},
				map[string]any{"type": "image_url", "image_url": map[string]any{"url": "data:image/png;base64,xxx"}},
			}},
			{Role: "tool", Content: "tool result"},
		},
	}

	got := ExtractPromptLogText(request)
	want := "world"
	if got != want {
		t.Fatalf("ExtractPromptLogText() = %q, want %q", got, want)
	}
}

func TestExtractPromptLogTextCleansClientInjectedContext(t *testing.T) {
	request := &dto.GeneralOpenAIRequest{
		Messages: []dto.Message{
			{Role: "user", Content: "<system-reminder>\nThe following tools are reachable via `tool_search`."},
			{Role: "user", Content: "Query: hi qwen\n\nAvailable memories:\n- [user] memory content"},
		},
	}

	got := ExtractPromptLogText(request)
	want := "hi qwen"
	if got != want {
		t.Fatalf("ExtractPromptLogText() = %q, want %q", got, want)
	}
}

func TestExtractPromptLogTextRemovesRelevantMemorySuffix(t *testing.T) {
	request := &dto.GeneralOpenAIRequest{
		Messages: []dto.Message{
			{Role: "user", Content: "review this change\n\n## Relevant memory\n\nmemory content"},
		},
	}

	got := ExtractPromptLogText(request)
	want := "review this change"
	if got != want {
		t.Fatalf("ExtractPromptLogText() = %q, want %q", got, want)
	}
}

func TestExtractPromptLogTextSkipsManagedMemoryTask(t *testing.T) {
	request := &dto.GeneralOpenAIRequest{
		Messages: []dto.Message{
			{Role: "user", Content: "Managed memory has TWO directories. Choose which one to write each memory into."},
		},
	}

	got := ExtractPromptLogText(request)
	if got != "" {
		t.Fatalf("ExtractPromptLogText() = %q, want empty", got)
	}
}

func TestExtractPromptLogTextRemovesManagedMemorySuffix(t *testing.T) {
	request := &dto.GeneralOpenAIRequest{
		Messages: []dto.Message{
			{Role: "user", Content: "hi qwen\n\nManaged memory has TWO directories. Choose which one to write each memory into."},
		},
	}

	got := ExtractPromptLogText(request)
	want := "hi qwen"
	if got != want {
		t.Fatalf("ExtractPromptLogText() = %q, want %q", got, want)
	}
}

func TestExtractPromptLogTextUnwrapsUserMessageTag(t *testing.T) {
	request := &dto.GeneralOpenAIRequest{
		Messages: []dto.Message{
			{Role: "user", Content: "<user-message>\n介绍一下你自己\n</user-message>"},
		},
	}

	got := ExtractPromptLogText(request)
	want := "介绍一下你自己"
	if got != want {
		t.Fatalf("ExtractPromptLogText() = %q, want %q", got, want)
	}
}

func TestIsDuplicatePromptLog(t *testing.T) {
	promptLogDedupeMu.Lock()
	promptLogDedupeMap = make(map[string]time.Time)
	promptLogDedupeMu.Unlock()

	now := time.Date(2026, 6, 19, 10, 0, 0, 0, time.UTC)
	if isDuplicatePromptLog(1, "hi qwen", now) {
		t.Fatal("first prompt should not be duplicate")
	}
	if !isDuplicatePromptLog(1, "hi qwen", now.Add(time.Second)) {
		t.Fatal("same user and content within TTL should be duplicate")
	}
	if isDuplicatePromptLog(2, "hi qwen", now.Add(2*time.Second)) {
		t.Fatal("different user should not be duplicate")
	}
	if isDuplicatePromptLog(1, "hi qwen", now.Add(promptLogDedupeTTL+time.Second)) {
		t.Fatal("same content after TTL should not be duplicate")
	}
}

func TestTruncateUTF8Bytes(t *testing.T) {
	got, truncated := truncateUTF8Bytes("你好abc", 7)
	if !truncated {
		t.Fatal("truncateUTF8Bytes() truncated = false, want true")
	}
	if got != "你好a" {
		t.Fatalf("truncateUTF8Bytes() = %q, want %q", got, "你好a")
	}
}
