package model

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
)

func GetPromptLogAnalysisOpenAIChannel() (*Channel, error) {
	var channel Channel
	err := DB.Where("status = ? AND type IN ?", common.ChannelStatusEnabled, []int{constant.ChannelTypeOpenAI, constant.ChannelTypeOpenAIMax}).
		Order("priority desc").
		Order("id asc").
		First(&channel).Error
	if err != nil {
		return nil, err
	}
	return &channel, nil
}

func ResolvePromptLogAnalysisChannelModel(channel *Channel, preferredModel string) string {
	models := channel.GetModels()
	if len(models) == 0 {
		return strings.TrimSpace(preferredModel)
	}

	preferredModel = strings.TrimSpace(preferredModel)
	if preferredModel != "" {
		for _, modelName := range models {
			modelName = strings.TrimSpace(modelName)
			if modelName == preferredModel {
				return modelName
			}
		}
	}

	for _, modelName := range models {
		modelName = strings.TrimSpace(modelName)
		if isPromptLogAnalysisChatModel(modelName) {
			return modelName
		}
	}
	for _, modelName := range models {
		modelName = strings.TrimSpace(modelName)
		if modelName != "" {
			return modelName
		}
	}
	return preferredModel
}

func isPromptLogAnalysisChatModel(modelName string) bool {
	modelName = strings.ToLower(strings.TrimSpace(modelName))
	if modelName == "" {
		return false
	}
	if strings.Contains(modelName, "embedding") ||
		strings.Contains(modelName, "audio") ||
		strings.Contains(modelName, "realtime") ||
		strings.Contains(modelName, "transcribe") ||
		strings.Contains(modelName, "tts") ||
		strings.Contains(modelName, "image") ||
		strings.Contains(modelName, "dall-e") ||
		strings.Contains(modelName, "whisper") {
		return false
	}
	return strings.HasPrefix(modelName, "gpt-") ||
		strings.HasPrefix(modelName, "o1") ||
		strings.HasPrefix(modelName, "o3") ||
		strings.HasPrefix(modelName, "o4") ||
		strings.HasPrefix(modelName, "chatgpt-")
}
