package service

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"gorm.io/gorm"
)

const DefaultPromptLogAnalysisPrompt = `你是一名资深 AI 应用与提示词质量分析专家。请基于以下经过脱敏的提示词日志，分析该用户的提示词使用情况。

用户账号：{{username}}
用户 ID：{{user_id}}
查询起始时间：{{start_time}}
查询截止时间：{{end_time}}
分析日志数量：{{log_count}}

请输出中文报告，结构清晰，适合管理员阅读，必须包含：
1. 用户提示词主要用途
2. 用户正在完成的任务类型
3. 提示词水平评估
4. 值得推广的经验
5. 不足之处
6. 改进建议

注意：
- 不要泄露或复述原始敏感内容。
- 如果样本不足，请明确说明判断依据有限。
- 结论要具体、可操作。

脱敏后的提示词日志：
{{prompt_logs}}`

const promptLogAnalysisOptionKey = "PromptLogAnalysisPrompt"

var (
	promptLogAnalysisStartOnce sync.Once
	bearerTokenRegex           = regexp.MustCompile(`(?i)bearer\s+[a-z0-9._~+\-/=]{16,}`)
	apiKeyRegex                = regexp.MustCompile(`(?i)\b(sk-[a-z0-9_-]{16,}|xox[baprs]-[a-z0-9-]{16,}|[a-z0-9_]*(api|secret|token|key)[a-z0-9_]*\s*[:=]\s*["']?[^"'\s,;]{8,})`)
	longSecretRegex            = regexp.MustCompile(`\b[A-Za-z0-9_\-]{32,}\b`)
	emailRegex                 = regexp.MustCompile(`\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b`)
	phoneRegex                 = regexp.MustCompile(`\b(?:\+?86[- ]?)?1[3-9]\d{9}\b`)
)

func StartPromptLogAnalysisWorker() {
	promptLogAnalysisStartOnce.Do(func() {
		if !common.IsMasterNode {
			return
		}
		go promptLogAnalysisWorker()
		common.SysLog("prompt log analysis worker started")
	})
}

func GetPromptLogAnalysisPromptTemplate() string {
	common.OptionMapRWMutex.RLock()
	value := strings.TrimSpace(common.OptionMap[promptLogAnalysisOptionKey])
	common.OptionMapRWMutex.RUnlock()
	if value == "" {
		return DefaultPromptLogAnalysisPrompt
	}
	return value
}

func promptLogAnalysisWorker() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		runPromptLogAnalysisOnce()
		<-ticker.C
	}
}

func runPromptLogAnalysisOnce() {
	for {
		task, err := model.ClaimNextPromptLogAnalysisTask()
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return
			}
			logger.LogWarn(context.Background(), fmt.Sprintf("claim prompt log analysis task failed: %v", err))
			return
		}
		processPromptLogAnalysisTask(task)
	}
}

func processPromptLogAnalysisTask(task *model.PromptLogAnalysisTask) {
	filter := model.PromptLogFilter{
		User:      task.FilterUser,
		StartTime: task.StartTime,
		EndTime:   task.EndTime,
	}
	maxLogs := common.PromptLogAnalysisMaxLogs
	if maxLogs <= 0 || maxLogs > 200 {
		maxLogs = 200
	}
	samples, err := model.GetPromptLogAnalysisSamples(filter, maxLogs)
	if err != nil {
		_ = model.FailPromptLogAnalysisTask(task.Id, 0, 0, err.Error())
		return
	}
	if len(samples) == 0 {
		_ = model.FailPromptLogAnalysisTask(task.Id, 0, 0, "no prompt logs matched the analysis filter")
		return
	}
	promptLogs, contentBytes := buildPromptLogAnalysisSampleText(samples)
	renderedPrompt := renderPromptLogAnalysisPrompt(task, len(samples), promptLogs)
	result, err := callPromptLogAnalysisOpenAI(task.AnalysisModel, renderedPrompt)
	if err != nil {
		_ = model.FailPromptLogAnalysisTask(task.Id, len(samples), contentBytes, err.Error())
		return
	}
	if err := model.CompletePromptLogAnalysisTask(task.Id, len(samples), contentBytes, result); err != nil {
		logger.LogWarn(context.Background(), fmt.Sprintf("complete prompt log analysis task failed: id=%d err=%v", task.Id, err))
	}
}

func buildPromptLogAnalysisSampleText(samples []model.PromptLogAnalysisSample) (string, int) {
	var builder strings.Builder
	maxChars := common.PromptLogAnalysisMaxChars
	if maxChars <= 0 {
		maxChars = 100000
	}
	contentBytes := 0
	for i, sample := range samples {
		text := sanitizePromptLogAnalysisText(sample.ContentText)
		contentBytes += len([]byte(text))
		entry := fmt.Sprintf("## 日志 %d\n时间：%s\n模型：%s\n格式：%s\n内容：\n%s\n\n",
			i+1,
			formatPromptLogAnalysisTime(sample.CreatedAt),
			emptyDash(sample.ModelName),
			emptyDash(sample.RelayFormat),
			text,
		)
		if builder.Len()+utf8.RuneCountInString(entry) > maxChars {
			builder.WriteString("\n[后续日志因分析长度限制被省略]\n")
			break
		}
		builder.WriteString(entry)
	}
	return builder.String(), contentBytes
}

func sanitizePromptLogAnalysisText(text string) string {
	text = bearerTokenRegex.ReplaceAllString(text, "Bearer [REDACTED]")
	text = apiKeyRegex.ReplaceAllString(text, "[REDACTED_SECRET]")
	text = longSecretRegex.ReplaceAllString(text, "[REDACTED_SECRET]")
	text = emailRegex.ReplaceAllString(text, "[REDACTED_EMAIL]")
	text = phoneRegex.ReplaceAllString(text, "[REDACTED_PHONE]")
	return text
}

func renderPromptLogAnalysisPrompt(task *model.PromptLogAnalysisTask, logCount int, promptLogs string) string {
	prompt := task.AnalysisPrompt
	replacements := map[string]string{
		"{{username}}":    emptyDash(task.Username),
		"{{user_id}}":     fmt.Sprintf("%d", task.UserId),
		"{{start_time}}":  formatPromptLogAnalysisTime(task.StartTime),
		"{{end_time}}":    formatPromptLogAnalysisTime(task.EndTime),
		"{{log_count}}":   fmt.Sprintf("%d", logCount),
		"{{prompt_logs}}": promptLogs,
	}
	for key, value := range replacements {
		prompt = strings.ReplaceAll(prompt, key, value)
	}
	return prompt
}

func callPromptLogAnalysisOpenAI(modelName string, prompt string) (string, error) {
	channel, err := model.GetPromptLogAnalysisOpenAIChannel()
	if err != nil {
		return "", fmt.Errorf("no enabled OpenAI channel available: %w", err)
	}
	apiKey, _, apiErr := channel.GetNextEnabledKey()
	if apiErr != nil {
		return "", fmt.Errorf("no enabled OpenAI channel key available: %s", apiErr.Error())
	}
	if strings.TrimSpace(modelName) == "" {
		modelName = common.PromptLogAnalysisModel
	}
	modelName = model.ResolvePromptLogAnalysisChannelModel(channel, modelName)
	if strings.TrimSpace(modelName) == "" {
		return "", errors.New("OpenAI channel has no available analysis model")
	}
	stream := false
	temperature := 0.2
	request := dto.GeneralOpenAIRequest{
		Model: modelName,
		Messages: []dto.Message{
			{Role: "user", Content: prompt},
		},
		Stream:      &stream,
		Temperature: &temperature,
	}
	body, err := common.Marshal(request)
	if err != nil {
		return "", err
	}
	timeout := common.PromptLogAnalysisTimeoutSeconds
	if timeout <= 0 {
		timeout = 120
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeout)*time.Second)
	defer cancel()
	baseURL := strings.TrimRight(channel.GetBaseURL(), "/")
	if baseURL == "" {
		return "", errors.New("OpenAI channel base URL is empty")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+"/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)
	if channel.OpenAIOrganization != nil && strings.TrimSpace(*channel.OpenAIOrganization) != "" {
		req.Header.Set("OpenAI-Organization", strings.TrimSpace(*channel.OpenAIOrganization))
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var openaiResp dto.OpenAITextResponse
	if err := common.DecodeJson(resp.Body, &openaiResp); err != nil {
		return "", err
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return "", fmt.Errorf("OpenAI analysis request failed: status=%d error=%v", resp.StatusCode, openaiResp.Error)
	}
	if len(openaiResp.Choices) == 0 {
		return "", errors.New("OpenAI analysis response has no choices")
	}
	result := strings.TrimSpace(common.Interface2String(openaiResp.Choices[0].Message.Content))
	if result == "" {
		return "", errors.New("OpenAI analysis response is empty")
	}
	return result, nil
}

func formatPromptLogAnalysisTime(timestamp int64) string {
	if timestamp <= 0 {
		return "-"
	}
	return time.Unix(timestamp, 0).Format("2006-01-02 15:04:05")
}

func emptyDash(value string) string {
	if strings.TrimSpace(value) == "" {
		return "-"
	}
	return value
}
