package model

import (
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

type PromptLog struct {
	Id             int    `json:"id" gorm:"index:idx_prompt_logs_created_at_id,priority:2;index:idx_prompt_logs_user_id_id,priority:2"`
	UserId         int    `json:"user_id" gorm:"index;index:idx_prompt_logs_user_id_id,priority:1"`
	Username       string `json:"username" gorm:"index;default:''"`
	RequestId      string `json:"request_id,omitempty" gorm:"type:varchar(64);index;default:''"`
	ModelName      string `json:"model_name" gorm:"index;default:''"`
	RelayFormat    string `json:"relay_format" gorm:"type:varchar(32);index;default:''"`
	ContentPreview string `json:"content_preview" gorm:"type:varchar(512);default:''"`
	ContentBytes   int    `json:"content_bytes" gorm:"default:0"`
	Truncated      bool   `json:"truncated" gorm:"default:false"`
	CreatedAt      int64  `json:"created_at" gorm:"bigint;index;index:idx_prompt_logs_created_at_id,priority:1"`
}

type PromptLogContent struct {
	Id          int    `json:"id"`
	PromptLogId int    `json:"prompt_log_id" gorm:"index"`
	ContentText string `json:"content_text" gorm:"type:text"`
	CreatedAt   int64  `json:"created_at" gorm:"bigint;index"`
}

type PromptLogRecord struct {
	UserId         int
	Username       string
	RequestId      string
	ModelName      string
	RelayFormat    string
	ContentPreview string
	ContentText    string
	ContentBytes   int
	Truncated      bool
	CreatedAt      int64
}

func RecordPromptLogs(records []PromptLogRecord) error {
	if len(records) == 0 {
		return nil
	}
	return LOG_DB.Transaction(func(tx *gorm.DB) error {
		logs := make([]PromptLog, 0, len(records))
		for _, record := range records {
			logs = append(logs, PromptLog{
				UserId:         record.UserId,
				Username:       record.Username,
				RequestId:      record.RequestId,
				ModelName:      record.ModelName,
				RelayFormat:    record.RelayFormat,
				ContentPreview: record.ContentPreview,
				ContentBytes:   record.ContentBytes,
				Truncated:      record.Truncated,
				CreatedAt:      record.CreatedAt,
			})
		}
		if err := tx.Create(&logs).Error; err != nil {
			return err
		}
		contents := make([]PromptLogContent, 0, len(records))
		now := common.GetTimestamp()
		for i, record := range records {
			createdAt := record.CreatedAt
			if createdAt == 0 {
				createdAt = now
			}
			contents = append(contents, PromptLogContent{
				PromptLogId: logs[i].Id,
				ContentText: record.ContentText,
				CreatedAt:   createdAt,
			})
		}
		return tx.Create(&contents).Error
	})
}

func NewPromptLogRecord(userId int, username, requestId, modelName, relayFormat, contentPreview, contentText string, contentBytes int, truncated bool) PromptLogRecord {
	return PromptLogRecord{
		UserId:         userId,
		Username:       username,
		RequestId:      requestId,
		ModelName:      modelName,
		RelayFormat:    relayFormat,
		ContentPreview: contentPreview,
		ContentText:    contentText,
		ContentBytes:   contentBytes,
		Truncated:      truncated,
		CreatedAt:      time.Now().Unix(),
	}
}
