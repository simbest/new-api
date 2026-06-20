package model

import (
	"errors"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

const (
	PromptLogAnalysisStatusQueued    = "queued"
	PromptLogAnalysisStatusRunning   = "running"
	PromptLogAnalysisStatusSucceeded = "succeeded"
	PromptLogAnalysisStatusFailed    = "failed"
)

type PromptLogAnalysisTask struct {
	Id             int    `json:"id"`
	UserId         int    `json:"user_id" gorm:"index"`
	Username       string `json:"username" gorm:"index;default:''"`
	FilterUser     string `json:"filter_user" gorm:"type:varchar(255);default:''"`
	StartTime      int64  `json:"start_time" gorm:"bigint;index"`
	EndTime        int64  `json:"end_time" gorm:"bigint;index"`
	Status         string `json:"status" gorm:"type:varchar(32);index;default:'queued'"`
	PromptLogCount int    `json:"prompt_log_count" gorm:"default:0"`
	ContentBytes   int    `json:"content_bytes" gorm:"default:0"`
	AnalysisModel  string `json:"analysis_model" gorm:"type:varchar(128);default:''"`
	AnalysisPrompt string `json:"analysis_prompt" gorm:"type:text"`
	AnalysisResult string `json:"analysis_result" gorm:"type:text"`
	ErrorMessage   string `json:"error_message" gorm:"type:text"`
	CreatedAt      int64  `json:"created_at" gorm:"bigint;index"`
	StartedAt      int64  `json:"started_at" gorm:"bigint;index"`
	FinishedAt     int64  `json:"finished_at" gorm:"bigint;index"`
}

type PromptLogAnalysisTaskFilter struct {
	User      string
	Status    string
	StartTime int64
	EndTime   int64
}

type PromptLogAnalysisSample struct {
	Id           int
	UserId       int
	Username     string
	ModelName    string
	RelayFormat  string
	ContentText  string
	ContentBytes int
	CreatedAt    int64
}

var ErrPromptLogAnalysisUserNotUnique = errors.New("prompt log analysis requires exactly one matched user")

func CreatePromptLogAnalysisTask(filter PromptLogFilter, analysisPrompt string, analysisModel string) (*PromptLogAnalysisTask, error) {
	userId, username, err := ResolvePromptLogFilterSingleUser(filter)
	if err != nil {
		return nil, err
	}
	now := common.GetTimestamp()
	task := &PromptLogAnalysisTask{
		UserId:         userId,
		Username:       username,
		FilterUser:     strings.TrimSpace(filter.User),
		StartTime:      filter.StartTime,
		EndTime:        filter.EndTime,
		Status:         PromptLogAnalysisStatusQueued,
		AnalysisModel:  strings.TrimSpace(analysisModel),
		AnalysisPrompt: analysisPrompt,
		CreatedAt:      now,
	}
	err = LOG_DB.Create(task).Error
	return task, err
}

func ResolvePromptLogFilterSingleUser(filter PromptLogFilter) (int, string, error) {
	if strings.TrimSpace(filter.User) == "" {
		return 0, "", ErrPromptLogAnalysisUserNotUnique
	}
	type userRow struct {
		UserId   int
		Username string
	}
	var users []userRow
	tx := LOG_DB.Model(&PromptLog{}).Select("user_id, max(username) as username")
	tx = applyPromptLogFilter(tx, filter)
	err := tx.Group("user_id").Limit(2).Scan(&users).Error
	if err != nil {
		return 0, "", err
	}
	if len(users) != 1 || users[0].UserId <= 0 {
		return 0, "", ErrPromptLogAnalysisUserNotUnique
	}
	return users[0].UserId, users[0].Username, nil
}

func GetPromptLogAnalysisTasks(startIdx int, num int, filter PromptLogAnalysisTaskFilter) (tasks []*PromptLogAnalysisTask, total int64, err error) {
	tx := LOG_DB.Model(&PromptLogAnalysisTask{})
	user := strings.TrimSpace(filter.User)
	if user != "" {
		tx = tx.Where("username LIKE ? OR filter_user LIKE ?", "%"+user+"%", "%"+user+"%")
	}
	status := strings.TrimSpace(filter.Status)
	if status != "" {
		tx = tx.Where("status = ?", status)
	}
	if filter.StartTime > 0 {
		tx = tx.Where("created_at >= ?", filter.StartTime)
	}
	if filter.EndTime > 0 {
		tx = tx.Where("created_at <= ?", filter.EndTime)
	}
	if err = tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err = tx.Order("created_at desc").Order("id desc").Limit(num).Offset(startIdx).Find(&tasks).Error
	return tasks, total, err
}

func GetPromptLogAnalysisTask(id int) (*PromptLogAnalysisTask, error) {
	task := &PromptLogAnalysisTask{}
	err := LOG_DB.First(task, id).Error
	if err != nil {
		return nil, err
	}
	return task, nil
}

func ClaimNextPromptLogAnalysisTask() (*PromptLogAnalysisTask, error) {
	var task PromptLogAnalysisTask
	err := LOG_DB.Transaction(func(tx *gorm.DB) error {
		result := tx.Where("status = ?", PromptLogAnalysisStatusQueued).Order("created_at asc").Order("id asc").Limit(1).Find(&task)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		now := common.GetTimestamp()
		updateResult := tx.Model(&PromptLogAnalysisTask{}).Where("id = ? AND status = ?", task.Id, PromptLogAnalysisStatusQueued).Updates(map[string]any{
			"status":     PromptLogAnalysisStatusRunning,
			"started_at": now,
		})
		if updateResult.Error != nil {
			return updateResult.Error
		}
		if updateResult.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		task.Status = PromptLogAnalysisStatusRunning
		task.StartedAt = now
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &task, nil
}

func CompletePromptLogAnalysisTask(id int, promptLogCount int, contentBytes int, analysisResult string) error {
	return LOG_DB.Model(&PromptLogAnalysisTask{}).Where("id = ?", id).Updates(map[string]any{
		"status":           PromptLogAnalysisStatusSucceeded,
		"prompt_log_count": promptLogCount,
		"content_bytes":    contentBytes,
		"analysis_result":  analysisResult,
		"error_message":    "",
		"finished_at":      common.GetTimestamp(),
	}).Error
}

func FailPromptLogAnalysisTask(id int, promptLogCount int, contentBytes int, errorMessage string) error {
	return LOG_DB.Model(&PromptLogAnalysisTask{}).Where("id = ?", id).Updates(map[string]any{
		"status":           PromptLogAnalysisStatusFailed,
		"prompt_log_count": promptLogCount,
		"content_bytes":    contentBytes,
		"error_message":    errorMessage,
		"finished_at":      common.GetTimestamp(),
	}).Error
}

func RetryPromptLogAnalysisTask(id int) (*PromptLogAnalysisTask, error) {
	var task PromptLogAnalysisTask
	err := LOG_DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.First(&task, id).Error; err != nil {
			return err
		}
		if task.Status != PromptLogAnalysisStatusFailed {
			return errors.New("only failed analysis tasks can be retried")
		}
		err := tx.Model(&PromptLogAnalysisTask{}).Where("id = ?", id).Updates(map[string]any{
			"status":          PromptLogAnalysisStatusQueued,
			"analysis_result": "",
			"error_message":   "",
			"started_at":      0,
			"finished_at":     0,
		}).Error
		if err != nil {
			return err
		}
		task.Status = PromptLogAnalysisStatusQueued
		task.AnalysisResult = ""
		task.ErrorMessage = ""
		task.StartedAt = 0
		task.FinishedAt = 0
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &task, nil
}

func GetPromptLogAnalysisSamples(filter PromptLogFilter, limit int) ([]PromptLogAnalysisSample, error) {
	if limit <= 0 {
		limit = 200
	}
	var samples []PromptLogAnalysisSample
	tx := LOG_DB.Table("prompt_logs").
		Select("prompt_logs.id, prompt_logs.user_id, prompt_logs.username, prompt_logs.model_name, prompt_logs.relay_format, prompt_log_contents.content_text, prompt_logs.content_bytes, prompt_logs.created_at").
		Joins("JOIN prompt_log_contents ON prompt_log_contents.prompt_log_id = prompt_logs.id")
	tx = applyPromptLogFilter(tx, filter)
	err := tx.Order("prompt_logs.created_at desc").Order("prompt_logs.id desc").Limit(limit).Scan(&samples).Error
	return samples, err
}
