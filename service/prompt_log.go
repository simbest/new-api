package service

import (
	"crypto/sha256"
	"encoding/hex"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

var (
	promptLogQueue     chan model.PromptLogRecord
	promptLogStartOnce sync.Once
	promptLogDedupeMu  sync.Mutex
	promptLogDedupeMap = make(map[string]time.Time)
)

const promptLogDedupeTTL = 60 * time.Second

func StartPromptLogWorker() {
	promptLogStartOnce.Do(func() {
		queueSize := common.PromptLogQueueSize
		if queueSize <= 0 {
			queueSize = 10000
		}
		promptLogQueue = make(chan model.PromptLogRecord, queueSize)
		go promptLogWorker()
		common.SysLog("prompt log worker started")
	})
}

func CapturePromptLog(c *gin.Context, relayFormat types.RelayFormat, request dto.Request) {
	if !common.PromptLogEnabled || request == nil || promptLogQueue == nil {
		return
	}

	content := ExtractPromptLogText(request)
	if content == "" {
		return
	}
	if isDuplicatePromptLog(c.GetInt("id"), content, time.Now()) {
		return
	}

	maxBytes := common.PromptLogMaxContentBytes
	if maxBytes <= 0 {
		maxBytes = 16 * 1024
	}
	content, truncated := truncateUTF8Bytes(content, maxBytes)
	preview, _ := truncateUTF8Bytes(content, 512)

	record := model.NewPromptLogRecord(
		c.GetInt("id"),
		c.GetString("username"),
		c.GetString(common.RequestIdKey),
		getPromptLogModelName(request),
		string(relayFormat),
		preview,
		content,
		len([]byte(content)),
		truncated,
	)

	select {
	case promptLogQueue <- record:
	default:
		logger.LogWarn(c, "prompt log queue full, dropped")
	}
}

func ExtractPromptLogText(request dto.Request) string {
	var parts []string
	switch r := request.(type) {
	case *dto.GeneralOpenAIRequest:
		for _, message := range r.Messages {
			if message.Role != "user" {
				continue
			}
			parts = append(parts, extractOpenAIMessageText(message)...)
		}
	case *dto.ClaudeRequest:
		for _, message := range r.Messages {
			if message.Role != "user" {
				continue
			}
			parts = append(parts, extractClaudeMessageText(message)...)
		}
	case *dto.OpenAIResponsesRequest:
		for _, input := range r.ParseInput() {
			if input.Type == "input_text" && strings.TrimSpace(input.Text) != "" {
				parts = append(parts, input.Text)
			}
		}
	}
	return normalizePromptLogText(parts)
}

func DetectSystemNoticeInRequest(request dto.Request) (bool, int) {
	count := 0
	switch r := request.(type) {
	case *dto.GeneralOpenAIRequest:
		for _, message := range r.Messages {
			if message.Role != "user" {
				continue
			}
			count += countSystemNoticeTexts(extractOpenAIMessageText(message))
		}
	case *dto.ClaudeRequest:
		for _, message := range r.Messages {
			if message.Role != "user" {
				continue
			}
			count += countSystemNoticeTexts(extractClaudeMessageText(message))
		}
	case *dto.OpenAIResponsesRequest:
		for _, input := range r.ParseInput() {
			if input.Type == "input_text" {
				count += countSystemNoticeTexts([]string{input.Text})
			}
		}
	}
	return count > 0, count
}

func promptLogWorker() {
	batchSize := common.PromptLogBatchSize
	if batchSize <= 0 {
		batchSize = 100
	}
	flushSeconds := common.PromptLogFlushIntervalSeconds
	if flushSeconds <= 0 {
		flushSeconds = 1
	}
	ticker := time.NewTicker(time.Duration(flushSeconds) * time.Second)
	defer ticker.Stop()

	batch := make([]model.PromptLogRecord, 0, batchSize)
	flush := func() {
		if len(batch) == 0 {
			return
		}
		records := batch
		batch = make([]model.PromptLogRecord, 0, batchSize)
		if err := model.RecordPromptLogs(records); err != nil {
			common.SysLog("failed to record prompt logs: " + err.Error())
		}
	}

	for {
		select {
		case record := <-promptLogQueue:
			batch = append(batch, record)
			if len(batch) >= batchSize {
				flush()
			}
		case <-ticker.C:
			flush()
		}
	}
}

func extractOpenAIMessageText(message dto.Message) []string {
	if message.IsStringContent() {
		if text, ok := message.Content.(string); ok && strings.TrimSpace(text) != "" {
			return []string{text}
		}
		return nil
	}
	var parts []string
	for _, content := range message.ParseContent() {
		if content.Type == "text" && strings.TrimSpace(content.Text) != "" {
			parts = append(parts, content.Text)
		}
	}
	return parts
}

func extractClaudeMessageText(message dto.ClaudeMessage) []string {
	if message.IsStringContent() {
		text := message.GetStringContent()
		if strings.TrimSpace(text) != "" {
			return []string{text}
		}
		return nil
	}
	media, err := message.ParseContent()
	if err != nil {
		return nil
	}
	var parts []string
	for _, content := range media {
		if content.Type == "text" {
			text := content.GetText()
			if strings.TrimSpace(text) != "" {
				parts = append(parts, text)
			}
		}
	}
	return parts
}

func countSystemNoticeTexts(parts []string) int {
	count := 0
	for _, part := range parts {
		if strings.Contains(part, "<system-notice>") {
			count++
		}
	}
	return count
}

func normalizePromptLogText(parts []string) string {
	for i := len(parts) - 1; i >= 0; i-- {
		part := parts[i]
		part = cleanPromptLogText(part)
		if part != "" {
			return part
		}
	}
	return ""
}

func cleanPromptLogText(text string) string {
	text = strings.TrimSpace(text)
	if text == "" {
		return ""
	}

	if strings.HasPrefix(text, "<system-reminder>") {
		return ""
	}
	if strings.HasPrefix(text, "<system-notice>") {
		return ""
	}

	if strings.HasPrefix(text, "Query:") {
		text = strings.TrimSpace(strings.TrimPrefix(text, "Query:"))
	}
	if strings.HasPrefix(text, "<user-message>") && strings.HasSuffix(text, "</user-message>") {
		text = strings.TrimSpace(strings.TrimPrefix(text, "<user-message>"))
		text = strings.TrimSpace(strings.TrimSuffix(text, "</user-message>"))
	}

	for _, marker := range []string{
		"\n\nAvailable memories:",
		"\n\n## Relevant memory",
		"\n\n## Relevant memories",
		"\n\n<system-reminder>",
		"\n\n<system-notice>",
		"\n\nManaged memory has TWO directories",
	} {
		if idx := strings.Index(text, marker); idx >= 0 {
			text = text[:idx]
		}
	}

	if strings.HasPrefix(text, "Managed memory has TWO directories") {
		return ""
	}

	return strings.TrimSpace(text)
}

func isDuplicatePromptLog(userID int, content string, now time.Time) bool {
	sum := sha256.Sum256([]byte(content))
	key := strconv.Itoa(userID) + ":" + hex.EncodeToString(sum[:])

	promptLogDedupeMu.Lock()
	defer promptLogDedupeMu.Unlock()

	if expiresAt, ok := promptLogDedupeMap[key]; ok && now.Before(expiresAt) {
		return true
	}

	for existingKey, expiresAt := range promptLogDedupeMap {
		if now.After(expiresAt) {
			delete(promptLogDedupeMap, existingKey)
		}
	}
	promptLogDedupeMap[key] = now.Add(promptLogDedupeTTL)
	return false
}

func truncateUTF8Bytes(s string, maxBytes int) (string, bool) {
	if maxBytes <= 0 || len([]byte(s)) <= maxBytes {
		return s, false
	}
	cut := 0
	for i := range s {
		if i > maxBytes {
			break
		}
		cut = i
	}
	if cut == 0 && len(s) > 0 {
		_, size := utf8.DecodeRuneInString(s)
		if size <= maxBytes {
			cut = size
		}
	}
	return s[:cut], true
}

func getPromptLogModelName(request dto.Request) string {
	switch r := request.(type) {
	case *dto.GeneralOpenAIRequest:
		return r.Model
	case *dto.ClaudeRequest:
		return r.Model
	case *dto.OpenAIResponsesRequest:
		return r.Model
	default:
		return ""
	}
}
